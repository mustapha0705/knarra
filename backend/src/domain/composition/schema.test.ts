import { describe, expect, it } from "vitest";
import extraKey from "./__fixtures__/invalid/extra-key.json" with { type: "json" };
import fractionalTime from "./__fixtures__/invalid/fractional-time.json" with { type: "json" };
import missingField from "./__fixtures__/invalid/missing-field.json" with { type: "json" };
import negativeTime from "./__fixtures__/invalid/negative-time.json" with { type: "json" };
import schemaVersionString from "./__fixtures__/invalid/schema-version-string.json" with { type: "json" };
import wrongKind from "./__fixtures__/invalid/wrong-kind.json" with { type: "json" };
import spikeAssets from "./__fixtures__/spike.assets.json" with { type: "json" };
import spikeComposition from "./__fixtures__/spike.composition.json" with { type: "json" };
import {
  assetRefSchema,
  compositionSchema,
  idSchema,
  renderPresetSchema,
  RENDER_PRESETS,
  VERTICAL_1080P30,
  type Composition,
} from "./index.js";

type Path = PropertyKey[];

/** A deep, mutable copy of JSON data. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function issuesOf(schema: { safeParse: (v: unknown) => unknown }, value: unknown) {
  const result = schema.safeParse(value) as ReturnType<typeof compositionSchema.safeParse>;
  return result.success ? [] : result.error.issues;
}

function expectIssueAt(value: unknown, path: Path) {
  const paths = issuesOf(compositionSchema, value).map((issue) => issue.path);
  expect(paths).toContainEqual(path);
}

/** A fresh, mutable copy of the valid spike Composition. */
function spike(): Composition {
  return compositionSchema.parse(clone(spikeComposition));
}

describe("compositionSchema: valid fixtures", () => {
  it("parses the KNAR-000 spike composition unchanged", () => {
    expect(compositionSchema.parse(spikeComposition)).toEqual(spikeComposition);
  });

  it("encodes the spike: 3 s image, 5 s video range, 8 s music with a 2 s fade-out", () => {
    const [visual, audio] = spike().tracks;

    expect(visual.clips).toHaveLength(2);
    expect(visual.clips[0]).toMatchObject({ kind: "image", durationMs: 3000 });
    expect(visual.clips[1]).toMatchObject({
      kind: "video",
      sourceStartMs: 0,
      sourceEndMs: 5000,
      durationMs: 5000,
    });
    expect(audio.clips).toEqual([
      expect.objectContaining({
        kind: "audio",
        sourceStartMs: 0,
        sourceEndMs: 8000,
        fadeOutMs: 2000,
      }),
    ]);
  });

  it("accepts empty clip lists (emptiness is a semantic rule)", () => {
    const composition = spike();
    composition.tracks[0].clips = [];
    composition.tracks[1].clips = [];

    expect(compositionSchema.safeParse(composition).success).toBe(true);
  });

  it("parses every spike asset", () => {
    for (const asset of spikeAssets) {
      expect(assetRefSchema.parse(asset)).toEqual(asset);
    }
  });
});

describe("compositionSchema: invalid fixtures", () => {
  it.each<[string, unknown, Path]>([
    ["wrong clip kind", wrongKind, ["tracks", 0, "clips", 0, "kind"]],
    ["negative time", negativeTime, ["tracks", 0, "clips", 0, "durationMs"]],
    ["fractional time", fractionalTime, ["tracks", 0, "clips", 1, "sourceStartMs"]],
    ["missing field", missingField, ["tracks", 0, "clips", 1, "sourceEndMs"]],
    ["extra key on a clip", extraKey, ["tracks", 0, "clips", 0]],
    ["schemaVersion of the wrong type", schemaVersionString, ["schemaVersion"]],
  ])("%s fails with an issue at the expected path", (_name, fixture, path) => {
    expect(compositionSchema.safeParse(fixture).success).toBe(false);
    expectIssueAt(fixture, path);
  });

  it("names the unknown key", () => {
    const issue = issuesOf(compositionSchema, extraKey)[0];

    expect(issue).toMatchObject({ code: "unrecognized_keys", keys: ["filePath"] });
  });
});

