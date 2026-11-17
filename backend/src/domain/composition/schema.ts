import { z } from "zod";

// Structural schemas for Composition v1. They describe the shape of the data
// only: every object is strict (unknown keys are rejected) and every time is a
// non-negative integer number of milliseconds (ADR 0005).
//
// Rules that compare fields or entities with each other (ranges, asset
// existence, overlaps, speed and volume limits) are semantic and live in
// validateComposition (KNAR-103).

/**
 * Kernel ID format: 1 to 64 characters, starting with a letter or digit, then
 * letters, digits, `_`, or `-`. This excludes path separators, dots, spaces,
 * and shell metacharacters, so an ID can never be read as a path or a command.
 */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const idSchema = z
  .string()
  .regex(
    ID_PATTERN,
    "Must be 1 to 64 characters: letters, digits, '_' or '-', starting with a letter or digit",
  );

/** A point in time or a duration: a non-negative integer of milliseconds. */
export const timeMsSchema = z.int().nonnegative();

const positiveIntSchema = z.int().positive();

export const mediaKindSchema = z.enum(["image", "video", "audio"]);

/**
 * The catalog entry the kernel validates clips against. It is not an upload
 * record: it carries no filename, path, or URL. `durationMs`, `width`, and
 * `height` are null where the media kind has no such property.
 */
export const assetRefSchema = z.strictObject({
  id: idSchema,
  kind: mediaKindSchema,
  durationMs: timeMsSchema.nullable(),
  width: positiveIntSchema.nullable(),
  height: positiveIntSchema.nullable(),
  hasAudio: z.boolean(),
});

export const imageClipSchema = z.strictObject({
  id: idSchema,
  kind: z.literal("image"),
  assetId: idSchema,
  durationMs: timeMsSchema,
});

export const videoClipSchema = z.strictObject({
  id: idSchema,
  kind: z.literal("video"),
  assetId: idSchema,
  sourceStartMs: timeMsSchema,
  sourceEndMs: timeMsSchema,
  speed: z.number(),
  volume: z.number(),
  durationMs: timeMsSchema,
});

export const audioClipSchema = z.strictObject({
  id: idSchema,
  kind: z.literal("audio"),
  assetId: idSchema,
  sourceStartMs: timeMsSchema,
  sourceEndMs: timeMsSchema,
  timelineStartMs: timeMsSchema,
  volume: z.number(),
  fadeInMs: timeMsSchema,
  fadeOutMs: timeMsSchema,
});

export const visualClipSchema = z.discriminatedUnion("kind", [
  imageClipSchema,
  videoClipSchema,
]);

/** Sequential: a clip's start time derives from its position in `clips`. */
export const visualTrackSchema = z.strictObject({
  id: idSchema,
  kind: z.literal("visual"),
  clips: z.array(visualClipSchema),
});

export const audioTrackSchema = z.strictObject({
  id: idSchema,
  kind: z.literal("audio"),
  clips: z.array(audioClipSchema),
});

export const COMPOSITION_SCHEMA_VERSION = 1;

/** Exactly one visual track followed by one audio track in v1. */
export const compositionSchema = z.strictObject({
  schemaVersion: z.literal(COMPOSITION_SCHEMA_VERSION),
  id: idSchema,
  presetId: idSchema,
  tracks: z.tuple([visualTrackSchema, audioTrackSchema]),
});

export const renderPresetSchema = z.strictObject({
  id: idSchema,
  width: positiveIntSchema,
  height: positiveIntSchema,
  fps: positiveIntSchema,
  videoCodec: z.literal("h264"),
  pixelFormat: z.literal("yuv420p"),
  colorRange: z.literal("tv"),
  crf: z.int().min(0).max(51),
  audioCodec: z.literal("aac"),
  audioBitrateKbps: positiveIntSchema,
  audioSampleRateHz: positiveIntSchema,
  audioChannels: positiveIntSchema,
});
