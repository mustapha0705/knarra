import { describe, expect, it } from "vitest";
import spikeAssetsJson from "./__fixtures__/spike.assets.json" with { type: "json" };
import spikeCompositionJson from "./__fixtures__/spike.composition.json" with { type: "json" };
import type { Issue, IssueCode, IssuePath } from "./issues.js";
import { assetRefSchema, compositionSchema } from "./schema.js";
import type { AssetRef, AudioClip, Composition, ImageClip, VideoClip } from "./types.js";
import { expectedVideoDurationMs, validateComposition } from "./validate.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Fresh copies of the valid spike fixture, safe to mutate in a test. */
function spike(): { composition: Composition; assets: AssetRef[] } {
  return {
    composition: compositionSchema.parse(clone(spikeCompositionJson)),
    assets: assetRefSchema.array().parse(clone(spikeAssetsJson)),
  };
}

function imageClip(c: Composition): ImageClip {
  const clip = c.tracks[0].clips[0];
  if (clip?.kind !== "image") throw new Error("fixture changed: expected an image clip first");
  return clip;
}

function videoClip(c: Composition): VideoClip {
  const clip = c.tracks[0].clips[1];
  if (clip?.kind !== "video") throw new Error("fixture changed: expected a video clip second");
  return clip;
}

function musicClip(c: Composition): AudioClip {
  const clip = c.tracks[1].clips[0];
  if (!clip) throw new Error("fixture changed: expected an audio clip");
  return clip;
}

const IMAGE: IssuePath = ["tracks", 0, "clips", 0];
const VIDEO: IssuePath = ["tracks", 0, "clips", 1];
const MUSIC: IssuePath = ["tracks", 1, "clips", 0];

function summary(issues: Issue[]): [IssueCode, IssuePath][] {
  return issues.map((issue) => [issue.code, issue.path]);
}

/** Applies a change to the spike and returns the resulting issues. */
function issuesAfter(change: (c: Composition, assets: AssetRef[]) => void): Issue[] {
  const { composition, assets } = spike();
  change(composition, assets);
  return validateComposition(composition, assets);
}

