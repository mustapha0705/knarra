# Architecture

This describes the target architecture. `CURRENT_STATE.md` describes what exists today.

## Components and Ownership

| Component | Location (target) | Responsibility | Milestone |
| --- | --- | --- | --- |
| Editor UI | `frontend/src/features/editor` | Canvas, Timeline, review-before-apply, local planner | exists |
| Composition adapter | `frontend/src/features/editor` (new module) | `toComposition(editorProject)` and back | KNAR-302 (M3), extended by KNAR-402–602, consolidated in M7 |
| Composition kernel | `backend/src/domain/composition` | Zod schemas, types, semantic validation, edit-operation reducer, migrations | M1 |
| Render compiler | `backend/src/render/compiler` | `compileRenderPlan(composition, assets, preset): RenderPlan`; pure | M2 |
| FFmpeg executor, probe | `backend/src/media` | `spawn` adapter, progress parser, cancellation, ffprobe JSON adapter | M3 |
| Persistence | `backend/src/persistence` | PostgreSQL repositories, migrations, optimistic concurrency | M4 |
| Storage | `backend/src/storage` | Storage adapter (local filesystem first), server-generated paths | M5 |
| Jobs | `backend/src/jobs` | In-process queue (concurrency 1), state machine, SSE progress | M6 |
| API | `backend/src/api` | Thin Express routes: parse, call a service, map errors | M3–M7 |
| Planner | `backend/src/planner` | `EditPlanner` provider interface; emits `EditOperation`s only | M8 |
| Analysis runner | `backend/src/analysis` | `AnalysisRunner` interface; process implementation invokes the Python CLI | M9 |
| Analysis contracts | `backend/src/domain/analysis` | Versioned Zod schemas for analysis results; validation before persistence | M9 |
| Media intelligence (Python) | `media-intelligence/` (`knarra_mi`) | Analysis-only: shots, beats, transcription, motion/color, embeddings, StyleProfile, similarity | M9–M10 |

## Dependency Direction

```text
api ──► services ──► domain/composition
                 ├─► render/compiler ──► domain/composition
                 ├─► media (executor, probe)
                 ├─► persistence
                 ├─► storage
                 ├─► jobs
                 ├─► planner ──► domain/composition
                 └─► analysis ──► domain/analysis
                         │
                         └─(process boundary: request/result JSON files)─► media-intelligence (Python)
```

- `domain/composition` imports nothing outside itself and Zod. No Express, `fs`, `child_process`, or database code. It can later be extracted into a shared package for the frontend (ADR 0006).
- `render/compiler` imports only the domain. It performs no file writes and starts no processes.
- Route handlers contain no persistence or FFmpeg logic.
- The Python package depends on nothing in the backend and the backend imports nothing from it. They share only the versioned JSON contract.

## Data Flows

**Edit:** UI action or LLM plan → `EditOperation[]` → structural validation (Zod) → semantic validation → pure reducer → new `Composition` → re-validated → saved as current state.

**Render:** user requests export → immutable project version → `compileRenderPlan` → executor spawns FFmpeg with argument array → `-progress pipe:1` parsed into job progress → ffprobe verifies output → export stored → download authorized.

**Ingest:** upload → original stored immutably under a server-generated path → ffprobe metadata persisted → thumbnails and proxies generated as derived artifacts.

**Analyze (M9+):** service requests an analysis for an asset → `AnalysisRunner` writes `request.json` to a per-job working directory → spawns `python -m knarra_mi run --request … --result …` → reads `result.json` → Zod validation of contract and schema versions → persisted as a derived analysis record → read by the UI and planner. Analysis never changes the Composition; edits it inspires still go through `EditOperation`s.

## Architecture Invariants

1. The Canvas organizes media and communicates intent; it is not the render model.
2. The Timeline Composition is the source of truth for the finished video.
3. Manual edits and approved AI edits update the same typed Composition.
4. The LLM emits allowlisted edit operations, never FFmpeg commands, shell fragments, paths, or storage locations.
5. Structural schema validation and application-level semantic validation both run before operations can modify project state.
6. The render compiler is a deterministic, pure function from Composition, assets, and preset to an FFmpeg execution plan.
7. FFmpeg is launched with `child_process.spawn()` and an argument array, never an interpolated shell command.
8. Original media is immutable. Proxies and thumbnails are derived artifacts; final exports use originals.
9. Project versions are immutable Composition/Canvas snapshots referencing assets, not copies of uploaded media.
10. Every render job binds to an immutable project version.
11. The first production renderer supports a single sequential visual track and one background-audio track. Additional layers are deferred.
12. The current frontend is evolved incrementally, not regenerated from the design export.
13. The Python media-intelligence package is analysis-only. It never mutates projects, Timelines, Compositions, or source media, and its output is versioned and validated by Node before persistence (ADR 0007).

