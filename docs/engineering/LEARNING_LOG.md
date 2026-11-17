# Learning Log

One entry per completed task. The agent writes the whole entry after Mustapha confirms the task passes (see `AGENT_WORKFLOW.md`). Answer 6 records only what Mustapha actually reported inspecting, changing, or testing; the agent never invents it.

## Template

```markdown
## KNAR-### — Task name (YYYY-MM-DD)

1. What problem does this layer solve?
2. What inputs and outputs cross its boundary?
3. What invariant does it protect?
4. What failure case did the test expose?
5. How would I diagnose it without Claude?
6. What did I personally inspect, change, or test?
```

At the end of each milestone, explain the data flow on paper or in your own words before starting the next one.

---

## KNAR-000 — Minimal Export spike (2026-11-16)

1. **What problem does this layer solve?**
   It proves that Knarra's core output can be produced: a still image and a trimmed video, normalized to one vertical format, joined, with faded music, as a playable MP4 the browser can download.

2. **What inputs and outputs cross its boundary?**
   Input: an empty `POST /api/demo-render`; three fixed files (`pic.png`, `vid.mp4`, `aud.mp3`). Output: `knarra-demo.mp4` streamed as an attachment, or a 409/500 JSON error. Inside, FFmpeg receives an argument array and a filtergraph:
   - Each visual input: `trim` → `setpts=PTS-STARTPTS` (restart timestamps at zero) → `scale=1080:1920:force_original_aspect_ratio=decrease` (fit inside) → `pad` (letterbox to exactly 1080x1920) → `setsar=1` (square pixels) → `fps=30` → `format=yuv420p`.
   - `concat=n=2:v=1:a=0` joins the two visual segments; inputs must already match in size, SAR, frame rate, and pixel format.
   - Audio: `atrim=duration=8` → `asetpts` → `afade=t=out:st=6:d=2`.
   - `-map [v] -map [a]` selects exactly the filtered streams; `+faststart` moves the index to the front so playback can start before download finishes.

3. **What invariant does it protect?**
   Invariant 7: FFmpeg runs through `spawn()` with an argument array, so no shell ever parses the command. It also previews invariant 6: the render is fully determined by its inputs.

4. **What failure case did the test expose?**
   The output probes as `yuvj420p` with `color_range=pc` even though the command asks for `yuv420p`. The source video was full range, and `format=yuv420p` changes the pixel layout but not the range tag. `verify.js` did not check pixel format, so it passed. Separately, the render worked locally but a fresh clone cannot run it, because `render.js` is gitignored.

5. **How would I diagnose it without Claude?**
   - `ffprobe -v error -show_streams -of json knarra-demo.mp4` and read `pix_fmt`, `color_range`, `r_frame_rate`, `width`, `height`, `duration`.
   - Run the same probe on each input to see which one introduced a property.
   - Read FFmpeg's stderr for warnings such as the deprecated pixel-format message.
   - `git ls-files` and `git check-ignore -v <file>` to confirm a file is actually committed.

6. **What did I personally inspect, change, or test?**
   I built this spike by hand (`TASKS.md` records KNAR-000 as a manual spike, commits `e7d3fb0` and `01013eb`): the FFmpeg practice commands, `render.js`, `verify.js`, and the Export wiring.

---

## KNAR-001 — Make the spike reproducible from Git (2026-11-17)

1. **What problem does this layer solve?**
   The spike worked on this machine, but the repository could not reproduce it: `backend/src/server.js` imports `../ffmpeg-practice/render.js`, and the whole `ffmpeg-practice/` folder was gitignored, so a fresh clone crashed on import.

2. **What inputs and outputs cross its boundary?**
   Git's ignore rules decide what reaches the repository. Ignoring a whole folder hid code and notes along with the media. The fix ignores media by extension, so scripts and notes are committed and media and generated MP4s are not.

3. **What invariant does it protect?**
   Commit code and notes; never commit media or generated outputs. A checkpoint must be reproducible from Git alone, apart from deliberately untracked media.

4. **What failure case did the test expose?**
   A passing local run proved nothing about the commit, because the local folder contained ignored files. Only a clone-like copy of exactly what Git would contain showed the import crash, and then showed it had become a clean 500 when media is missing. A second lesson came from the check itself: when another server already holds port 3001, a request to `localhost:3001` silently reaches that server instead, so the check must confirm the port is free and read the new server's own log.

5. **How would I diagnose it without Claude?**
   - `git check-ignore -v <file>` shows which rule ignores a file.
   - `git ls-files` lists what is committed; `git ls-files -co --exclude-standard` lists what would be committed.
   - Clone the repository into an empty folder (or copy only those files), install, and run it before calling a checkpoint done.
   - `netstat -ano | findstr :3001` shows whether a port is already in use.

