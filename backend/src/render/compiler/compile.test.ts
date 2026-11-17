import { describe, expect, it } from "vitest";
import spikeAssetsJson from "../../domain/composition/__fixtures__/spike.assets.json" with { type: "json" };
import spikeCompositionJson from "../../domain/composition/__fixtures__/spike.composition.json" with { type: "json" };
import {
  VERTICAL_1080P30,
  assetRefSchema,
  compositionSchema,
  type AudioClip,
  type Composition,
  type ImageClip,
  type IssueCode,
  type IssuePath,
  type VideoClip,
} from "../../domain/composition/index.js";
import spikePlanJson from "./__fixtures__/spike.plan.json" with { type: "json" };
import { buildFfmpegArgs, compileRenderPlan, isSafeInputPath } from "./compile.js";
import type { RenderAsset, RenderPlan } from "./types.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const pathFor = (assetId: string) => `/srv/knarra/storage/originals/${assetId}/original`;

function spike(): { composition: Composition; assets: RenderAsset[] } {
  return {
    composition: compositionSchema.parse(clone(spikeCompositionJson)),
    assets: assetRefSchema
      .array()
      .parse(clone(spikeAssetsJson))
      .map((asset) => ({ ...asset, path: pathFor(asset.id) })),
  };
}

const image = (c: Composition) => c.tracks[0].clips[0] as ImageClip;
const video = (c: Composition) => c.tracks[0].clips[1] as VideoClip;
const music = (c: Composition) => c.tracks[1].clips[0] as AudioClip;

/** Compiles the spike after a change that is expected to produce a plan. */
function planAfter(change: (c: Composition, assets: RenderAsset[]) => void = () => {}): RenderPlan {
  const { composition, assets } = spike();
  change(composition, assets);
  const result = compileRenderPlan(composition, assets, VERTICAL_1080P30);
  if (!result.ok) throw new Error(`expected a plan, got ${JSON.stringify(result.error)}`);
  return result.value;
}

/** Compiles the spike after a change that is expected to be rejected. */
function issuesAfter(
  change: (c: Composition, assets: RenderAsset[]) => void,
  preset = VERTICAL_1080P30,
): [IssueCode, IssuePath][] {
  const { composition, assets } = spike();
  change(composition, assets);
  const result = compileRenderPlan(composition, assets, preset);
  if (result.ok) throw new Error("expected issues, got a plan");
  return result.error.map((issue) => [issue.code, issue.path]);
}

const chains = (plan: RenderPlan) => plan.filterGraph.split(";");
const chainEndingIn = (plan: RenderPlan, label: string) => {
  const chain = chains(plan).find((c) => c.endsWith(`[${label}]`));
  if (!chain) throw new Error(`no chain produces [${label}]`);
  return chain;
};

const NORMALIZE =
  "scale=1080:1920:force_original_aspect_ratio=decrease:in_range=auto:out_range=tv:out_color_matrix=bt709," +
  "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30";
const AUDIO_FORMAT = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";

describe("compileRenderPlan: the spike as a Composition (golden)", () => {
  it("matches the golden plan exactly", () => {
    expect(planAfter()).toEqual(spikePlanJson);
  });

  it("builds the full FFmpeg argument array in a fixed order", () => {
    expect(buildFfmpegArgs(planAfter(), "/srv/knarra/storage/exports/job-1/output.mp4")).toEqual([
      "-y",
      "-loop", "1", "-framerate", "30", "-t", "3.000", "-i", pathFor("asset-pic"),
      "-ss", "0.000", "-t", "5.000", "-i", pathFor("asset-vid"),
      "-ss", "0.000", "-t", "8.000", "-i", pathFor("asset-aud"),
      "-filter_complex", spikePlanJson.filterGraph,
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20",
      "-pix_fmt", "yuv420p", "-color_range", "tv",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", "30",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-t", "8.000", "-movflags", "+faststart",
      "/srv/knarra/storage/exports/job-1/output.mp4",
    ]);
  });

  it("reports the expected duration and safe diagnostics", () => {
    const plan = planAfter();

    expect(plan.expectedDurationMs).toBe(8000);
    expect(plan.diagnostics).toEqual({
      presetId: "vertical-1080p30",
      width: 1080,
      height: 1920,
      fps: 30,
      visualClipCount: 2,
      inputCount: 3,
      audioSourceCount: 1,
    });
    expect(JSON.stringify(plan.diagnostics)).not.toContain("/srv");
  });
});

