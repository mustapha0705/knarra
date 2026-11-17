import { describe, expect, it } from "vitest";
import spikeAssetsJson from "../domain/composition/__fixtures__/spike.assets.json" with { type: "json" };
import spikeCompositionJson from "../domain/composition/__fixtures__/spike.composition.json" with { type: "json" };
import { assetRefSchema, compositionSchema } from "../domain/composition/index.js";
import type { MediaProbe } from "../media/index.js";
import { fitSourceRanges, toAssetRef } from "./exports.js";

const video = {
  codec: "h264",
  width: 1280,
  height: 720,
  pixelFormat: "yuv420p",
  colorRange: "tv",
  colorSpace: null,
  frameRate: { numerator: 30, denominator: 1 },
  durationMs: 4000 as number | null,
};
const audio = { codec: "aac", sampleRateHz: 44_100, channels: 2, durationMs: 4000 };
const probe = (overrides: Partial<MediaProbe>): MediaProbe => ({
  formatName: "mov,mp4,m4a,3gp,3g2,mj2",
  durationMs: 4000,
  video: null,
  audio: null,
  ...overrides,
});

describe("toAssetRef", () => {
  it("reads a video with sound", () => {
    expect(toAssetRef("a", probe({ video, audio }))).toEqual({
      id: "a",
      kind: "video",
      durationMs: 4000,
      width: 1280,
      height: 720,
      hasAudio: true,
    });
  });

  it("reads a silent video", () => {
    expect(toAssetRef("a", probe({ video }))).toMatchObject({ kind: "video", hasAudio: false });
  });

  it.each<[string, number | null]>([
    ["png_pipe", null],
    ["jpeg_pipe", 40],
    ["image2", 40],
    ["webp_pipe", null],
  ])("reads %s as a still image", (formatName, durationMs) => {
    expect(toAssetRef("a", probe({ formatName, durationMs, video: { ...video, durationMs } }))).toEqual({
      id: "a",
      kind: "image",
      durationMs: null,
      width: 1280,
      height: 720,
      hasAudio: false,
    });
  });

  it("reads an animated GIF as video", () => {
    expect(toAssetRef("a", probe({ formatName: "gif", durationMs: 2500, video }))).toMatchObject({
      kind: "video",
      durationMs: 2500,
    });
  });

  it("reads an audio file", () => {
    expect(toAssetRef("a", probe({ formatName: "mp3", audio }))).toEqual({
      id: "a",
      kind: "audio",
      durationMs: 4000,
      width: null,
      height: null,
      hasAudio: true,
    });
  });

  it("returns null for a file with no picture and no sound", () => {
    expect(toAssetRef("a", probe({ formatName: "srt" }))).toBeNull();
  });
});

describe("fitSourceRanges", () => {
  const assets = assetRefSchema.array().parse(spikeAssetsJson);
  const withVideoRange = (sourceEndMs: number, sourceStartMs = 0) => {
    const composition = compositionSchema.parse(JSON.parse(JSON.stringify(spikeCompositionJson)));
    Object.assign(composition.tracks[0].clips[1]!, { sourceStartMs, sourceEndMs });
    return composition;
  };

  it("leaves ranges inside the file alone", () => {
    expect(fitSourceRanges(withVideoRange(229_005), assets)).toEqual([]);
  });

  it("trims a range that overshoots by up to 500 ms", () => {
    expect(fitSourceRanges(withVideoRange(229_505, 224_000), assets)).toEqual([
      { op: "trimClip", clipId: "clip-video-1", sourceStartMs: 224_000, sourceEndMs: 229_005 },
    ]);
  });

  it("leaves a larger overshoot for validation to report", () => {
    expect(fitSourceRanges(withVideoRange(229_506), assets)).toEqual([]);
  });

  it("does not create an empty range", () => {
    expect(fitSourceRanges(withVideoRange(229_100, 229_005), assets)).toEqual([]);
  });

  it("also fits audio clips", () => {
    const composition = withVideoRange(5000);
    composition.tracks[1].clips[0]!.sourceEndMs = 198_300;

    expect(fitSourceRanges(composition, assets)).toEqual([
      { op: "trimClip", clipId: "clip-music-1", sourceStartMs: 0, sourceEndMs: 198_200 },
    ]);
  });
});
