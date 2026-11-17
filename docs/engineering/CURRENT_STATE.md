# Current State

Last verified: 2026-11-17 at commit `9498d18` plus the KNAR-501 changes (backends for M1 to M5 implemented; KNAR-302, KNAR-401, and KNAR-501 are in review; branch `feat/media-ingestion`).

This document records what genuinely exists. Update it whenever a task changes what is implemented, stubbed, or absent.

## Environment

| Item | Value |
| --- | --- |
| OS | Windows 11 Pro |
| Node / npm | 24.12.0 / 11.12.1 |
| FFmpeg / ffprobe | gyan.dev full build 2026-10-12, on PATH (`/c/ffmpeg/bin`) |
| Git | `core.autocrlf=true` (system config); no `.gitattributes`; index is LF |

## Repository Layout

- `frontend/`: React 19, TypeScript 6, Vite 8. Standalone npm project.
- `backend/`: Express 5, JavaScript ESM (`"type": "module"`) with a TypeScript toolchain alongside it (TypeScript 7, Vitest 5, Zod 4, tsx; KNAR-101). Runtime code is still JavaScript. Standalone npm project.
- `backend/src/domain/composition/` holds the Composition kernel. So far it has structural schemas, derived types, one preset, fixtures (KNAR-102), semantic validation (KNAR-103), the EditOperation schema (KNAR-104), the reducer (KNAR-105), and versioned parsing (KNAR-106). M1 is complete. Nothing imports it yet: not the server, not the frontend.
- No root `package.json`, no workspaces, no shared types package, no root `.gitignore`.
- `backend/src/{config,controllers,middleware,routes}` exist on disk but are empty and untracked.

## Implemented

| Area | Behavior | Evidence |
| --- | --- | --- |
| Editor state | Whole editor document in one `useReducer` (`{project, past, future, revision}`) | `frontend/src/features/editor/useProjectHistory.ts:78` |
| Undo/redo | JSON-snapshot history, 40 entries; `patch` skips history | `useProjectHistory.ts:21-76` |
| Media import | File, folder (`webkitdirectory`), drag-and-drop; `blob:` URLs; nothing uploaded | `ProjectEditor.tsx:139-345`, `media.ts:163-210` |
| Media probing | Browser `Image`/`<video>`/`<audio>` reads duration and dimensions; video poster as JPEG data URL | `frontend/src/features/editor/media.ts:79-156` |
| Canvas | Pan, zoom, marquee, multi-drag, z-order | `Canvas.tsx`, `CanvasNode.tsx`, `canvasGeometry.ts` |
| Timeline | Three fixed lanes (`video`, `overlay` labelled Images, `audio`), horizontal drag | `Timeline.tsx`, `media.ts:12-16` |
| Segments | In/Out markers on video preview create `Segment`s (`V1-S1`) | `ProjectEditor.tsx:632-640` |
| Local planner | Deterministic regex parser: `@` mentions, mm:ss ranges, speed, music intent | `frontend/src/features/editor/planner.ts:84-161` |
| Review-before-apply | Plan validated, shown in `PlanCard`, applied only without errors | `PlanCard.tsx`, `ProjectEditor.tsx:717-778` |
| Demo render endpoint (no longer called by the frontend) | `POST /api/demo-render`; global `rendering` flag (409 if busy); `res.download` of fixed MP4 | `backend/src/server.js:20-49` |
| FFmpeg spike | `spawn('ffmpeg', args)` with argument array, no shell; trim/setpts, scale/pad 1080x1920, setsar, fps=30, format=yuv420p, concat, atrim/afade, AAC 192k, `+faststart` | `backend/ffmpeg-practice/render.js` (tracked; spike media is gitignored) |
| Spike verification | ffprobe checks duration ±0.1 s and 1080x1920 | `backend/ffmpeg-practice/verify.js` (tracked) |
| Composition v1 structural schemas | Strict Zod schemas for `AssetRef`, clips, tracks, `Composition` (`schemaVersion: 1`), `RenderPreset`; kernel ID format; `vertical-1080p30` preset; types via `z.infer`. | `backend/src/domain/composition/{schema,types,presets,index}.ts`, `schema.test.ts` |
| Composition semantic validation | `validateComposition(composition, assets)` returns every issue with a stable `code`, `path`, and `message`: unique IDs, asset existence and kind, source ranges, speed, video duration, image duration, volume, audio overlap, non-empty visual track, fades | `backend/src/domain/composition/{validate,issues}.ts`, `validate.test.ts` |
| EditOperation v1 schema | Strict discriminated union on `op`: `appendClip`, `insertClip`, `removeClip`, `moveClip`, `trimClip`, `setClipSpeed`, `setImageDuration`, `setClipVolume`, `setBackgroundAudio`; batches of 1 to 200 | `backend/src/domain/composition/operations.ts`, `operations.test.ts` |
| Edit-operation reducer | `applyOperations(composition, operations, assets)`: parses the operations, applies them to a copy, re-validates, and returns a new Composition or issues. Pure and all-or-nothing. Not called by the server or the frontend yet | `backend/src/domain/composition/reducer.ts`, `reducer.test.ts` |
| Versioned Composition parsing | `parseComposition(unknown)`: checks `schemaVersion`, runs registered migrations to the current version, then the strict parse. The production migration registry is empty (version 1 is the only version) | `backend/src/domain/composition/{parse,migrations}.ts`, `parse.test.ts` |
| Render compiler | `compileRenderPlan(composition, assets, preset)`: pure function from a valid Composition to FFmpeg inputs, filtergraph, and output arguments; limited-range `yuv420p`; clip audio mixed with background audio (ADR 0009). Not called by the server yet | `backend/src/render/compiler/{compile,types,index}.ts`, `compile.test.ts` |
| FFmpeg executor and probe | `executeRenderPlan` runs a plan with progress, cancellation, and partial-output cleanup; `probeMedia` reads validated media properties with ffprobe; `runProcess` is the only place a process is spawned. Used by the export API | `backend/src/media/*.ts`, `render.integration.test.ts` |
| Project-driven Export (in review) | The Export button maps the timeline with `toComposition`, uploads the used media for the length of one export, and downloads the MP4 the backend renders from the validated Composition. Synchronous; one render at a time. Automated tests pass; not yet tested in a browser | `backend/src/api/exports.ts`, `frontend/src/features/editor/{composition,exportProject}.ts`, `ProjectEditor.tsx` |
| Project persistence backend (in review) | PostgreSQL schema and migrations; create, save, reopen, delete; numeric-revision stale-write protection; immutable versions; `/api/projects`. Tested on an embedded PostgreSQL only; not yet connected to a real server, and not yet used by the frontend (KNAR-402) | `backend/src/persistence/*`, `backend/src/projects/service.ts`, `backend/src/api/projects.ts` |
| Asset ingestion backend (in review) | Uploads stored as read-only originals under ID-built paths; metadata from ffprobe; thumbnails and proxies with tracked state; `/api/projects/:id/assets`. Not yet used by the frontend (KNAR-502) or by Export (KNAR-602) | `backend/src/storage/localStorage.ts`, `backend/src/assets/service.ts`, `backend/src/media/derive.ts`, `backend/src/api/assets.ts` |

