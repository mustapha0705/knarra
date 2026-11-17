import { z } from "zod";
import { isSafeInputPath } from "../render/compiler/index.js";
import { runProcess } from "./process.js";

/** What Knarra needs to know about a media file, read with ffprobe. */
export interface MediaProbe {
  /** ffprobe's container name list, e.g. "mov,mp4,m4a,3gp,3g2,mj2" or "png_pipe". */
  formatName: string;
  /** Container duration. Null for still images. */
  durationMs: number | null;
  /** The first real video stream. Cover art embedded in audio files is ignored. */
  video: {
    codec: string;
    width: number;
    height: number;
    pixelFormat: string | null;
    /** "tv" (limited), "pc" (full), or null when the file does not say. */
    colorRange: string | null;
    /** The color matrix, e.g. "bt709", or null when the file does not say. */
    colorSpace: string | null;
    frameRate: { numerator: number; denominator: number } | null;
    durationMs: number | null;
  } | null;
  /** The first audio stream. */
  audio: {
    codec: string;
    sampleRateHz: number | null;
    channels: number | null;
    durationMs: number | null;
  } | null;
}

export class ProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbeError";
  }
}

// ffprobe output is external-tool output: only the fields used are declared,
// each is validated, and everything else is ignored.
const streamSchema = z.looseObject({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  pix_fmt: z.string().optional(),
  color_range: z.string().optional(),
  color_space: z.string().optional(),
  r_frame_rate: z.string().optional(),
  sample_rate: z.string().optional(),
  channels: z.number().int().positive().optional(),
  duration: z.string().optional(),
  disposition: z.looseObject({ attached_pic: z.number().optional() }).optional(),
});

const probeOutputSchema = z.looseObject({
  streams: z.array(streamSchema),
  format: z.looseObject({
    format_name: z.string(),
    duration: z.string().optional(),
  }),
});

/** Converts ffprobe's decimal-seconds string to integer milliseconds (ADR 0005). */
function secondsToMs(value: string | undefined): number | null {
  if (value === undefined) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

function parseFrameRate(value: string | undefined): { numerator: number; denominator: number } | null {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? "");
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return numerator > 0 && denominator > 0 ? { numerator, denominator } : null;
}

/** Parses the JSON printed by `ffprobe -print_format json -show_format -show_streams`. */
export function parseProbeOutput(json: string): MediaProbe {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProbeError("ffprobe did not return valid JSON");
  }

  const parsed = probeOutputSchema.safeParse(data);
  if (!parsed.success) throw new ProbeError("ffprobe returned an unexpected structure");
  const { streams, format } = parsed.data;

  const videoStream = streams.find(
    (stream) => stream.codec_type === "video" && stream.disposition?.attached_pic !== 1,
  );
  const audioStream = streams.find((stream) => stream.codec_type === "audio");

  const video =
    videoStream && videoStream.codec_name && videoStream.width && videoStream.height
      ? {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          pixelFormat: videoStream.pix_fmt ?? null,
          colorRange: videoStream.color_range ?? null,
          colorSpace: videoStream.color_space ?? null,
          frameRate: parseFrameRate(videoStream.r_frame_rate),
          durationMs: secondsToMs(videoStream.duration),
        }
      : null;

  const sampleRate = Number(audioStream?.sample_rate);
  const audio =
    audioStream && audioStream.codec_name
      ? {
          codec: audioStream.codec_name,
          sampleRateHz: Number.isInteger(sampleRate) && sampleRate > 0 ? sampleRate : null,
          channels: audioStream.channels ?? null,
          durationMs: secondsToMs(audioStream.duration),
        }
      : null;

  return { formatName: format.format_name, durationMs: secondsToMs(format.duration), video, audio };
}

export interface ProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  ffprobePath?: string;
}

/**
 * Reads a media file's properties with ffprobe. `path` must be a
 * server-resolved absolute path. A path that ffprobe could read as an option
 * or a protocol is refused before any process starts.
 */
export async function probeMedia(path: string, options: ProbeOptions = {}): Promise<MediaProbe> {
  const { signal, timeoutMs = 30_000, ffprobePath = "ffprobe" } = options;
  if (!isSafeInputPath(path)) throw new ProbeError("The media path must be a non-empty absolute path");
  const { stdout } = await runProcess(
    ffprobePath,
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-i", path],
    { collectStdout: true, timeoutMs, ...(signal ? { signal } : {}) },
  );
  return parseProbeOutput(stdout);
}
