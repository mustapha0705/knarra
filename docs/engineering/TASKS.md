# Tasks

Work one task at a time. A task is done only when its completion evidence matches its acceptance criteria and the learning-log entry exists. M2–M9 tasks, including the frontend integration checkpoints (KNAR-302, KNAR-402, KNAR-502, KNAR-602), are headlines; expand them into full entries at the start of their milestone. Every task follows the completion sequence in `AGENT_WORKFLOW.md`.

Statuses: `ready | in-progress | blocked | review | done | planned`.

## Index

| ID | Status | Milestone | Task | Depends on |
| --- | --- | --- | --- | --- |
| KNAR-000 | done | M0 | Minimal Export spike | none |
| KNAR-001 | done | M0 | Make the spike reproducible from Git | KNAR-000 |
| KNAR-002 | done | M0 | Planning documents | KNAR-000 |
| KNAR-003 | done | M0 | Add staged frontend integration checkpoints | KNAR-002 |
| KNAR-101 | done | M1 | Backend TypeScript toolchain | KNAR-001, KNAR-002 |
| KNAR-102 | done | M1 | Structural Composition schemas v1 | KNAR-101 |
| KNAR-103 | done | M1 | Semantic Composition validation | KNAR-102 |
| KNAR-104 | done | M1 | EditOperation v1 schema | KNAR-102 |
| KNAR-105 | done | M1 | Pure atomic operation reducer | KNAR-103, KNAR-104 |
| KNAR-106 | done | M1 | Schema version and migration boundary | KNAR-102 |
| KNAR-201 | planned | M2 | Deterministic render compiler | M1 |
| KNAR-301 | planned | M3 | FFmpeg executor and media probe | KNAR-201 |
| KNAR-302 | planned | M3 | Project-driven synchronous Export integration (frontend checkpoint) | KNAR-201, KNAR-301 |
| KNAR-401 | planned | M4 | Project persistence and versions | M1 |
| KNAR-402 | planned | M4 | Project save and reopen integration (frontend checkpoint) | KNAR-401, KNAR-302 |
| KNAR-501 | planned | M5 | Asset ingestion and proxies | KNAR-301, KNAR-401 |
| KNAR-502 | planned | M5 | Asset ingestion and proxy integration (frontend checkpoint) | KNAR-501, KNAR-402 |
| KNAR-601 | planned | M6 | Asynchronous render jobs | KNAR-301, KNAR-401 |
| KNAR-602 | planned | M6 | Asynchronous Export experience (frontend checkpoint) | KNAR-601, KNAR-502 |
| KNAR-701 | planned | M7 | Frontend architecture consolidation | KNAR-302, KNAR-402, KNAR-502, KNAR-602 |
| KNAR-801 | planned | M8 | LLM planner | KNAR-701 |
| KNAR-901 | planned | M9 | Python package skeleton, contract envelope, CLI | KNAR-701 |
| KNAR-902 | planned | M9 | Node analysis contracts and process runner | KNAR-901 |
| KNAR-903 | planned | M9 | Persist validated analysis results | KNAR-902, KNAR-401 |
| KNAR-904 | planned | M9 | Shot/scene detection and StyleProfileV0 | KNAR-903 |
| KNAR-1001 | planned | M10 | Further analyzers (one task each) | KNAR-904 |

---

## M0: Repository Baseline and Planning

### KNAR-000 — Minimal Export spike

- Status: done
- Milestone: M0
- Depends on: none
- Owner/session: Mustapha (manual spike)
- Intended files: `backend/src/server.js`, `backend/ffmpeg-practice/render.js`, `backend/ffmpeg-practice/verify.js`, `frontend/src/features/editor/ProjectEditor.tsx`, `EditorToolbar.tsx`, `Editor.module.css`, `frontend/vite.config.ts`
- Goal: prove the media core end to end: one image and a trimmed video, normalized, concatenated, with faded music, rendered to MP4 and downloaded from the Export button.
- Non-goals: using project data, persistence, progress, cancellation, concurrency.
- Acceptance criteria:
  - Clicking Export downloads an 8-second 1080x1920 H.264/AAC MP4.
  - A second request while rendering returns 409.
  - A failed render returns 500 with a generic message and removes the partial output.