## Stubbed or Mocked

- **Edit operations:** 14 op kinds are declared, but `applyEditPlan` implements only 7: `insertClip`, `insertImage`, `addAudio`, `setSpeed`, `setVolume`, `setImageDuration`, and `removeClip` (removes every clip of the asset). The local planner only ever emits the first four. `moveClip`, `trimClip`, `splitClip`, `setBrightness`, `setContrast`, `setSaturation`, `addTransition` validate but do nothing (`planner.ts:262-328`).
- **`executeEditPlan`:** `console.info` returning `{status:'not-connected'}` (`planner.ts:334-337`).
- **Save indicator:** 550 ms timer; nothing is persisted (`ProjectEditor.tsx:161-169`).
- **Workspace:** seeded fake projects and statuses (`frontend/src/features/workspace/data.ts`); workspace settings never reach the editor.
- **Export is synchronous and temporary in two ways:** the browser re-uploads the used media on every export (until KNAR-502), and the request stays open for the whole render with no progress or cancel control (until KNAR-602). The `/api` proxy in `frontend/vite.config.ts` is dev-only.
- **Other:** "Analyze style", Markdown/Link/Sandbox sources, feedback, sign-out are toasts; waveforms are fake; `CanvasNode.scale/rotation/groupId`, `TimelineClip.effects`, `EditorProject.instructions` are unused.

## Absent

- A configured database on this machine: `DATABASE_URL` is not set, so `/api/projects` answers 503 until it is.
- Render jobs, progress reporting to the client, and a cancel control (M6).
- Tests: no browser tests, and no test run against a real PostgreSQL server. The backend has 441 unit tests (database tests use an embedded PostgreSQL) and 70 integration tests (real FFmpeg, real HTTP, generated fixtures). The frontend has 20 unit tests for the Composition adapter.
- Runtime validation in product code: the kernel schemas exist, but no request, saved project, or edit passes through them yet.
- Backend TypeScript source (toolchain only so far), `@types/node`, backend linting, CI, pre-commit hooks, Prettier, `.editorconfig`.
- Configuration beyond `DATABASE_URL` (the port is hardcoded `3001`), structured logging.
- Python media intelligence: no code yet (planned for M9, ADR 0007). Python 3.14.2 is installed on the development machine.

