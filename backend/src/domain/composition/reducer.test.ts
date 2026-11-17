import { describe, expect, it } from "vitest";
import spikeAssetsJson from "./__fixtures__/spike.assets.json" with { type: "json" };
import spikeCompositionJson from "./__fixtures__/spike.composition.json" with { type: "json" };
import type { Issue, IssueCode, IssuePath } from "./issues.js";
import type { EditOperation } from "./operations.js";
import { applyOperations } from "./reducer.js";
import { assetRefSchema, compositionSchema } from "./schema.js";
import type { AssetRef, AudioClip, Composition } from "./types.js";
import { validateComposition } from "./validate.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Frozen inputs: any attempt to mutate them throws, in every test.
const composition: Composition = deepFreeze(compositionSchema.parse(clone(spikeCompositionJson)));
const assets: readonly AssetRef[] = deepFreeze(assetRefSchema.array().parse(clone(spikeAssetsJson)));

const newImage = { id: "clip-image-2", kind: "image", assetId: "asset-pic", durationMs: 2000 } as const;
const newVideo = {
  id: "clip-video-2",
  kind: "video",
  assetId: "asset-vid",
  sourceStartMs: 10_000,
  sourceEndMs: 14_000,
  speed: 2,
  volume: 1,
} as const;
const newMusic = {
  id: "clip-music-2",
  kind: "audio",
  assetId: "asset-aud",
  sourceStartMs: 20_000,
  sourceEndMs: 26_000,
  timelineStartMs: 0,
  volume: 0.5,
  fadeInMs: 500,
  fadeOutMs: 1000,
} as const;

function apply(...operations: EditOperation[]) {
  return applyOperations(composition, operations, assets);
}

/** Applies operations that are expected to succeed. */
function applied(...operations: EditOperation[]): Composition {
  const result = apply(...operations);
  if (!result.ok) throw new Error(`expected success, got ${JSON.stringify(result.error)}`);
  return result.value;
}

/** Applies operations that are expected to fail. */
function rejected(operations: unknown): [IssueCode, IssuePath][] {
  const result = applyOperations(composition, operations, assets);
  if (result.ok) throw new Error("expected failure, got success");
  return result.error.map((issue: Issue) => [issue.code, issue.path]);
}

const visualIds = (c: Composition) => c.tracks[0].clips.map((clip) => clip.id);
const audioIds = (c: Composition) => c.tracks[1].clips.map((clip) => clip.id);

