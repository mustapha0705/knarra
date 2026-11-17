import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ID_PATTERN } from "../domain/composition/index.js";

// Storage layout (ARCHITECTURE.md, "Storage Layout"):
//
//   <root>/originals/<assetId>/original      immutable uploaded media
//   <root>/derived/<assetId>/<file>          thumbnails and proxies
//   <root>/exports/<renderJobId>/output.mp4  rendered videos
//
// Every path is built here from an ID and a fixed file name. Uploaded
// filenames never reach this module; they are display text in the database.

/** The only files that may exist under derived/<assetId>/. */
export const DERIVED_FILES = ["thumbnail.jpg", "proxy.mp4"] as const;
export type DerivedFile = (typeof DERIVED_FILES)[number];

export class StorageError extends Error {
  readonly reason: "invalid-id" | "outside-root" | "too-large" | "already-exists" | "empty";

  constructor(reason: StorageError["reason"], message: string) {
    super(message);
    this.name = "StorageError";
    this.reason = reason;
  }
}

export interface StoredOriginal {
  path: string;
  bytes: number;
  sha256: string;
}

/** The storage operations the rest of the backend may use. */
export interface StorageAdapter {
  originalPath(assetId: string): string;
  derivedPath(assetId: string, file: DerivedFile): string;
  exportPath(renderJobId: string): string;
  writeOriginal(assetId: string, source: Readable, maxBytes: number): Promise<StoredOriginal>;
  prepareDerivedDir(assetId: string): Promise<void>;
  prepareExportDir(renderJobId: string): Promise<void>;
  removeAsset(assetId: string): Promise<void>;
  removeDerived(assetId: string, file: DerivedFile): Promise<void>;
  removeExport(renderJobId: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/** Storage on the local filesystem under one root directory. */
export class LocalStorage implements StorageAdapter {
  readonly root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) throw new Error("The storage root must be an absolute path");
    this.root = resolve(root);
  }

  originalPath(assetId: string): string {
    return this.inside("originals", this.id(assetId), "original");
  }

  derivedPath(assetId: string, file: DerivedFile): string {
    if (!DERIVED_FILES.includes(file)) {
      throw new StorageError("invalid-id", "Unknown derived file");
    }
    return this.inside("derived", this.id(assetId), file);
  }

  exportPath(renderJobId: string): string {
    return this.inside("exports", this.id(renderJobId), "output.mp4");
  }

  /**
   * Stores an uploaded file as the asset's original.
   *
   * - The asset's directory must not exist yet: an original is never overwritten.
   * - The data is written to a temporary name and renamed only when complete,
   *   so a file named `original` is always whole.
   * - The stored file is made read-only.
   * - On any failure the directory is removed, leaving nothing behind.
   */
  async writeOriginal(assetId: string, source: Readable, maxBytes: number): Promise<StoredOriginal> {
    const path = this.originalPath(assetId);
    const directory = this.inside("originals", this.id(assetId));
    await mkdir(this.inside("originals"), { recursive: true });
    try {
      await mkdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new StorageError("already-exists", "This asset already has an original");
      }
      throw error;
    }

    const partial = `${path}.partial`;
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          done(new StorageError("too-large", "The file is larger than allowed"));
          return;
        }
        hash.update(chunk);
        done(null, chunk);
      },
    });

    try {
      await pipeline(source, meter, createWriteStream(partial, { flags: "wx" }));
      if (bytes === 0) throw new StorageError("empty", "The file is empty");
      await rename(partial, path);
      await chmod(path, 0o444);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }

    return { path, bytes, sha256: hash.digest("hex") };
  }

  async prepareDerivedDir(assetId: string): Promise<void> {
    await mkdir(this.inside("derived", this.id(assetId)), { recursive: true });
  }

  async prepareExportDir(renderJobId: string): Promise<void> {
    await mkdir(this.inside("exports", this.id(renderJobId)), { recursive: true });
  }

  /** Removes an asset's original and everything derived from it. */
  async removeAsset(assetId: string): Promise<void> {
    const id = this.id(assetId);
    const original = this.inside("originals", id, "original");
    // Read-only files cannot be deleted on Windows until they are writable again.
    await chmod(original, 0o666).catch(() => undefined);
    await rm(this.inside("originals", id), { recursive: true, force: true });
    await rm(this.inside("derived", id), { recursive: true, force: true });
  }

  async removeDerived(assetId: string, file: DerivedFile): Promise<void> {
    await rm(this.derivedPath(assetId, file), { force: true });
  }

  async removeExport(renderJobId: string): Promise<void> {
    await rm(this.inside("exports", this.id(renderJobId)), { recursive: true, force: true });
  }

  async exists(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }

  private id(value: string): string {
    if (typeof value !== "string" || !ID_PATTERN.test(value)) {
      throw new StorageError("invalid-id", "Not a valid storage ID");
    }
    return value;
  }

  /** Joins path parts under the root and proves the result is still inside it. */
  private inside(...parts: string[]): string {
    const path = resolve(join(this.root, ...parts));
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new StorageError("outside-root", "The path leaves the storage root");
    }
    return path;
  }
}
