import type { z } from "zod";
import type {
  assetRefSchema,
  audioClipSchema,
  audioTrackSchema,
  compositionSchema,
  imageClipSchema,
  mediaKindSchema,
  renderPresetSchema,
  videoClipSchema,
  visualClipSchema,
  visualTrackSchema,
} from "./schema.js";

// Types are derived from the schemas so the two cannot drift apart.

export type MediaKind = z.infer<typeof mediaKindSchema>;
export type AssetRef = z.infer<typeof assetRefSchema>;
export type ImageClip = z.infer<typeof imageClipSchema>;
export type VideoClip = z.infer<typeof videoClipSchema>;
export type AudioClip = z.infer<typeof audioClipSchema>;
export type VisualClip = z.infer<typeof visualClipSchema>;
export type VisualTrack = z.infer<typeof visualTrackSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type Composition = z.infer<typeof compositionSchema>;
export type RenderPreset = z.infer<typeof renderPresetSchema>;
