import { rename, rm } from "node:fs/promises";
import { isSafeInputPath } from "../render/compiler/index.js";
import { runProcess } from "./process.js";

// Derived artifacts: small files made from an original for use in the editor.
// They can always be regenerated; the original is only ever read.

export interface DeriveOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  ffmpegPath?: string;
}

const THUMBNAIL_SIZE = 480;
const PROXY_MAX_WIDTH = 960;

/**
 * Runs FFmpeg to produce `outputPath`. The result is written under a temporary
 * name and renamed only on success, so a file at `outputPath` is always
 * complete; a failed or cancelled run leaves nothing behind.
 */
async function produce(
  inputArgs: string[],
  outputArgs: string[],
  outputPath: string,
  extension: string,
  options: DeriveOptions,
): Promise<void> {
  if (!isSafeInputPath(outputPath)) throw new TypeError("The output path must be an absolute path");
  const { signal, timeoutMs = 10 * 60 * 1000, ffmpegPath = "ffmpeg" } = options;
  const partial = `${outputPath}.partial.${extension}`;

  try {
    await runProcess(
      ffmpegPath,
      ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...inputArgs, ...outputArgs, partial],
      { timeoutMs, ...(signal ? { signal } : {}) },
    );
    await rm(outputPath, { force: true });
    await rename(partial, outputPath);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

function input(path: string): string[] {
  if (!isSafeInputPath(path)) throw new TypeError("The input path must be an absolute path");
  return ["-i", path];
}

/** A JPEG no larger than 480 px on its longest side, from an image or a video frame. */
export async function createThumbnail(
  originalPath: string,
  outputPath: string,
  source: { kind: "image" | "video"; durationMs: number | null },
  options: DeriveOptions = {},
): Promise<void> {
  // For video, take a frame a little way in: the very first frame is often black.
  const seekMs = source.kind === "video" ? Math.min(1000, Math.floor((source.durationMs ?? 0) / 2)) : 0;
  const seek = seekMs > 0 ? ["-ss", (seekMs / 1000).toFixed(3)] : [];
  await produce(
    [...seek, ...input(originalPath)],
    [
      "-frames:v", "1",
      "-vf", `scale=${THUMBNAIL_SIZE}:${THUMBNAIL_SIZE}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      "-q:v", "4",
      "-f", "image2",
    ],
    outputPath,
    "jpg",
    options,
  );
}

/**
 * A small H.264/AAC MP4 for smooth playback in the editor. Final renders never
 * use it: they read the original (invariant 8).
 */
export async function createProxy(
  originalPath: string,
  outputPath: string,
  options: DeriveOptions = {},
): Promise<void> {
  await produce(
    input(originalPath),
    [
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-vf", `scale='min(${PROXY_MAX_WIDTH},iw)':-2`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k", "-ac", "2",
      "-movflags", "+faststart",
      "-f", "mp4",
    ],
    outputPath,
    "mp4",
    options,
  );
}