describe("compileRenderPlan: determinism and purity", () => {
  it("gives an identical plan for identical input", () => {
    expect(planAfter()).toEqual(planAfter());
    expect(JSON.stringify(planAfter())).toBe(JSON.stringify(planAfter()));
  });

  it("does not mutate the composition, assets, or preset", () => {
    const { composition, assets } = spike();
    deepFreeze(composition);
    deepFreeze(assets);

    const result = compileRenderPlan(composition, assets, deepFreeze(clone(VERTICAL_1080P30)));

    expect(result.ok).toBe(true);
  });
});

describe("compileRenderPlan: paths", () => {
  const awkward = "/srv/knarra/My Media (2026)/it's a $HOME; `test` & \"clip\".mp4";

  it("passes a path with spaces and shell characters as one unmodified argument", () => {
    const plan = planAfter((_c, assets) => {
      assets[1]!.path = awkward;
    });
    const args = buildFfmpegArgs(plan, "/srv/out put/final video.mp4");

    expect(plan.inputs[1]?.path).toBe(awkward);
    expect(args[args.indexOf(awkward) - 1]).toBe("-i");
    expect(args.filter((arg) => arg === awkward)).toHaveLength(1);
    expect(args.at(-1)).toBe("/srv/out put/final video.mp4");
  });

  it("accepts Windows absolute paths", () => {
    const plan = planAfter((_c, assets) => {
      assets[0]!.path = "C:\\Knarra Storage\\originals\\asset-pic\\original";
    });

    expect(plan.inputs[0]?.path).toBe("C:\\Knarra Storage\\originals\\asset-pic\\original");
  });

  it("never puts a path in the filtergraph", () => {
    const plan = planAfter((_c, assets) => {
      assets[1]!.path = awkward;
    });

    expect(plan.filterGraph).not.toContain("srv");
    expect(plan.filterGraph).not.toContain("My Media");
    expect(plan.filterGraph).toBe(spikePlanJson.filterGraph);
  });

  it.each([
    ["an empty path", ""],
    ["a relative path", "media/vid.mp4"],
    ["a path that looks like an option", "-i"],
    ["a path that looks like an output option", "-f lavfi"],
    ["a concat protocol", "concat:/a.mp4|/b.mp4"],
    ["a URL", "http://example.com/vid.mp4"],
    ["a path with a NUL byte", "/srv/a\0.mp4"],
  ])("rejects %s", (_name, path) => {
    expect(
      issuesAfter((_c, assets) => {
        assets[1]!.path = path;
      }),
    ).toEqual([["ASSET_PATH_INVALID", ["tracks", 0, "clips", 1, "assetId"]]]);
    expect(isSafeInputPath(path)).toBe(false);
  });

  it("refuses to build arguments for an unsafe output path", () => {
    expect(() => buildFfmpegArgs(planAfter(), "-y")).toThrow(TypeError);
    expect(() => buildFfmpegArgs(planAfter(), "out.mp4")).toThrow(TypeError);
    expect(() => buildFfmpegArgs(planAfter(), "")).toThrow(TypeError);
  });
});

