import { describe, expect, it } from "vitest";
import { ProbeError, parseProbeOutput, probeMedia } from "./probe.js";

const videoStream = {
  index: 0,
  codec_name: "h264",
  codec_type: "video",
  width: 1280,
  height: 720,
  pix_fmt: "yuvj420p",
  color_range: "pc",
  r_frame_rate: "30000/1001",
  duration: "229.004558",
  disposition: { attached_pic: 0 },
};
const audioStream = {
  index: 1,
  codec_name: "aac",
  codec_type: "audio",
  sample_rate: "44100",
  channels: 2,
  r_frame_rate: "0/0",
  duration: "228.995000",
};
const coverArt = {
  index: 1,
  codec_name: "mjpeg",
  codec_type: "video",
  width: 1667,
  height: 1667,
  pix_fmt: "yuvj420p",
  disposition: { attached_pic: 1 },
};

const output = (streams: unknown[], format: unknown) => JSON.stringify({ streams, format });

describe("parseProbeOutput", () => {
  it("reads a video file with audio", () => {
    const probe = parseProbeOutput(
      output([videoStream, audioStream], { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "229.004558" }),
    );

    expect(probe).toEqual({
      formatName: "mov,mp4,m4a,3gp,3g2,mj2",
      durationMs: 229_005,
      video: {
        codec: "h264",
        width: 1280,
        height: 720,
        pixelFormat: "yuvj420p",
        colorRange: "pc",
        colorSpace: null,
        frameRate: { numerator: 30_000, denominator: 1001 },
        durationMs: 229_005,
      },
      audio: { codec: "aac", sampleRateHz: 44_100, channels: 2, durationMs: 228_995 },
    });
  });

  it("treats an audio file's embedded cover art as not a video stream", () => {
    const probe = parseProbeOutput(
      output([{ ...audioStream, index: 0, codec_name: "mp3" }, coverArt], { format_name: "mp3", duration: "198.200000" }),
    );

    expect(probe.video).toBeNull();
    expect(probe.audio).toMatchObject({ codec: "mp3", sampleRateHz: 44_100 });
    expect(probe.durationMs).toBe(198_200);
  });

  it("reads a still image: no duration and no audio", () => {
    const probe = parseProbeOutput(
      output([{ codec_name: "png", codec_type: "video", width: 1920, height: 1080, pix_fmt: "rgba", r_frame_rate: "25/1" }], {
        format_name: "png_pipe",
      }),
    );

    expect(probe).toMatchObject({ durationMs: null, audio: null, video: { codec: "png", width: 1920, height: 1080, colorRange: null } });
  });

  it("rounds durations to integer milliseconds", () => {
    const probe = parseProbeOutput(output([audioStream], { format_name: "mp3", duration: "1.2345" }));

    expect(probe.durationMs).toBe(1235);
  });

  it("returns nulls for values ffprobe reports as unusable", () => {
    const probe = parseProbeOutput(
      output(
        [
          { ...videoStream, r_frame_rate: "0/0", duration: "N/A", color_range: undefined },
          { ...audioStream, sample_rate: "unknown", channels: undefined },
        ],
        { format_name: "matroska,webm", duration: "N/A" },
      ),
    );

    expect(probe.durationMs).toBeNull();
    expect(probe.video).toMatchObject({ frameRate: null, durationMs: null, colorRange: null });
    expect(probe.audio).toMatchObject({ sampleRateHz: null, channels: null });
  });

  it("ignores fields it does not use", () => {
    const probe = parseProbeOutput(
      output([{ ...videoStream, tags: { title: "$(rm -rf /)" }, some_new_field: [1, 2] }], {
        format_name: "mov",
        duration: "1.0",
        filename: "../../etc/passwd",
        tags: { comment: "x" },
      }),
    );

    expect(JSON.stringify(probe)).not.toContain("passwd");
    expect(JSON.stringify(probe)).not.toContain("rm -rf");
  });

  it.each([
    ["text that is not JSON", "ffprobe: error"],
    ["an empty string", ""],
    ["JSON without streams", JSON.stringify({ format: { format_name: "mp4" } })],
    ["JSON without a format", JSON.stringify({ streams: [] })],
    ["JSON of the wrong type", "[]"],
    ["a stream with a non-numeric width", output([{ ...videoStream, width: "1280" }], { format_name: "mp4" })],
  ])("rejects %s", (_name, text) => {
    expect(() => parseProbeOutput(text)).toThrow(ProbeError);
  });
});

describe("probeMedia", () => {
  it.each(["", "relative/file.mp4", "-version", "concat:a|b", "http://example.com/a.mp4"])(
    "refuses the unsafe path %j without starting ffprobe",
    async (path) => {
      await expect(probeMedia(path, { ffprobePath: "knarra-no-such-program" })).rejects.toBeInstanceOf(ProbeError);
    },
  );
});