Changing an invariant requires a new ADR.

## Composition v1 Model

All times are integer milliseconds (ADR 0005), from 0 to 24 hours.

- `AssetRef` (the catalog the kernel validates against; not an upload record): `{ id, kind: 'image' | 'video' | 'audio', durationMs: int | null, width, height, hasAudio }`
- Clips:
  - `ImageClip { id, kind: 'image', assetId, durationMs }`
  - `VideoClip { id, kind: 'video', assetId, sourceStartMs, sourceEndMs, speed, volume, durationMs }`
  - `AudioClip { id, kind: 'audio', assetId, sourceStartMs, sourceEndMs, timelineStartMs, volume, fadeInMs, fadeOutMs }`
- Tracks:
  - `VisualTrack { id, kind: 'visual', clips: (ImageClip | VideoClip)[] }`: sequential; start times derive from array order.
  - `AudioTrack { id, kind: 'audio', clips: AudioClip[] }`
- `Composition { schemaVersion: 1, id, presetId, tracks: [VisualTrack, AudioTrack] }`: exactly one track of each kind in v1.
- `RenderPreset` `vertical-1080p30`: 1080x1920, 30 fps, H.264, `yuv420p`, `colorRange: 'tv'`, CRF 20, x264 preset `medium`, AAC 192k / 48 kHz / stereo.
- `EditOperation` v1, discriminated on `op`: `appendClip`, `insertClip { index }`, `removeClip { clipId }`, `moveClip { clipId, toIndex }`, `trimClip { clipId, sourceStartMs, sourceEndMs }`, `setClipSpeed`, `setImageDuration`, `setClipVolume`, `setBackgroundAudio`. `splitClip` is deferred.

Semantic rules (each issue has a stable `code`, a `path`, and a `message`):

- IDs are unique; every referenced asset exists.
- Clip kind matches asset kind.
- `0 ≤ sourceStartMs < sourceEndMs ≤ asset.durationMs`.
- Speed is between 0.25 and 4.
- Video `durationMs = round((sourceEndMs − sourceStartMs) / speed)`, within ±1 ms.
- Image duration is between 100 ms and 60 s.
- Video clip duration is at least 100 ms.
- Volume is between 0 and 1.
- Audio clips do not overlap.
- Total visual duration is greater than 0.
- Fades are no longer than their clip, separately and together.
- A referenced video or audio asset has a known duration; a referenced image or video asset has known dimensions.

Entry points:

- `parseComposition(unknown)`: read `schemaVersion`, run registered migrations, strict Zod parse.
- `validateComposition(composition, assets)`
- `applyOperations(composition, ops, assets)`: pure and atomic; validates ops, applies to a copy, re-validates, returns `Result<Composition, Issue[]>`.

### Render Plan (M2)

`compileRenderPlan(composition, assets, preset)` in `backend/src/render/compiler` returns `Result<RenderPlan, Issue[]>`. It validates the Composition first and compiles nothing if it is invalid.

- `RenderAsset` is an `AssetRef` plus a server-resolved absolute `path`. Paths that are empty, relative, or could be read by FFmpeg as an option or protocol are rejected.
- `RenderPlan { inputs, filterGraph, outputArgs, expectedDurationMs, diagnostics }`. `buildFfmpegArgs(plan, outputPath)` produces the argument array for `spawn`.
- One input per visual clip in track order, then one per audible background clip. Paths appear only as argument-array elements; the filtergraph refers to inputs by index.
- Each visual clip is scaled and padded to the preset size, converted to limited range (`out_range=tv`), BT.709 color, and `yuv420p`, set to the preset frame rate, and cut to its exact duration; the clips are then concatenated. The output is tagged `tv` and `bt709` explicitly.
- Audio: a video clip's own audio is mixed with the background track, scaled by the clip's volume (ADR 0009). Every audio source is resampled to the preset format and placed on the timeline. The output always has exactly one audio stream of the video's length; silence is generated when nothing is audible.

### Media Execution (M3)

`backend/src/media` is the only module that starts FFmpeg or ffprobe.

- `runProcess(command, args, options)`: `spawn` with an argument array and `shell: false`; supports `AbortSignal`, a timeout, line-by-line stdout, and a bounded stderr tail. It settles only after the process has closed.
- `executeRenderPlan(plan, outputPath, { signal, onProgress })`: runs a plan with `-progress pipe:1`. If the render fails or is cancelled it deletes the partial output, so a file at `outputPath` always means a completed render.
- `createProgressParser`: turns FFmpeg's progress blocks into `{ outTimeMs, ratio, frame, done }`; `ratio` never decreases and reaches 1 only at the end.
- `probeMedia(path)`: runs ffprobe and returns a validated `MediaProbe` (format, duration, video codec/size/pixel format/color range/color space/frame rate, audio codec/sample rate/channels). Cover art embedded in audio files is not treated as video.
- `ProcessError.stderr` can contain file paths. It is for server logs and must not be returned to a client.

