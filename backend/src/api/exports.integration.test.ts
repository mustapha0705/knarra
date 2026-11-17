import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RenderPreset } from "../domain/composition/index.js";
import { probeMedia, runProcess } from "../media/index.js";
import { createExportsRouter } from "./exports.js";

// The whole KNAR-302 backend path over real HTTP: upload media, send a
// Composition, receive a rendered MP4. Real FFmpeg, generated fixtures.

const PRESET: RenderPreset = {
  id: "test-270x480",
  width: 270,
  height: 480,
  fps: 30,
  videoCodec: "h264",
  pixelFormat: "yuv420p",
  colorRange: "tv",
  crf: 30,
  encoderPreset: "veryfast",
  audioCodec: "aac",
  audioBitrateKbps: 96,
  audioSampleRateHz: 48000,
  audioChannels: 2,
};
const SLOW_PRESET: RenderPreset = { ...PRESET, id: "test-slow", width: 1080, height: 1920, encoderPreset: "slow" };

let work: string;
let exportsRoot: string;
let server: Server;
let base: string;
const files: Record<"image" | "video" | "music", Buffer> = {} as never;

const ffmpeg = (args: string[]) => runProcess("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "knarra api test "));
  exportsRoot = join(work, "exports root");

  await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=640x360:rate=1", "-frames:v", "1", join(work, "image.png")]);
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc2=size=640x480:rate=25",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "3", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuvj420p", "-color_range", "pc", "-c:a", "aac",
    join(work, "video.mp4"),
  ]);
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=44100", "-t", "5", join(work, "music.mp3")]);
  files.image = await readFile(join(work, "image.png"));
  files.video = await readFile(join(work, "video.mp4"));
  files.music = await readFile(join(work, "music.mp3"));

  const app = express();
  app.use(
    "/api/exports",
    createExportsRouter({
      rootDir: exportsRoot,
      maxAssets: 4,
      maxAssetBytes: 2 * 1024 * 1024,
      presets: { [PRESET.id]: PRESET, [SLOW_PRESET.id]: SLOW_PRESET },
    }),
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/exports`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(work, { recursive: true, force: true });
});

async function createExport(): Promise<string> {
  const response = await fetch(base, { method: "POST" });
  expect(response.status).toBe(201);
  return ((await response.json()) as { exportId: string }).exportId;
}

const upload = (exportId: string, assetId: string, body: Buffer) =>
  fetch(`${base}/${exportId}/assets/${assetId}`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: new Uint8Array(body),
  });

const render = (exportId: string, composition: unknown, signal?: AbortSignal) =>
  fetch(`${base}/${exportId}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ composition }),
    ...(signal ? { signal } : {}),
  });

interface LooseComposition {
  schemaVersion: number;
  id: string;
  presetId: string;
  tracks: { id: string; kind: string; clips: Record<string, unknown>[] }[];
}

/** 1 s image + 1 s of video (2 s of source at 2x) over 3 s of music. */
function composition(presetId = PRESET.id): LooseComposition {
  return {
    schemaVersion: 1,
    id: "proj_abc1234",
    presetId,
    tracks: [
      {
        id: "track-visual",
        kind: "visual",
        clips: [
          { id: "clip_image", kind: "image", assetId: "asset_image", durationMs: 1000 },
          {
            id: "clip_video",
            kind: "video",
            assetId: "asset_video",
            sourceStartMs: 500,
            sourceEndMs: 2500,
            speed: 2,
            volume: 1,
            durationMs: 1000,
          },
        ],
      },
      {
        id: "track-audio",
        kind: "audio",
        clips: [
          {
            id: "clip_music",
            kind: "audio",
            assetId: "asset_music",
            sourceStartMs: 0,
            sourceEndMs: 3000,
            timelineStartMs: 0,
            volume: 0.8,
            fadeInMs: 0,
            fadeOutMs: 500,
          },
        ],
      },
    ],
  };
}

async function uploadAll(exportId: string) {
  expect((await upload(exportId, "asset_image", files.image)).status).toBe(204);
  expect((await upload(exportId, "asset_video", files.video)).status).toBe(204);
  expect((await upload(exportId, "asset_music", files.music)).status).toBe(204);
}

const exportDirs = async (): Promise<string[]> => (existsSync(exportsRoot) ? readdir(exportsRoot) : []);

