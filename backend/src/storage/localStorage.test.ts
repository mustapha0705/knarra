import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorage, StorageError } from "./localStorage.js";

let root: string;
let storage: LocalStorage;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "knarra storage test "));
  storage = new LocalStorage(root);
});

afterAll(async () => {
  for (const id of ["asset-1", "asset-ro"]) await storage.removeAsset(id).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

const bytes = (text: string) => Readable.from([Buffer.from(text)]);

async function storageError(promise: Promise<unknown>): Promise<StorageError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StorageError) return error;
    throw error;
  }
  throw new Error("expected a StorageError");
}

describe("paths", () => {
  it("builds every path under the root from IDs and fixed names", () => {
    expect(storage.originalPath("asset-1")).toBe(join(root, "originals", "asset-1", "original"));
    expect(storage.derivedPath("asset-1", "proxy.mp4")).toBe(join(root, "derived", "asset-1", "proxy.mp4"));
    expect(storage.exportPath("job_1")).toBe(join(root, "exports", "job_1", "output.mp4"));
  });

  it.each(["..", "../x", "..\\x", "a/b", "a\\b", "C:\\x", "/etc", ".hidden", "", "a b", "x".repeat(65), "a\u0000b"])(
    "refuses the ID %j everywhere",
    async (id) => {
      for (const attempt of [
        () => storage.originalPath(id),
        () => storage.derivedPath(id, "thumbnail.jpg"),
        () => storage.exportPath(id),
      ]) {
        expect(attempt).toThrow(StorageError);
      }
      expect((await storageError(storage.writeOriginal(id, bytes("x"), 100))).reason).toBe("invalid-id");
      expect((await storageError(storage.removeAsset(id))).reason).toBe("invalid-id");
    },
  );

  it("refuses an unknown derived file name", () => {
    expect(() => storage.derivedPath("asset-1", "../../original" as never)).toThrow(StorageError);
  });

  it("requires an absolute root", () => {
    expect(() => new LocalStorage("relative/storage")).toThrow();
  });
});

describe("writeOriginal", () => {
  it("stores the bytes, reports size and SHA-256, and makes the file read-only", async () => {
    const stored = await storage.writeOriginal("asset-1", bytes("hello media"), 1000);

    expect(stored).toEqual({
      path: storage.originalPath("asset-1"),
      bytes: 11,
      sha256: createHash("sha256").update("hello media").digest("hex"),
    });
    expect(await readFile(stored.path, "utf8")).toBe("hello media");
    expect((await stat(stored.path)).mode & 0o222).toBe(0);
    expect(await readdir(join(root, "originals", "asset-1"))).toEqual(["original"]);
  });

  it("never overwrites an existing original", async () => {
    const error = await storageError(storage.writeOriginal("asset-1", bytes("replacement"), 1000));

    expect(error.reason).toBe("already-exists");
    expect(await readFile(storage.originalPath("asset-1"), "utf8")).toBe("hello media");
  });

  it("removes everything when the file is too large", async () => {
    const error = await storageError(storage.writeOriginal("asset-big", bytes("x".repeat(101)), 100));

    expect(error.reason).toBe("too-large");
    expect(existsSync(join(root, "originals", "asset-big"))).toBe(false);
  });

  it("removes everything when the file is empty", async () => {
    const error = await storageError(storage.writeOriginal("asset-empty", Readable.from([]), 100));

    expect(error.reason).toBe("empty");
    expect(existsSync(join(root, "originals", "asset-empty"))).toBe(false);
  });

  it("removes everything when the upload stream fails midway", async () => {
    const failing = new Readable({
      read() {
        this.push(Buffer.from("partial"));
        this.destroy(new Error("connection lost"));
      },
    });

    await expect(storage.writeOriginal("asset-broken", failing, 1000)).rejects.toThrow("connection lost");
    expect(existsSync(join(root, "originals", "asset-broken"))).toBe(false);
  });
});

describe("removeAsset", () => {
  it("removes a read-only original and its derived files", async () => {
    await storage.writeOriginal("asset-ro", bytes("data"), 100);
    await storage.prepareDerivedDir("asset-ro");

    await storage.removeAsset("asset-ro");

    expect(existsSync(join(root, "originals", "asset-ro"))).toBe(false);
    expect(existsSync(join(root, "derived", "asset-ro"))).toBe(false);
  });

  it("does nothing for an asset that has no files", async () => {
    await expect(storage.removeAsset("never-stored")).resolves.toBeUndefined();
  });

  it("keeps all paths inside the root", () => {
    for (const path of [storage.originalPath("a"), storage.derivedPath("a", "thumbnail.jpg"), storage.exportPath("a")]) {
      expect(path.startsWith(root + sep)).toBe(true);
    }
  });
});
