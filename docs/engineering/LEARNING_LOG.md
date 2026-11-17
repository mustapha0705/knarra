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

---

## KNAR-105 — Pure atomic operation reducer (2026-11-17)

1. **What problem does this layer solve?**
   It is the single place where a Composition changes. Given a Composition and a batch of operations it returns either a new valid Composition or the reasons it refused. There is no third outcome such as "half applied".

2. **What inputs and outputs cross its boundary?**
   Input: the current `Composition`, untrusted operations (`unknown`), and the asset list. Output: `{ ok: true, value }` with a new Composition, or `{ ok: false, error }` with issues. Issues about an operation have paths like `operations.1.clipId`; issues about the result have Composition paths like `tracks.0.clips.1.speed`.

3. **What invariant does it protect?**
   Invariant 3 (manual and AI edits change the same typed Composition through the same code) and invariant 5 (structural and semantic validation both run before state changes). Because the function is pure and atomic, a caller can keep the old Composition, try an edit, and simply discard a failed attempt.

4. **What failure case did the test expose?**
   The frontend's current `setSpeed` compounds: it divides the clip's current duration by the new speed, so setting 2x twice gives a quarter-length clip, and the duration no longer matches the source range. This reducer stores the speed and always recomputes the duration from the source range, `round((end - start) / speed)`. Setting 2x any number of times gives the same clip, and setting 1x restores the original.

5. **How would I diagnose it without Claude?**
   - Call `applyOperations` in a test with a frozen input (`Object.freeze` recursively); any mutation throws with a stack trace.
   - Read the first path segment of each issue: `operations` means the request was wrong, `tracks` means the result would be invalid.
   - `npm test -- reducer` runs only these tests.

6. **What did I personally inspect, change, or test?**
   Nothing yet. This task was completed overnight under my delegation and is waiting for my review.

---

## KNAR-106 — Schema version and migration boundary (2026-11-17)

1. **What problem does this layer solve?**
   Saved projects outlive the code that wrote them. When the Composition shape changes, old saved data must either be upgraded or refused clearly. This task adds the one door through which stored Composition data enters: `parseComposition`.

2. **What inputs and outputs cross its boundary?**
   Input: `unknown` data, such as a row from the database or an uploaded project file. Output: a current-version `Composition`, or issues. The steps are fixed: read `schemaVersion`, run migrations (`0 -> 1`, `1 -> 2`, one step at a time), then the strict parse.

3. **What invariant does it protect?**
   Invariant 2, over time: the Composition stays the source of truth even after its format changes. It also supports invariant 9 (immutable project versions), because an old immutable snapshot can still be read later without rewriting it.

4. **What failure case did the test expose?**
   Why this is needed before the first project is ever saved: without a version check, data written by a newer Knarra would be read by an older one as "has unknown keys" and be reported as corrupt, or worse, partly accepted. The tests show a future version is refused with "Update Knarra" before its structure is even looked at, and that a migration which throws or forgets to raise the version becomes an issue instead of a crash.

5. **How would I diagnose it without Claude?**
   - Look at `schemaVersion` in the stored JSON first.
   - Call `parseComposition(data)` and read the issue `code`: `SCHEMA_VERSION_*` is a version problem, `MIGRATION_FAILED` is a broken upgrade step, `INVALID_STRUCTURE` is the data itself.
   - `npm test -- parse` runs only these tests.

6. **What did I personally inspect, change, or test?**
   Nothing yet. This task was completed overnight under my delegation and is waiting for my review.

---

## KNAR-201 — Deterministic render compiler (2026-11-17)

1. **What problem does this layer solve?**
   It turns "the video to render" (a Composition) into "exactly what to tell FFmpeg" (a plan). The spike hard-coded one command for three fixed files; this produces the equivalent command for any valid Composition.

2. **What inputs and outputs cross its boundary?**
   Input: a Composition, the assets with their server-resolved file paths, and a render preset. Output: a `RenderPlan` with the inputs, the filtergraph text, the output arguments, and the expected duration, or a list of issues. It reads no files and starts no process.

3. **What invariant does it protect?**
   Invariant 6 (the compiler is a deterministic, pure function) and invariant 7 (FFmpeg gets an argument array, never a shell string). Because it is pure, its entire behavior can be tested by comparing text, in milliseconds, without FFmpeg installed. Paths never enter the filtergraph: inputs are referred to by number (`[1:v]`), so a filename with spaces, quotes, or semicolons cannot change the meaning of the graph. Paths that FFmpeg itself would treat specially, such as `-i` or `concat:a|b`, are rejected.

4. **What failure case did the test expose?**
   Two, and they needed different kinds of test. The spike's output was full range (`yuvj420p`) because `format=yuv420p` changes the pixel layout but not the range; the plan now converts with `out_range=tv` and tags the output, and golden tests pin that text. The second was invisible to text comparison: when a sped-up clip's audio was delayed and mixed with music, the mixed audio stream came out 0.02 seconds long. Only a real render showed it. Golden tests prove the plan is what was intended; only real renders prove the intention was right, which is why M3 adds them.

5. **How would I diagnose it without Claude?**
   - Print `plan.filterGraph.split(";")` to read one chain per line.
   - Run the arguments by hand and probe the result: `ffprobe -v error -show_entries stream=codec_name,pix_fmt,color_range,duration -of default=nw=1 out.mp4`.
   - For audio, measure a time window: `ffmpeg -i out.mp4 -af "atrim=3:5,volumedetect" -f null -` and read `mean_volume` (about -91 dB is silence).
   - Cut the graph down one filter at a time until the problem disappears.

6. **What did I personally inspect, change, or test?**
   Nothing yet. This task was completed overnight under my delegation and is waiting for my review.

---

## KNAR-301 — FFmpeg executor and media probe (2026-11-17)