## Baseline Checks (2026-11-16)

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.app.json --noEmit` (frontend) | Pass, 0 errors |
| `npx tsc -p tsconfig.node.json --noEmit` (frontend) | Pass, 0 errors |
| `npx eslint .` (frontend) | Pass, 0 problems |
| `npm run build` (frontend) | Not run during audit (writes `dist/`); a prior build exists |
| `npm run typecheck` (backend, 2026-11-17) | Pass, 0 errors |
| `npm test` (backend, 2026-11-17) | Pass, 442 tests |
| `npm run test:integration` (backend, 2026-11-17) | Pass, 73 tests |
| `npm test` (frontend, 2026-11-17) | Pass, 20 tests |
| `npm run build` (frontend, 2026-11-17) | Pass |

## Known Defects

1. ~~**Fresh clone cannot start the backend.**~~ Resolved by KNAR-001: spike scripts and notes are tracked and only spike media is ignored. A fresh clone starts; without the (untracked) demo media, `POST /api/demo-render` returns a clean 500.
2. ~~**Frontend export wiring is uncommitted.**~~ Resolved: committed in `35d97be`.
3. **Output is tagged full range.** `knarra-demo.mp4` probes as `yuvj420p`, `color_range=pc`, despite `-pix_fmt yuv420p`. The source `vid.mp4` is full-range `yuvj420p`. `verify.js` checks neither pixel format nor range. (M2/M3)
4. **Spike drops the video clip's own audio** (`concat ... a=0`); no `aresample`/channel normalization; libx264 defaults (no `-crf`/`-preset`). (M2 decision)
5. **Open CORS and all-interface bind.** `cors()` with no options; `app.listen(PORT)` without host. Any page can trigger a CPU-heavy render. Acceptable only for local development. (M6, KNAR-601)
7. **Open review findings for the export API and renderer** (medium/low, from the review of `11092ad`; not yet fixed):
   - Export sessions are swept only when a new export starts, are not capped in number or total size, and are orphaned on restart (nothing empties the temp root at startup). Until KNAR-602.
   - If a file is locked when an export directory is removed (Windows), the directory is never retried, and a 422 can become a 500.
   - No render timeout and no cap on total timeline length; one long render can hold the single render slot.
   - GIFs: a single-frame GIF fails with a 500 (`-loop` is not a gif-demuxer option); an animated GIF is classified as video while the frontend puts `.gif` on the Images lane. AVIF stills are classified as video with no duration.
   - Expiry and `DELETE` do not wait for an upload in progress.
   - `[n:v]` picks the first video stream even when it is cover art.
   - One malformed stream (for example `width: 0`) makes the whole probe fail.
   - Frontend: skipped clips are not reported to the user; audio-clip speed is ignored; uploads re-read each file into memory.
6. **Config gaps.** `dotenv` installed but unused; only a `dev` script. Frontend tsconfig does not enable `strict`.

## Frontend Types vs. Planned Backend Domain

- `Asset`, `TimelineClip`, and `EditOperation` exist in `frontend/src/features/editor/types.ts` with shapes incompatible with the planned Composition v1. The frontend `Asset` contains UI state (`blob:` `src`, data-URL `poster`, `status`, `folderId`, slider `metadata`).
- No `Track` entity: `TrackId = 'video' | 'overlay' | 'audio'` is a constant. Images are placed on `overlay`, which conflicts with the single sequential visual track (invariant 11).
- `EditOperation` is a flat bag of optional fields, not a discriminated union. Ops target "all clips of asset X" by mutable `referenceId`; `after` is ignored; `setSpeed` compounds when repeated.
- Manual edits (timeline drag, add-to-timeline, sliders, rename, segment creation) bypass operations entirely.
- Effects live in two places: sliders write `asset.metadata`; clips carry their own `speed`/`volume`.
- `EditorProject` has no aspect ratio, resolution, fps, or schema version. Canvas nodes and timeline clips share one document and one undo stack. Applied-command records are not undone.
- All frontend times are integer milliseconds, matching ADR 0005.

Resolution: the backend kernel is authoritative. The existing frontend is connected in stages (ADR 0008): KNAR-302 adds a `toComposition(editorProject)` adapter for Export, KNAR-402 adds save and reopen, KNAR-502 adds uploaded assets and proxies, and KNAR-602 adds render jobs. M7 then renames the frontend types `Editor*`, routes every editor mutation through `EditOperation`s, and removes the prototype domain logic. M1 and M2 do not change the frontend.