6. **What did I personally inspect, change, or test?**
   I ran the manual Export test in the browser and confirmed the MP4 downloaded.

---

## KNAR-003 — Add staged frontend integration checkpoints (2026-11-17)

1. **What problem does this layer solve?**
   The plan connected the existing frontend to the backend only once, in M7, after five backend milestones. Every mismatch between the editor and the backend contracts would have surfaced together and late, and the hard-coded Export spike would have stayed in place until then. The roadmap now ends each backend milestone with a frontend integration checkpoint.

2. **What inputs and outputs cross its boundary?**
   This is a planning change, so the boundary is between milestones. Each backend milestone outputs a stable contract; its checkpoint takes that contract and the existing UI as inputs and outputs one browser-testable slice: KNAR-302 a real Export, KNAR-402 save and reopen, KNAR-502 uploaded assets and proxies, KNAR-602 render jobs. M7 takes those four integrations and outputs one consolidated frontend architecture.

3. **What invariant does it protect?**
   Invariant 12: the current frontend is evolved incrementally, not regenerated. It also keeps invariants 2–5 honest earlier, because the editor must produce a Composition that passes real validation from KNAR-302 onward.

4. **What failure case did the test expose?**
   Planning KNAR-302 exposed a gap: imported media exists only as `blob:` URLs in the browser until M5, so the backend would have had nothing to render. The roadmap now states a temporary request-scoped upload, deleted after the render and removed by KNAR-502. The stale-statement search also showed that accepted ADRs still said "M7 adapter"; a new ADR supersedes that wording instead of rewriting history.

5. **How would I diagnose it without Claude?**
   - Read the "Depends on" column in `TASKS.md` and check that every checkpoint depends on its backend task and on the previous checkpoint.
   - Search the docs for `M7` and `vertical slice` and check each hit against ADR 0008.
   - `git diff --name-only` to confirm a documentation task touched only Markdown files.

6. **What did I personally inspect, change, or test?**
   I approved the plan, chose the temporary upload for KNAR-302 and a new ADR instead of editing accepted ones, and removed the final diff-summary step from the completion sequence.

---

## KNAR-101 — Backend TypeScript toolchain (2026-11-17)

1. **What problem does this layer solve?**
   The Composition kernel needs strong static types and a test runner, but the backend was plain JavaScript with neither. This task adds TypeScript, Vitest, and Zod next to the existing JavaScript, so the kernel can be written and tested without converting `server.js` first.

2. **What inputs and outputs cross its boundary?**
   Input: source files under `backend/src`. Output: two verdicts and nothing else. `npm run typecheck` reads the files and reports type errors; `noEmit` means it never writes JavaScript. `npm test` runs `src/**/*.test.ts`. The running server is untouched: `npm run dev` still starts `src/server.js` with Node directly.

3. **What invariant does it protect?**
   It prepares invariant 5 (structural and semantic validation before state changes). `strict` rejects implicit `any` and unchecked `null`/`undefined`. `noUncheckedIndexedAccess` makes `clips[0]` a `Clip | undefined`, which matters for a kernel that indexes into clip arrays. Types disappear at runtime, so untrusted JSON (a saved project, a request body, model output) still needs a runtime schema; Zod provides that, and types are derived from the schemas so the two cannot drift.

4. **What failure case did the test expose?**
   A passing type-check proves little by itself, so a temporary file that assigned `xs[0]` to a `number` was added; it failed with `TS2322`, showing the strict option is really on. The dev-server check found port 3001 already in use, the same trap as KNAR-001; the process was identified as this repository's own nodemon before trusting its responses.

5. **How would I diagnose it without Claude?**
   - `npx tsc --noEmit --listFilesOnly` shows which files the type-check actually covers.
   - `npx tsc --showConfig` prints the effective compiler options.
   - Write one deliberately wrong line and confirm the type-check fails.
   - `npm test -- <name>` runs only matching test files.
   - `netstat -ano | findstr :3001`, then look up the PID, to see which server is answering.

6. **What did I personally inspect, change, or test?**
   I ran the manual checklist (`npm run typecheck`, `npm test`, and Export in the browser) and confirmed it works.

---

## KNAR-102 — Structural Composition schemas v1 (2026-11-17)

1. **What problem does this layer solve?**
   Everything later in the plan (validation, edits, rendering, saving, the LLM planner) needs one agreed shape for "the video to render". This task defines that shape as runtime schemas, so untrusted JSON either becomes a typed `Composition` or is rejected with a list of issues.

