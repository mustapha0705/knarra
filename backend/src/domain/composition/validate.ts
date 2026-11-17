import {
  DURATION_TOLERANCE_MS,
  MAX_IMAGE_DURATION_MS,
  MAX_SPEED,
  MAX_VOLUME,
  MIN_IMAGE_DURATION_MS,
  MIN_SPEED,
  MIN_VOLUME,
  type Issue,
  type IssueCode,
  type IssuePath,
} from "./issues.js";
import type {
  AssetRef,
  AudioClip,
  Composition,
  ImageClip,
  MediaKind,
  VideoClip,
} from "./types.js";

/** The timeline length of a video clip implied by its source range and speed. */
export function expectedVideoDurationMs(
  sourceStartMs: number,
  sourceEndMs: number,
  speed: number,
): number {
  return Math.round((sourceEndMs - sourceStartMs) / speed);
}

/**
 * Checks every semantic rule of Composition v1 and returns all issues found,
 * in document order. An empty array means the Composition is valid.
 *
 * The input must already be structurally valid (parsed by compositionSchema).
 * This function is pure: it reads only its arguments and mutates nothing.
 */
export function validateComposition(
  composition: Composition,
  assets: readonly AssetRef[],
): Issue[] {
  const issues: Issue[] = [];
  const report = (code: IssueCode, path: IssuePath, message: string) => {
    issues.push({ code, path, message });
  };

  const catalog = new Map<string, AssetRef>();
  assets.forEach((asset, index) => {
    if (catalog.has(asset.id)) {
      report(
        "ASSET_CATALOG_DUPLICATE_ID",
        ["assets", index, "id"],
        `Asset ID "${asset.id}" appears more than once in the asset catalog. Each asset needs a unique ID.`,
      );
      return;
    }
    catalog.set(asset.id, asset);
  });

  const seenIds = new Set<string>([composition.id]);
  const checkUniqueId = (id: string, path: IssuePath) => {
    if (seenIds.has(id)) {
      report(
        "DUPLICATE_ID",
        path,
        `ID "${id}" is already used elsewhere in this composition. The composition, its tracks, and its clips must all have different IDs.`,
      );
      return;
    }
    seenIds.add(id);
  };

  /** Resolves a clip's asset and checks its kind. Returns null if unusable. */
  const resolveAsset = (
    clip: { assetId: string; kind: MediaKind },
    clipPath: IssuePath,
  ): AssetRef | null => {
    const asset = catalog.get(clip.assetId);
    if (!asset) {
      report(
        "ASSET_NOT_FOUND",
        [...clipPath, "assetId"],
        `Asset "${clip.assetId}" does not exist in this project. Use the ID of an imported asset.`,
      );
      return null;
    }
    if (asset.kind !== clip.kind) {
      report(
        "ASSET_KIND_MISMATCH",
        [...clipPath, "assetId"],
        `Asset "${asset.id}" is ${articleFor(asset.kind)} ${asset.kind}, but this is ${articleFor(clip.kind)} ${clip.kind} clip. Use ${articleFor(clip.kind)} ${clip.kind} asset.`,
      );
      return null;
    }
    if ((asset.kind === "image" || asset.kind === "video") && (asset.width === null || asset.height === null)) {
      report(
        "ASSET_METADATA_MISSING",
        [...clipPath, "assetId"],
        `Asset "${asset.id}" has no known width and height. Probe the asset again before using it.`,
      );
    }
    return asset;
  };

  const checkSourceRange = (
    clip: VideoClip | AudioClip,
    asset: AssetRef | null,
    clipPath: IssuePath,
  ): boolean => {
    if (clip.sourceStartMs >= clip.sourceEndMs) {
      report(
        "SOURCE_RANGE_INVALID",
        [...clipPath, "sourceEndMs"],
        `The source range ends at ${clip.sourceEndMs} ms, which is not after its start at ${clip.sourceStartMs} ms. The end must be later than the start.`,
      );
      return false;
    }
    if (!asset) return true;
    if (asset.durationMs === null) {
      report(
        "ASSET_METADATA_MISSING",
        [...clipPath, "assetId"],
        `Asset "${asset.id}" has no known duration. Probe the asset again before using it.`,
      );
      return true;
    }
    if (clip.sourceEndMs > asset.durationMs) {
      report(
        "SOURCE_RANGE_OUT_OF_BOUNDS",
        [...clipPath, "sourceEndMs"],
        `The source range ends at ${clip.sourceEndMs} ms, but asset "${asset.id}" is only ${asset.durationMs} ms long. End the range at or before ${asset.durationMs} ms.`,
      );
    }
    return true;
  };

  const checkVolume = (volume: number, clipPath: IssuePath) => {
    if (volume < MIN_VOLUME || volume > MAX_VOLUME) {
      report(
        "VOLUME_OUT_OF_RANGE",
        [...clipPath, "volume"],
        `Volume ${volume} is outside the allowed range. Use a value from ${MIN_VOLUME} (silent) to ${MAX_VOLUME} (full).`,
      );
    }
  };

  const checkImageClip = (clip: ImageClip, clipPath: IssuePath) => {
    resolveAsset(clip, clipPath);
    if (clip.durationMs < MIN_IMAGE_DURATION_MS || clip.durationMs > MAX_IMAGE_DURATION_MS) {
      report(
        "IMAGE_DURATION_OUT_OF_RANGE",
        [...clipPath, "durationMs"],
        `An image clip of ${clip.durationMs} ms is not allowed. Use a duration from ${MIN_IMAGE_DURATION_MS} ms to ${MAX_IMAGE_DURATION_MS} ms.`,
      );
    }
  };

  const checkVideoClip = (clip: VideoClip, clipPath: IssuePath) => {
    const asset = resolveAsset(clip, clipPath);
    const rangeIsOrdered = checkSourceRange(clip, asset, clipPath);

    const speedIsValid = clip.speed >= MIN_SPEED && clip.speed <= MAX_SPEED;
    if (!speedIsValid) {
      report(
        "SPEED_OUT_OF_RANGE",
        [...clipPath, "speed"],
        `Speed ${clip.speed} is outside the allowed range. Use a value from ${MIN_SPEED} to ${MAX_SPEED}.`,
      );
    }

    // The duration can only be compared once the values it derives from are sound.
    if (rangeIsOrdered && speedIsValid) {
      const expected = expectedVideoDurationMs(clip.sourceStartMs, clip.sourceEndMs, clip.speed);
      if (Math.abs(clip.durationMs - expected) > DURATION_TOLERANCE_MS) {
        report(
          "DURATION_MISMATCH",
          [...clipPath, "durationMs"],
          `Duration ${clip.durationMs} ms does not match the source range and speed, which give ${expected} ms. Set the duration to ${expected} ms.`,
        );
      }
    }

    checkVolume(clip.volume, clipPath);
  };

  const [visualTrack, audioTrack] = composition.tracks;

  // Visual track: sequential image and video clips.
  const visualPath: IssuePath = ["tracks", 0];
  checkUniqueId(visualTrack.id, [...visualPath, "id"]);
  let totalVisualMs = 0;
  visualTrack.clips.forEach((clip, index) => {
    const clipPath: IssuePath = [...visualPath, "clips", index];
    checkUniqueId(clip.id, [...clipPath, "id"]);
    if (clip.kind === "image") checkImageClip(clip, clipPath);
    else checkVideoClip(clip, clipPath);
    totalVisualMs += clip.durationMs;
  });
  if (totalVisualMs <= 0) {
    report(
      "VISUAL_TRACK_EMPTY",
      [...visualPath, "clips"],
      "The visual track has no duration. Add at least one image or video clip.",
    );
  }

  // Audio track: clips placed at explicit timeline positions.
  const audioPath: IssuePath = ["tracks", 1];
  checkUniqueId(audioTrack.id, [...audioPath, "id"]);
  const placed: { index: number; startMs: number; endMs: number; id: string }[] = [];
  audioTrack.clips.forEach((clip, index) => {
    const clipPath: IssuePath = [...audioPath, "clips", index];
    checkUniqueId(clip.id, [...clipPath, "id"]);
    const asset = resolveAsset(clip, clipPath);
    const rangeIsOrdered = checkSourceRange(clip, asset, clipPath);
    checkVolume(clip.volume, clipPath);

    if (!rangeIsOrdered) return;
    const durationMs = clip.sourceEndMs - clip.sourceStartMs;

    for (const field of ["fadeInMs", "fadeOutMs"] as const) {
      if (clip[field] > durationMs) {
        report(
          "FADE_TOO_LONG",
          [...clipPath, field],
          `A fade of ${clip[field]} ms is longer than the ${durationMs} ms clip. Use a fade of at most ${durationMs} ms.`,
        );
      }
    }
    if (
      clip.fadeInMs <= durationMs &&
      clip.fadeOutMs <= durationMs &&
      clip.fadeInMs + clip.fadeOutMs > durationMs
    ) {
      report(
        "FADE_TOO_LONG",
        clipPath,
        `The fade-in (${clip.fadeInMs} ms) and fade-out (${clip.fadeOutMs} ms) together are longer than the ${durationMs} ms clip. Shorten them so they total at most ${durationMs} ms.`,
      );
    }

    placed.push({
      index,
      startMs: clip.timelineStartMs,
      endMs: clip.timelineStartMs + durationMs,
      id: clip.id,
    });
  });

  // Overlaps: compare each clip with the furthest-reaching clip before it.
  const byStart = [...placed].sort((a, b) => a.startMs - b.startMs || a.index - b.index);
  const overlaps: { index: number; message: string }[] = [];
  let furthest: (typeof placed)[number] | undefined;
  for (const clip of byStart) {
    if (furthest && clip.startMs < furthest.endMs) {
      overlaps.push({
        index: clip.index,
        message: `This audio clip starts at ${clip.startMs} ms, before clip "${furthest.id}" ends at ${furthest.endMs} ms. Audio clips must not overlap; start it at or after ${furthest.endMs} ms.`,
      });
    }
    if (!furthest || clip.endMs > furthest.endMs) furthest = clip;
  }
  overlaps
    .sort((a, b) => a.index - b.index)
    .forEach(({ index, message }) => {
      report("AUDIO_CLIPS_OVERLAP", [...audioPath, "clips", index, "timelineStartMs"], message);
    });

  return issues;
}

function articleFor(kind: MediaKind): "a" | "an" {
  return kind === "video" ? "a" : "an";
}