### Frontend Mapping (staged: KNAR-302 to M7)

The existing frontend is connected in stages (ADR 0008). The `toComposition` adapter introduced by KNAR-302 implements the clip and track rows; server asset records arrive with KNAR-502; the `Editor*` renames and routing every mutation through `EditOperation`s complete in M7.

| Frontend today | Composition v1 |
| --- | --- |
| `Asset` (UI, `blob:` src) | `AssetRef` + server asset record; frontend type renamed `EditorAsset` |
| `TimelineClip` on `video` lane | `VideoClip` on the visual track |
| `TimelineClip` on `overlay` lane (images) | `ImageClip` on the visual track, sequenced |
| `TimelineClip` on `audio` lane | `AudioClip` on the audio track |
| `timelineStartMs` on visual clips | Derived from order |
| `asset.metadata.speed/volume` sliders | Clip fields via `EditOperation`s |
| `EditOperation` keyed by `referenceId` | `EditOperation` keyed by stable clip/asset IDs; handles are display aliases |
| `canvasNodes`, `folders` | Canvas state, stored separately from the Composition |

## Media Intelligence Subsystem (M9+)

Decision record: ADR 0007. Scheduled after the M7 frontend architecture consolidation.

**Responsibilities:** scene and shot detection, beat and tempo analysis, transcription, motion and color analysis, visual embeddings, reference-video `StyleProfile` generation, asset similarity and ranking.

**Not responsibilities:** project CRUD, Composition ownership, edit operations, render orchestration, render-job APIs. These stay in Node/TypeScript.

**Package layout (target):**

```text
media-intelligence/
├── pyproject.toml
├── src/knarra_mi/
│   ├── contracts/     versioned request/result models (one module per analysis kind)
│   ├── analyzers/     pure functions: typed inputs → typed results; no I/O beyond reading inputs
│   ├── dispatch.py    dispatch(request) -> result; transport-independent
│   └── cli.py         `run --request <file> --result <file>`; thin adapter over dispatch
└── tests/
    └── fixtures/contracts/   golden result JSON shared with the Node contract tests
```

A later `http/` adapter (FastAPI) and queue worker would wrap the same `dispatch` without changing `analyzers/`.

**Contract envelope:**

- Request: `{ contractVersion, requestId, analysisKind, inputs: [{ assetId, path, mediaKind }], params, scratchDir? }`. Paths are server-resolved originals or proxies, opened read-only. No project or Composition data is sent.
- Result: `{ contractVersion, requestId, analysisKind, schemaVersion, analyzer: { name, version }, status: 'ok' | 'error', result?, errors?, diagnostics }`.
- Exit codes: `0` ok, `2` invalid request, `3` analysis failure. The result file is written on failure whenever possible.

**Node side:**

- `AnalysisRunner` interface; `ProcessAnalysisRunner` uses `spawn()` with an argument array, a per-job working directory, `AbortSignal`, timeout, bounded stderr, and cleanup.
- `backend/src/domain/analysis` holds Zod schemas per analysis kind and version. Results failing validation, with unknown versions, or with a mismatched `requestId`/`analysisKind` are rejected and not persisted.
- Results are derived artifacts keyed by asset ID, analysis kind, schema version, analyzer version, and input fingerprint.

## Storage Layout (target, M5)

```text
storage/
├── originals/<assetId>/   immutable uploaded media
├── derived/<assetId>/     thumbnails, posters, proxies, large analysis artifacts (e.g. embeddings)
└── exports/<renderJobId>/ rendered MP4s
```

All paths are generated on the server from IDs. Uploaded filenames are kept only as display metadata.

## Security Boundaries

- Model output becomes `EditOperation`s only, and passes the same validation as manual edits.
- Uploaded filenames and metadata are untrusted; they never become filesystem paths or FFmpeg arguments.
- FFmpeg receives only compiler-generated arguments containing server-resolved paths.
- CORS is restricted and the server binds to a configured host in M6 (KNAR-601). The earlier integration checkpoints (KNAR-302, KNAR-402, KNAR-502) run in local development only.
- Until M5, media sent with a KNAR-302 Export request is held under server-generated temporary names and deleted after the render.
- Python analysis output is untrusted input to Node: validated before persistence, never executed, and never used as a filesystem path or FFmpeg argument.
