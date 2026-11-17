import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AssetService } from "../assets/service.js";
import { probeMedia, runProcess } from "../media/index.js";
import { AssetRepository } from "../persistence/assetRepository.js";
import type { Database } from "../persistence/db.js";
import { ProjectRepository } from "../persistence/projectRepository.js";
import { createMigratedTestDatabase } from "../persistence/testing/pglite.js";
import { ProjectService } from "../projects/service.js";
import { LocalStorage } from "../storage/localStorage.js";
import { createAssetsRouter } from "./assets.js";
import { createProjectsRouter } from "./projects.js";

// The M5 gate over real HTTP, real FFmpeg, and an embedded PostgreSQL:
// originals remain unchanged, regenerated proxies do not create duplicate
// records, and filenames cannot escape the storage root.

let work: string;
let storageRoot: string;
let database: Database;
let assetService: AssetService;
let server: Server;
let base: string;
const media: Record<"image" | "video" | "audio", Buffer> = {} as never;

const ffmpeg = (args: string[]) => runProcess("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "knarra assets test "));
  storageRoot = join(work, "storage root");

  await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=1280x720:rate=1", "-frames:v", "1", join(work, "i.png")]);
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "3", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac",
    join(work, "v.mp4"),
  ]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=44100", "-t", "4", join(work, "a.mp3")]);
  media.image = await readFile(join(work, "i.png"));
  media.video = await readFile(join(work, "v.mp4"));
  media.audio = await readFile(join(work, "a.mp3"));

  database = await createMigratedTestDatabase();
  const storage = new LocalStorage(storageRoot);
  assetService = new AssetService(new AssetRepository(database), storage, { maxAssetBytes: 5 * 1024 * 1024 });
  const projectService = new ProjectService(new ProjectRepository(database));

  const app = express();
  app.use("/api/projects/:projectId/assets", createAssetsRouter(assetService));
  app.use(
    "/api/projects",
    createProjectsRouter(projectService, { prepareDelete: (id) => assetService.prepareProjectDelete(id) }),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects`;
});

afterAll(async () => {
  // Let background FFmpeg runs finish so no file is still open during cleanup.
  await assetService.settle();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.close();
  // Originals are read-only; remove them through storage first.
  const originals = join(storageRoot, "originals");
  if (existsSync(originals)) {
    const storage = new LocalStorage(storageRoot);
    for (const id of await readdir(originals)) await storage.removeAsset(id);
  }
  await rm(work, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function newProject(): Promise<string> {
  const response = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Assets test" }),
  });
  return ((await response.json()) as Json).project.id as string;
}

async function upload(projectId: string, body: Buffer, name?: string): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${base}/${projectId}/assets`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      ...(name === undefined ? {} : { "x-file-name": encodeURIComponent(name) }),
    },
    body: new Uint8Array(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

async function waitForDerivatives(projectId: string, assetId: string): Promise<Json> {
  let asset: Json = {};
  await expect
    .poll(
      async () => {
        asset = ((await (await fetch(`${base}/${projectId}/assets/${assetId}`)).json()) as Json).asset as Json;
        return asset.derivatives.every((d: Json) => d.status !== "pending");
      },
      { timeout: 60_000, interval: 200 },
    )
    .toBe(true);
  return asset;
}

const filesUnder = async (directory: string): Promise<string[]> => {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
};

describe("upload and metadata", () => {
  it("stores a video and reports the metadata it read from the file", async () => {
    const projectId = await newProject();

    const { status, body } = await upload(projectId, media.video, "Holiday clip.mp4");

    expect(status).toBe(201);
    expect(body.asset).toMatchObject({
      projectId,
      kind: "video",
      name: "Holiday clip.mp4",
      durationMs: 3000,
      width: 1920,
      height: 1080,
      hasAudio: true,
      byteSize: media.video.length,
      sha256: sha256(media.video),
    });
    expect(body.asset.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.asset.derivatives.map((d: Json) => d.kind).sort()).toEqual(["proxy", "thumbnail"]);
  });

  it("classifies images and audio from their content", async () => {
    const projectId = await newProject();

    const image = await upload(projectId, media.image, "still.png");
    const audio = await upload(projectId, media.audio, "song.mp3");

    expect(image.body.asset).toMatchObject({ kind: "image", durationMs: null, width: 1280, height: 720, hasAudio: false });
    expect(image.body.asset.derivatives.map((d: Json) => d.kind)).toEqual(["thumbnail"]);
    expect(audio.body.asset).toMatchObject({ kind: "audio", width: null, height: null, hasAudio: true });
    expect(Math.abs(audio.body.asset.durationMs - 4000)).toBeLessThanOrEqual(60);
    expect(audio.body.asset.derivatives).toEqual([]);
  });

  it("ignores a misleading file name", async () => {
    const projectId = await newProject();

    const { body } = await upload(projectId, media.audio, "definitely-a-video.mp4");

    expect(body.asset.kind).toBe("audio");
  });

  it("lists a project's uploaded assets in upload order", async () => {
    const projectId = await newProject();
    await upload(projectId, media.image, "first.png");
    await upload(projectId, media.audio, "second.mp3");

    const { assets } = (await (await fetch(`${base}/${projectId}/assets`)).json()) as Json;

    expect(assets.map((asset: Json) => asset.name)).toEqual(["first.png", "second.mp3"]);
  });

  it.each([
    ["a text file", Buffer.from("just some text\n"), 415],
    ["a shell script", Buffer.from("#!/bin/sh\nrm -rf /\n"), 415],
    ["an empty body", Buffer.alloc(0), 400],
    ["a file over the limit", Buffer.alloc(6 * 1024 * 1024, 1), 413],
  ])("rejects %s and leaves no files or records", async (_name, body, expected) => {
    const projectId = await newProject();
    const before = await filesUnder(storageRoot);

    const response = await upload(projectId, body, "x.mp4");

    expect(response.status).toBe(expected);
    expect(await filesUnder(storageRoot)).toEqual(before);
    expect(((await (await fetch(`${base}/${projectId}/assets`)).json()) as Json).assets).toEqual([]);
  });

  it("answers 404 for an unknown project and stores nothing", async () => {
    const before = await filesUnder(storageRoot);

    expect((await upload("00000000-0000-0000-0000-000000000000", media.image)).status).toBe(404);
    expect(await filesUnder(storageRoot)).toEqual(before);
  });
});

describe("gate: filenames cannot escape the storage root", () => {
  it.each([
    "../../../../escape.png",
    "..\\..\\..\\escape.png",
    "C:\\Windows\\escape.png",
    "/etc/passwd",
    "$(rm -rf ~).png",
    "name\u0000with-nul.png",
    "%2e%2e%2fescape.png",
  ])("stores %j only as display text", async (name) => {
    const projectId = await newProject();

    const { status, body } = await upload(projectId, media.image, name);

    expect(status).toBe(201);
    const files = await filesUnder(work);
    expect(files.every((file) => file.startsWith(storageRoot) || file.startsWith(join(work, "")))).toBe(true);
    expect(files.some((file) => /escape|passwd|with-nul/.test(file))).toBe(false);
    expect(body.asset.name).not.toContain("\u0000");
    expect(existsSync(join(storageRoot, "originals", body.asset.id, "original"))).toBe(true);
  });

  it.each(["..%2F..%2Fescape", "a.b", "%20"])("answers 404 for the project ID %j", async (projectId) => {
    expect((await upload(projectId, media.image)).status).toBe(404);
  });

  // (A bare ".." is resolved by the client before it is sent, so it never reaches the server.)
  it.each(["..%2Foriginals", "a.b", "%2E%2E%2F"])("answers 404 for the asset ID %j", async (assetId) => {
    const projectId = await newProject();

    for (const path of [`/${assetId}`, `/${assetId}/thumbnail`, `/${assetId}/proxy`]) {
      expect((await fetch(`${base}/${projectId}/assets${path}`)).status).toBe(404);
    }
  });

  it("offers no route that serves the original", async () => {
    const projectId = await newProject();
    const { body } = await upload(projectId, media.image, "x.png");

    for (const path of ["original", "file", "download"]) {
      expect((await fetch(`${base}/${projectId}/assets/${body.asset.id}/${path}`)).status).toBe(404);
    }
  });
});

describe("derived artifacts", () => {
  it("creates a thumbnail and a playable proxy for a video", async () => {
    const projectId = await newProject();
    const { body } = await upload(projectId, media.video, "v.mp4");

    const asset = await waitForDerivatives(projectId, body.asset.id);

    expect(asset.derivatives).toEqual([
      { kind: "proxy", status: "ready", errorCode: null },
      { kind: "thumbnail", status: "ready", errorCode: null },
    ]);

    const thumb = await fetch(`${base}/${projectId}/assets/${body.asset.id}/thumbnail`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/jpeg");
    const thumbFile = join(work, "thumb.jpg");
    await writeFile(thumbFile, Buffer.from(await thumb.arrayBuffer()));
    const thumbProbe = await probeMedia(thumbFile);
    expect(Math.max(thumbProbe.video!.width, thumbProbe.video!.height)).toBeLessThanOrEqual(480);

    const proxy = await fetch(`${base}/${projectId}/assets/${body.asset.id}/proxy`);
    expect(proxy.status).toBe(200);
    expect(proxy.headers.get("content-type")).toBe("video/mp4");
    const proxyFile = join(work, "proxy.mp4");
    await writeFile(proxyFile, Buffer.from(await proxy.arrayBuffer()));
    const proxyProbe = await probeMedia(proxyFile);
    expect(proxyProbe.video).toMatchObject({ codec: "h264", width: 960, height: 540 });
    expect(proxyProbe.audio?.codec).toBe("aac");
    expect(Math.abs((proxyProbe.durationMs ?? 0) - 3000)).toBeLessThanOrEqual(100);
  });

  it("gate: regenerating does not duplicate records and leaves the original unchanged", async () => {
    const projectId = await newProject();
    const { body } = await upload(projectId, media.video, "v.mp4");
    const originalPath = join(storageRoot, "originals", body.asset.id, "original");
    await waitForDerivatives(projectId, body.asset.id);

    // Regenerate three times, two of them at once.
    await Promise.all([
      fetch(`${base}/${projectId}/assets/${body.asset.id}/derivatives`, { method: "POST" }),
      fetch(`${base}/${projectId}/assets/${body.asset.id}/derivatives`, { method: "POST" }),
    ]);
    await waitForDerivatives(projectId, body.asset.id);
    expect((await fetch(`${base}/${projectId}/assets/${body.asset.id}/derivatives`, { method: "POST" })).status).toBe(202);
    const after = await waitForDerivatives(projectId, body.asset.id);

    expect(after.derivatives).toHaveLength(2);
    const { rows: assetRows } = await database.query("SELECT id FROM assets WHERE project_id = $1", [projectId]);
    const { rows: derivedRows } = await database.query("SELECT kind FROM asset_derivatives WHERE project_id = $1", [projectId]);
    expect(assetRows).toHaveLength(1);
    expect(derivedRows).toHaveLength(2);
    expect((await readdir(join(storageRoot, "derived", body.asset.id))).sort()).toEqual(["proxy.mp4", "thumbnail.jpg"]);

    // The original is byte-for-byte what was uploaded.
    expect(sha256(await readFile(originalPath))).toBe(sha256(media.video));
    expect(sha256(await readFile(originalPath))).toBe(after.sha256);
  });

  it("records a failure without a path or stderr, and keeps the asset", async () => {
    const projectId = await newProject();
    const { body } = await upload(projectId, media.video, "v.mp4");
    await waitForDerivatives(projectId, body.asset.id);
    // Make the derived directory unusable so FFmpeg cannot write there.
    const derivedDir = join(storageRoot, "derived", body.asset.id);
    await rm(derivedDir, { recursive: true, force: true });
    await writeFile(derivedDir, "not a directory");

    await fetch(`${base}/${projectId}/assets/${body.asset.id}/derivatives`, { method: "POST" });
    const asset = await waitForDerivatives(projectId, body.asset.id).catch(() => null);
    await rm(derivedDir, { force: true });

    // Either generation could not even start (directory) or FFmpeg failed: the
    // asset must survive and no derivative may claim to be ready.
    const current = ((await (await fetch(`${base}/${projectId}/assets/${body.asset.id}`)).json()) as Json).asset as Json;
    expect(current.id).toBe(body.asset.id);
    for (const derivative of (asset ?? current).derivatives as Json[]) {
      expect(JSON.stringify(derivative)).not.toMatch(/[\\/]|stderr|Error:/);
    }
  });

  it("answers 404 for a thumbnail that is not ready or does not exist", async () => {
    const projectId = await newProject();
    const audio = await upload(projectId, media.audio, "a.mp3");

    expect((await fetch(`${base}/${projectId}/assets/${audio.body.asset.id}/thumbnail`)).status).toBe(404);
    expect((await fetch(`${base}/${projectId}/assets/${audio.body.asset.id}/proxy`)).status).toBe(404);
  });
});

describe("deletion and project saves", () => {
  it("deletes an asset's record, original, and derived files", async () => {
    const projectId = await newProject();
    const { body } = await upload(projectId, media.video, "v.mp4");
    await waitForDerivatives(projectId, body.asset.id);

    expect((await fetch(`${base}/${projectId}/assets/${body.asset.id}`, { method: "DELETE" })).status).toBe(204);

    expect(existsSync(join(storageRoot, "originals", body.asset.id))).toBe(false);
    expect(existsSync(join(storageRoot, "derived", body.asset.id))).toBe(false);
    expect((await fetch(`${base}/${projectId}/assets/${body.asset.id}`)).status).toBe(404);
  });

  it("deleting a project removes its uploaded files", async () => {
    const projectId = await newProject();
    const { body } = await upload(projectId, media.image, "x.png");
    await waitForDerivatives(projectId, body.asset.id);

    expect((await fetch(`${base}/${projectId}`, { method: "DELETE" })).status).toBe(204);

    expect(existsSync(join(storageRoot, "originals", body.asset.id))).toBe(false);
    expect(existsSync(join(storageRoot, "derived", body.asset.id))).toBe(false);
  });

  it("a project save keeps uploaded assets and cannot overwrite their metadata", async () => {
    const projectId = await newProject();
    const { body } = await upload(projectId, media.video, "v.mp4");
    const project = ((await (await fetch(`${base}/${projectId}`)).json()) as Json).project as Json;

    const saved = await fetch(`${base}/${projectId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedRevision: project.revision,
        title: project.title,
        composition: project.composition,
        editorState: {},
        // The browser claims different metadata for the uploaded asset.
        assets: [{ id: body.asset.id, kind: "audio", name: "forged", durationMs: 999_999, width: null, height: null, hasAudio: true }],
      }),
    });

    expect(saved.status).toBe(200);
    const reopened = ((await saved.json()) as Json).project as Json;
    expect(reopened.assets).toEqual([
      expect.objectContaining({ id: body.asset.id, kind: "video", durationMs: 3000, verified: true, name: "v.mp4" }),
    ]);
    expect(((await (await fetch(`${base}/${projectId}/assets`)).json()) as Json).assets).toHaveLength(1);
  });
});