describe("export flow", () => {
  it("renders the uploaded project and returns an MP4", async () => {
    const exportId = await createExport();
    await uploadAll(exportId);

    const response = await render(exportId, composition());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toContain("knarra-export.mp4");

    const output = join(work, "downloaded.mp4");
    await writeFile(output, Buffer.from(await response.arrayBuffer()));
    const probe = await probeMedia(output);

    expect(Math.abs((probe.durationMs ?? 0) - 2000)).toBeLessThanOrEqual(50);
    expect(probe.video).toMatchObject({
      codec: "h264",
      width: 270,
      height: 480,
      pixelFormat: "yuv420p",
      colorRange: "tv",
      frameRate: { numerator: 30, denominator: 1 },
    });
    expect(probe.audio).toMatchObject({ codec: "aac", sampleRateHz: 48_000, channels: 2 });
  });

  it("deletes the uploaded media and the output after a successful render", async () => {
    // Cleanup follows the download, so allow it a moment.
    await expect.poll(exportDirs, { timeout: 10_000, interval: 100 }).toEqual([]);
  });

  it("stores uploads under server-generated names only", async () => {
    const exportId = await createExport();
    await upload(exportId, "asset_image", files.image);

    const stored = await readdir(join(exportsRoot, exportId));

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^asset-[0-9a-f-]{36}$/);
    expect((await fetch(`${base}/${exportId}`, { method: "DELETE" })).status).toBe(204);
    expect(await exportDirs()).toEqual([]);
  });

  it("forgets an export once it has been rendered", async () => {
    const exportId = await createExport();
    await uploadAll(exportId);
    await (await render(exportId, composition())).arrayBuffer();

    await expect
      .poll(async () => (await render(exportId, composition())).status, { timeout: 10_000, interval: 100 })
      .toBe(404);
    await expect.poll(exportDirs, { timeout: 10_000, interval: 100 }).toEqual([]);
  });
});

describe("browser-measured durations", () => {
  it("accepts a source range that ends slightly after the file does", async () => {
    const exportId = await createExport();
    await uploadAll(exportId);
    const c = composition();
    // The video is 3000 ms long; a browser might report 3040.
    Object.assign(c.tracks[0]!.clips[1]!, { sourceStartMs: 1040, sourceEndMs: 3040, speed: 2, durationMs: 1000 });

    const response = await render(exportId, c);

    expect(response.status).toBe(200);
    const output = join(work, "fitted.mp4");
    await writeFile(output, Buffer.from(await response.arrayBuffer()));
    expect(Math.abs(((await probeMedia(output)).durationMs ?? 0) - 1980)).toBeLessThanOrEqual(50);
  });

  it("still rejects a source range far past the end of the file", async () => {
    const exportId = await createExport();
    await uploadAll(exportId);
    const c = composition();
    Object.assign(c.tracks[0]!.clips[1]!, { sourceStartMs: 0, sourceEndMs: 4000, speed: 2, durationMs: 2000 });

    const response = await render(exportId, c);
    const body = (await response.json()) as { issues: { code: string }[] };

    expect(response.status).toBe(422);
    expect(body.issues.map((issue) => issue.code)).toEqual(["SOURCE_RANGE_OUT_OF_BOUNDS"]);
  });
});

