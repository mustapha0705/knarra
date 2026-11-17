/** A snapshot of how far a render has got. */
export interface RenderProgress {
  /** How much of the output has been written, in milliseconds. */
  outTimeMs: number;
  /** `outTimeMs` as a fraction of the expected duration, from 0 to 1. */
  ratio: number;
  /** Frames written so far, when FFmpeg reports it. */
  frame: number | null;
  /** True for the final report of a render that completed. */
  done: boolean;
}

/**
 * Parses the `key=value` lines FFmpeg writes with `-progress pipe:1`.
 *
 * FFmpeg emits a block of lines for each report and ends the block with
 * `progress=continue` or `progress=end`. One RenderProgress is produced per
 * block. Unknown keys and malformed lines are ignored: this is output from an
 * external tool and must never be able to break a render.
 *
 * Returns a function to call with each stdout line.
 */
export function createProgressParser(
  expectedDurationMs: number,
  onProgress: (progress: RenderProgress) => void,
): (line: string) => void {
  let outTimeMs = 0;
  let frame: number | null = null;
  let lastRatio = 0;

  return (line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) return;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    switch (key) {
      case "out_time_us":
      // FFmpeg's `out_time_ms` is misnamed: it also carries microseconds.
      case "out_time_ms": {
        const microseconds = Number(value);
        // "N/A" appears before the first frame; negative values appear briefly at start.
        if (Number.isFinite(microseconds) && microseconds >= 0) {
          outTimeMs = Math.max(outTimeMs, Math.round(microseconds / 1000));
        }
        return;
      }
      case "frame": {
        const frames = Number(value);
        if (Number.isInteger(frames) && frames >= 0) frame = frames;
        return;
      }
      case "progress": {
        const done = value === "end";
        const raw = expectedDurationMs > 0 ? outTimeMs / expectedDurationMs : 0;
        // Never report backwards, never past 1, and reach exactly 1 only at the end.
        lastRatio = done ? 1 : Math.max(lastRatio, Math.min(raw, 0.999));
        onProgress({ outTimeMs, ratio: lastRatio, frame, done });
        return;
      }
      default:
        return;
    }
  };
}
