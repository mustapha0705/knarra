# Architecture

This describes the target architecture. `CURRENT_STATE.md` describes what exists today.

## Components and Ownership

| Component | Location (target) | Responsibility | Milestone |
| --- | --- | --- | --- |
| Editor UI | `frontend/src/features/editor` | Canvas, Timeline, review-before-apply, local planner | exists |
| Composition adapter | `frontend/src/features/editor` (new module) | `toComposition(editorProject)` and back | M7 |
| Composition kernel | `backend/src/domain/composition` | Zod schemas, types, semantic validation, edit-operation reducer, migrations | M1 |
| Render compiler | `backend/src/render/compiler` | `compileRenderPlan(composition, assets, preset): RenderPlan`; pure | M2 |
| FFmpeg executor, probe | `backend/src/media` | `spawn` adapter, progress parser, cancellation, ffprobe JSON adapter | M3 |
| Persistence | `backend/src/persistence` | PostgreSQL repositories, migrations, optimistic concurrency | M4 |
| Storage | `backend/src/storage` | Storage adapter (local filesystem first), server-generated paths | M5 |
| Jobs | `backend/src/jobs` | In-process queue (concurrency 1), state machine, SSE progress | M6 |
| API | `backend/src/api` | Thin Express routes: parse, call a service, map errors | M4–M7 |
| Planner | `backend/src/planner` | `EditPlanner` provider interface; emits `EditOperation`s only | M8 |

## Dependency Direction

```text
api ──► services ──► domain/composition
                 ├─► render/compiler ──► domain/composition
                 ├─► media (executor, probe)
                 ├─► persistence
                 ├─► storage
                 ├─► jobs
                 └─► planner ──► domain/composition
```

- `domain/composition` imports nothing outside itself and Zod. No Express, `fs`, `child_process`, or database code. It can later be extracted into a shared package for the frontend (ADR 0006).
- `render/compiler` imports only the domain. It performs no file writes and starts no processes.
- Route handlers contain no persistence or FFmpeg logic.

## Data Flows

**Edit:** UI action or LLM plan → `EditOperation[]` → structural validation (Zod) → semantic validation → pure reducer → new `Composition` → re-validated → saved as current state.

**Render:** user requests export → immutable project version → `compileRenderPlan` → executor spawns FFmpeg with argument array → `-progress pipe:1` parsed into job progress → ffprobe verifies output → export stored → download authorized.

**Ingest:** upload → original stored immutably under a server-generated path → ffprobe metadata persisted → thumbnails and proxies generated as derived artifacts.

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

Changing an invariant requires a new ADR.

## Composition v1 Model

All times are integer milliseconds (ADR 0005).

- `AssetRef` (the catalog the kernel validates against; not an upload record): `{ id, kind: 'image' | 'video' | 'audio', durationMs: int | null, width, height, hasAudio }`
- Clips:
  - `ImageClip { id, kind: 'image', assetId, durationMs }`
  - `VideoClip { id, kind: 'video', assetId, sourceStartMs, sourceEndMs, speed, volume, durationMs }`
  - `AudioClip { id, kind: 'audio', assetId, sourceStartMs, sourceEndMs, timelineStartMs, volume, fadeInMs, fadeOutMs }`
- Tracks:
  - `VisualTrack { id, kind: 'visual', clips: (ImageClip | VideoClip)[] }`: sequential; start times derive from array order.
  - `AudioTrack { id, kind: 'audio', clips: AudioClip[] }`
- `Composition { schemaVersion: 1, id, presetId, tracks: [VisualTrack, AudioTrack] }`: exactly one track of each kind in v1.
- `RenderPreset` `vertical-1080p30`: 1080x1920, 30 fps, H.264, `yuv420p`, `colorRange: 'tv'`, CRF, AAC 192k / 48 kHz / stereo.
- `EditOperation` v1, discriminated on `op`: `appendClip`, `insertClip { index }`, `removeClip { clipId }`, `moveClip { clipId, toIndex }`, `trimClip { clipId, sourceStartMs, sourceEndMs }`, `setClipSpeed`, `setImageDuration`, `setClipVolume`, `setBackgroundAudio`. `splitClip` is deferred.

Semantic rules (each issue has a stable `code`, a `path`, and a `message`):

- IDs are unique; every referenced asset exists.
- Clip kind matches asset kind.
- `0 ≤ sourceStartMs < sourceEndMs ≤ asset.durationMs`.
- Speed is between 0.25 and 4.
- Video `durationMs = round((sourceEndMs − sourceStartMs) / speed)`, within ±1 ms.
- Image duration is between 100 ms and 60 s.
- Volume is between 0 and 1.
- Audio clips do not overlap.
- Total visual duration is greater than 0.
- Fades are no longer than their clip.

Entry points:

- `parseComposition(unknown)`: read `schemaVersion`, run registered migrations, strict Zod parse.
- `validateComposition(composition, assets)`
- `applyOperations(composition, ops, assets)`: pure and atomic; validates ops, applies to a copy, re-validates, returns `Result<Composition, Issue[]>`.

### Frontend Mapping (M7)

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

## Storage Layout (target, M5)

```text
storage/
├── originals/<assetId>/   immutable uploaded media
├── derived/<assetId>/     thumbnails, posters, proxies
└── exports/<renderJobId>/ rendered MP4s
```

All paths are generated on the server from IDs. Uploaded filenames are kept only as display metadata.

## Security Boundaries

- Model output becomes `EditOperation`s only, and passes the same validation as manual edits.
- Uploaded filenames and metadata are untrusted; they never become filesystem paths or FFmpeg arguments.
- FFmpeg receives only compiler-generated arguments containing server-resolved paths.
- CORS is restricted and the server binds to a configured host before the UI is connected to real services (M6/M7).
