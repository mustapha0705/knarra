import {
  err,
  ok,
  validateComposition,
  type Composition,
  type Issue,
  type RenderPreset,
  type Result,
} from "../../domain/composition/index.js";
import type { RenderAsset, RenderInput, RenderPlan } from "./types.js";

/**
 * Compiles a Composition into an FFmpeg execution plan.
 *
 * Pure and deterministic: no file access, no processes, no clock, no random
 * values. The Composition is validated first; an invalid Composition produces
 * issues and no plan.
 *
 * Shape of the plan:
 * - One input per visual clip, in track order, then one per audible background
 *   clip. Video and audio inputs are cut with `-ss`/`-t` before decoding.
 * - Each visual clip is normalized to the preset's size, frame rate, pixel
 *   format, limited ("tv") color range, and BT.709 color, then the clips are
 *   concatenated.
 * - A video clip's own audio is mixed with the background track, scaled by the
 *   clip's volume (ADR 0009). The output always has one audio stream.
 */
export function compileRenderPlan(
  composition: Composition,
  assets: readonly RenderAsset[],
  preset: RenderPreset,
): Result<RenderPlan, Issue[]> {
  const issues: Issue[] = validateComposition(composition, assets);

  if (composition.presetId !== preset.id) {
    issues.push({
      code: "PRESET_MISMATCH",
      path: ["presetId"],
      message: `This composition uses preset "${composition.presetId}", but it was asked to render with preset "${preset.id}". Render it with its own preset.`,
    });
  }

  const [visualTrack, audioTrack] = composition.tracks;
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  const checkPath = (assetId: string, clipPath: Issue["path"]) => {
    const asset = byId.get(assetId);
    if (asset && !isSafeInputPath(asset.path)) {
      issues.push({
        code: "ASSET_PATH_INVALID",
        path: [...clipPath, "assetId"],
        message: `Asset "${assetId}" has no usable file location on the server. Its stored path must be a non-empty absolute path.`,
      });
    }
  };
  visualTrack.clips.forEach((clip, index) => checkPath(clip.assetId, ["tracks", 0, "clips", index]));
  audioTrack.clips.forEach((clip, index) => checkPath(clip.assetId, ["tracks", 1, "clips", index]));

  if (issues.length > 0) return err(issues);

  const { width, height, fps } = preset;
  const channelLayout = preset.audioChannels === 1 ? "mono" : "stereo";
  const audioFormat = `aresample=${preset.audioSampleRateHz},aformat=sample_fmts=fltp:channel_layouts=${channelLayout}`;

  const inputs: RenderInput[] = [];
  const chains: string[] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];

  const normalize =
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:in_range=auto:out_range=tv:out_color_matrix=${COLOR_STANDARD},` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps}`;

  // Every clip boundary is rounded to a whole frame of the timeline, and both
  // picture and sound are cut on those same boundaries. Rounding each clip's
  // length on its own would let small errors add up until the sound drifts
  // away from the picture.
  const frameAt = (ms: number) => Math.round((ms * fps) / 1000);
  const msAtFrame = (frame: number) => Math.round((frame * 1000) / fps);

  let timelineMs = 0;
  for (const clip of visualTrack.clips) {
    const asset = byId.get(clip.assetId)!;
    const inputIndex = inputs.length;
    const label = `v${videoLabels.length}`;
    const clipDuration = seconds(clip.durationMs);
    const startFrame = frameAt(timelineMs);
    const frames = Math.max(1, frameAt(timelineMs + clip.durationMs) - startFrame);
    const startMs = msAtFrame(startFrame);
    const lengthMs = msAtFrame(startFrame + frames) - startMs;
    // After fps conversion, repeat the last frame if the source runs short (a
    // video stream can end before its container does), then cut to exactly
    // `frames` frames.
    const finish = `tpad=stop_mode=clone:stop=-1,trim=end_frame=${frames},setpts=PTS-STARTPTS,format=${preset.pixelFormat}`;

    if (clip.kind === "image") {
      inputs.push({
        assetId: asset.id,
        path: asset.path,
        args: ["-loop", "1", "-framerate", String(fps), "-t", clipDuration],
      });
      chains.push(`[${inputIndex}:v]${normalize},${finish}[${label}]`);
    } else {
      const sourceDuration = seconds(clip.sourceEndMs - clip.sourceStartMs);
      inputs.push({
        assetId: asset.id,
        path: asset.path,
        args: ["-ss", seconds(clip.sourceStartMs), "-t", sourceDuration],
      });
      const retime = clip.speed === 1 ? "setpts=PTS-STARTPTS" : `setpts=(PTS-STARTPTS)/${number(clip.speed)}`;
      chains.push(
        `[${inputIndex}:v]trim=duration=${sourceDuration},${retime},${normalize},${finish}[${label}]`,
      );

      if (asset.hasAudio && clip.volume > 0) {
        const audioLabel = `a${audioLabels.length}`;
        const steps = [
          `atrim=duration=${sourceDuration}`,
          "asetpts=PTS-STARTPTS",
          ...tempoFilters(clip.speed),
          `volume=${number(clip.volume)}`,
          audioFormat,
          `atrim=duration=${seconds(lengthMs)}`,
          ...delayFilter(startMs),
          CLEAN_TIMESTAMPS,
        ];
        chains.push(`[${inputIndex}:a]${steps.join(",")}[${audioLabel}]`);
        audioLabels.push(audioLabel);
      }
    }

    videoLabels.push(label);
    timelineMs += clip.durationMs;
  }
  const totalMs = timelineMs;
  const total = seconds(totalMs);

  chains.push(`${videoLabels.map((l) => `[${l}]`).join("")}concat=n=${videoLabels.length}:v=1:a=0[vout]`);

  for (const clip of audioTrack.clips) {
    // Silent clips and clips that start after the video ends contribute nothing.
    if (clip.volume <= 0 || clip.timelineStartMs >= totalMs) continue;

    const asset = byId.get(clip.assetId)!;
    const inputIndex = inputs.length;
    const durationMs = clip.sourceEndMs - clip.sourceStartMs;
    const duration = seconds(durationMs);
    inputs.push({
      assetId: asset.id,
      path: asset.path,
      args: ["-ss", seconds(clip.sourceStartMs), "-t", duration],
    });

    const audioLabel = `a${audioLabels.length}`;
    const steps = [
      `atrim=duration=${duration}`,
      "asetpts=PTS-STARTPTS",
      `volume=${number(clip.volume)}`,
      ...(clip.fadeInMs > 0 ? [`afade=t=in:st=0.000:d=${seconds(clip.fadeInMs)}`] : []),
      ...(clip.fadeOutMs > 0
        ? [`afade=t=out:st=${seconds(durationMs - clip.fadeOutMs)}:d=${seconds(clip.fadeOutMs)}`]
        : []),
      audioFormat,
      ...delayFilter(clip.timelineStartMs),
      CLEAN_TIMESTAMPS,
    ];
    chains.push(`[${inputIndex}:a]${steps.join(",")}[${audioLabel}]`);
    audioLabels.push(audioLabel);
  }

  // Exactly one audio stream of exactly the video's length, whatever the sources.
  const fit = `apad,atrim=duration=${total}`;
  if (audioLabels.length === 0) {
    chains.push(
      `anullsrc=channel_layout=${channelLayout}:sample_rate=${preset.audioSampleRateHz},atrim=duration=${total}[aout]`,
    );
  } else if (audioLabels.length === 1) {
    chains.push(`[${audioLabels[0]}]${fit}[aout]`);
  } else {
    chains.push(
      `${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0[amix]`,
    );
    chains.push(`[amix]${fit}[aout]`);
  }

  const outputArgs = [
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-preset", preset.encoderPreset,
    "-crf", String(preset.crf),
    "-pix_fmt", preset.pixelFormat,
    "-color_range", preset.colorRange,
    // The encoder writes no range flag at all unless color information is
    // present, so the standard is stated in full. Pixels are converted to it by
    // `scale` above.
    "-colorspace", COLOR_STANDARD,
    "-color_primaries", COLOR_STANDARD,
    "-color_trc", COLOR_STANDARD,
    "-r", String(fps),
    "-c:a", preset.audioCodec,
    "-b:a", `${preset.audioBitrateKbps}k`,
    "-ar", String(preset.audioSampleRateHz),
    "-ac", String(preset.audioChannels),
    "-t", total,
    "-movflags", "+faststart",
  ];

  return ok({
    inputs,
    filterGraph: chains.join(";"),
    outputArgs,
    expectedDurationMs: totalMs,
    diagnostics: {
      presetId: preset.id,
      width,
      height,
      fps,
      visualClipCount: visualTrack.clips.length,
      inputCount: inputs.length,
      audioSourceCount: audioLabels.length,
    },
  });
}