- Required tests: manual; `verify.js` probe of duration and dimensions.
- Verification commands: `node backend/ffmpeg-practice/verify.js`; `ffprobe` on `knarra-demo.mp4`.
- Learning checkpoint: explain each filter in the graph (`trim`, `setpts`, `scale` with `force_original_aspect_ratio`, `pad`, `setsar`, `fps`, `format`, `concat`, `atrim`, `asetpts`, `afade`) and why `+faststart` matters.
- Completion evidence:
  - Commits `e7d3fb0` and `01013eb`.
  - ffprobe of `knarra-demo.mp4`: H.264 High 1080x1920, 30/1 fps, SAR 1:1, AAC LC stereo, duration 8.000000.
  - Gaps carried forward: `render.js`/`verify.js` were gitignored and never committed, so a fresh clone failed on import (fixed by KNAR-001); frontend export wiring was uncommitted (committed in `35d97be`); output is tagged `yuvj420p`/`color_range=pc` (M2/M3); the clip's own audio is dropped (M2 decision).

### KNAR-001 — Make the spike reproducible from Git

- Status: done
- Milestone: M0
- Depends on: KNAR-000
- Owner/session: lead
- Intended files: `backend/.gitignore`, `backend/ffmpeg-practice/{render.js,verify.js,command.md,commands.txt,Knarra_Four_Hour_Minimal_Render_Spike.md}`, `backend/package.json`
- Goal: a fresh clone contains every file the Export spike needs except media.
- Note: the frontend export wiring originally in this task's scope was already committed in `35d97be`.
- Non-goals: changing render behavior, refactoring `server.js`, adding tests or dependencies, committing media.
- Acceptance criteria:
  - `backend/.gitignore` ignores only media and generated outputs in `ffmpeg-practice/` (`*.mp4`, `*.mp3`, `*.png`), not the scripts and notes.
  - `git ls-files` shows no `.mp4`/`.mp3` files.
  - `backend/package.json` `main` points to `src/server.js`.
  - In a fresh clone with no media, `npm install && npm run dev` starts the server; `POST /api/demo-render` returns a clean 500, not an import crash.
  - With media present, Export still downloads the 8-second MP4.