describe("applyOperations: effects", () => {
  it("appendClip adds an image clip at the end", () => {
    const result = applied({ op: "appendClip", clip: newImage });

    expect(visualIds(result)).toEqual(["clip-image-1", "clip-video-1", "clip-image-2"]);
    expect(result.tracks[0].clips[2]).toEqual(newImage);
  });

  it("appendClip derives a video clip's duration from its range and speed", () => {
    const result = applied({ op: "appendClip", clip: newVideo });

    expect(result.tracks[0].clips[2]).toEqual({ ...newVideo, durationMs: 2000 });
  });

  it.each([
    [0, ["clip-image-2", "clip-image-1", "clip-video-1"]],
    [1, ["clip-image-1", "clip-image-2", "clip-video-1"]],
    [2, ["clip-image-1", "clip-video-1", "clip-image-2"]],
  ])("insertClip places the clip at index %d", (index, expected) => {
    expect(visualIds(applied({ op: "insertClip", index, clip: newImage }))).toEqual(expected);
  });

  it("removeClip removes a visual clip", () => {
    expect(visualIds(applied({ op: "removeClip", clipId: "clip-image-1" }))).toEqual(["clip-video-1"]);
  });

  it("removeClip removes an audio clip", () => {
    const result = applied({ op: "removeClip", clipId: "clip-music-1" });

    expect(audioIds(result)).toEqual([]);
    expect(visualIds(result)).toEqual(visualIds(composition));
  });

  it("moveClip reorders the visual track", () => {
    expect(visualIds(applied({ op: "moveClip", clipId: "clip-video-1", toIndex: 0 }))).toEqual([
      "clip-video-1",
      "clip-image-1",
    ]);
    expect(visualIds(applied({ op: "moveClip", clipId: "clip-image-1", toIndex: 1 }))).toEqual([
      "clip-video-1",
      "clip-image-1",
    ]);
    expect(visualIds(applied({ op: "moveClip", clipId: "clip-image-1", toIndex: 0 }))).toEqual(
      visualIds(composition),
    );
  });

  it("trimClip sets a video clip's range and recomputes its duration", () => {
    const result = applied({ op: "trimClip", clipId: "clip-video-1", sourceStartMs: 2000, sourceEndMs: 3500 });

    expect(result.tracks[0].clips[1]).toMatchObject({ sourceStartMs: 2000, sourceEndMs: 3500, durationMs: 1500 });
  });

  it("trimClip sets an audio clip's range", () => {
    const result = applied({ op: "trimClip", clipId: "clip-music-1", sourceStartMs: 30_000, sourceEndMs: 36_000 });

    expect(result.tracks[1].clips[0]).toMatchObject({ sourceStartMs: 30_000, sourceEndMs: 36_000 });
  });

  it("setClipSpeed sets the speed and recomputes the duration from the source range", () => {
    const result = applied({ op: "setClipSpeed", clipId: "clip-video-1", speed: 2 });

    expect(result.tracks[0].clips[1]).toMatchObject({ speed: 2, durationMs: 2500, sourceStartMs: 0, sourceEndMs: 5000 });
  });

  it("setImageDuration sets an image clip's duration", () => {
    const result = applied({ op: "setImageDuration", clipId: "clip-image-1", durationMs: 1500 });

    expect(result.tracks[0].clips[0]).toMatchObject({ durationMs: 1500 });
  });

  it("setClipVolume sets the volume of video and audio clips", () => {
    const result = applied(
      { op: "setClipVolume", clipId: "clip-video-1", volume: 0.25 },
      { op: "setClipVolume", clipId: "clip-music-1", volume: 0.75 },
    );

    expect(result.tracks[0].clips[1]).toMatchObject({ volume: 0.25 });
    expect(result.tracks[1].clips[0]).toMatchObject({ volume: 0.75 });
  });

  it("setBackgroundAudio replaces the audio track's clips", () => {
    expect(applied({ op: "setBackgroundAudio", clip: newMusic }).tracks[1].clips).toEqual([newMusic]);
  });

  it("setBackgroundAudio with null clears the audio track", () => {
    expect(applied({ op: "setBackgroundAudio", clip: null }).tracks[1].clips).toEqual([]);
  });

  it("applies a batch in order", () => {
    const result = applied(
      { op: "appendClip", clip: newVideo },
      { op: "moveClip", clipId: "clip-video-2", toIndex: 0 },
      { op: "setClipSpeed", clipId: "clip-video-2", speed: 4 },
      { op: "removeClip", clipId: "clip-image-1" },
    );

    expect(visualIds(result)).toEqual(["clip-video-2", "clip-video-1"]);
    expect(result.tracks[0].clips[0]).toMatchObject({ speed: 4, durationMs: 1000 });
  });

  it("leaves everything it was not asked to change untouched", () => {
    const result = applied({ op: "setImageDuration", clipId: "clip-image-1", durationMs: 1500 });
    const expected = clone(composition);
    expected.tracks[0].clips[0]!.durationMs = 1500;

    expect(result).toEqual(expected);
  });
});

describe("applyOperations: setClipSpeed is idempotent", () => {
  const speedUp: EditOperation = { op: "setClipSpeed", clipId: "clip-video-1", speed: 2 };

  it("gives the same result when repeated in one batch", () => {
    expect(applied(speedUp, speedUp, speedUp)).toEqual(applied(speedUp));
  });

  it("gives the same result when applied to its own output", () => {
    const once = applied(speedUp);
    const twice = applyOperations(once, [speedUp], assets);

    expect(twice).toEqual({ ok: true, value: once });
  });

  it("returns to the original duration when the speed is set back to 1", () => {
    const result = applied(speedUp, { op: "setClipSpeed", clipId: "clip-video-1", speed: 1 });

    expect(result).toEqual(composition);
  });

  it("uses the trimmed range, whichever of trim and speed comes first", () => {
    const trim: EditOperation = { op: "trimClip", clipId: "clip-video-1", sourceStartMs: 1000, sourceEndMs: 4000 };

    expect(applied(trim, speedUp)).toEqual(applied(speedUp, trim));
    expect(applied(trim, speedUp).tracks[0].clips[1]).toMatchObject({ durationMs: 1500 });
  });
});

