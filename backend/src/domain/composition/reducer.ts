import { err, ok, structuralIssues, type Issue, type IssuePath, type Result } from "./issues.js";
import { editOperationsSchema, type EditOperation, type NewVisualClip } from "./operations.js";
import type { AssetRef, AudioClip, Composition, VisualClip } from "./types.js";
import { expectedVideoDurationMs, validateComposition } from "./validate.js";

/**
 * Applies a batch of edit operations to a Composition.
 *
 * - Pure: the input Composition, operations, and assets are never mutated.
 * - Atomic: the result is either a new, fully valid Composition or a list of
 *   issues. If any operation is malformed, cannot be applied, or the final
 *   Composition is invalid, nothing is returned as applied.
 * - Only the final Composition is validated, so a batch may pass through an
 *   invalid intermediate state (for example, remove the only clip, then append
 *   another).
 *
 * `operations` is untrusted and is parsed here. `composition` must already be
 * structurally valid (parsed by compositionSchema or parseComposition).
 */
export function applyOperations(
  composition: Composition,
  operations: unknown,
  assets: readonly AssetRef[],
): Result<Composition, Issue[]> {
  const parsed = editOperationsSchema.safeParse(operations);
  if (!parsed.success) {
    return err(structuralIssues(parsed.error.issues, ["operations"]));
  }

  const draft = deepCopy(composition);
  for (const [index, operation] of parsed.data.entries()) {
    const issue = applyOne(draft, operation, ["operations", index]);
    if (issue) return err([issue]);
  }

  const issues = validateComposition(draft, assets);
  return issues.length > 0 ? err(issues) : ok(draft);
}

type Located =
  | { track: "visual"; index: number; clip: VisualClip }
  | { track: "audio"; index: number; clip: AudioClip };

/** Applies one operation to the draft in place. Returns an issue on failure. */
function applyOne(draft: Composition, operation: EditOperation, path: IssuePath): Issue | null {
  const [visual, audio] = draft.tracks;

  const find = (clipId: string): Located | null => {
    const visualIndex = visual.clips.findIndex((clip) => clip.id === clipId);
    const visualClip = visual.clips[visualIndex];
    if (visualClip) return { track: "visual", index: visualIndex, clip: visualClip };
    const audioIndex = audio.clips.findIndex((clip) => clip.id === clipId);
    const audioClip = audio.clips[audioIndex];
    if (audioClip) return { track: "audio", index: audioIndex, clip: audioClip };
    return null;
  };

  const notFound = (clipId: string): Issue => ({
    code: "CLIP_NOT_FOUND",
    path: [...path, "clipId"],
    message: `Clip "${clipId}" does not exist in this composition. Use the ID of an existing clip.`,
  });

  const notSupported = (clipId: string, actual: string, allowed: string): Issue => ({
    code: "CLIP_KIND_NOT_SUPPORTED",
    path: [...path, "clipId"],
    message: `"${operation.op}" cannot be applied to clip "${clipId}" because it is ${actual}. It applies only to ${allowed}.`,
  });

  switch (operation.op) {
    case "appendClip": {
      visual.clips.push(materialize(operation.clip));
      return null;
    }

    case "insertClip": {
      if (operation.index > visual.clips.length) {
        return {
          code: "INDEX_OUT_OF_RANGE",
          path: [...path, "index"],
          message: `Index ${operation.index} is past the end of the visual track, which has ${visual.clips.length} clips. Use an index from 0 to ${visual.clips.length}.`,
        };
      }
      visual.clips.splice(operation.index, 0, materialize(operation.clip));
      return null;
    }

    case "removeClip": {
      const found = find(operation.clipId);
      if (!found) return notFound(operation.clipId);
      const clips = found.track === "visual" ? visual.clips : audio.clips;
      clips.splice(found.index, 1);
      return null;
    }

    case "moveClip": {
      const found = find(operation.clipId);
      if (!found) return notFound(operation.clipId);
      if (found.track !== "visual") {
        return notSupported(operation.clipId, "an audio clip", "image and video clips");
      }
      if (operation.toIndex >= visual.clips.length) {
        return {
          code: "INDEX_OUT_OF_RANGE",
          path: [...path, "toIndex"],
          message: `Index ${operation.toIndex} is past the end of the visual track, which has ${visual.clips.length} clips. Use an index from 0 to ${visual.clips.length - 1}.`,
        };
      }
      visual.clips.splice(found.index, 1);
      visual.clips.splice(operation.toIndex, 0, found.clip);
      return null;
    }

    case "trimClip": {
      const found = find(operation.clipId);
      if (!found) return notFound(operation.clipId);
      const { clip } = found;
      if (clip.kind === "image") {
        return notSupported(operation.clipId, "an image clip", "video and audio clips");
      }
      clip.sourceStartMs = operation.sourceStartMs;
      clip.sourceEndMs = operation.sourceEndMs;
      if (clip.kind === "video") clip.durationMs = derivedDurationMs(clip);
      return null;
    }

    case "setClipSpeed": {
      const found = find(operation.clipId);
      if (!found) return notFound(operation.clipId);
      const { clip } = found;
      if (clip.kind !== "video") {
        return notSupported(operation.clipId, `${article(clip.kind)} ${clip.kind} clip`, "video clips");
      }
      // Set, never multiply: the duration always derives from the source range,
      // so applying the same speed twice gives the same clip.
      clip.speed = operation.speed;
      clip.durationMs = derivedDurationMs(clip);
      return null;
    }

    case "setImageDuration": {
      const found = find(operation.clipId);
      if (!found) return notFound(operation.clipId);
      const { clip } = found;
      if (clip.kind !== "image") {
        return notSupported(operation.clipId, `${article(clip.kind)} ${clip.kind} clip`, "image clips");
      }
      clip.durationMs = operation.durationMs;
      return null;
    }

    case "setClipVolume": {
      const found = find(operation.clipId);
      if (!found) return notFound(operation.clipId);
      const { clip } = found;
      if (clip.kind === "image") {
        return notSupported(operation.clipId, "an image clip", "video and audio clips");
      }
      clip.volume = operation.volume;
      return null;
    }

    case "setBackgroundAudio": {
      audio.clips = operation.clip ? [operation.clip] : [];
      return null;
    }
  }
}

/** Turns a caller-supplied clip into a stored clip by deriving its duration. */
function materialize(clip: NewVisualClip): VisualClip {
  if (clip.kind === "image") return { ...clip };
  return { ...clip, durationMs: derivedDurationMs(clip) };
}

/**
 * A video clip's timeline duration. When the range or speed is unusable the
 * result is 0; validation then reports the range or speed as the problem.
 */
function derivedDurationMs(clip: { sourceStartMs: number; sourceEndMs: number; speed: number }): number {
  if (clip.speed <= 0 || clip.sourceEndMs <= clip.sourceStartMs) return 0;
  return expectedVideoDurationMs(clip.sourceStartMs, clip.sourceEndMs, clip.speed);
}

/** Compositions are plain JSON data, so a JSON round trip is a full copy. */
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function article(kind: "image" | "video" | "audio"): "a" | "an" {
  return kind === "video" ? "a" : "an";
}