describe("compositionSchema: strictness", () => {
  it("rejects unknown keys at every level", () => {
    const top = { ...spike(), ffmpegArgs: ["-y"] };
    expectIssueAt(top, []);

    const track: unknown = clone(spikeComposition);
    (track as { tracks: Record<string, unknown>[] }).tracks[1]!.muted = true;
    expectIssueAt(track, ["tracks", 1]);

    const audioClip: unknown = clone(spikeComposition);
    (audioClip as { tracks: { clips: Record<string, unknown>[] }[] }).tracks[1]!.clips[0]!.src =
      "blob:x";
    expectIssueAt(audioClip, ["tracks", 1, "clips", 0]);
  });

  it("rejects a future or unknown schemaVersion", () => {
    expectIssueAt({ ...spike(), schemaVersion: 2 }, ["schemaVersion"]);
    expectIssueAt({ ...spike(), schemaVersion: 0 }, ["schemaVersion"]);
  });

  it("rejects a missing schemaVersion", () => {
    const { schemaVersion: _omitted, ...rest } = spike();
    expectIssueAt(rest, ["schemaVersion"]);
  });

  it("requires exactly one visual track followed by one audio track", () => {
    const [visual, audio] = spike().tracks;

    expect(compositionSchema.safeParse({ ...spike(), tracks: [visual] }).success).toBe(false);
    expect(compositionSchema.safeParse({ ...spike(), tracks: [audio, visual] }).success).toBe(
      false,
    );
    expect(
      compositionSchema.safeParse({ ...spike(), tracks: [visual, audio, audio] }).success,
    ).toBe(false);
  });

  it("rejects an audio clip on the visual track", () => {
    const composition: unknown = clone(spikeComposition);
    const tracks = (composition as { tracks: { clips: unknown[] }[] }).tracks;
    tracks[0]!.clips.push(tracks[1]!.clips[0]);

    expectIssueAt(composition, ["tracks", 0, "clips", 2, "kind"]);
  });

  it.each([
    ["a numeric string", "3000"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["null", null],
  ])("rejects %s as a time", (_name, value) => {
    const composition: unknown = clone(spikeComposition);
    (composition as { tracks: { clips: Record<string, unknown>[] }[] }).tracks[0]!.clips[0]!.durationMs =
      value;

    expectIssueAt(composition, ["tracks", 0, "clips", 0, "durationMs"]);
  });

  it("rejects non-numeric speed and volume", () => {
    const composition: unknown = clone(spikeComposition);
    const clip = (composition as { tracks: { clips: Record<string, unknown>[] }[] }).tracks[0]!
      .clips[1]!;
    clip.speed = "fast";
    clip.volume = Number.NaN;

    expectIssueAt(composition, ["tracks", 0, "clips", 1, "speed"]);
    expectIssueAt(composition, ["tracks", 0, "clips", 1, "volume"]);
  });
});

describe("idSchema", () => {
  it.each(["a", "clip-video-1", "asset_01", "0f8fad5b-d9cb-469f-a165-70867728950e", "A".repeat(64)])(
    "accepts %s",
    (id) => {
      expect(idSchema.safeParse(id).success).toBe(true);
    },
  );

  it.each([
    "",
    "../x",
    "a/b",
    "a\\b",
    "a;rm",
    "$(x)",
    "a b",
    "a.mp4",
    "-leading-dash",
    "A".repeat(65),
  ])("rejects %j", (id) => {
    expect(idSchema.safeParse(id).success).toBe(false);
  });
});

describe("assetRefSchema", () => {
  const asset = { id: "asset-1", kind: "video", durationMs: 1000, width: 1280, height: 720, hasAudio: true };

  it("rejects an unknown media kind", () => {
    expect(issuesOf(assetRefSchema, { ...asset, kind: "gif" }).map((i) => i.path)).toContainEqual([
      "kind",
    ]);
  });

  it("rejects upload details such as a path", () => {
    expect(assetRefSchema.safeParse({ ...asset, path: "C:/media/vid.mp4" }).success).toBe(false);
  });

  it("rejects a fractional duration and non-positive dimensions", () => {
    expect(assetRefSchema.safeParse({ ...asset, durationMs: 0.5 }).success).toBe(false);
    expect(assetRefSchema.safeParse({ ...asset, width: 0 }).success).toBe(false);
  });
});

describe("render presets", () => {
  it("vertical-1080p30 is a valid RenderPreset", () => {
    expect(renderPresetSchema.parse(VERTICAL_1080P30)).toEqual(VERTICAL_1080P30);
    expect(VERTICAL_1080P30).toMatchObject({
      id: "vertical-1080p30",
      width: 1080,
      height: 1920,
      fps: 30,
      videoCodec: "h264",
      pixelFormat: "yuv420p",
      colorRange: "tv",
      audioCodec: "aac",
      audioBitrateKbps: 192,
      audioSampleRateHz: 48000,
      audioChannels: 2,
    });
  });

  it("is registered under its own id, which the spike composition uses", () => {
    expect(RENDER_PRESETS[spike().presetId]).toBe(VERTICAL_1080P30);
  });

  it("rejects unknown keys and unsupported formats", () => {
    expect(renderPresetSchema.safeParse({ ...VERTICAL_1080P30, extraArgs: "-y" }).success).toBe(false);
    expect(renderPresetSchema.safeParse({ ...VERTICAL_1080P30, pixelFormat: "yuvj420p" }).success).toBe(
      false,
    );
    expect(renderPresetSchema.safeParse({ ...VERTICAL_1080P30, colorRange: "pc" }).success).toBe(false);
  });
});
