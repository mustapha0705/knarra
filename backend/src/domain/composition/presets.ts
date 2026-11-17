import type { RenderPreset } from "./types.js";

/**
 * Vertical 1080x1920 at 30 fps, H.264 in limited-range yuv420p, AAC stereo.
 * The CRF value is provisional; M2 (render compiler) confirms encoder settings.
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
  audioCodec: "aac",
  audioBitrateKbps: 192,
  audioSampleRateHz: 48000,
  audioChannels: 2,
};

export const RENDER_PRESETS: Readonly<Record<string, RenderPreset>> = {
  [VERTICAL_1080P30.id]: VERTICAL_1080P30,
};