describe("compileRenderPlan: image and video ordering", () => {
  it("creates one input per visual clip, in track order", () => {
    const plan = planAfter((c) => {
      c.tracks[0].clips.reverse();
    });

    expect(plan.inputs.map((input) => input.assetId)).toEqual(["asset-vid", "asset-pic", "asset-aud"]);
    expect(chainEndingIn(plan, "v0")).toMatch(/^\[0:v\]trim=duration=5\.000,/);
    expect(chainEndingIn(plan, "v1")).toMatch(/^\[1:v\]scale=/);
    expect(chains(plan)).toContain("[v0][v1]concat=n=2:v=1:a=0[vout]");
  });

  it("gives each use of the same asset its own input", () => {
    const plan = planAfter((c) => {
      c.tracks[0].clips.push({ ...image(c), id: "clip-image-2", durationMs: 1000 });
      c.tracks[0].clips.unshift({ ...video(c), id: "clip-video-0", sourceStartMs: 60_000, sourceEndMs: 62_000, durationMs: 2000 });
    });

    expect(plan.inputs.map((input) => input.assetId)).toEqual([
      "asset-vid",
      "asset-pic",
      "asset-vid",
      "asset-pic",
      "asset-aud",
    ]);
    expect(plan.inputs[0]?.args).toEqual(["-ss", "60.000", "-t", "2.000"]);
    expect(plan.inputs[3]?.args).toEqual(["-loop", "1", "-framerate", "30", "-t", "1.000"]);
    expect(chains(plan)).toContain("[v0][v1][v2][v3]concat=n=4:v=1:a=0[vout]");
    expect(plan.expectedDurationMs).toBe(11_000);
    expect(plan.outputArgs.slice(-4)).toEqual(["-t", "11.000", "-movflags", "+faststart"]);
  });

  it("compiles a single image clip", () => {
    const plan = planAfter((c) => {
      c.tracks[0].clips = [image(c)];
      c.tracks[1].clips = [];
    });

    expect(chains(plan)).toEqual([
      `[0:v]${NORMALIZE},trim=duration=3.000,setpts=PTS-STARTPTS,format=yuv420p[v0]`,
      "[v0]concat=n=1:v=1:a=0[vout]",
      "anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=3.000[aout]",
    ]);
  });
});

describe("compileRenderPlan: speed math", () => {
  const withSpeed = (speed: number, durationMs: number, volume = 0) =>
    planAfter((c) => {
      Object.assign(video(c), { speed, durationMs, volume });
    });

  it("seeks the source range and retimes it by the speed", () => {
    const plan = planAfter((c) => {
      Object.assign(video(c), { sourceStartMs: 12_500, sourceEndMs: 18_500, speed: 2, durationMs: 3000 });
    });

    expect(plan.inputs[1]?.args).toEqual(["-ss", "12.500", "-t", "6.000"]);
    expect(chainEndingIn(plan, "v1")).toBe(
      `[1:v]trim=duration=6.000,setpts=(PTS-STARTPTS)/2,${NORMALIZE},trim=duration=3.000,setpts=PTS-STARTPTS,format=yuv420p[v1]`,
    );
    expect(plan.expectedDurationMs).toBe(6000);
  });

  it.each([
    [0.25, 20_000, "setpts=(PTS-STARTPTS)/0.25", "trim=duration=20.000"],
    [0.5, 10_000, "setpts=(PTS-STARTPTS)/0.5", "trim=duration=10.000"],
    [1.5, 3333, "setpts=(PTS-STARTPTS)/1.5", "trim=duration=3.333"],
    [4, 1250, "setpts=(PTS-STARTPTS)/4", "trim=duration=1.250"],
  ])("speed %d gives a %d ms clip", (speed, durationMs, retime, cut) => {
    const chain = chainEndingIn(withSpeed(speed, durationMs), "v1");

    expect(chain).toContain(`trim=duration=5.000,${retime},`);
    expect(chain).toContain(`fps=30,${cut},setpts=PTS-STARTPTS,format=yuv420p`);
  });

  it("uses plain timestamps at speed 1", () => {
    expect(chainEndingIn(withSpeed(1, 5000), "v1")).toContain("trim=duration=5.000,setpts=PTS-STARTPTS,scale=");
  });

  it.each([
    [0.25, 20_000, "atempo=0.5,atempo=0.5,"],
    [0.4, 12_500, "atempo=0.5,atempo=0.8,"],
    [0.5, 10_000, "atempo=0.5,"],
    [1, 5000, ""],
    [1.5, 3333, "atempo=1.5,"],
    [2, 2500, "atempo=2,"],
    [3, 1667, "atempo=2,atempo=1.5,"],
    [4, 1250, "atempo=2,atempo=2,"],
  ])("retimes the clip's audio at speed %d without leaving the 0.5-2 range per stage", (speed, durationMs, tempo) => {
    const chain = chainEndingIn(withSpeed(speed, durationMs, 1), "a0");

    expect(chain).toBe(
      `[1:a]atrim=duration=5.000,asetpts=PTS-STARTPTS,${tempo}volume=1,${AUDIO_FORMAT},` +
        `atrim=duration=${(durationMs / 1000).toFixed(3)},adelay=3000:all=1,asetpts=N/SR/TB[a0]`,
    );
  });
});

