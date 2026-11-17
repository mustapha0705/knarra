# Tasks

Work one task at a time. A task is done only when its completion evidence matches its acceptance criteria and the learning-log entry exists. M2–M9 tasks are headlines; expand them into full entries at the start of their milestone.

Statuses: `ready | in-progress | blocked | review | done | planned`.

## Index

| ID | Status | Milestone | Task | Depends on |
| --- | --- | --- | --- | --- |
| KNAR-000 | done | M0 | Minimal Export spike | none |
| KNAR-001 | ready | M0 | Make the spike reproducible from Git | KNAR-000 |
| KNAR-002 | review | M0 | Planning documents | KNAR-000 |
| KNAR-101 | ready | M1 | Backend TypeScript toolchain | KNAR-001, KNAR-002 |
| KNAR-102 | ready | M1 | Structural Composition schemas v1 | KNAR-101 |
| KNAR-103 | ready | M1 | Semantic Composition validation | KNAR-102 |
| KNAR-104 | ready | M1 | EditOperation v1 schema | KNAR-102 |
| KNAR-105 | ready | M1 | Pure atomic operation reducer | KNAR-103, KNAR-104 |
| KNAR-106 | ready | M1 | Schema version and migration boundary | KNAR-102 |
| KNAR-201 | planned | M2 | Deterministic render compiler | M1 |
| KNAR-301 | planned | M3 | FFmpeg executor and media probe | KNAR-201 |
| KNAR-401 | planned | M4 | Project persistence and versions | M1 |
| KNAR-501 | planned | M5 | Asset ingestion and proxies | KNAR-301, KNAR-401 |
| KNAR-601 | planned | M6 | Asynchronous render jobs | KNAR-301, KNAR-401 |
| KNAR-701 | planned | M7 | Frontend vertical slice | M4–M6 |
| KNAR-801 | planned | M8 | LLM planner | M7 |
| KNAR-901 | planned | M9 | Reference analysis | M8 |

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
  - Gaps carried forward: `render.js`/`verify.js` are gitignored and were never committed (fresh clone fails on import); frontend export wiring is uncommitted (both fixed by KNAR-001); output is tagged `yuvj420p`/`color_range=pc` (M2/M3); the clip's own audio is dropped (M2 decision).

### KNAR-001 — Make the spike reproducible from Git

- Status: ready
- Milestone: M0
- Depends on: KNAR-000
- Owner/session: lead
- Intended files: `backend/.gitignore`, `backend/ffmpeg-practice/{render.js,verify.js,command.md,commands.txt,Knarra_Four_Hour_Minimal_Render_Spike.md}`, `backend/package.json`, plus the existing uncommitted frontend export diff (`ProjectEditor.tsx`, `EditorToolbar.tsx`, `Editor.module.css`, `vite.config.ts`)
- Goal: a fresh clone contains every file the Export spike needs except media.
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
- Completion evidence: (to be filled)

### KNAR-002 — Planning documents

- Status: review
- Milestone: M0
- Depends on: KNAR-000
- Owner/session: lead
- Intended files: `CLAUDE.md`, `docs/engineering/*.md`, `docs/decisions/0001`–`0006`
- Goal: commit the approved engineering plan.
- Non-goals: any product source, dependency, or configuration change.
- Acceptance criteria:
  - Only documentation files are added.
  - Frontend type-check and lint still pass.
- Required tests: none (documentation only).
- Verification commands: `git status`; `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx eslint .`
- Learning checkpoint: explain the 12 invariants and why M1 must be built by one session.
- Completion evidence: (to be filled)

---

## M1: Composition Kernel

All M1 tasks run on branch `feat/composition-kernel`, one commit per task. Code lives in `backend/src/domain/composition/` and must not import Express, `fs`, `child_process`, or database code.

M1 verification command (created by KNAR-101): `cd backend && npm run typecheck && npm test`

### KNAR-101 — Backend TypeScript toolchain

- Status: ready
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
- Completion evidence: (to be filled)

### KNAR-102 — Structural Composition schemas v1

- Status: ready
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
- Completion evidence: (to be filled)

### KNAR-103 — Semantic Composition validation

- Status: ready
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
- Completion evidence: (to be filled)

### KNAR-104 — EditOperation v1 schema

- Status: ready
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
- Completion evidence: (to be filled)

### KNAR-105 — Pure atomic operation reducer

- Status: ready
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
- Completion evidence: (to be filled)

### KNAR-106 — Schema version and migration boundary

- Status: ready
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
- Completion evidence: (to be filled)

---

## M2–M9: Headline Tasks

Expand each into full task entries (and split as needed) at the start of its milestone.

- **KNAR-201 (M2):** `compileRenderPlan` with golden tests: spike Composition, paths with spaces, image/video ordering, speed math, muted audio, limited-range color normalization, validation failures. ADR for a video clip's own audio.
- **KNAR-301 (M3):** ffprobe adapter, `spawn` executor, progress parser, `AbortSignal` cancellation, partial-output cleanup, real tiny-render integration test with pixel-format and range assertions.
- **KNAR-401 (M4):** PostgreSQL migrations, repositories, save/reopen API, numeric-revision stale-write protection, immutable versions.
- **KNAR-501 (M5):** storage adapter, safe uploads, probe persistence, thumbnails and proxies, path-escape and idempotency tests.
- **KNAR-601 (M6):** in-process job queue, state machine, SSE progress, cancel/retry, authorized download, restricted CORS.
- **KNAR-701 (M7):** `toComposition` adapter, `Editor*` type renames, all editor mutations via `EditOperation`s, browser acceptance flow.
- **KNAR-801 (M8):** `EditPlanner` interface, provider structured output, 20+ fixed evaluation prompts, adversarial output tests.
- **KNAR-901 (M9):** `StyleProfileV0` analysis display.