describe("applyOperations: purity", () => {
  it("never mutates the input composition, operations, or assets", () => {
    const before = clone({ composition, assets });
    const operations: EditOperation[] = deepFreeze([
      { op: "appendClip", clip: { ...newVideo } },
      { op: "setBackgroundAudio", clip: { ...newMusic } },
      { op: "removeClip", clipId: "clip-image-1" },
    ]);

    const result = applyOperations(composition, operations, assets);

    expect(result.ok).toBe(true);
    expect({ composition, assets }).toEqual(before);
  });

  it("returns a new object that shares no clips with the input", () => {
    const result = applied({ op: "setClipVolume", clipId: "clip-music-1", volume: 0.5 });

    expect(result).not.toBe(composition);
    expect(result.tracks[0].clips[0]).not.toBe(composition.tracks[0].clips[0]);
    expect(result.tracks[0].clips[0]).toEqual(composition.tracks[0].clips[0]);
  });

  it("does not let later changes to the operations leak into the result", () => {
    const clip: AudioClip = { ...newMusic };
    const result = applied({ op: "setBackgroundAudio", clip });
    clip.volume = 0;

    expect(result.tracks[1].clips[0]).toMatchObject({ volume: 0.5 });
  });

  it("always returns a composition that passes validation", () => {
    const result = applied({ op: "appendClip", clip: newVideo }, { op: "setBackgroundAudio", clip: newMusic });

    expect(validateComposition(result, assets)).toEqual([]);
  });
});

describe("applyOperations: all or nothing", () => {
  it("rejects structurally invalid operations before applying anything", () => {
    expect(rejected([{ op: "removeClip", clipId: "clip-image-1" }, { op: "removeClip", clipId: "../x" }])).toEqual([
      ["INVALID_STRUCTURE", ["operations", 1, "clipId"]],
    ]);
    expect(rejected([{ op: "runCommand", command: "rm -rf /" }])).toEqual([
      ["INVALID_STRUCTURE", ["operations", 0, "op"]],
    ]);
    expect(rejected("not operations")).toEqual([["INVALID_STRUCTURE", ["operations"]]]);
    expect(rejected([])).toEqual([["INVALID_STRUCTURE", ["operations"]]]);
  });

  it("returns no composition when an operation fails midway", () => {
    const result = apply(
      { op: "setImageDuration", clipId: "clip-image-1", durationMs: 1500 },
      { op: "removeClip", clipId: "clip-missing" },
      { op: "setClipVolume", clipId: "clip-music-1", volume: 0.5 },
    );

    expect(result).toEqual({
      ok: false,
      error: [
        {
          code: "CLIP_NOT_FOUND",
          path: ["operations", 1, "clipId"],
          message: expect.stringContaining("clip-missing"),
        },
      ],
    });
    expect(result).not.toHaveProperty("value");
  });

  it("returns no composition when the final result is semantically invalid", () => {
    const result = apply(
      { op: "setImageDuration", clipId: "clip-image-1", durationMs: 1500 },
      { op: "setClipSpeed", clipId: "clip-video-1", speed: 100 },
    );

    expect(result).toEqual({
      ok: false,
      error: [expect.objectContaining({ code: "SPEED_OUT_OF_RANGE", path: ["tracks", 0, "clips", 1, "speed"] })],
    });
  });

  it("allows an invalid intermediate state if the final result is valid", () => {
    const result = applied(
      { op: "removeClip", clipId: "clip-image-1" },
      { op: "removeClip", clipId: "clip-video-1" }, // the visual track is empty here
      { op: "appendClip", clip: newImage },
    );

    expect(visualIds(result)).toEqual(["clip-image-2"]);
  });

  it.each<[string, EditOperation, [IssueCode, IssuePath][]]>([
    ["a missing clip", { op: "moveClip", clipId: "nope", toIndex: 0 }, [["CLIP_NOT_FOUND", ["operations", 0, "clipId"]]]],
    ["an insert past the end", { op: "insertClip", index: 3, clip: newImage }, [["INDEX_OUT_OF_RANGE", ["operations", 0, "index"]]]],
    ["a move past the end", { op: "moveClip", clipId: "clip-image-1", toIndex: 2 }, [["INDEX_OUT_OF_RANGE", ["operations", 0, "toIndex"]]]],
    ["moving an audio clip", { op: "moveClip", clipId: "clip-music-1", toIndex: 0 }, [["CLIP_KIND_NOT_SUPPORTED", ["operations", 0, "clipId"]]]],
    ["trimming an image clip", { op: "trimClip", clipId: "clip-image-1", sourceStartMs: 0, sourceEndMs: 1 }, [["CLIP_KIND_NOT_SUPPORTED", ["operations", 0, "clipId"]]]],
    ["speeding up an image clip", { op: "setClipSpeed", clipId: "clip-image-1", speed: 2 }, [["CLIP_KIND_NOT_SUPPORTED", ["operations", 0, "clipId"]]]],
    ["speeding up an audio clip", { op: "setClipSpeed", clipId: "clip-music-1", speed: 2 }, [["CLIP_KIND_NOT_SUPPORTED", ["operations", 0, "clipId"]]]],
    ["an image duration on a video clip", { op: "setImageDuration", clipId: "clip-video-1", durationMs: 1000 }, [["CLIP_KIND_NOT_SUPPORTED", ["operations", 0, "clipId"]]]],
    ["a volume on an image clip", { op: "setClipVolume", clipId: "clip-image-1", volume: 1 }, [["CLIP_KIND_NOT_SUPPORTED", ["operations", 0, "clipId"]]]],
  ])("rejects %s", (_name, operation, expected) => {
    expect(rejected([operation])).toEqual(expected);
  });

  it.each<[string, EditOperation, [IssueCode, IssuePath][]]>([
    ["a duplicate clip ID", { op: "appendClip", clip: { ...newImage, id: "clip-video-1" } }, [["DUPLICATE_ID", ["tracks", 0, "clips", 2, "id"]]]],
    ["an unknown asset", { op: "appendClip", clip: { ...newImage, assetId: "asset-missing" } }, [["ASSET_NOT_FOUND", ["tracks", 0, "clips", 2, "assetId"]]]],
    ["an image clip using a video asset", { op: "appendClip", clip: { ...newImage, assetId: "asset-vid" } }, [["ASSET_KIND_MISMATCH", ["tracks", 0, "clips", 2, "assetId"]]]],
    ["a trim past the end of the asset", { op: "trimClip", clipId: "clip-video-1", sourceStartMs: 0, sourceEndMs: 999_999 }, [["SOURCE_RANGE_OUT_OF_BOUNDS", ["tracks", 0, "clips", 1, "sourceEndMs"]]]],
    ["a reversed trim", { op: "trimClip", clipId: "clip-video-1", sourceStartMs: 4000, sourceEndMs: 1000 }, [["SOURCE_RANGE_INVALID", ["tracks", 0, "clips", 1, "sourceEndMs"]]]],
    ["a zero speed", { op: "setClipSpeed", clipId: "clip-video-1", speed: 0 }, [["SPEED_OUT_OF_RANGE", ["tracks", 0, "clips", 1, "speed"]]]],
    ["a volume above 1", { op: "setClipVolume", clipId: "clip-music-1", volume: 1.5 }, [["VOLUME_OUT_OF_RANGE", ["tracks", 1, "clips", 0, "volume"]]]],
    ["an image shown for too long", { op: "setImageDuration", clipId: "clip-image-1", durationMs: 60_001 }, [["IMAGE_DURATION_OUT_OF_RANGE", ["tracks", 0, "clips", 0, "durationMs"]]]],
    ["a trim that makes the fade too long", { op: "trimClip", clipId: "clip-music-1", sourceStartMs: 0, sourceEndMs: 1000 }, [["FADE_TOO_LONG", ["tracks", 1, "clips", 0, "fadeOutMs"]]]],
  ])("rejects a result with %s", (_name, operation, expected) => {
    expect(rejected([operation])).toEqual(expected);
  });

  it("rejects removing every visual clip", () => {
    expect(
      rejected([
        { op: "removeClip", clipId: "clip-image-1" },
        { op: "removeClip", clipId: "clip-video-1" },
      ]),
    ).toEqual([["VISUAL_TRACK_EMPTY", ["tracks", 0, "clips"]]]);
  });
});