describe("compileRenderPlan: audio", () => {
  it("mutes a video clip with volume 0 by not using its audio at all", () => {
    const plan = planAfter();

    expect(plan.filterGraph).not.toContain("[1:a]");
    expect(plan.diagnostics.audioSourceCount).toBe(1);
  });

  it("ignores the audio of a video asset that has no audio stream", () => {
    const plan = planAfter((c, assets) => {
      video(c).volume = 1;
      assets[1]!.hasAudio = false;
    });

    expect(plan.filterGraph).not.toContain("[1:a]");
  });

  it("mixes an audible video clip with the background track, placed on the timeline", () => {
    const plan = planAfter((c) => {
      video(c).volume = 0.5;
    });

    expect(chainEndingIn(plan, "a0")).toBe(
      `[1:a]atrim=duration=5.000,asetpts=PTS-STARTPTS,volume=0.5,${AUDIO_FORMAT},atrim=duration=5.000,adelay=3000:all=1,asetpts=N/SR/TB[a0]`,
    );
    expect(chainEndingIn(plan, "a1")).toMatch(/^\[2:a\]atrim=duration=8\.000,/);
    expect(chains(plan).slice(-2)).toEqual([
      "[a0][a1]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[amix]",
      "[amix]apad,atrim=duration=8.000[aout]",
    ]);
    expect(plan.diagnostics.audioSourceCount).toBe(2);
  });

  it("does not delay a video clip that starts the timeline", () => {
    const plan = planAfter((c) => {
      video(c).volume = 1;
      c.tracks[0].clips.reverse();
    });

    expect(chainEndingIn(plan, "a0")).not.toContain("adelay");
  });

  it("produces silence when nothing is audible", () => {
    const plan = planAfter((c) => {
      c.tracks[1].clips = [];
    });

    expect(plan.inputs).toHaveLength(2);
    expect(chains(plan).at(-1)).toBe("anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=8.000[aout]");
    expect(plan.outputArgs.slice(0, 4)).toEqual(["-map", "[vout]", "-map", "[aout]"]);
  });

  it("skips a background clip with volume 0 and does not open its file", () => {
    const plan = planAfter((c) => {
      music(c).volume = 0;
    });

    expect(plan.inputs.map((input) => input.assetId)).toEqual(["asset-pic", "asset-vid"]);
    expect(plan.filterGraph).toContain("anullsrc");
  });

  it("skips a background clip that starts after the video ends", () => {
    const plan = planAfter((c) => {
      music(c).timelineStartMs = 8000;
    });

    expect(plan.inputs).toHaveLength(2);
  });

  it("applies the source range, volume, both fades, and the timeline position of a background clip", () => {
    const plan = planAfter((c) => {
      Object.assign(music(c), {
        sourceStartMs: 30_000,
        sourceEndMs: 34_000,
        timelineStartMs: 1500,
        volume: 0.35,
        fadeInMs: 250,
        fadeOutMs: 1000,
      });
    });

    expect(plan.inputs[2]?.args).toEqual(["-ss", "30.000", "-t", "4.000"]);
    expect(chainEndingIn(plan, "a0")).toBe(
      `[2:a]atrim=duration=4.000,asetpts=PTS-STARTPTS,volume=0.35,afade=t=in:st=0.000:d=0.250,afade=t=out:st=3.000:d=1.000,${AUDIO_FORMAT},adelay=1500:all=1,asetpts=N/SR/TB[a0]`,
    );
  });

  it("pads short audio and cuts long audio to the video's length", () => {
    const short = planAfter((c) => {
      Object.assign(music(c), { sourceEndMs: 2000, fadeOutMs: 0 });
    });
    expect(chains(short).at(-1)).toBe("[a0]apad,atrim=duration=8.000[aout]");

    const long = planAfter((c) => {
      music(c).sourceEndMs = 60_000;
    });
    expect(chains(long).at(-1)).toBe("[a0]apad,atrim=duration=8.000[aout]");
    expect(long.expectedDurationMs).toBe(8000);
  });
});

