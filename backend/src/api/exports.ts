import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import express, { type Request, type Response, type Router } from "express";
import {
  ID_PATTERN,
  RENDER_PRESETS,
  applyOperations,
  parseComposition,
  type AssetRef,
  type Composition,
  type EditOperation,
  type Issue,
  type RenderPreset,
} from "../domain/composition/index.js";
import { executeRenderPlan, isCancellation, probeMedia, type MediaProbe } from "../media/index.js";
import { compileRenderPlan, type RenderAsset } from "../render/compiler/index.js";
import { jsonErrors, jsonNotFound } from "./errors.js";

// KNAR-302: project-driven synchronous Export.
//
// Until uploads and storage exist (M5), the browser sends the media a render
// needs along with the request. This router holds that media only for the
// length of one export:
//
//   POST   /                          -> { exportId }
//   PUT    /:exportId/assets/:assetId    raw file body, streamed to disk
//   POST   /:exportId/render             { composition } -> the MP4
//   DELETE /:exportId                    discard an export that was not rendered
//
// Everything the client sends is untrusted. Files are stored under
// server-generated names in a server-generated directory; the client's
// filenames are never received at all. Asset metadata (kind, duration, size,
// audio) is read from the files with ffprobe, not taken from the client. The
// directory is deleted when the render finishes, fails, or is cancelled.
// KNAR-502 replaces this with persistent asset ingestion.

export interface ExportsRouterOptions {
  /** Directory under which per-export directories are created. */
  rootDir?: string;
  maxAssets?: number;
  maxAssetBytes?: number;
  /** Exports not rendered within this time are discarded. */
  sessionTtlMs?: number;
  presets?: Readonly<Record<string, RenderPreset>>;
}

