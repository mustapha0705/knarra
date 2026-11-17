# Current State

Last verified: 2026-11-17 at commit `a59abde` plus the KNAR-103 changes (branch `feat/composition-kernel`).

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
- `backend/src/domain/composition/` holds the Composition kernel. So far it has structural schemas, derived types, one preset, fixtures (KNAR-102), and semantic validation (KNAR-103). Nothing imports it yet: not the server, not the frontend.
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
| Demo render endpoint | `POST /api/demo-render`; global `rendering` flag (409 if busy); `res.download` of fixed MP4 | `backend/src/server.js:20-49` |
| FFmpeg spike | `spawn('ffmpeg', args)` with argument array, no shell; trim/setpts, scale/pad 1080x1920, setsar, fps=30, format=yuv420p, concat, atrim/afade, AAC 192k, `+faststart` | `backend/ffmpeg-practice/render.js` (tracked; spike media is gitignored) |
| Spike verification | ffprobe checks duration ±0.1 s and 1080x1920 | `backend/ffmpeg-practice/verify.js` (tracked) |
| Composition v1 structural schemas | Strict Zod schemas for `AssetRef`, clips, tracks, `Composition` (`schemaVersion: 1`), `RenderPreset`; kernel ID format; `vertical-1080p30` preset; types via `z.infer`. No operations, reducer, or migrations yet (KNAR-104 to KNAR-106) | `backend/src/domain/composition/{schema,types,presets,index}.ts`, `schema.test.ts` |
| Composition semantic validation | `validateComposition(composition, assets)` returns every issue with a stable `code`, `path`, and `message`: unique IDs, asset existence and kind, source ranges, speed, video duration, image duration, volume, audio overlap, non-empty visual track, fades | `backend/src/domain/composition/{validate,issues}.ts`, `validate.test.ts` |

## Stubbed or Mocked

- **Edit operations:** 14 op kinds are declared, but `applyEditPlan` implements only 7: `insertClip`, `insertImage`, `addAudio`, `setSpeed`, `setVolume`, `setImageDuration`, and `removeClip` (removes every clip of the asset). The local planner only ever emits the first four. `moveClip`, `trimClip`, `splitClip`, `setBrightness`, `setContrast`, `setSaturation`, `addTransition` validate but do nothing (`planner.ts:262-328`).
- **`executeEditPlan`:** `console.info` returning `{status:'not-connected'}` (`planner.ts:334-337`).
- **Save indicator:** 550 ms timer; nothing is persisted (`ProjectEditor.tsx:161-169`).
- **Workspace:** seeded fake projects and statuses (`frontend/src/features/workspace/data.ts`); workspace settings never reach the editor.
- **Export:** downloads the fixed demo MP4; the project is not sent (`ProjectEditor.tsx:184-214`; dev-only `/api` proxy in `frontend/vite.config.ts`). This spike is not the Export architecture: KNAR-302 replaces it with a project-driven synchronous render, and KNAR-602 replaces that with render jobs.
- **Other:** "Analyze style", Markdown/Link/Sandbox sources, feedback, sign-out are toasts; waveforms are fake; `CanvasNode.scale/rotation/groupId`, `TimelineClip.effects`, `EditorProject.instructions` are unused.

## Absent

- Persistence: no database, migrations, project storage, uploads, or storage layout.
- Server-side ffprobe, progress reporting, cancellation, job state, partial-output cleanup on success paths.
- Tests: the backend has unit tests for the kernel only (102 tests). No integration tests or render fixtures. The frontend has no test runner.
- Runtime validation in product code: the kernel schemas exist, but no request, saved project, or edit passes through them yet.
- Backend TypeScript source (toolchain only so far), `@types/node`, backend linting, CI, pre-commit hooks, Prettier, `.editorconfig`.
- `.env.example`, configuration loading (port is hardcoded `3001`), structured logging.
- Python media intelligence: no code yet (planned for M9, ADR 0007). Python 3.14.2 is installed on the development machine.

## Baseline Checks (2026-11-16)

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.app.json --noEmit` (frontend) | Pass, 0 errors |
| `npx tsc -p tsconfig.node.json --noEmit` (frontend) | Pass, 0 errors |
| `npx eslint .` (frontend) | Pass, 0 problems |
| `npm run build` (frontend) | Not run during audit (writes `dist/`); a prior build exists |
| `npm run typecheck` (backend, 2026-11-17) | Pass, 0 errors |
| `npm test` (backend, 2026-11-17) | Pass, 102 tests |

## Known Defects

1. ~~**Fresh clone cannot start the backend.**~~ Resolved by KNAR-001: spike scripts and notes are tracked and only spike media is ignored. A fresh clone starts; without the (untracked) demo media, `POST /api/demo-render` returns a clean 500.
2. ~~**Frontend export wiring is uncommitted.**~~ Resolved: committed in `35d97be`.
3. **Output is tagged full range.** `knarra-demo.mp4` probes as `yuvj420p`, `color_range=pc`, despite `-pix_fmt yuv420p`. The source `vid.mp4` is full-range `yuvj420p`. `verify.js` checks neither pixel format nor range. (M2/M3)
4. **Spike drops the video clip's own audio** (`concat ... a=0`); no `aresample`/channel normalization; libx264 defaults (no `-crf`/`-preset`). (M2 decision)
5. **Open CORS and all-interface bind.** `cors()` with no options; `app.listen(PORT)` without host. Any page can trigger a CPU-heavy render. Acceptable only for local development. (M6, KNAR-601)
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
