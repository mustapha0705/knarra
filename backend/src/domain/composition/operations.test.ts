import { describe, expect, it } from "vitest";
import {
  EDIT_OPERATION_NAMES,
  MAX_OPERATIONS_PER_BATCH,
  editOperationSchema,
  editOperationsSchema,
  type EditOperation,
} from "./operations.js";

const imageClip = { id: "clip-image-2", kind: "image", assetId: "asset-pic", durationMs: 2000 } as const;
const videoClip = {
  id: "clip-video-2",
  kind: "video",
  assetId: "asset-vid",
  sourceStartMs: 1000,
  sourceEndMs: 4000,
  speed: 1,
  volume: 1,
} as const;
const audioClip = {
  id: "clip-music-2",
  kind: "audio",
  assetId: "asset-aud",
  sourceStartMs: 0,
  sourceEndMs: 8000,
  timelineStartMs: 0,
  volume: 0.8,
  fadeInMs: 0,
  fadeOutMs: 1000,
} as const;

/** One valid example of every operation. */
const VALID: Record<EditOperation["op"], EditOperation[]> = {
  appendClip: [
    { op: "appendClip", clip: imageClip },
    { op: "appendClip", clip: videoClip },
  ],
  insertClip: [{ op: "insertClip", index: 0, clip: videoClip }],
  removeClip: [{ op: "removeClip", clipId: "clip-image-1" }],
  moveClip: [{ op: "moveClip", clipId: "clip-video-1", toIndex: 0 }],
  trimClip: [{ op: "trimClip", clipId: "clip-video-1", sourceStartMs: 500, sourceEndMs: 2500 }],
  setClipSpeed: [{ op: "setClipSpeed", clipId: "clip-video-1", speed: 2 }],
  setImageDuration: [{ op: "setImageDuration", clipId: "clip-image-1", durationMs: 1500 }],
  setClipVolume: [{ op: "setClipVolume", clipId: "clip-music-1", volume: 0.5 }],
  setBackgroundAudio: [
    { op: "setBackgroundAudio", clip: audioClip },
    { op: "setBackgroundAudio", clip: null },
  ],
};

const MALICIOUS_IDS = ["../x", "a;rm", "$(x)", "a/b", "C:\\media\\vid.mp4", "a b", "`id`", "a|b", ""];

function pathsOf(value: unknown): PropertyKey[][] {
  const result = editOperationSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path);
}