describe("compileRenderPlan: limited-range color normalization", () => {
  it("converts every visual clip to limited range and yuv420p", () => {
    const plan = planAfter();

    for (const label of ["v0", "v1"]) {
      const chain = chainEndingIn(plan, label);
      expect(chain).toContain("in_range=auto:out_range=tv:out_color_matrix=bt709");
      expect(chain).toMatch(/format=yuv420p\[v\d\]$/);
    }
  });

  it("tags the output as limited-range yuv420p explicitly", () => {
    const { outputArgs } = planAfter();

    expect(outputArgs[outputArgs.indexOf("-pix_fmt") + 1]).toBe("yuv420p");
    expect(outputArgs[outputArgs.indexOf("-color_range") + 1]).toBe("tv");
    for (const flag of ["-colorspace", "-color_primaries", "-color_trc"]) {
      expect(outputArgs[outputArgs.indexOf(flag) + 1]).toBe("bt709");
    }
    expect(outputArgs.join(" ")).not.toContain("yuvj420p");
  });

  it("sets explicit encoder and audio settings from the preset", () => {
    const { outputArgs } = planAfter();
    const valueOf = (flag: string) => outputArgs[outputArgs.indexOf(flag) + 1];

    expect(valueOf("-c:v")).toBe("libx264");
    expect(valueOf("-preset")).toBe("medium");
    expect(valueOf("-crf")).toBe("20");
    expect(valueOf("-r")).toBe("30");
    expect(valueOf("-c:a")).toBe("aac");
    expect(valueOf("-b:a")).toBe("192k");
    expect(valueOf("-ar")).toBe("48000");
    expect(valueOf("-ac")).toBe("2");
  });
});

describe("compileRenderPlan: validation failures", () => {
  it("returns the semantic issues and no plan for an invalid composition", () => {
    const { composition, assets } = spike();
    video(composition).speed = 100;
    image(composition).assetId = "asset-missing";

    const result = compileRenderPlan(composition, assets, VERTICAL_1080P30);

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("value");
    expect(result.ok ? [] : result.error.map((issue) => issue.code)).toEqual([
      "ASSET_NOT_FOUND",
      "SPEED_OUT_OF_RANGE",
    ]);
  });

  it("rejects an empty visual track", () => {
    expect(
      issuesAfter((c) => {
        c.tracks[0].clips = [];
      }),
    ).toEqual([["VISUAL_TRACK_EMPTY", ["tracks", 0, "clips"]]]);
  });

  it("rejects a source range past the end of the asset", () => {
    expect(
      issuesAfter((c) => {
        video(c).sourceEndMs = 999_999;
      }),
    ).toContainEqual(["SOURCE_RANGE_OUT_OF_BOUNDS", ["tracks", 0, "clips", 1, "sourceEndMs"]]);
  });

  it("rejects a preset other than the composition's own", () => {
    expect(issuesAfter(() => {}, { ...VERTICAL_1080P30, id: "square-1080p30" })).toEqual([
      ["PRESET_MISMATCH", ["presetId"]],
    ]);
  });

  it("reports validation and path problems together", () => {
    expect(
      issuesAfter((c, assets) => {
        image(c).durationMs = 1;
        assets[2]!.path = "aud.mp3";
      }),
    ).toEqual([
      ["IMAGE_DURATION_OUT_OF_RANGE", ["tracks", 0, "clips", 0, "durationMs"]],
      ["ASSET_PATH_INVALID", ["tracks", 1, "clips", 0, "assetId"]],
    ]);
  });
});
