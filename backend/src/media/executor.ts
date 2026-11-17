import { rm, writeFile } from "node:fs/promises";
import { buildFfmpegArgs, type RenderPlan } from "../render/compiler/index.js";
import { ProcessError, runProcess } from "./process.js";
import { createProgressParser, type RenderProgress } from "./progress.js";

export interface ExecuteRenderOptions {
  /** Aborting stops FFmpeg and removes the partial output. */
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
  ffmpegPath?: string;
}

/**
 * Runs a compiled render plan with FFmpeg and writes the result to
 * `outputPath`, which must be a server-generated absolute path.
 *
 * FFmpeg is started with `spawn` and an argument array; no shell is involved
 * (ADR 0002). If the render fails or is cancelled, the partial output file is
 * removed before the error is rethrown, so a file at `outputPath` always means
 * a completed render.
 */
export async function executeRenderPlan(
  plan: RenderPlan,
  outputPath: string,
  options: ExecuteRenderOptions = {},
): Promise<{ outputPath: string }> {
  const { signal, onProgress, ffmpegPath = "ffmpeg" } = options;
  const filterGraphFile = `${outputPath}.filtergraph.txt`;

  const args = [
    "-hide_banner",
    "-nostdin",
    "-loglevel", "error",
    "-nostats",
    "-progress", "pipe:1",
    ...buildFfmpegArgs(plan, outputPath, { filterGraphFile }),
  ];

  try {
    await writeFile(filterGraphFile, plan.filterGraph, "utf8");
    await runProcess(ffmpegPath, args, {
      ...(signal ? { signal } : {}),
      ...(onProgress
        ? { onStdoutLine: createProgressParser(plan.expectedDurationMs, onProgress) }
        : {}),
    });
  } catch (error) {
    // Cleanup must not replace the real error: a cancellation has to stay
    // recognisable as one even if a file is briefly locked.
    await rm(outputPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await rm(filterGraphFile, { force: true }).catch(() => undefined);
  }

  return { outputPath };
}

/** True when an error means the render was cancelled, not that it failed. */
export function isCancellation(error: unknown): boolean {
  return error instanceof ProcessError && error.failure === "aborted";
}