interface ExportSession {
  dir: string;
  createdAt: number;
  /** assetId -> absolute path of the stored file. */
  files: Map<string, string>;
  /** Asset IDs with an upload in progress. */
  uploading: Set<string>;
  rendering: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMAGE_FORMATS = /(^|,)(image2|png_pipe|jpeg_pipe|webp_pipe|bmp_pipe|tiff_pipe|gif|avif|jpegxl_pipe|heif)(,|$)/;

export function createExportsRouter(options: ExportsRouterOptions = {}): Router {
  const {
    rootDir = join(tmpdir(), "knarra-exports"),
    maxAssets = 30,
    maxAssetBytes = 1024 * 1024 * 1024,
    sessionTtlMs = 60 * 60 * 1000,
    presets = RENDER_PRESETS,
  } = options;

  const sessions = new Map<string, ExportSession>();
  // Renders are CPU-heavy; one at a time until render jobs exist (M6).
  let activeRender = false;

  const discard = async (exportId: string) => {
    const session = sessions.get(exportId);
    if (!session) return;
    sessions.delete(exportId);
    await rm(session.dir, { recursive: true, force: true });
  };

  const discardExpired = async () => {
    const cutoff = Date.now() - sessionTtlMs;
    for (const [exportId, session] of sessions) {
      if (session.createdAt < cutoff && !session.rendering) await discard(exportId);
    }
  };

  /** Looks up the session named in the URL, answering 404 when there is none. */
  const sessionFor = (req: Request, res: Response): [string, ExportSession] | null => {
    const exportId = String(req.params.exportId ?? "");
    const session = UUID_PATTERN.test(exportId) ? sessions.get(exportId) : undefined;
    if (!session) {
      res.status(404).json({ error: "This export does not exist or has expired." });
      return null;
    }
    return [exportId, session];
  };

  const router = express.Router();

  router.post("/", async (_req, res) => {
    await discardExpired();
    const exportId = randomUUID();
    const dir = join(rootDir, exportId);
    await mkdir(dir, { recursive: true });
    sessions.set(exportId, { dir, createdAt: Date.now(), files: new Map(), uploading: new Set(), rendering: false });
    res.status(201).json({ exportId });
  });

  router.put("/:exportId/assets/:assetId", async (req, res) => {
    const found = sessionFor(req, res);
    if (!found) return;
    const [, session] = found;

    const assetId = String(req.params.assetId ?? "");
    if (!ID_PATTERN.test(assetId)) {
      res.status(400).json({ error: "The asset ID is not valid." });
      return;
    }
    if (session.rendering) {
      res.status(409).json({ error: "This export is already rendering." });
      return;
    }
    if (session.files.has(assetId) || session.uploading.has(assetId)) {
      res.status(409).json({ error: "This asset has already been uploaded." });
      return;
    }
    if (session.files.size + session.uploading.size >= maxAssets) {
      res.status(413).json({ error: `An export can use at most ${maxAssets} files.` });
      return;
    }
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxAssetBytes) {
      res.status(413).json({ error: "This file is too large to export." });
      return;
    }

    // The stored name is generated here; nothing from the client reaches the path.
    const path = join(session.dir, `asset-${randomUUID()}`);
    let received = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.length;
        done(received > maxAssetBytes ? new Error("too-large") : null, chunk);
      },
    });

    session.uploading.add(assetId);
    try {
      await pipeline(req, limit, createWriteStream(path, { flags: "wx" }));
    } catch {
      await rm(path, { force: true });
      session.uploading.delete(assetId);
      if (received > maxAssetBytes) {
        res.status(413).json({ error: "This file is too large to export." });
      } else if (!res.headersSent) {
        res.status(400).json({ error: "The upload did not complete." });
      }
      return;
    }
    session.uploading.delete(assetId);

    if (received === 0) {
      await rm(path, { force: true });
      res.status(400).json({ error: "The uploaded file is empty." });
      return;
    }
    session.files.set(assetId, path);
    res.status(204).end();
  });

  router.delete("/:exportId", async (req, res) => {
    const found = sessionFor(req, res);
    if (!found) return;
    const [exportId, session] = found;
    if (session.rendering) {
      res.status(409).json({ error: "This export is rendering." });
      return;
    }
    await discard(exportId);
    res.status(204).end();
  });

  router.post("/:exportId/render", express.json({ limit: "2mb" }), async (req, res) => {
    const found = sessionFor(req, res);
    if (!found) return;
    const [exportId, session] = found;

    if (session.rendering || session.uploading.size > 0) {
      res.status(409).json({ error: "This export is still busy." });
      return;
    }
    if (activeRender) {
      res.status(409).json({ error: "Another render is in progress. Try again when it finishes." });
      return;
    }
    activeRender = true;
    session.rendering = true;

    // If the browser gives up, stop FFmpeg instead of rendering for nobody.
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onClose);

    // Clean up before answering, so the client never sees a response while
    // its uploaded media is still on disk.
    const invalid = async (issues: Issue[]) => {
      await discard(exportId);
      res.status(422).json({
        error: "This project cannot be exported yet.",
        issues: issues.map(({ code, path, message }) => ({ code, path, message })),
      });
    };

    try {
      const body: unknown = req.body;
      const parsed = parseComposition(
        typeof body === "object" && body !== null ? (body as Record<string, unknown>).composition : undefined,
      );
      if (!parsed.ok) return await invalid(parsed.error);
      const composition = parsed.value;

      const preset = presets[composition.presetId];
      if (!preset) {
        return await invalid([
          {
            code: "PRESET_MISMATCH",
            path: ["presetId"],
            message: `Preset "${composition.presetId}" is not available. Use one of: ${Object.keys(presets).join(", ")}.`,
          },
        ]);
      }

      const assets: RenderAsset[] = [];
      for (const [assetId, path] of session.files) {
        let probe: MediaProbe;
        try {
          probe = await probeMedia(path, { signal: controller.signal });
        } catch (error) {
          if (isCancellation(error)) throw error;
          return await invalid([
            {
              code: "ASSET_METADATA_MISSING",
              path: ["assets", assetId],
              message: `The file sent for asset "${assetId}" could not be read as an image, video, or audio file.`,
            },
          ]);
        }
        const asset = toAssetRef(assetId, probe);
        if (!asset) {
          return await invalid([
            {
              code: "ASSET_METADATA_MISSING",
              path: ["assets", assetId],
              message: `The file sent for asset "${assetId}" has no usable picture or sound.`,
            },
          ]);
        }
        assets.push({ ...asset, path });
      }

      // The browser measured these files itself, and its durations can differ
      // from the probed ones by a few milliseconds. Pull such ranges back to the
      // real end of the file, through the same operations any other edit uses.
      let renderable = composition;
      const fits = fitSourceRanges(composition, assets);
      if (fits.length > 0) {
        const fitted = applyOperations(composition, fits, assets);
        if (!fitted.ok) return await invalid(fitted.error);
        renderable = fitted.value;
      }

      const plan = compileRenderPlan(renderable, assets, preset);
      if (!plan.ok) return await invalid(plan.error);

      const outputPath = join(session.dir, "output.mp4");
      await executeRenderPlan(plan.value, outputPath, { signal: controller.signal });

      await new Promise<void>((resolve) => {
        res.download(outputPath, "knarra-export.mp4", (error) => {
          if (error && !res.headersSent) {
            res.status(500).json({ error: "Could not send the rendered file." });
          }
          resolve();
        });
      });
    } catch (error) {
      if (!isCancellation(error)) {
        // Details (which can include server paths) go to the log, never to the client.
        console.error("Export failed", error);
        await discard(exportId);
        if (!res.headersSent) res.status(500).json({ error: "The render failed." });
      }
    } finally {
      res.off("close", onClose);
      activeRender = false;
      await discard(exportId);
    }
  });

  router.use(jsonNotFound);
  router.use(jsonErrors);
  return router;
}