describe("editOperationSchema", () => {
  it("defines exactly the nine v1 operations", () => {
    expect([...EDIT_OPERATION_NAMES].sort()).toEqual(Object.keys(VALID).sort());
    expect(EDIT_OPERATION_NAMES).not.toContain("splitClip");
  });

  it.each(Object.values(VALID).flat())("accepts a valid $op", (operation) => {
    expect(editOperationSchema.parse(operation)).toEqual(operation);
  });

  it.each(["splitClip", "addTransition", "runCommand", "", "APPENDCLIP"])(
    "rejects the unknown op %j",
    (op) => {
      expect(pathsOf({ op, clipId: "clip-video-1" })).toContainEqual(["op"]);
    },
  );

  it("rejects a missing op and non-object input", () => {
    expect(editOperationSchema.safeParse({ clipId: "clip-video-1" }).success).toBe(false);
    expect(editOperationSchema.safeParse("removeClip clip-video-1").success).toBe(false);
    expect(editOperationSchema.safeParse(null).success).toBe(false);
  });

  it.each(Object.values(VALID).flat())("rejects an extra key on $op", (operation) => {
    const result = editOperationSchema.safeParse({ ...operation, ffmpegArgs: ["-y"] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ code: "unrecognized_keys", keys: ["ffmpegArgs"] });
  });

  it("rejects extra keys on a nested clip, such as a path or URL", () => {
    expect(pathsOf({ op: "appendClip", clip: { ...imageClip, path: "C:/x.png" } })).toContainEqual(["clip"]);
    expect(pathsOf({ op: "insertClip", index: 0, clip: { ...videoClip, src: "blob:x" } })).toContainEqual([
      "clip",
    ]);
    expect(pathsOf({ op: "setBackgroundAudio", clip: { ...audioClip, url: "http://x" } })).toContainEqual([
      "clip",
    ]);
  });

  it("does not accept a caller-supplied duration for a video clip", () => {
    expect(pathsOf({ op: "appendClip", clip: { ...videoClip, durationMs: 1 } })).toContainEqual(["clip"]);
  });

  describe("IDs accept only the kernel ID format", () => {
    it.each(MALICIOUS_IDS)("rejects %j as clipId", (id) => {
      for (const operation of [
        { op: "removeClip", clipId: id },
        { op: "moveClip", clipId: id, toIndex: 0 },
        { op: "trimClip", clipId: id, sourceStartMs: 0, sourceEndMs: 1 },
        { op: "setClipSpeed", clipId: id, speed: 1 },
        { op: "setImageDuration", clipId: id, durationMs: 1000 },
        { op: "setClipVolume", clipId: id, volume: 1 },
      ]) {
        expect(pathsOf(operation)).toEqual([["clipId"]]);
      }
    });

    it.each(MALICIOUS_IDS)("rejects %j as a new clip's id or assetId", (id) => {
      expect(pathsOf({ op: "appendClip", clip: { ...imageClip, id } })).toEqual([["clip", "id"]]);
      expect(pathsOf({ op: "appendClip", clip: { ...videoClip, assetId: id } })).toEqual([
        ["clip", "assetId"],
      ]);
      expect(pathsOf({ op: "setBackgroundAudio", clip: { ...audioClip, assetId: id } })).toEqual([
        ["clip", "assetId"],
      ]);
    });
  });

  describe("numbers", () => {
    it("rejects negative and fractional indexes", () => {
      expect(pathsOf({ op: "insertClip", index: -1, clip: imageClip })).toEqual([["index"]]);
      expect(pathsOf({ op: "moveClip", clipId: "clip-video-1", toIndex: 0.5 })).toEqual([["toIndex"]]);
    });

    it("rejects negative and fractional times", () => {
      expect(pathsOf({ op: "trimClip", clipId: "c", sourceStartMs: -1, sourceEndMs: 10 })).toEqual([
        ["sourceStartMs"],
      ]);
      expect(pathsOf({ op: "setImageDuration", clipId: "c", durationMs: 1.5 })).toEqual([["durationMs"]]);
    });

    it("rejects non-numeric speed and volume", () => {
      expect(pathsOf({ op: "setClipSpeed", clipId: "c", speed: "2x" })).toEqual([["speed"]]);
      expect(pathsOf({ op: "setClipVolume", clipId: "c", volume: Number.NaN })).toEqual([["volume"]]);
    });

    it("leaves ranges to semantic validation", () => {
      // Structurally fine; applyOperations rejects it because the result is invalid.
      expect(editOperationSchema.safeParse({ op: "setClipSpeed", clipId: "c", speed: 100 }).success).toBe(true);
    });
  });
});

describe("editOperationsSchema", () => {
  const one: EditOperation = { op: "removeClip", clipId: "clip-image-1" };

  it("accepts a batch and reports the index of a bad operation", () => {
    expect(editOperationsSchema.safeParse([one, one]).success).toBe(true);

    const result = editOperationsSchema.safeParse([one, { op: "removeClip", clipId: "../x" }]);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([[1, "clipId"]]);
  });

  it("rejects an empty batch and an oversized batch", () => {
    expect(editOperationsSchema.safeParse([]).success).toBe(false);
    expect(
      editOperationsSchema.safeParse(Array.from({ length: MAX_OPERATIONS_PER_BATCH + 1 }, () => one)).success,
    ).toBe(false);
    expect(
      editOperationsSchema.safeParse(Array.from({ length: MAX_OPERATIONS_PER_BATCH }, () => one)).success,
    ).toBe(true);
  });
});
