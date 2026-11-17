import type { AssetRef } from "../../domain/composition/index.js";

/**
 * An asset as the compiler needs it: the kernel's catalog entry plus the
 * server-resolved location of the original file. The path never comes from a
 * client, a model, or an uploaded filename.
 */
export interface RenderAsset extends AssetRef {
  path: string;
}

/** One FFmpeg input: `...args -i path`. */
export interface RenderInput {
  assetId: string;
  path: string;
  /** Options placed before `-i`. They contain numbers and fixed flags only. */
  args: string[];
}

/**
 * Everything needed to run one render. Produced by a pure function, so the same
 * Composition, assets, and preset always give the same plan.
 */
export interface RenderPlan {
  inputs: RenderInput[];
  /** The `-filter_complex` value. Refers to inputs by index; contains no paths. */
  filterGraph: string;
  /** Stream mapping and encoder options. The output path is added by the executor. */
  outputArgs: string[];
  expectedDurationMs: number;
  /** Safe to log: counts and output dimensions, no paths or filenames. */
  diagnostics: {
    presetId: string;
    width: number;
    height: number;
    fps: number;
    visualClipCount: number;
    inputCount: number;
    audioSourceCount: number;
  };
}
