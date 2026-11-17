import { z } from "zod";
import {
  audioClipSchema,
  idSchema,
  imageClipSchema,
  timeMsSchema,
  videoClipSchema,
} from "./schema.js";

// EditOperation v1: the only way a Composition changes, whether the edit comes
// from the UI or from an LLM plan (invariants 3 and 4).
//
// Every operation is a strict object discriminated on `op`. An operation can
// name clips and assets only by kernel ID and can carry only numbers besides.
// There is no field that could hold a path, a filename, a URL, a shell
// fragment, or an FFmpeg argument.
//
// These schemas are structural. Whether the target clip exists, whether an
// index is in range, and whether the result is a valid Composition are decided
// when the operations are applied (applyOperations, KNAR-105).

/**
 * A video clip as supplied by a caller. `durationMs` is absent on purpose: the
 * reducer derives it from the source range and speed.
 */
export const newVideoClipSchema = videoClipSchema.omit({ durationMs: true });

/** A clip that can be placed on the visual track. */
export const newVisualClipSchema = z.discriminatedUnion("kind", [
  imageClipSchema,
  newVideoClipSchema,
]);

const indexSchema = z.int().nonnegative();

/** Adds a clip to the end of the visual track. */
export const appendClipSchema = z.strictObject({
  op: z.literal("appendClip"),
  clip: newVisualClipSchema,
});

/** Inserts a clip into the visual track so that it ends up at `index`. */
export const insertClipSchema = z.strictObject({
  op: z.literal("insertClip"),
  index: indexSchema,
  clip: newVisualClipSchema,
});

/** Removes one clip, from either track, by ID. */
export const removeClipSchema = z.strictObject({
  op: z.literal("removeClip"),
  clipId: idSchema,
});

/** Moves a visual clip so that it ends up at `toIndex`. */
export const moveClipSchema = z.strictObject({
  op: z.literal("moveClip"),
  clipId: idSchema,
  toIndex: indexSchema,
});

/** Sets the source range of a video or audio clip. */
export const trimClipSchema = z.strictObject({
  op: z.literal("trimClip"),
  clipId: idSchema,
  sourceStartMs: timeMsSchema,
  sourceEndMs: timeMsSchema,
});

/** Sets (does not multiply) the playback speed of a video clip. */
export const setClipSpeedSchema = z.strictObject({
  op: z.literal("setClipSpeed"),
  clipId: idSchema,
  speed: z.number(),
});

/** Sets how long an image clip is shown. */
export const setImageDurationSchema = z.strictObject({
  op: z.literal("setImageDuration"),
  clipId: idSchema,
  durationMs: timeMsSchema,
});

/** Sets the volume of a video or audio clip. */
export const setClipVolumeSchema = z.strictObject({
  op: z.literal("setClipVolume"),
  clipId: idSchema,
  volume: z.number(),
});

/**
 * Replaces everything on the audio track with one background clip, or clears
 * the track when `clip` is null.
 */
export const setBackgroundAudioSchema = z.strictObject({
  op: z.literal("setBackgroundAudio"),
  clip: audioClipSchema.nullable(),
});

export const editOperationSchema = z.discriminatedUnion("op", [
  appendClipSchema,
  insertClipSchema,
  removeClipSchema,
  moveClipSchema,
  trimClipSchema,
  setClipSpeedSchema,
  setImageDurationSchema,
  setClipVolumeSchema,
  setBackgroundAudioSchema,
]);

/** Upper bound on one batch, so untrusted input cannot request unbounded work. */
export const MAX_OPERATIONS_PER_BATCH = 200;

export const editOperationsSchema = z
  .array(editOperationSchema)
  .min(1)
  .max(MAX_OPERATIONS_PER_BATCH);

export const EDIT_OPERATION_NAMES = editOperationSchema.options.map(
  (option) => option.shape.op.value,
);

export type NewVideoClip = z.infer<typeof newVideoClipSchema>;
export type NewVisualClip = z.infer<typeof newVisualClipSchema>;
export type EditOperation = z.infer<typeof editOperationSchema>;
export type EditOperationName = EditOperation["op"];