2. **What inputs and outputs cross its boundary?**
   Input: `unknown` data, such as a parsed JSON file. Output: a typed value, or issues that each carry a `path` (for example `tracks.0.clips.1.sourceEndMs`) and a message. The TypeScript types are derived from the schemas with `z.infer`, so there is one definition, not two that can drift.

3. **What invariant does it protect?**
   Invariant 2 (the Composition is the source of truth for the video) and ADR 0005 (all times are integer milliseconds). Strict objects mean a Composition cannot carry extra fields such as a file path or FFmpeg arguments, and the ID format excludes path separators and shell characters. That is the first half of invariant 4, in place before any LLM exists.

4. **What failure case did the test expose?**
   The difference between structural and semantic validity. A Composition where a video clip uses source range 0–5000 ms of a 2-second asset, or has speed 100, is structurally valid: every field has the right type. Only a check that compares fields with each other and with the asset catalog can reject it, which is KNAR-103. The tests make this explicit: empty clip lists parse here, because "the visual track must not be empty" is a semantic rule.

5. **How would I diagnose it without Claude?**
   - Call `compositionSchema.safeParse(data)` and read `result.error.issues`: each has `code`, `path`, and `message`.
   - An `unrecognized_keys` issue lists the offending key names in `keys`.
   - Edit a copy of `spike.composition.json` to break one thing and run `npm test -- schema` to see which path is reported.

6. **What did I personally inspect, change, or test?**
   I ran the manual checklist and confirmed it works.

---

## KNAR-103 — Semantic Composition validation (2026-11-17)

1. **What problem does this layer solve?**
   A Composition can have every field of the right type and still be nonsense: a clip that uses seconds 0–5 of a 2-second video, a speed of 100, two songs playing at once. The schema cannot see that. This layer checks the rules that compare fields with each other and with the asset catalog.

2. **What inputs and outputs cross its boundary?**
   Input: a structurally valid `Composition` and the list of `AssetRef`s. Output: a list of issues, empty when valid. Each issue has a stable `code` for programs, a `path` such as `tracks.0.clips.1.speed`, and a `message` that says what to change.

3. **What invariant does it protect?**
   Invariant 5: semantic validation runs before anything can modify project state. It also backs invariant 6, because the render compiler can assume ranges, speeds, and durations are consistent instead of defending against them.

4. **What failure case did the test expose?**
   Validation needs the asset catalog. Whether `sourceEndMs: 5000` is legal depends on the asset's real duration, which is not in the Composition, so the schema alone can never decide it. The tests also pin down that all problems are reported together (eleven in one composition), not just the first, and that a duration is not reported as wrong when the speed it derives from is already invalid.

5. **How would I diagnose it without Claude?**
   - Call `validateComposition(composition, assets)` and read each issue's `code` and `path`.
   - Compare the clip at that path with the matching entry in the asset list (`durationMs`, `kind`).
   - For a duration issue, compute `round((sourceEndMs - sourceStartMs) / speed)` by hand.
   - `npm test -- validate` runs only these tests.

6. **What did I personally inspect, change, or test?**
   Nothing yet. This task was completed overnight under my delegation and is waiting for my review.

---

## KNAR-104 — EditOperation v1 schema (2026-11-17)

1. **What problem does this layer solve?**
   It defines the complete list of ways a Composition may change. Anything that is not one of the nine operations, in exactly the right shape, is not an edit.

2. **What inputs and outputs cross its boundary?**
   Input: `unknown` data, from the UI today and from an LLM plan in M8. Output: a typed `EditOperation`, or issues with paths such as `1.clipId` for the second operation of a batch.

3. **What invariant does it protect?**
   Invariant 4: the LLM emits allowlisted edit operations, never FFmpeg commands, shell fragments, paths, or storage locations. This schema enforces that before any LLM exists, by construction: operations are strict objects, so no extra field can ride along; the only strings are `op` (a fixed list) and IDs (letters, digits, `_`, `-`); everything else is a number. There is nowhere to put a path or a command.

4. **What failure case did the test expose?**
   Strings like `../x`, `a;rm`, and `$(x)` are rejected as IDs, and `ffmpegArgs`, `path`, `src`, and `url` are rejected as keys. One design issue surfaced while writing the cases: if a caller could supply a video clip's `durationMs`, it could disagree with the source range and speed, so new video clips do not accept it at all.

5. **How would I diagnose it without Claude?**
   - `editOperationSchema.safeParse(value)` and read `error.issues`.
   - An issue at path `op` means the operation name is not allowlisted.
   - `unrecognized_keys` names the extra field.
   - `npm test -- operations` runs only these tests.

6. **What did I personally inspect, change, or test?**
   Nothing yet. This task was completed overnight under my delegation and is waiting for my review.
