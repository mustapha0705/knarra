import { describe, expect, it } from "vitest";
import { createProgressParser, type RenderProgress } from "./progress.js";

function feed(expectedDurationMs: number, text: string): RenderProgress[] {
  const reports: RenderProgress[] = [];
  const parse = createProgressParser(expectedDurationMs, (progress) => reports.push({ ...progress }));
  text.split("\n").forEach(parse);
  return reports;
}

// The shape FFmpeg writes with `-progress pipe:1`: one block per report.
const block = (frame: number, microseconds: number | "N/A", state: "continue" | "end") =>
  [
    `frame=${frame}`,
    "fps=30.00",
    "stream_0_0_q=28.0",
    "bitrate= 512.0kbits/s",
    "total_size=65536",
    `out_time_us=${microseconds}`,
    `out_time_ms=${microseconds}`,
    "out_time=00:00:01.000000",
    "dup_frames=0",
    "drop_frames=0",
    "speed=1.5x",
    `progress=${state}`,
  ].join("\n");

describe("createProgressParser", () => {
  it("emits one report per block, converting microseconds to milliseconds", () => {
    const reports = feed(8000, [block(30, 1_000_000, "continue"), block(120, 4_000_000, "continue")].join("\n"));

    expect(reports).toEqual([
      { outTimeMs: 1000, ratio: 0.125, frame: 30, done: false },
      { outTimeMs: 4000, ratio: 0.5, frame: 120, done: false },
    ]);
  });

  it("reports exactly 1 and done only on the end block", () => {
    const reports = feed(8000, [block(239, 7_990_000, "continue"), block(240, 8_000_000, "end")].join("\n"));

    expect(reports.map((r) => [r.ratio, r.done])).toEqual([
      [0.99875, false],
      [1, true],
    ]);
  });

  it("stays below 1 while running even if FFmpeg overshoots the expected duration", () => {
    const reports = feed(1000, block(40, 1_300_000, "continue"));

    expect(reports[0]).toMatchObject({ ratio: 0.999, done: false });
  });

  it("never reports progress going backwards", () => {
    const reports = feed(
      8000,
      [block(60, 2_000_000, "continue"), block(61, 1_000_000, "continue"), block(90, 3_000_000, "continue")].join("\n"),
    );

    expect(reports.map((r) => r.ratio)).toEqual([0.25, 0.25, 0.375]);
    expect(reports.map((r) => r.outTimeMs)).toEqual([2000, 2000, 3000]);
  });

  it("treats N/A and negative times as no progress yet", () => {
    const reports = feed(8000, [block(0, "N/A", "continue"), "out_time_us=-33333\nprogress=continue"].join("\n"));

    expect(reports.map((r) => r.outTimeMs)).toEqual([0, 0]);
  });

  it("ignores malformed lines, unknown keys, and empty lines", () => {
    const reports = feed(
      1000,
      ["", "garbage", "=novalue", "frame=abc", "out_time_us=notanumber", "unknown_key=1", "out_time_us=500000", "progress=continue"].join(
        "\n",
      ),
    );

    expect(reports).toEqual([{ outTimeMs: 500, ratio: 0.5, frame: null, done: false }]);
  });

  it("does not divide by zero for a zero expected duration", () => {
    expect(feed(0, block(1, 1_000_000, "continue"))[0]?.ratio).toBe(0);
  });
});
