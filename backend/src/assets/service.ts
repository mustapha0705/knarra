import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { AssetRef } from "../domain/composition/index.js";
import { createProxy, createThumbnail } from "../media/derive.js";
import { ProcessError, probeMedia, type MediaProbe } from "../media/index.js";
import type { AssetRepository, DerivativeKind, UploadedAsset } from "../persistence/assetRepository.js";
import { StorageError, type DerivedFile, type StorageAdapter } from "../storage/localStorage.js";

// Asset ingestion (M5): an upload becomes an immutable original on disk plus a
// database record whose metadata the server read from the file itself.

export type IngestError =
  | { kind: "project-not-found" }
  | { kind: "not-found" }
  | { kind: "too-large" }
  | { kind: "empty" }
  /** The file is not an image, video, or audio file FFmpeg can read. */
  | { kind: "unsupported" };

export type IngestOutcome<T> = { ok: true; value: T } | { ok: false; error: IngestError };

export interface AssetServiceOptions {
  maxAssetBytes?: number;
  /** Override for tests: how media is probed. */
  probe?: (path: string) => Promise<MediaProbe>;
}

const DERIVED_FILE: Record<DerivativeKind, DerivedFile> = {
  thumbnail: "thumbnail.jpg",
  proxy: "proxy.mp4",
};

const IMAGE_FORMATS = /(^|,)(image2|png_pipe|jpeg_pipe|webp_pipe|bmp_pipe|tiff_pipe|avif|jpegxl_pipe|heif)(,|$)/;

/** The derived artifacts each kind of asset gets. Audio needs none. */
export function derivativesFor(kind: AssetRef["kind"]): DerivativeKind[] {
  if (kind === "image") return ["thumbnail"];
  if (kind === "video") return ["thumbnail", "proxy"];
  return [];
}

/**
 * Turns an uploaded filename into display text. It is stored and shown, and
 * nothing else: it never becomes a path. Control characters are removed so it
 * cannot disturb logs or terminals.
 */
export function displayName(raw: unknown): string {
  if (typeof raw !== "string") return "Untitled";
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
  return cleaned.length > 0 ? cleaned : "Untitled";
}

/**
 * Builds the kernel's catalog entry from what ffprobe found in the file.
 * Returns null for a file with neither a picture nor sound.
 */
export function describeMedia(id: string, probe: MediaProbe): AssetRef | null {
  if (probe.video) {
    const { width, height } = probe.video;
    const still =
      IMAGE_FORMATS.test(probe.formatName) &&
      (probe.durationMs === null || (probe.audio === null && probe.durationMs <= 100));
    if (still) return { id, kind: "image", durationMs: null, width, height, hasAudio: false };
    if (probe.durationMs === null || probe.durationMs <= 0) return null;
    return { id, kind: "video", durationMs: probe.durationMs, width, height, hasAudio: probe.audio !== null };
  }
  if (probe.audio) {
    if (probe.durationMs === null || probe.durationMs <= 0) return null;
    return { id, kind: "audio", durationMs: probe.durationMs, width: null, height: null, hasAudio: true };
  }
  return null;
}

export class AssetService {
  private readonly assets: AssetRepository;
  private readonly storage: StorageAdapter;
  private readonly maxAssetBytes: number;
  private readonly probe: (path: string) => Promise<MediaProbe>;
  /** Derivative generation in flight, keyed by asset ID. */
  private readonly generating = new Map<string, Promise<void>>();

  constructor(assets: AssetRepository, storage: StorageAdapter, options: AssetServiceOptions = {}) {
    this.assets = assets;
    this.storage = storage;
    this.maxAssetBytes = options.maxAssetBytes ?? 2 * 1024 * 1024 * 1024;
    this.probe = options.probe ?? ((path) => probeMedia(path));
  }

  /**
   * Stores an upload as a new asset of the project.
   *
   * Order matters: the file is written and probed before any database row
   * exists, and if anything fails the file is removed. So there is never a
   * record without a readable original, and never an orphan file after a
   * failure.
   */
  async ingest(projectId: string, source: Readable, name: unknown): Promise<IngestOutcome<UploadedAsset>> {
    if (!(await this.assets.projectExists(projectId))) {
      source.resume();
      return { ok: false, error: { kind: "project-not-found" } };
    }

    const assetId = randomUUID();
    let stored;
    try {
      stored = await this.storage.writeOriginal(assetId, source, this.maxAssetBytes);
    } catch (error) {
      if (error instanceof StorageError && error.reason === "too-large") return { ok: false, error: { kind: "too-large" } };
      if (error instanceof StorageError && error.reason === "empty") return { ok: false, error: { kind: "empty" } };
      throw error;
    }

    try {
      let described: AssetRef | null = null;
      try {
        described = describeMedia(assetId, await this.probe(stored.path));
      } catch (error) {
        // ffprobe exiting with an error means "not media", not a server fault.
        if (!(error instanceof ProcessError && error.failure === "exit") && !(error instanceof Error && error.name === "ProbeError")) {
          throw error;
        }
      }
      if (!described) {
        await this.storage.removeAsset(assetId);
        return { ok: false, error: { kind: "unsupported" } };
      }

      const asset = await this.assets.insert({
        ...described,
        projectId,
        name: displayName(name),
        byteSize: stored.bytes,
        sha256: stored.sha256,
      });
      for (const kind of derivativesFor(asset.kind)) {
        await this.assets.setDerivative(projectId, assetId, kind, "pending");
      }
      return { ok: true, value: (await this.assets.get(projectId, assetId)) ?? asset };
    } catch (error) {
      await this.storage.removeAsset(assetId);
      throw error;
    }
  }