describe("rejected requests", () => {
  it("returns validation issues, and cleans up, for a project that cannot render", async () => {
    const exportId = await createExport();
    await uploadAll(exportId);
    const broken = composition();
    broken.tracks[0]!.clips[1]!.speed = 100;

    const response = await render(exportId, broken);
    const body = (await response.json()) as { error: string; issues: { code: string; path: unknown[]; message: string }[] };

    expect(response.status).toBe(422);
    expect(body.issues).toEqual([
      expect.objectContaining({ code: "SPEED_OUT_OF_RANGE", path: ["tracks", 0, "clips", 1, "speed"] }),
    ]);
    expect(JSON.stringify(body)).not.toContain(work);
    expect(await exportDirs()).toEqual([]);
  });

  it("reports a clip whose media was never uploaded", async () => {
    const exportId = await createExport();
    await upload(exportId, "asset_image", files.image);
    await upload(exportId, "asset_music", files.music);

    const response = await render(exportId, composition());
    const body = (await response.json()) as { issues: { code: string }[] };

    expect(response.status).toBe(422);
    expect(body.issues.map((issue) => issue.code)).toContain("ASSET_NOT_FOUND");
  });

  it("takes the media kind from the file, not from the client", async () => {
    const exportId = await createExport();
    // The client claims the image slot but sends audio.
    await upload(exportId, "asset_image", files.music);
    await upload(exportId, "asset_video", files.video);
    await upload(exportId, "asset_music", files.music);

    const response = await render(exportId, composition());
    const body = (await response.json()) as { issues: { code: string }[] };

    expect(response.status).toBe(422);
    expect(body.issues.map((issue) => issue.code)).toContain("ASSET_KIND_MISMATCH");
  });

  it("rejects a file that is not media", async () => {
    const exportId = await createExport();
    await upload(exportId, "asset_image", Buffer.from("#!/bin/sh\nrm -rf /\n"));
    await upload(exportId, "asset_video", files.video);
    await upload(exportId, "asset_music", files.music);

    const response = await render(exportId, composition());

    expect(response.status).toBe(422);
    expect(await exportDirs()).toEqual([]);
  });

  it.each([
    ["not a composition", { hello: "world" }],
    ["a future schema version", { ...composition(), schemaVersion: 2 }],
    ["an unknown key", { ...composition(), ffmpegArgs: ["-y"] }],
    ["an unknown preset", composition("no-such-preset")],
    ["nothing", undefined],
  ])("rejects %s with 422", async (_name, body) => {
    const exportId = await createExport();
    await uploadAll(exportId);

    expect((await render(exportId, body)).status).toBe(422);
  });

  it.each(["..%2F..%2Fetc", "a.b", "a%20b", "-x", "x".repeat(65)])("rejects the asset ID %j", async (assetId) => {
    const exportId = await createExport();

    const response = await upload(exportId, assetId, files.image);

    expect([400, 404]).toContain(response.status);
    expect(await readdir(join(exportsRoot, exportId))).toEqual([]);
    await fetch(`${base}/${exportId}`, { method: "DELETE" });
  });

  it.each(["not-a-uuid", "00000000-0000-0000-0000-000000000000", "..%2F..%2Fwindows"])(
    "answers 404 for the unknown export %j",
    async (exportId) => {
      expect((await upload(exportId, "asset_image", files.image)).status).toBe(404);
      expect((await render(exportId, composition())).status).toBe(404);
      expect((await fetch(`${base}/${exportId}`, { method: "DELETE" })).status).toBe(404);
    },
  );

  it("rejects a file over the size limit and keeps nothing", async () => {
    const exportId = await createExport();

    const response = await upload(exportId, "asset_big", Buffer.alloc(3 * 1024 * 1024));

    expect(response.status).toBe(413);
    expect(await readdir(join(exportsRoot, exportId))).toEqual([]);
    await fetch(`${base}/${exportId}`, { method: "DELETE" });
  });

  it("rejects an empty file, a repeated asset, and too many files", async () => {
    const exportId = await createExport();

    expect((await upload(exportId, "asset_empty", Buffer.alloc(0))).status).toBe(400);
    expect((await upload(exportId, "a1", files.image)).status).toBe(204);
    expect((await upload(exportId, "a1", files.image)).status).toBe(409);
    expect((await upload(exportId, "a2", files.image)).status).toBe(204);
    expect((await upload(exportId, "a3", files.image)).status).toBe(204);
    expect((await upload(exportId, "a4", files.image)).status).toBe(204);
    expect((await upload(exportId, "a5", files.image)).status).toBe(413);
    await fetch(`${base}/${exportId}`, { method: "DELETE" });
  });
});

describe("one render at a time, and cancellation", () => {
  /** Five minutes of 1080x1920 at the slow preset: long enough to interrupt. */
  function longComposition() {
    const c = composition(SLOW_PRESET.id);
    c.tracks[0]!.clips = Array.from({ length: 5 }, (_unused, index) => ({
      id: `clip_long_${index}`,
      kind: "image",
      assetId: "asset_image",
      durationMs: 60_000,
    }));
    c.tracks[1]!.clips = [];
    return c;
  }

  it("answers 409 to a second render and cleans up when the first is abandoned", async () => {
    const first = await createExport();
    await upload(first, "asset_image", files.image);
    const second = await createExport();
    await uploadAll(second);

    const controller = new AbortController();
    const running = render(first, longComposition(), controller.signal).catch((error: unknown) => error);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const blocked = await render(second, composition());
    expect(blocked.status).toBe(409);

    // The browser gives up: the server must stop FFmpeg and delete everything.
    controller.abort();
    await running;
    await expect
      .poll(async () => (await exportDirs()).includes(first), { timeout: 20_000, interval: 250 })
      .toBe(false);

    // The server is free again, and the blocked export was not thrown away.
    const retry = await render(second, composition());
    expect(retry.status).toBe(200);
    await retry.arrayBuffer();
    await expect.poll(exportDirs, { timeout: 10_000, interval: 100 }).toEqual([]);
  });
});