1. **What problem does this layer solve?**
   The compiler produces a plan; something has to carry it out in the real world, where processes fail, hang, get cancelled, and leave half-written files. This layer runs FFmpeg and ffprobe and makes those outcomes safe and predictable.

2. **What inputs and outputs cross its boundary?**
   Input: a `RenderPlan`, an output path, an optional `AbortSignal`, and an optional progress callback. Output: a finished file, or a `ProcessError` saying whether it failed to start, exited with an error, was cancelled, or timed out. For probing: a path in, a validated description of the media out.

3. **What invariant does it protect?**
   Invariant 7: FFmpeg is launched with `spawn()` and an argument array, never a shell command. It also supplies the rule that a file at the output path always means a completed render, which render jobs (M6) depend on.

4. **What failure case did the test expose?**
   Order matters in cleanup. On Windows a file cannot be deleted while another process has it open, so the partial output can only be removed after FFmpeg has fully closed; the runner therefore settles on the process's `close` event, not at the moment it asks the process to stop. The integration tests also found a defect that no golden test could: the rendered file had no color-range tag at all for some sources. The golden test compared the plan with what I intended, and my intention was incomplete. Only rendering and probing a real file showed it.

5. **How would I diagnose it without Claude?**
   - Read `error.failure`, `error.exitCode`, and `error.stderr` on a `ProcessError`.
   - Run the same arguments by hand with `-loglevel info` to see FFmpeg's own explanation.
   - `ffprobe -v error -show_streams -of json file.mp4` and compare with what the probe returned.
   - After a cancelled render, list the output directory: nothing should be left.
   - `npm run test:integration` re-runs the real renders in a few seconds.

6. **What did I personally inspect, change, or test?**
   Nothing yet. This task was completed overnight under my delegation and is waiting for my review.

---

## KNAR-302 — Project-driven synchronous Export integration (2026-11-17)

1. **What problem does this layer solve?**
   Until now Export ignored the project and rendered one fixed demo. This connects the existing editor to the real pipeline: the timeline becomes a Composition, the backend validates, compiles, and renders it, and the browser downloads the result.

2. **What inputs and outputs cross its boundary?**
   Browser to server: a new export request, then each used media file as raw bytes addressed by its asset ID, then the Composition as JSON. Server to browser: an MP4, or a list of issues with messages. No filename, no file path, and no media metadata crosses from the browser.

3. **What invariant does it protect?**
   Invariants 2 and 5: what is rendered is exactly the validated Composition. It also applies the safety rules for uploads before the storage layer exists: untrusted names never become paths, and derived files are cleaned up after failed or cancelled work.

4. **What failure case did the test expose?**
   The server must not believe the browser about a file. A test uploads an audio file into the slot the Composition uses as an image; because the server probes the file itself, the result is `ASSET_KIND_MISMATCH` instead of FFmpeg being handed the wrong kind of input. A second case came from how browsers and ffprobe measure length: they can disagree by a few milliseconds, which made a "use the whole clip" range fail validation, so ranges within 500 ms of the end are trimmed to the real end. A third was ordering in cleanup: the directory is removed before an error response is sent, so a client never sees a failure while its media is still on disk.

5. **How would I diagnose it without Claude?**
   - Browser DevTools, Network tab: watch `POST /api/exports`, the `PUT` uploads, then `/render`; a 422 response body lists the issues.
   - Reproduce without the UI using `curl` and the spike fixture.
   - Read the backend terminal: render failures log FFmpeg's stderr there, not to the browser.
   - Look in the system temp folder under `knarra-exports`: it should be empty when no export is running.

6. **What did I personally inspect, change, or test?**
   Nothing yet. This task was implemented overnight under my delegation; my browser test is still to do, so the task is in review.

---

## KNAR-401 — Project persistence and versions (2026-11-17)

1. **What problem does this layer solve?**
   Until now a project lived only in the browser tab. This stores it in PostgreSQL so it can be reopened, and adds two guarantees a file on disk would not give: a save cannot silently overwrite someone else's newer save, and a version, once made, never changes.

2. **What inputs and outputs cross its boundary?**
   In: a title to create a project; to save, the revision the client started from plus the Composition, the editor state, and the asset list. Out: the stored project with its new revision, or 409 with the current revision, or 422 with issues. Three layers handle it: routes (HTTP only), a service (the rules), and a repository (the SQL).

3. **What invariant does it protect?**
   Invariant 9 (versions are immutable snapshots that reference assets instead of copying media) and invariant 10 (a render job binds to an immutable version). The database enforces both itself: a trigger rejects any `UPDATE` of a version, and a render job row cannot exist without a version.

4. **What failure case did the test expose?**
   The stale write. Two editors open revision 1. The first saves and the project becomes revision 2. The second, still holding revision 1, saves. Without a check the first editor's work is gone with no error anywhere. With the revision in the `WHERE` clause of the update, the second save matches zero rows, is reported as a conflict, and writes nothing, not even its asset list. A second lesson: "can be saved" and "can be rendered" are different. A project with an empty timeline must be saveable, so saving checks structure only; making a version runs full validation, because a version is a promise that it can be rendered.

5. **How would I diagnose it without Claude?**
   - `psql` into the database: `SELECT id, title, revision, updated_at FROM projects;` and `SELECT name FROM schema_migrations;`.
   - A 409 response carries `currentRevision`; compare it with the revision the client sent.
   - `SELECT project_id, version_number, project_revision FROM project_versions ORDER BY 1, 2;` shows what each version captured.
   - `npm test -- persistence` runs the repository tests with no server needed.

6. **What did I personally inspect, change, or test?**
   Nothing yet. This task was implemented overnight under my delegation. I still need to connect it to my PostgreSQL server, so it is in review.