/**
 * The complete FFmpeg argument array for a plan. Pass it to `spawn("ffmpeg",
 * args)`; it must never be joined into a shell command (ADR 0002).
 */
export function buildFfmpegArgs(
  plan: RenderPlan,
  outputPath: string,
  options: { filterGraphFile?: string } = {},
): string[] {
  if (!isSafeInputPath(outputPath)) {
    throw new TypeError("The output path must be a non-empty absolute path");
  }
  const { filterGraphFile } = options;
  if (filterGraphFile !== undefined && !isSafeInputPath(filterGraphFile)) {
    throw new TypeError("The filtergraph file must be a non-empty absolute path");
  }
  return [
    "-y",
    ...plan.inputs.flatMap((input) => [...input.args, "-i", input.path]),
    // A long timeline makes a long filtergraph. Windows limits a command line to
    // 32,767 characters, so executors pass the graph in a file: `-/option file`
    // makes FFmpeg read the option's value from that file.
    ...(filterGraphFile === undefined
      ? ["-filter_complex", plan.filterGraph]
      : ["-/filter_complex", filterGraphFile]),
    ...plan.outputArgs,
    outputPath,
  ];
}

/**
 * A path FFmpeg will treat as a plain local file: absolute (POSIX `/…`, Windows
 * `C:\…` or `C:/…`), so it can never be read as an option (leading `-`) or as a
 * protocol such as `concat:` or `http:`. Spaces and other characters are fine
 * because the path is passed as its own array element, never through a shell.
 */