describe("applyOperations: the result is always storable", () => {
  it("rejects a batch that shrinks a video clip to nothing", () => {
    expect(
      rejected([
        { op: "trimClip", clipId: "clip-video-1", sourceStartMs: 0, sourceEndMs: 1 },
        { op: "setClipSpeed", clipId: "clip-video-1", speed: 4 },
      ]),
    ).toEqual([["VIDEO_DURATION_TOO_SHORT", ["tracks", 0, "clips", 1, "durationMs"]]]);
  });

  it("rejects an input composition that carries an unknown key", () => {
    const smuggled = clone(composition);
    (smuggled.tracks[0].clips[0] as unknown as Record<string, unknown>).filePath = "C:/secret.png";

    const result = applyOperations(smuggled, [{ op: "setClipVolume", clipId: "clip-music-1", volume: 0.5 }], assets);

    expect(result).toEqual({
      ok: false,
      error: [expect.objectContaining({ code: "INVALID_STRUCTURE", path: ["tracks", 0, "clips", 0] })],
    });
  });

  it("moves a clip forward in a three-clip track", () => {
    const result = applied(
      { op: "appendClip", clip: newImage },
      { op: "moveClip", clipId: "clip-image-1", toIndex: 2 },
    );

    expect(visualIds(result)).toEqual(["clip-video-1", "clip-image-2", "clip-image-1"]);
  });

  it("does not throw on deeply nested operations", () => {
    let nested: unknown = [];
    for (let depth = 0; depth < 20_000; depth += 1) nested = [nested];

    expect(applyOperations(composition, nested, assets).ok).toBe(false);
  });
});