- Required tests: manual fresh-clone check; manual Export check.
- Verification commands: `git clone <repo> /tmp/knarra-check && cd /tmp/knarra-check/backend && npm install && npm run dev`; `curl -X POST http://localhost:3001/api/demo-render -i`.
- Learning checkpoint: explain why a passing local run did not prove the commit was reproducible.
- Completion evidence (2026-11-17, against base `af1ca7b`):
  - `backend/.gitignore` now ignores only media in `ffmpeg-practice/` (`*.mp4 *.mov *.mp3 *.wav *.m4a *.png *.jpg *.jpeg`); the extra extensions beyond the three named are a defensive addition. `render.js`, `verify.js`, `command.md`, `commands.txt`, and `Knarra_Four_Hour_Minimal_Render_Spike.md` become tracked.
  - `backend/package.json` `main` is `src/server.js`.
  - No media tracked or trackable: `git ls-files` and `git ls-files -co --exclude-standard` filtered for `mp4|mp3|mov|wav|m4a` both return nothing.
  - Fresh-clone simulation (files from `git ls-files -co --exclude-standard` copied to an empty directory, `npm ci`, port 3001 confirmed free first): `GET /` → 200; `POST /api/demo-render` → 500 `{"error":"The demo render failed"}`; the clone's log shows FFmpeg exited because the inputs were missing, with no import crash.
  - With media present: `node backend/ffmpeg-practice/verify.js` passed (8 s, 1080x1920); ffprobe shows h264 1080x1920 30/1 + aac, duration 8.000000 (still `yuvj420p`, tracked for M2/M3).
  - Frontend regression checks: `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, `npx eslint .` all pass.
  - Manual: Mustapha clicked Export in the browser and confirmed the MP4 downloaded.

### KNAR-002 — Planning documents

- Status: done
- Milestone: M0
- Depends on: KNAR-000
- Owner/session: lead
- Intended files: `CLAUDE.md`, `docs/engineering/*.md`, `docs/decisions/0001`–`0006` (0007 and these status updates follow in a separate docs commit)
- Goal: commit the approved engineering plan.
- Non-goals: any product source, dependency, or configuration change.
- Acceptance criteria:
  - Only documentation files are added.
  - Frontend type-check and lint still pass.
- Required tests: none (documentation only).
- Verification commands: `git status`; `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx eslint .`
- Learning checkpoint: explain the 12 invariants and why M1 must be built by one session.
- Completion evidence:
  - Commit `35d97be` (`docs: establish Knarra backend architecture and execution plan`) adds `CLAUDE.md`, `docs/engineering/*.md`, and ADRs 0001–0006.
  - Before commit: `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.node.json --noEmit`, and `npx eslint .` in `frontend/` all passed.
  - Deviation: the same commit also included the playbook (`Knarra_Claude_Code_Serious_Development_Playbook.md`) and the KNAR-000 frontend export wiring (`ProjectEditor.tsx`, `EditorToolbar.tsx`, `Editor.module.css`, `vite.config.ts`). Those are KNAR-000 work, not new product changes, and KNAR-001's scope was reduced accordingly.

### KNAR-003 — Add staged frontend integration checkpoints

- Status: done
- Milestone: M0
- Depends on: KNAR-002
- Owner/session: lead
- Intended files: `docs/engineering/{TASKS.md,MASTER_PLAN.md,AGENT_WORKFLOW.md,ARCHITECTURE.md,CURRENT_STATE.md,LEARNING_LOG.md}`, `docs/decisions/0008-staged-frontend-integration.md`, `CLAUDE.md` (Working Rules), `Knarra_Claude_Code_Serious_Development_Playbook.md` (precedence note only)
- Goal: the engineering roadmap and agent workflow describe staged frontend/backend integration. The existing frontend connects to each backend contract at the end of the relevant milestone (KNAR-302, KNAR-402, KNAR-502, KNAR-602), M7 becomes frontend architecture consolidation, and the task-completion workflow is recorded as permanent policy.
- Non-goals:
  - No product source changes.
  - No API implementation.
  - No frontend implementation.
  - No dependency changes.
  - No restructuring of M1.
  - No expansion of every future milestone into detailed implementation tasks.
- Acceptance criteria:
  - The index, headline list, and `MASTER_PLAN.md` contain KNAR-302, KNAR-402, KNAR-502, and KNAR-602 with purpose, exclusions, and unambiguous dependencies.
  - KNAR-701 is described as frontend architecture consolidation, not as the first frontend vertical slice.
  - The nine-step integration sequence is documented in `MASTER_PLAN.md`.
  - `AGENT_WORKFLOW.md` records agent and Mustapha responsibilities, the task completion sequence, and the automated frontend-check policy, using only commands that exist.
  - No planning document still says that frontend integration begins in M7, that the frontend must be created, that the Export spike is the final Export architecture, that Mustapha must hand-edit task evidence or learning logs, or that the agent may commit. Remaining historical wording in accepted ADRs and the playbook body is superseded explicitly (ADR 0008, playbook precedence note).
  - M1 task entries (KNAR-101 to KNAR-106) are unchanged.
  - Only Markdown documentation files change.
- Required tests: none (documentation only).
- Verification commands: `git status --short`; `git diff --stat`; `git diff --name-only` (every path ends in `.md`); `git diff docs/engineering/TASKS.md` (no hunk inside the M1 section); repository search for `vertical slice`, `M7`, `Mustapha to write`, `writes the learning log`, `commit automatically`.
- Learning checkpoint: explain why each backend milestone ends with a frontend integration checkpoint instead of connecting the frontend once in M7, and what M7 is still for.
- Completion evidence (2026-11-17, against base `93a1f3d`):
  - `git status --short`: eight modified Markdown files (`CLAUDE.md`, the playbook, and six files in `docs/engineering/`) and one new file, `docs/decisions/0008-staged-frontend-integration.md`. No path outside Markdown documentation changed, so no source, dependency, or configuration file changed.
  - Index, headline list, and `MASTER_PLAN.md` contain KNAR-302 (depends on KNAR-201, KNAR-301), KNAR-402 (KNAR-401, KNAR-302), KNAR-502 (KNAR-501, KNAR-402), and KNAR-602 (KNAR-601, KNAR-502). KNAR-701 is "Frontend architecture consolidation" and depends on all four; KNAR-801 and KNAR-901 depend on KNAR-701.
  - `MASTER_PLAN.md` has the nine-step Integration Sequence and a checkpoint gate for M3–M6.
  - `AGENT_WORKFLOW.md` has Responsibilities, the Task Completion Sequence, and Automated Frontend Checks, citing only commands from `CLAUDE.md` and reporting frontend tests as unavailable.
  - `git diff -U0 docs/engineering/TASKS.md` has no hunk in KNAR-101 to KNAR-106.
  - Stale-statement search (`vertical slice`, `M7`, `Mustapha to write`, `writes the learning log`, `commit automatically`, `Draft the learning-log`): remaining old wording is only in accepted ADRs 0001, 0006, 0007 (superseded by ADR 0008, not edited) and the playbook body (under its new precedence note).
  - Frontend checks omitted: no frontend file and no contract the frontend consumes changed.
  - Decisions by Mustapha: KNAR-302 uses a temporary request-scoped media upload until KNAR-502; the M7 timing change is recorded in a new ADR rather than by editing accepted ADRs.
  - Deviation from the request: Mustapha removed the "show the final changed files and diff summary" step during review, so the completion sequence has 12 steps and goes from the documentation updates straight to the commit message.

---

## M1: Composition Kernel

All M1 tasks run on branch `feat/composition-kernel`, one commit per task. Code lives in `backend/src/domain/composition/` and must not import Express, `fs`, `child_process`, or database code.

M1 verification command (created by KNAR-101): `cd backend && npm run typecheck && npm test`

### KNAR-101 — Backend TypeScript toolchain

- Status: done
- Milestone: M1
- Depends on: KNAR-001, KNAR-002
- Owner/session: lead
- Intended files: `backend/package.json`, `backend/package-lock.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/src/domain/composition/smoke.test.ts`, `CLAUDE.md` (Commands section)
- Goal: the backend can type-check and test TypeScript alongside the existing JavaScript.
- Non-goals: converting `server.js`; any runtime behavior change; schemas.
- Approved dependencies: `typescript`, `tsx`, `vitest`, `zod`.
- Acceptance criteria:
  - `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `allowJs`, ESM (`NodeNext`), `noEmit`.
  - `npm run typecheck` and `npm test` exist and pass with one smoke test.
  - `npm run dev` still serves `POST /api/demo-render` unchanged.
- Required tests: smoke test that imports `zod` and runs under Vitest.
- Verification commands: `cd backend && npm run typecheck && npm test`
- Learning checkpoint: explain what `strict` and `noUncheckedIndexedAccess` catch, and why the kernel needs a runtime schema in addition to TypeScript types.
- Completion evidence (2026-11-17, branch `feat/composition-kernel`, against base `8696131`):
  - Installed `zod` 4.6.7 (dependency) and `typescript` 7.0.2, `tsx` 4.23.15, `vitest` 5.1.0 (dev dependencies). No other dependency added.
  - `backend/tsconfig.json` sets `strict`, `noUncheckedIndexedAccess`, `allowJs`, `module`/`moduleResolution` `NodeNext`, and `noEmit`. `checkJs` is off, so existing JavaScript is included but not type-checked.
  - `npm run typecheck` (`tsc --noEmit`): exit 0. `tsc --listFilesOnly` covers `src/server.js`, `ffmpeg-practice/render.js`, `smoke.test.ts`, and `vitest.config.ts`.
  - Negative check: a temporary file assigning `xs[0]` of a `number[]` to `number` failed with `TS2322` (`number | undefined`), proving `noUncheckedIndexedAccess` is active; the file was removed.
  - `npm test` (`vitest run`): 1 file, 2 tests passed (`src/domain/composition/smoke.test.ts` imports `zod`).
  - `npm run dev` unchanged: against the running nodemon instance (confirmed to be this repository's `src/server.js`, restarted after the `package.json` change), `GET /` returned 200 and `POST /api/demo-render` returned 200 `video/mp4`; ffprobe showed H.264 1080x1920 + AAC, duration 8.000000. `server.js` and `ffmpeg-practice/` are unmodified.
  - Frontend checks omitted: no frontend file and no contract the frontend consumes changed.
  - Manual: Mustapha ran the checklist (`npm run typecheck`, `npm test`, Export in the browser) and confirmed it works.
  - Notes carried forward: npm resolved TypeScript 7 while the frontend uses TypeScript 6; `@types/node` is not installed and needs approval in the first task whose TypeScript uses Node APIs; `tsx` is installed but unused until `server.js` is converted; `npm audit` reported findings that were not changed here.

### KNAR-102 — Structural Composition schemas v1

- Status: done
- Milestone: M1
- Depends on: KNAR-101
- Owner/session: lead
- Intended files: `backend/src/domain/composition/{schema.ts,types.ts,presets.ts,index.ts}`, `backend/src/domain/composition/__fixtures__/*.json`, `backend/src/domain/composition/schema.test.ts`
- Goal: strict Zod schemas for `AssetRef`, `ImageClip`, `VideoClip`, `AudioClip`, `VisualTrack`, `AudioTrack`, `Composition` (`schemaVersion: 1`), and `RenderPreset`, with types derived via `z.infer` and the `vertical-1080p30` preset.
- Non-goals: cross-field or cross-entity rules (KNAR-103), operations (KNAR-104), migrations (KNAR-106).
- Acceptance criteria:
  - All times are non-negative integers in milliseconds.
  - Unknown keys are rejected (strict objects).
  - `spike.composition.json` encodes KNAR-000 (3 s image, 5 s video range, 8 s music with 2 s fade-out) and parses.
  - Each invalid fixture fails with an issue at the expected path.
- Required tests: valid fixtures; invalid cases for wrong `kind`, negative and fractional times, missing fields, extra keys, wrong `schemaVersion` type.
- Verification commands: `cd backend && npm run typecheck && npm test -- schema`
- Learning checkpoint: explain the difference between a structurally valid and a semantically valid Composition.
- Completion evidence (2026-11-17, branch `feat/composition-kernel`, against base `b2b0faa`):
  - `npm run typecheck`: exit 0. `npm test -- schema`: 42 tests passed. `npm test`: 2 files, 44 tests passed.
  - Times: every time field uses one schema, a non-negative integer of milliseconds; tests reject negative, fractional, numeric-string, `NaN`, `Infinity`, and `null` values.
  - Strictness: every object is a strict object; tests reject unknown keys on the Composition, a track, a visual clip, an audio clip, an `AssetRef`, and a `RenderPreset`.
  - `__fixtures__/spike.composition.json` encodes KNAR-000 (3000 ms image, video range 0–5000 ms, music 0–8000 ms with a 2000 ms fade-out) and parses unchanged. `spike.assets.json` holds the three spike assets with dimensions and durations read from the spike media by ffprobe.
  - Invalid fixtures, each failing at its expected path: `wrong-kind` (`tracks.0.clips.0.kind`), `negative-time` (`tracks.0.clips.0.durationMs`), `fractional-time` (`tracks.0.clips.1.sourceStartMs`), `missing-field` (`tracks.0.clips.1.sourceEndMs`), `extra-key` (`tracks.0.clips.0`, key `filePath`), `schema-version-string` (`schemaVersion`).
  - Types in `types.ts` are all `z.infer` of the schemas; `vertical-1080p30` parses with `renderPresetSchema` and is registered in `RENDER_PRESETS`.
  - Kernel boundary: no kernel file imports Express, `fs`, `child_process`, or any Node module; only `zod` and sibling modules.
  - Frontend checks omitted: the kernel is not yet imported by the server or the frontend.
  - Manual: Mustapha ran the checklist and confirmed it works.
  - Decisions made here: kernel ID format `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` (reused by KNAR-104); `AssetRef` `durationMs`, `width`, and `height` are nullable, with per-kind requirements left to KNAR-103; `speed` and `volume` are structurally any finite number, with ranges left to KNAR-103; the spike video clip is encoded with `volume: 0` because the spike drops its audio; preset CRF is 20, provisional until M2.

### KNAR-103 — Semantic Composition validation

- Status: done
- Milestone: M1
- Depends on: KNAR-102
- Owner/session: lead
- Intended files: `backend/src/domain/composition/{validate.ts,issues.ts}`, `backend/src/domain/composition/validate.test.ts`
- Goal: `validateComposition(composition, assets)` returns every semantic issue with a stable `code`, a `path`, and an actionable `message`.
- Non-goals: mutation, migrations, FFmpeg concerns.
- Acceptance criteria: covers every rule in `ARCHITECTURE.md` › Composition v1 Model (unique IDs, asset existence, kind match, source range bounds, speed 0.25–4, video duration ±1 ms, image 100 ms–60 s, volume 0–1, no audio overlap, non-empty visual track, fades within clip).
- Required tests: one passing and one failing case per rule; a composition with several problems reports all of them.
- Verification commands: `cd backend && npm test -- validate`
- Learning checkpoint: explain why validation needs the asset catalog and cannot be done by the schema alone.
- Completion evidence (2026-11-17, branch `feat/composition-kernel`, against base `a59abde`):
  - `npm run typecheck`: exit 0. `npm test -- validate`: 58 tests passed. `npm test`: 3 files, 102 tests passed.
  - `validateComposition(composition, assets)` returns `Issue[]`, each with a stable `code`, a `path`, and a `message` that states the fix. It is pure; a test confirms the inputs are unchanged.
  - Rule coverage, each with at least one passing and one failing test: unique IDs (`DUPLICATE_ID`, `ASSET_CATALOG_DUPLICATE_ID`), asset existence (`ASSET_NOT_FOUND`), kind match (`ASSET_KIND_MISMATCH`), source range (`SOURCE_RANGE_INVALID`, `SOURCE_RANGE_OUT_OF_BOUNDS`), speed 0.25–4 (`SPEED_OUT_OF_RANGE`), video duration within 1 ms (`DURATION_MISMATCH`), image duration 100 ms–60 s (`IMAGE_DURATION_OUT_OF_RANGE`), volume 0–1 (`VOLUME_OUT_OF_RANGE`), audio overlap (`AUDIO_CLIPS_OVERLAP`), non-empty visual track (`VISUAL_TRACK_EMPTY`), fades within the clip (`FADE_TOO_LONG`).
  - A composition with eleven problems reports all eleven, in document order.
  - Additions beyond the listed rules: `ASSET_METADATA_MISSING` when a referenced video or audio asset has no duration or a referenced image or video asset has no dimensions (needed to check ranges at all); fade-in plus fade-out together may not exceed the clip. `DURATION_MISMATCH` is checked only when the range and speed are themselves valid, to avoid a misleading second issue.
  - Not checked here: whether `presetId` names a known preset (the signature takes no preset list; the render compiler receives the preset in M2).
  - Frontend checks omitted: the kernel is not yet imported by the server or the frontend.
  - Manual review pending: completed and committed by the agent overnight under Mustapha's delegation of 2026-11-17, which replaced the manual-test and commit steps for that run.

### KNAR-104 — EditOperation v1 schema

- Status: done
- Milestone: M1
- Depends on: KNAR-102
- Owner/session: lead
- Intended files: `backend/src/domain/composition/operations.ts`, `backend/src/domain/composition/operations.test.ts`
- Goal: a discriminated union on `op` for `appendClip`, `insertClip`, `removeClip`, `moveClip`, `trimClip`, `setClipSpeed`, `setImageDuration`, `setClipVolume`, `setBackgroundAudio`.
- Non-goals: applying operations; `splitClip`; effects.
- Acceptance criteria:
  - Unknown `op` values and extra keys are rejected.
  - ID fields accept only the kernel ID format, so path-like or shell-like strings (`../x`, `a;rm`, `$(x)`) are rejected.
- Required tests: one valid case per op; unknown op; extra keys; malicious ID strings.
- Verification commands: `cd backend && npm test -- operations`
- Learning checkpoint: explain how this schema enforces invariant 4 before any LLM exists.
- Completion evidence (2026-11-17, branch `feat/composition-kernel`, against base `bf514d5`):
  - `npm run typecheck`: exit 0. `npm test -- operations`: 55 tests passed. `npm test`: 4 files, 157 tests passed.
  - `editOperationSchema` is a discriminated union on `op` with exactly the nine v1 operations; a test asserts the list and that `splitClip` is absent.
  - Every operation has a valid case. Unknown `op` values (`splitClip`, `addTransition`, `runCommand`, empty, wrong case) fail at path `op`.
  - Every operation rejects an extra key (`unrecognized_keys`), and nested clips reject `path`, `src`, and `url`.
  - ID fields reuse the kernel ID schema; `../x`, `a;rm`, `$(x)`, `a/b`, a Windows path, a space, backticks, a pipe, and the empty string are rejected for `clipId`, new clip `id`, and `assetId`.
  - Decisions made here: new video clips carry no `durationMs` (the reducer derives it); `removeClip` targets a clip on either track; `setBackgroundAudio` carries one audio clip or `null` to clear the track; a batch (`editOperationsSchema`) holds 1 to 200 operations.
  - Frontend checks omitted: the kernel is not yet imported by the server or the frontend.
  - Manual review pending: completed and committed by the agent overnight under Mustapha's delegation of 2026-11-17.

### KNAR-105 — Pure atomic operation reducer

- Status: done
- Milestone: M1
- Depends on: KNAR-103, KNAR-104
- Owner/session: lead
- Intended files: `backend/src/domain/composition/reducer.ts`, `backend/src/domain/composition/reducer.test.ts`
- Goal: `applyOperations(composition, ops, assets)` returns `Result<Composition, Issue[]>`.
- Non-goals: persistence, undo history, frontend integration.
- Acceptance criteria:
  - The input composition is never mutated.
  - All-or-nothing: if any op or the resulting composition is invalid, no result composition is returned.
  - The result is re-validated with `validateComposition`.
  - `setClipSpeed` sets speed and recomputes duration from the source range, so repeating it is idempotent.
- Required tests: each op's effect; frozen-input test; failure midway leaves nothing applied; repeated `setClipSpeed`.
- Verification commands: `cd backend && npm test -- reducer`
- Learning checkpoint: explain why the frontend's current `setSpeed` compounds and how this reducer prevents it.
- Completion evidence (2026-11-17, branch `feat/composition-kernel`, against base `3f494bf`):
  - `npm run typecheck`: exit 0. `npm test -- reducer`: 48 tests passed. `npm test`: 5 files, 205 tests passed.
  - `applyOperations(composition, operations, assets)` returns `Result<Composition, Issue[]>`. `operations` is typed `unknown` and parsed with `editOperationsSchema` inside the function, so callers cannot skip structural validation.
  - Never mutates input: every test runs against a deep-frozen composition and asset list (a mutation would throw), one test also freezes the operations, and the result shares no clip objects with the input.
  - All or nothing: a batch that fails at its second operation returns only `CLIP_NOT_FOUND` at `operations.1.clipId` and no composition; a batch whose final state is invalid returns only the validation issues.
  - Re-validated: the final draft is passed to `validateComposition`; a test asserts every successful result validates cleanly, and nine cases show semantic issues from the result (duplicate ID, unknown asset, kind mismatch, range, speed, volume, image duration, fade, empty visual track) rejecting the batch.
  - `setClipSpeed` sets the speed and recomputes `durationMs` from the source range: repeated in one batch, applied to its own output, and set back to 1 all give the expected clip; trim-then-speed equals speed-then-trim.
  - Each operation's effect has a test, including the three insert positions and removal from either track.
  - New issue codes: `CLIP_NOT_FOUND`, `INDEX_OUT_OF_RANGE`, `CLIP_KIND_NOT_SUPPORTED`, and `INVALID_STRUCTURE` for malformed operations, all with paths starting at `operations`.
  - Decisions made here: application stops at the first operation that cannot be applied; only the final state is validated, so a batch may pass through an invalid intermediate state.
  - Frontend checks omitted: the kernel is not yet imported by the server or the frontend.
  - Manual review pending: completed and committed by the agent overnight under Mustapha's delegation of 2026-11-17.

### KNAR-106 — Schema version and migration boundary

- Status: done
- Milestone: M1
- Depends on: KNAR-102
- Owner/session: lead
- Intended files: `backend/src/domain/composition/{parse.ts,migrations.ts}`, `backend/src/domain/composition/parse.test.ts`
- Goal: `parseComposition(unknown)` reads `schemaVersion`, runs registered migrations up to the current version, then performs the strict parse.
- Non-goals: real v0 data; persistence.
- Acceptance criteria: missing, unknown, and future versions are rejected with actionable messages; the registry is proven with a synthetic test-only v0 → v1 migration.
- Required tests: current-version passthrough; missing version; future version; test-only migration.
- Verification commands: `cd backend && npm test -- parse`
- Learning checkpoint: explain why saved projects need a migration path before the first project is ever persisted.
- Completion evidence (2026-11-17, branch `feat/composition-kernel`, against base `cc0eab0`):
  - `npm run typecheck`: exit 0. `npm test -- parse`: 27 tests passed. `npm test`: 6 files, 232 tests passed.
  - `parseComposition(unknown)` reads `schemaVersion`, runs registered migrations one version at a time up to the current version, then performs the strict parse, and returns `Result<Composition, Issue[]>`.
  - Missing version: `SCHEMA_VERSION_MISSING`. Future version: `SCHEMA_VERSION_TOO_NEW`, with a message to update Knarra. Older version with no migration: `SCHEMA_VERSION_UNSUPPORTED`. Wrong type (`"1"`, `1.5`, `-1`, `null`, `true`, `NaN`, `{}`): `SCHEMA_VERSION_INVALID`. Tests assert the message text of each.
  - Current-version passthrough returns the spike composition unchanged and runs no migration.
  - Registry proven with a synthetic, test-only v0 to v1 migration (separate `visualTrack`/`audioTrack` fields and `preset` renamed): migrated data parses to the spike composition; migrated data still gets the strict parse; a migration that does not advance the version or that throws is reported as `MIGRATION_FAILED` instead of throwing; the migration receives a copy, so the frozen input is untouched.
  - The production registry `COMPOSITION_MIGRATIONS` is empty, asserted by a test, because version 1 is the only version ever stored.
  - Kernel boundary re-checked: kernel modules import only `zod` and sibling modules.
  - Frontend checks omitted: the kernel is not yet imported by the server or the frontend.
  - Manual review pending: completed and committed by the agent overnight under Mustapha's delegation of 2026-11-17.

---

## M2–M9: Headline Tasks

Expand each into full task entries (and split as needed) at the start of its milestone.

Frontend integration checkpoints (KNAR-302, KNAR-402, KNAR-502, KNAR-602) connect the existing React frontend to the backend contract its milestone has just stabilized. Each is tested in the browser before the next milestone starts. They do not redesign the approved UI (ADR 0008).

- **KNAR-201 (M2):** `compileRenderPlan` with golden tests: spike Composition, paths with spaces, image/video ordering, speed math, muted audio, limited-range color normalization, validation failures. ADR for a video clip's own audio.
- **KNAR-301 (M3):** ffprobe adapter, `spawn` executor, progress parser, `AbortSignal` cancellation, partial-output cleanup, real tiny-render integration test with pixel-format and range assertions.
- **KNAR-302 (M3, frontend checkpoint) — Project-driven synchronous Export integration.** Depends on KNAR-201 and KNAR-301. Replaces the hard-coded render spike with the first project-driven render:
  - A `toComposition` adapter maps the existing editor state to a valid Composition.
  - The existing Export control sends that Composition to the backend, which validates it structurally and semantically, compiles it, renders it synchronously, and returns the MP4 for download.
  - Media: imported files exist only in the browser until M5, so the Export request carries the files the Composition references. The server stores them under server-generated temporary names, never uses the uploaded filenames as paths or FFmpeg arguments, and deletes them after the render. This is temporary and is replaced by KNAR-502. Any upload dependency is approved when this task is expanded.
  - Out of scope: persistence, background jobs, progress streaming, cancellation, LLM planning, full migration of every editor mutation.
- **KNAR-401 (M4):** PostgreSQL migrations, repositories, save/reopen API, numeric-revision stale-write protection, immutable versions.
- **KNAR-402 (M4, frontend checkpoint) — Project save and reopen integration.** Depends on KNAR-401 and KNAR-302. The Dashboard and Editor first stop relying entirely on in-memory project data:
  - Dashboard project creation creates backend project records.
  - The current project and its Composition are saved.
  - A saved project reopens in the existing editor.
  - Revision and version behavior follows M4 (numeric-revision stale-write protection, explicit immutable versions).
  - Out of scope: uploaded media (KNAR-502), render jobs (KNAR-602).
- **KNAR-501 (M5):** storage adapter, safe uploads, probe persistence, thumbnails and proxies, path-escape and idempotency tests.
- **KNAR-502 (M5, frontend checkpoint) — Asset ingestion and proxy integration.** Depends on KNAR-501 and KNAR-402:
  - The existing media-import interface uploads to the backend.
  - The editor stores and uses backend asset identifiers.
  - The editor displays persisted metadata, thumbnails, and editing proxies.
  - Originals are preserved and used for final rendering; the temporary Export upload from KNAR-302 is removed.
  - Out of scope: redesigning the media-import UI.
- **KNAR-601 (M6):** in-process job queue, state machine, SSE progress, cancel/retry, authorized download, restricted CORS.
- **KNAR-602 (M6, frontend checkpoint) — Asynchronous Export experience.** Depends on KNAR-601 and KNAR-502:
  - Export creates a render job bound to an immutable project version instead of holding a synchronous request.
  - The UI displays real render progress.
  - The UI supports cancellation and retry, and downloads completed exports.
  - The UI represents the queued, rendering, completed, failed, and cancelled states.
- **KNAR-701 (M7) — Frontend architecture consolidation.** Depends on KNAR-302, KNAR-402, KNAR-502, and KNAR-602. Consolidates and hardens the staged integrations; it does not begin frontend development:
  - Route editor mutations through validated `EditOperation`s.
  - Remove duplicated or obsolete prototype domain logic.
  - Reconcile frontend types with the committed backend contracts (including the `Editor*` renames).
  - Complete end-to-end browser acceptance coverage.
  - Harden error, loading, stale-revision, and recovery states.
  - Preserve the approved UI unless integration requires a justified change.
- **KNAR-801 (M8):** `EditPlanner` interface, provider structured output, 20+ fixed evaluation prompts, adversarial output tests.
- **KNAR-901 (M9):** `media-intelligence/` package (`knarra_mi`): `pyproject.toml`, contract envelope models, `dispatch`, CLI `run --request --result`, exit codes, a trivial `probe` analysis kind, golden contract fixtures, Python tests.
- **KNAR-902 (M9):** `backend/src/domain/analysis` Zod schemas; `AnalysisRunner` + `ProcessAnalysisRunner` (`spawn`, working directory, `AbortSignal`, timeout, cleanup); Node tests against the shared golden fixtures, plus malformed/wrong-version/mismatched-ID rejection.
- **KNAR-903 (M9):** analysis-record migration and repository keyed by asset, kind, schema version, analyzer version, and input fingerprint; only validated results persist.
- **KNAR-904 (M9):** shot/scene detection analyzer and `StyleProfileV0`; source-media checksum test; StyleProfile shown in the UI as analysis only.
- **KNAR-1001 (M10):** beat/tempo, transcription, motion/color, visual embeddings, similarity/ranking. Split into one task per analyzer when M10 starts.