export function isSafeInputPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return false;
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

/** Standard-dynamic-range HD color: the only color standard Composition v1 renders. */
const COLOR_STANDARD = "bt709";

/**
 * Rewrites audio timestamps from the running sample count. Every audio source
 * ends with this: `atempo` followed by `adelay` otherwise hands `amix`
 * timestamps that run backwards, which truncates the mixed stream.
 */
const CLEAN_TIMESTAMPS = "asetpts=N/SR/TB";

/** Milliseconds as seconds with exactly three decimals, e.g. 2500 -> "2.500". */
function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/** A plain decimal with at most six decimals and no exponent, e.g. 0.25, 2, 1.5. */
function number(value: number): string {
  return String(Number(value.toFixed(6)));
}

/**
 * `atempo` filters that together change tempo by `speed` without changing
 * pitch. Each stage stays between 0.5 and 2, where the filter sounds best.
 */
function tempoFilters(speed: number): string[] {
  const stages: number[] = [];
  let remaining = speed;
  while (remaining < 0.5) {
    stages.push(0.5);
    remaining /= 0.5;
  }
  while (remaining > 2) {
    stages.push(2);
    remaining /= 2;
  }
  if (remaining !== 1) stages.push(remaining);
  return stages.map((stage) => `atempo=${number(stage)}`);
}

/** Shifts an audio source to its place on the timeline. */
function delayFilter(startMs: number): string[] {
  return startMs > 0 ? [`adelay=${startMs}:all=1`] : [];
}
