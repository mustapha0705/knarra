import type { RenderPreset } from "./types.js";

/**
 * Vertical 1080x1920 at 30 fps, H.264 in limited-range yuv420p, AAC stereo.
 * CRF 20 with the x264 "medium" preset: visually clean at a moderate file size.
 */
export const VERTICAL_1080P30: RenderPreset = {
  id: "vertical-1080p30",
  width: 1080,
  height: 1920,
  fps: 30,
  videoCodec: "h264",
  pixelFormat: "yuv420p",
  colorRange: "tv",
  crf: 20,
  encoderPreset: "medium",
  audioCodec: "aac",
  audioBitrateKbps: 192,
  audioSampleRateHz: 48000,
  audioChannels: 2,
};

export const RENDER_PRESETS: Readonly<Record<string, RenderPreset>> = {
  [VERTICAL_1080P30.id]: VERTICAL_1080P30,
};
