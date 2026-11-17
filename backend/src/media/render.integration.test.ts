import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compositionSchema,
  type AssetRef,
  type Composition,
  type RenderPreset,
} from "../domain/composition/index.js";
import { compileRenderPlan, type RenderAsset, type RenderPlan } from "../render/compiler/index.js";
import { executeRenderPlan, isCancellation } from "./executor.js";
import { probeMedia, type MediaProbe } from "./probe.js";
import { ProcessError, runProcess } from "./process.js";
import type { RenderProgress } from "./progress.js";

// Real FFmpeg and ffprobe, real files. Fixtures are generated from FFmpeg's
// built-in test sources into a temporary directory, so no media is committed.

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

let dir: string;
let assets: RenderAsset[];
let sourceVideo: MediaProbe;

const ffmpeg = (args: string[]) => runProcess("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

async function toAsset(id: string, kind: AssetRef["kind"], path: string): Promise<RenderAsset> {
  const probe = await probeMedia(path);
  return {
    id,
    kind,
    path,
    durationMs: kind === "image" ? null : probe.durationMs,
    width: kind === "audio" ? null : (probe.video?.width ?? null),
    height: kind === "audio" ? null : (probe.video?.height ?? null),
    hasAudio: probe.audio !== null,
  };
}

beforeAll(async () => {
  // The space in the directory name makes every path here a "path with spaces".
  dir = await mkdtemp(join(tmpdir(), "knarra render test "));
  const image = join(dir, "still image.png");
  const video = join(dir, "full range video.mp4");
  const music = join(dir, "music.wav");

  await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=640x360:rate=1", "-frames:v", "1", image]);
  // Full-range yuvj420p with audio, like the phone footage that tripped the spike.
  await ffmpeg([
    "-f", "lavfi", "-i", "testsrc2=size=640x480:rate=25",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "4",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuvj420p", "-color_range", "pc",
    "-c:a", "aac",
    video,
  ]);
  // Mono, 22.05 kHz: must be converted to the preset's stereo 48 kHz.
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=22050", "-t", "6", "-ac", "1", music]);

  sourceVideo = await probeMedia(video);
  assets = [
    await toAsset("asset-image", "image", image),
    await toAsset("asset-video", "video", video),
    await toAsset("asset-music", "audio", music),
  ];
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 1 s image, then source 0.5-2.5 s of the video at 2x (1 s), over 3 s of music. */
function composition(): Composition {
  return compositionSchema.parse({
    schemaVersion: 1,
    id: "comp-test",
    presetId: PRESET.id,
    tracks: [
      {
        id: "track-visual",
        kind: "visual",
        clips: [
          { id: "clip-image", kind: "image", assetId: "asset-image", durationMs: 1000 },
          {
            id: "clip-video",
            kind: "video",
            assetId: "asset-video",
            sourceStartMs: 500,
            sourceEndMs: 2500,
            speed: 2,
            volume: 0.5,
            durationMs: 1000,
          },
        ],
      },
      {
        id: "track-audio",
        kind: "audio",
        clips: [
          {
            id: "clip-music",
            kind: "audio",
            assetId: "asset-music",
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
  });
}

function plan(c: Composition = composition(), a: RenderAsset[] = assets): RenderPlan {
  const result = compileRenderPlan(c, a, PRESET);
  if (!result.ok) throw new Error(`compile failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** Mean volume in dB of a time window of a file's audio. About -91 is silence. */
async function meanVolumeDb(path: string, fromSeconds: number, toSeconds: number): Promise<number> {
  const { stderr } = await runProcess("ffmpeg", [
    "-hide_banner", "-nostats", "-i", path,
    "-af", `atrim=${fromSeconds}:${toSeconds},volumedetect`,
    "-f", "null", "-",
  ]);
  const match = /mean_volume: (-?[\d.]+) dB/.exec(stderr);
  if (!match) throw new Error("volumedetect printed no mean_volume");
  return Number(match[1]);
}

describe("fixtures", () => {
  it("probes the generated sources as expected", () => {
    expect(sourceVideo).toMatchObject({
      durationMs: 4000,
      video: { codec: "h264", width: 640, height: 480, pixelFormat: "yuvj420p", colorRange: "pc" },
      audio: { codec: "aac", sampleRateHz: 44_100 },
    });
    expect(assets).toMatchObject([
      { kind: "image", durationMs: null, width: 640, height: 360, hasAudio: false },
      { kind: "video", durationMs: 4000, width: 640, height: 480, hasAudio: true },
      { kind: "audio", durationMs: 6000, width: null, height: null, hasAudio: true },
    ]);
  });
});

describe("compile -> render -> probe", () => {
  let output: string;
  let probe: MediaProbe;
  const reports: RenderProgress[] = [];

  beforeAll(async () => {
    output = join(dir, "rendered output.mp4");
    await executeRenderPlan(plan(), output, { onProgress: (progress) => reports.push({ ...progress }) });
    probe = await probeMedia(output);
  });

  it("produces the expected container duration", () => {
    expect(probe.formatName).toContain("mp4");
    expect(Math.abs((probe.durationMs ?? 0) - 2000)).toBeLessThanOrEqual(50);
  });

  it("produces one H.264 video stream at the preset size and frame rate", () => {
    expect(probe.video).toMatchObject({
      codec: "h264",
      width: 270,
      height: 480,
      frameRate: { numerator: 30, denominator: 1 },
    });
    expect(Math.abs((probe.video?.durationMs ?? 0) - 2000)).toBeLessThanOrEqual(50);
  });

  it("normalizes a full-range source to limited-range yuv420p", () => {
    expect(sourceVideo.video).toMatchObject({ pixelFormat: "yuvj420p", colorRange: "pc" });
    expect(probe.video).toMatchObject({ pixelFormat: "yuv420p", colorRange: "tv", colorSpace: "bt709" });
  });

  it("produces one AAC stream in the preset format, as long as the video", () => {
    expect(probe.audio).toMatchObject({ codec: "aac", sampleRateHz: 48_000, channels: 2 });
    // Regression: delayed, retimed clip audio once truncated the mix to 0.02 s.
    expect(Math.abs((probe.audio?.durationMs ?? 0) - 2000)).toBeLessThanOrEqual(100);
  });

  it("mixes the video clip's audio in at its place on the timeline", async () => {
    const musicOnly = await meanVolumeDb(output, 0.1, 0.9);
    const musicAndClip = await meanVolumeDb(output, 1.1, 1.4);

    expect(musicOnly).toBeGreaterThan(-40);
    expect(musicAndClip).toBeGreaterThan(musicOnly + 1);
  });

  it("reports increasing progress that ends at exactly 1", () => {
    expect(reports.length).toBeGreaterThan(0);
    const ratios = reports.map((report) => report.ratio);
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios);
    expect(reports.at(-1)).toMatchObject({ ratio: 1, done: true });
    expect(reports.slice(0, -1).every((report) => report.ratio < 1 && !report.done)).toBe(true);
  });
});

describe("render variants", () => {
  it("renders silence when nothing is audible", async () => {
    const c = composition();
    c.tracks[1].clips = [];
    (c.tracks[0].clips[1] as { volume: number }).volume = 0;
    const output = join(dir, "silent.mp4");

    await executeRenderPlan(plan(c), output);
    const probe = await probeMedia(output);

    expect(probe.audio).toMatchObject({ codec: "aac", sampleRateHz: 48_000, channels: 2 });
    expect(await meanVolumeDb(output, 0, 2)).toBeLessThan(-80);
  });

  it("renders a single image clip", async () => {
    const c = composition();
    c.tracks[0].clips = [c.tracks[0].clips[0]!];
    const output = join(dir, "single image.mp4");

    await executeRenderPlan(plan(c), output);
    const probe = await probeMedia(output);

    expect(Math.abs((probe.durationMs ?? 0) - 1000)).toBeLessThanOrEqual(50);
    expect(probe.video).toMatchObject({ width: 270, height: 480, pixelFormat: "yuv420p", colorRange: "tv" });
  });

  it("renders a slowed clip at the expected length", async () => {
    const c = composition();
    Object.assign(c.tracks[0].clips[1]!, { sourceStartMs: 0, sourceEndMs: 500, speed: 0.25, durationMs: 2000 });
    const output = join(dir, "slow.mp4");

    await executeRenderPlan(plan(c), output);
    const probe = await probeMedia(output);

    expect(Math.abs((probe.durationMs ?? 0) - 3000)).toBeLessThanOrEqual(50);
    expect(Math.abs((probe.audio?.durationMs ?? 0) - 3000)).toBeLessThanOrEqual(100);
  });
});

describe("failure and cancellation", () => {
  it("rejects and leaves no output when an input file is missing", async () => {
    const broken = assets.map((asset) =>
      asset.id === "asset-video" ? { ...asset, path: join(dir, "does not exist.mp4") } : asset,
    );
    const output = join(dir, "failed.mp4");

    const error = await executeRenderPlan(plan(composition(), broken), output).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProcessError);
    expect(error).toMatchObject({ failure: "exit" });
    expect((error as ProcessError).exitCode).not.toBe(0);
    expect((error as ProcessError).stderr.length).toBeGreaterThan(0);
    expect(isCancellation(error)).toBe(false);
    expect(existsSync(output)).toBe(false);
  });

  it("stops FFmpeg and removes the partial output when aborted mid-render", async () => {
    // A long, slow render so there is time to cancel it.
    const c = composition();
    c.tracks[0].clips = Array.from({ length: 5 }, (_unused, index) => ({
      id: `clip-long-${index}`,
      kind: "image" as const,
      assetId: "asset-image",
      durationMs: 60_000,
    }));
    const slow: RenderPreset = { ...PRESET, width: 1080, height: 1920, encoderPreset: "slow" };
    const compiled = compileRenderPlan(c, assets, slow);
    if (!compiled.ok) throw new Error("compile failed");
    const output = join(dir, "cancelled.mp4");

    const controller = new AbortController();
    let sawFileWhileRunning = false;
    const started = Date.now();
    const running = executeRenderPlan(compiled.value, output, {
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.outTimeMs > 0 && !controller.signal.aborted) {
          sawFileWhileRunning = existsSync(output);
          controller.abort();
        }
      },
    });

    const error = await running.catch((e: unknown) => e);

    expect(isCancellation(error)).toBe(true);
    expect(sawFileWhileRunning).toBe(true);
    expect(existsSync(output)).toBe(false);
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it("does not start FFmpeg when already aborted", async () => {
    const output = join(dir, "never started.mp4");

    const error = await executeRenderPlan(plan(), output, { signal: AbortSignal.abort() }).catch((e: unknown) => e);

    expect(isCancellation(error)).toBe(true);
    expect(existsSync(output)).toBe(false);
  });

  it("leaves no stray files besides fixtures and completed renders", async () => {
    const names = await readdir(dir);

    expect(names.filter((name) => /failed|cancelled|never started/.test(name))).toEqual([]);
  });
});