describe("validateComposition", () => {
  it("accepts the spike composition", () => {
    const { composition, assets } = spike();
    expect(validateComposition(composition, assets)).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const { composition, assets } = spike();
    videoClip(composition).speed = 100; // make it report something
    const before = clone({ composition, assets });

    validateComposition(composition, assets);

    expect({ composition, assets }).toEqual(before);
  });

  it("gives every issue a code, a path, and a message that says what to do", () => {
    const issues = issuesAfter((c) => {
      videoClip(c).speed = 100;
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      code: "SPEED_OUT_OF_RANGE",
      path: [...VIDEO, "speed"],
      message: expect.stringContaining("Use a value from 0.25 to 4"),
    });
  });

  describe("unique IDs", () => {
    it("rejects two clips with the same ID, across tracks", () => {
      const issues = issuesAfter((c) => {
        musicClip(c).id = imageClip(c).id;
      });
      expect(summary(issues)).toEqual([["DUPLICATE_ID", [...MUSIC, "id"]]]);
    });

    it("rejects a track that reuses the composition ID", () => {
      const issues = issuesAfter((c) => {
        c.tracks[0].id = c.id;
      });
      expect(summary(issues)).toEqual([["DUPLICATE_ID", ["tracks", 0, "id"]]]);
    });

    it("rejects a clip that reuses a track ID", () => {
      const issues = issuesAfter((c) => {
        videoClip(c).id = c.tracks[0].id;
      });
      expect(summary(issues)).toEqual([["DUPLICATE_ID", [...VIDEO, "id"]]]);
    });

    it("allows two clips to use the same asset", () => {
      const issues = issuesAfter((c) => {
        c.tracks[0].clips.push({ ...imageClip(c), id: "clip-image-2" });
      });
      expect(issues).toEqual([]);
    });

    it("rejects a duplicate ID in the asset catalog", () => {
      const issues = issuesAfter((_c, assets) => {
        assets.push({ ...assets[0]! });
      });
      expect(summary(issues)).toEqual([["ASSET_CATALOG_DUPLICATE_ID", ["assets", 3, "id"]]]);
    });
  });

  describe("asset references", () => {
    it("rejects a clip whose asset does not exist", () => {
      const issues = issuesAfter((c) => {
        imageClip(c).assetId = "asset-missing";
      });
      expect(summary(issues)).toEqual([["ASSET_NOT_FOUND", [...IMAGE, "assetId"]]]);
    });

    it("rejects every clip when the catalog is empty", () => {
      const { composition } = spike();
      expect(summary(validateComposition(composition, []))).toEqual([
        ["ASSET_NOT_FOUND", [...IMAGE, "assetId"]],
        ["ASSET_NOT_FOUND", [...VIDEO, "assetId"]],
        ["ASSET_NOT_FOUND", [...MUSIC, "assetId"]],
      ]);
    });

    it("rejects an image clip that points at a video asset", () => {
      const issues = issuesAfter((c) => {
        imageClip(c).assetId = "asset-vid";
      });
      expect(summary(issues)).toEqual([["ASSET_KIND_MISMATCH", [...IMAGE, "assetId"]]]);
    });

    it("rejects an audio clip that points at a video asset", () => {
      const issues = issuesAfter((c) => {
        musicClip(c).assetId = "asset-vid";
      });
      expect(summary(issues)).toEqual([["ASSET_KIND_MISMATCH", [...MUSIC, "assetId"]]]);
    });

    it("rejects a video asset with unknown duration", () => {
      const issues = issuesAfter((_c, assets) => {
        assets[1]!.durationMs = null;
      });
      expect(summary(issues)).toEqual([["ASSET_METADATA_MISSING", [...VIDEO, "assetId"]]]);
    });

    it("rejects an image asset with unknown dimensions", () => {
      const issues = issuesAfter((_c, assets) => {
        assets[0]!.width = null;
      });
      expect(summary(issues)).toEqual([["ASSET_METADATA_MISSING", [...IMAGE, "assetId"]]]);
    });

    it("ignores problems in assets that no clip uses", () => {
      const issues = issuesAfter((_c, assets) => {
        assets.push({ id: "asset-unused", kind: "video", durationMs: null, width: null, height: null, hasAudio: false });
      });
      expect(issues).toEqual([]);
    });
  });

  describe("source range: 0 <= start < end <= asset duration", () => {
    it("accepts a range that ends exactly at the asset's end", () => {
      const issues = issuesAfter((c) => {
        const clip = videoClip(c);
        clip.sourceStartMs = 224_005;
        clip.sourceEndMs = 229_005;
      });
      expect(issues).toEqual([]);
    });

    it("rejects an empty range", () => {
      const issues = issuesAfter((c) => {
        const clip = videoClip(c);
        clip.sourceStartMs = 5000;
        clip.sourceEndMs = 5000;
      });
      expect(summary(issues)).toEqual([["SOURCE_RANGE_INVALID", [...VIDEO, "sourceEndMs"]]]);
    });

    it("rejects a reversed range on an audio clip", () => {
      const issues = issuesAfter((c) => {
        const clip = musicClip(c);
        clip.sourceStartMs = 9000;
        clip.sourceEndMs = 1000;
        clip.fadeOutMs = 0;
      });
      expect(summary(issues)).toEqual([["SOURCE_RANGE_INVALID", [...MUSIC, "sourceEndMs"]]]);
    });

    it("rejects a video range that runs past the end of the asset", () => {
      const issues = issuesAfter((c) => {
        const clip = videoClip(c);
        clip.sourceStartMs = 224_006;
        clip.sourceEndMs = 229_006;
      });
      expect(summary(issues)).toEqual([["SOURCE_RANGE_OUT_OF_BOUNDS", [...VIDEO, "sourceEndMs"]]]);
    });

    it("rejects an audio range that runs past the end of the asset", () => {
      const issues = issuesAfter((c) => {
        musicClip(c).sourceEndMs = 198_201;
      });
      expect(summary(issues)).toEqual([["SOURCE_RANGE_OUT_OF_BOUNDS", [...MUSIC, "sourceEndMs"]]]);
    });
  });

  describe("speed: 0.25 to 4", () => {
    it.each([
      [0.25, 20_000],
      [1, 5000],
      [4, 1250],
    ])("accepts speed %d", (speed, durationMs) => {
      const issues = issuesAfter((c) => {
        Object.assign(videoClip(c), { speed, durationMs });
      });
      expect(issues).toEqual([]);
    });

    it.each([0, 0.24, 4.01, -1])("rejects speed %d", (speed) => {
      const issues = issuesAfter((c) => {
        videoClip(c).speed = speed;
      });
      expect(summary(issues)).toEqual([["SPEED_OUT_OF_RANGE", [...VIDEO, "speed"]]]);
    });
  });

  describe("video duration = round((end - start) / speed), within 1 ms", () => {
    it("computes the expected duration", () => {
      expect(expectedVideoDurationMs(0, 5000, 1)).toBe(5000);
      expect(expectedVideoDurationMs(0, 5000, 2)).toBe(2500);
      expect(expectedVideoDurationMs(1000, 6000, 0.5)).toBe(10_000);
      expect(expectedVideoDurationMs(0, 1000, 3)).toBe(333);
    });

    it.each([332, 333, 334])("accepts %d ms for a 1000 ms range at speed 3", (durationMs) => {
      const issues = issuesAfter((c) => {
        Object.assign(videoClip(c), { sourceEndMs: 1000, speed: 3, durationMs });
      });
      expect(issues).toEqual([]);
    });

    it.each([331, 335, 1000])("rejects %d ms for a 1000 ms range at speed 3", (durationMs) => {
      const issues = issuesAfter((c) => {
        Object.assign(videoClip(c), { sourceEndMs: 1000, speed: 3, durationMs });
      });
      expect(summary(issues)).toEqual([["DURATION_MISMATCH", [...VIDEO, "durationMs"]]]);
    });

    it("rejects a duration left unchanged after a speed change", () => {
      const issues = issuesAfter((c) => {
        videoClip(c).speed = 2; // durationMs is still 5000
      });
      expect(issues).toEqual([
        {
          code: "DURATION_MISMATCH",
          path: [...VIDEO, "durationMs"],
          message: expect.stringContaining("Set the duration to 2500 ms"),
        },
      ]);
    });
  });

  describe("image duration: 100 ms to 60 s", () => {
    it.each([100, 3000, 60_000])("accepts %d ms", (durationMs) => {
      const issues = issuesAfter((c) => {
        imageClip(c).durationMs = durationMs;
      });
      expect(issues).toEqual([]);
    });

    it.each([0, 99, 60_001])("rejects %d ms", (durationMs) => {
      const issues = issuesAfter((c) => {
        imageClip(c).durationMs = durationMs;
      });
      expect(summary(issues)).toEqual([["IMAGE_DURATION_OUT_OF_RANGE", [...IMAGE, "durationMs"]]]);
    });
  });

  describe("volume: 0 to 1", () => {
    it.each([0, 0.5, 1])("accepts volume %d on video and audio clips", (volume) => {
      const issues = issuesAfter((c) => {
        videoClip(c).volume = volume;
        musicClip(c).volume = volume;
      });
      expect(issues).toEqual([]);
    });

    it.each([-0.1, 1.01])("rejects volume %d on video and audio clips", (volume) => {
      const issues = issuesAfter((c) => {
        videoClip(c).volume = volume;
        musicClip(c).volume = volume;
      });
      expect(summary(issues)).toEqual([
        ["VOLUME_OUT_OF_RANGE", [...VIDEO, "volume"]],
        ["VOLUME_OUT_OF_RANGE", [...MUSIC, "volume"]],
      ]);
    });
  });

  describe("audio clips do not overlap", () => {
    const second = (c: Composition, timelineStartMs: number): AudioClip => ({
      ...musicClip(c),
      id: "clip-music-2",
      sourceStartMs: 10_000,
      sourceEndMs: 12_000,
      timelineStartMs,
      fadeOutMs: 0,
    });

    it("accepts clips that touch end to start", () => {
      const issues = issuesAfter((c) => {
        c.tracks[1].clips.push(second(c, 8000));
      });
      expect(issues).toEqual([]);
    });

    it("rejects a clip that starts before the previous one ends", () => {
      const issues = issuesAfter((c) => {
        c.tracks[1].clips.push(second(c, 7999));
      });
      expect(issues).toEqual([
        {
          code: "AUDIO_CLIPS_OVERLAP",
          path: ["tracks", 1, "clips", 1, "timelineStartMs"],
          message: expect.stringContaining("start it at or after 8000 ms"),
        },
      ]);
    });

    it("finds overlaps regardless of array order", () => {
      const issues = issuesAfter((c) => {
        musicClip(c).timelineStartMs = 1000; // occupies 1000-9000
        c.tracks[1].clips.push(second(c, 0)); // occupies 0-2000
      });
      expect(summary(issues)).toEqual([
        ["AUDIO_CLIPS_OVERLAP", ["tracks", 1, "clips", 0, "timelineStartMs"]],
      ]);
    });

    it("reports a clip nested inside a longer one", () => {
      const issues = issuesAfter((c) => {
        c.tracks[1].clips.push(second(c, 1000), { ...second(c, 4000), id: "clip-music-3" });
      });
      expect(summary(issues)).toEqual([
        ["AUDIO_CLIPS_OVERLAP", ["tracks", 1, "clips", 1, "timelineStartMs"]],
        ["AUDIO_CLIPS_OVERLAP", ["tracks", 1, "clips", 2, "timelineStartMs"]],
      ]);
    });

    it("accepts an empty audio track", () => {
      const issues = issuesAfter((c) => {
        c.tracks[1].clips = [];
      });
      expect(issues).toEqual([]);
    });
  });

  describe("the visual track is not empty", () => {
    it("rejects a visual track with no clips", () => {
      const issues = issuesAfter((c) => {
        c.tracks[0].clips = [];
      });
      expect(summary(issues)).toEqual([["VISUAL_TRACK_EMPTY", ["tracks", 0, "clips"]]]);
    });

    it("accepts a single image clip", () => {
      const issues = issuesAfter((c) => {
        c.tracks[0].clips = [imageClip(c)];
      });
      expect(issues).toEqual([]);
    });
  });

  describe("fades are no longer than their clip", () => {
    it("accepts fades that exactly fill the clip", () => {
      const issues = issuesAfter((c) => {
        Object.assign(musicClip(c), { fadeInMs: 3000, fadeOutMs: 5000 });
      });
      expect(issues).toEqual([]);
    });

    it("rejects a fade-out longer than the clip", () => {
      const issues = issuesAfter((c) => {
        musicClip(c).fadeOutMs = 8001;
      });
      expect(summary(issues)).toEqual([["FADE_TOO_LONG", [...MUSIC, "fadeOutMs"]]]);
    });

    it("rejects a fade-in longer than the clip", () => {
      const issues = issuesAfter((c) => {
        Object.assign(musicClip(c), { fadeInMs: 9000, fadeOutMs: 0 });
      });
      expect(summary(issues)).toEqual([["FADE_TOO_LONG", [...MUSIC, "fadeInMs"]]]);
    });

    it("rejects fades that together are longer than the clip", () => {
      const issues = issuesAfter((c) => {
        Object.assign(musicClip(c), { fadeInMs: 5000, fadeOutMs: 5000 });
      });
      expect(summary(issues)).toEqual([["FADE_TOO_LONG", MUSIC]]);
    });
  });

  it("reports every problem in a composition with several", () => {
    const issues = issuesAfter((c) => {
      imageClip(c).durationMs = 50;
      imageClip(c).assetId = "asset-missing";
      Object.assign(videoClip(c), { speed: 9, volume: 2, sourceEndMs: 999_999 });
      Object.assign(musicClip(c), { id: videoClip(c).id, fadeOutMs: 20_000, volume: -1 });
      c.tracks[1].clips.push({ ...musicClip(c), id: "clip-music-2", timelineStartMs: 4000 });
    });

    expect(summary(issues)).toEqual([
      ["ASSET_NOT_FOUND", [...IMAGE, "assetId"]],
      ["IMAGE_DURATION_OUT_OF_RANGE", [...IMAGE, "durationMs"]],
      ["SOURCE_RANGE_OUT_OF_BOUNDS", [...VIDEO, "sourceEndMs"]],
      ["SPEED_OUT_OF_RANGE", [...VIDEO, "speed"]],
      ["VOLUME_OUT_OF_RANGE", [...VIDEO, "volume"]],
      ["DUPLICATE_ID", [...MUSIC, "id"]],
      ["VOLUME_OUT_OF_RANGE", [...MUSIC, "volume"]],
      ["FADE_TOO_LONG", [...MUSIC, "fadeOutMs"]],
      ["VOLUME_OUT_OF_RANGE", ["tracks", 1, "clips", 1, "volume"]],
      ["FADE_TOO_LONG", ["tracks", 1, "clips", 1, "fadeOutMs"]],
      ["AUDIO_CLIPS_OVERLAP", ["tracks", 1, "clips", 1, "timelineStartMs"]],
    ]);
  });
});