  list(projectId: string): Promise<UploadedAsset[]> {
    return this.assets.list(projectId);
  }

  async get(projectId: string, assetId: string): Promise<IngestOutcome<UploadedAsset>> {
    const asset = await this.assets.get(projectId, assetId);
    return asset ? { ok: true, value: asset } : { ok: false, error: { kind: "not-found" } };
  }

  /**
   * Call before deleting a whole project. Returns a function that removes the
   * files of the project's uploaded assets; call it once the project's rows
   * are gone, so a failed delete never loses media.
   */
  async prepareProjectDelete(projectId: string): Promise<() => Promise<void>> {
    const ids = (await this.assets.list(projectId)).map((asset) => asset.id);
    return async () => {
      for (const assetId of ids) {
        await this.generating.get(assetId)?.catch(() => undefined);
        await this.storage.removeAsset(assetId);
      }
    };
  }

  /** Deletes the record first, then the files, after any generation has stopped. */
  async remove(projectId: string, assetId: string): Promise<IngestOutcome<null>> {
    if (!(await this.assets.delete(projectId, assetId))) return { ok: false, error: { kind: "not-found" } };
    await this.generating.get(assetId)?.catch(() => undefined);
    await this.storage.removeAsset(assetId);
    return { ok: true, value: null };
  }

  /**
   * Generates (or regenerates) the asset's thumbnail and proxy.
   *
   * Idempotent: it only ever updates the asset's existing derivative rows and
   * replaces the files in place, so running it again cannot duplicate
   * anything. Calls for an asset that is already being processed share the
   * run in flight. The original is only read.
   */
  generateDerivatives(projectId: string, assetId: string): Promise<void> {
    const running = this.generating.get(assetId);
    if (running) return running;

    const run = this.runGeneration(projectId, assetId).finally(() => {
      this.generating.delete(assetId);
    });
    this.generating.set(assetId, run);
    return run;
  }

  /** Resolves once no derivative generation is running. For shutdown and tests. */
  async settle(): Promise<void> {
    while (this.generating.size > 0) {
      await Promise.allSettled([...this.generating.values()]);
    }
  }

  get maxBytes(): number {
    return this.maxAssetBytes;
  }

  /** Where a ready derived file is, or null if it is not available. */
  async derivedFile(projectId: string, assetId: string, kind: DerivativeKind): Promise<string | null> {
    const asset = await this.assets.get(projectId, assetId);
    const ready = asset?.derivatives.some((derivative) => derivative.kind === kind && derivative.status === "ready");
    if (!ready) return null;
    const path = this.storage.derivedPath(assetId, DERIVED_FILE[kind]);
    return (await this.storage.exists(path)) ? path : null;
  }

  private async runGeneration(projectId: string, assetId: string): Promise<void> {
    const asset = await this.assets.get(projectId, assetId);
    if (!asset || asset.kind === "audio") return;

    const original = this.storage.originalPath(assetId);
    const kinds = derivativesFor(asset.kind);
    try {
      await this.storage.prepareDerivedDir(assetId);
    } catch (error) {
      console.error(`Could not prepare derived files for asset ${assetId}`, error);
      for (const kind of kinds) {
        await this.assets.setDerivative(projectId, assetId, kind, "failed", "storage-error").catch(() => undefined);
      }
      return;
    }

    for (const kind of kinds) {
      const output = this.storage.derivedPath(assetId, DERIVED_FILE[kind]);
      await this.assets.setDerivative(projectId, assetId, kind, "pending");
      try {
        if (kind === "thumbnail") {
          await createThumbnail(original, output, { kind: asset.kind, durationMs: asset.durationMs });
        } else {
          await createProxy(original, output);
        }
        await this.assets.setDerivative(projectId, assetId, kind, "ready");
      } catch (error) {
        await this.storage.removeDerived(assetId, DERIVED_FILE[kind]);
        // Record a short reason only; stderr and paths stay in the server log.
        const code = error instanceof ProcessError ? `ffmpeg-${error.failure}` : "unexpected-error";
        console.error(`Could not create ${kind} for asset ${assetId}`, error);
        // The asset may have been deleted meanwhile; then there is no row to update.
        await this.assets.setDerivative(projectId, assetId, kind, "failed", code).catch(() => undefined);
      }
    }
  }
}