/** How far past the end of a file a browser-measured source range may reach. */
export const SOURCE_RANGE_TOLERANCE_MS = 500;

/**
 * Trim operations for clips whose source range ends slightly after their
 * asset does. Larger overshoots are left alone so validation reports them.
 */
export function fitSourceRanges(composition: Composition, assets: readonly AssetRef[]): EditOperation[] {
  const durations = new Map(assets.map((asset) => [asset.id, asset.durationMs]));
  const operations: EditOperation[] = [];

  for (const track of composition.tracks) {
    for (const clip of track.clips) {
      if (clip.kind === "image") continue;
      const durationMs = durations.get(clip.assetId);
      if (durationMs === null || durationMs === undefined) continue;
      const overshoot = clip.sourceEndMs - durationMs;
      if (overshoot > 0 && overshoot <= SOURCE_RANGE_TOLERANCE_MS && durationMs > clip.sourceStartMs) {
        operations.push({
          op: "trimClip",
          clipId: clip.id,
          sourceStartMs: clip.sourceStartMs,
          sourceEndMs: durationMs,
        });
      }
    }
  }
  return operations;
}

/**
 * Builds the kernel's catalog entry from what ffprobe found in the file.
 * Returns null for a file with neither a picture nor sound.
 */
export function toAssetRef(id: string, probe: MediaProbe): AssetRef | null {
  if (probe.video) {
    const { width, height } = probe.video;
    const isStill = IMAGE_FORMATS.test(probe.formatName) && (probe.durationMs === null || probe.audio === null && probe.durationMs <= 100);
    if (isStill) return { id, kind: "image", durationMs: null, width, height, hasAudio: false };
    return { id, kind: "video", durationMs: probe.durationMs, width, height, hasAudio: probe.audio !== null };
  }
  if (probe.audio) {
    return { id, kind: "audio", durationMs: probe.durationMs, width: null, height: null, hasAudio: true };
  }
  return null;
}
