# Master Plan

Milestones are dependency-ordered. Each ends with a gate that must be demonstrated before the next begins. Detailed tasks live in `TASKS.md`.

```text
M0 baseline ─► M1 composition kernel ─► M2 render compiler ─► M3 executor + probe
   ─► M4 persistence + versions ─► M5 ingestion + proxies ─► M6 render jobs
   ─► M7 frontend vertical slice ─► M8 LLM planner ─► M9 reference analysis
```

M1–M4 are built sequentially by one lead session. Parallel worktrees are allowed only after the shared contracts they depend on are committed (see `AGENT_WORKFLOW.md`).

## M0: Repository Baseline and Planning

Deliver: accurate `CURRENT_STATE.md`, architecture map, task graph, verified commands and baseline results, ADRs for decisions already made, and a reproducible spike checkpoint (KNAR-001).

Gate: no product code changes in the planning commit. Planning documents approved.

## M1: Composition Kernel

Deliver:

- Backend TypeScript toolchain (TypeScript, tsx, Vitest, Zod), coexisting with existing JavaScript.
- Versioned Zod schemas for `AssetRef`, clips, tracks, `Composition`, `RenderPreset`, and `EditOperation`.
- TypeScript types derived from the schemas.
- Semantic validation for IDs, media kinds, source ranges, speeds, durations, and track compatibility.
- Pure, atomic edit-operation reducer.
- Migration boundary for future schema versions.

Gate: unit tests prove valid compositions pass and invalid compositions fail with actionable errors.

## M2: Deterministic Render Compiler

Deliver `compileRenderPlan(composition, assets, preset): RenderPlan` containing resolved inputs, filtergraph, output arguments, expected duration, and safe diagnostic metadata. No file writes, no processes.

Additions from the audit:

- A colorspace/range-normalization golden test. The spike output was tagged `yuvj420p`/full range because the source was full range; the compiler must emit limited-range output explicitly.
- Decide and record (ADR) how a video clip's own audio is handled: dropped, kept, or mixed under the background track.
- Explicit encoder settings (CRF, preset) and audio normalization (sample rate, channels).

Gate: golden tests cover the spike as Composition JSON, paths with spaces, image/video ordering, speed math, muted audio, range normalization, and validation failures.

## M3: FFmpeg Executor and Media Probe

Deliver: ffprobe JSON adapter, `spawn()` process adapter, structured stderr and exit-code errors, `-progress pipe:1` parser, cancellation through `AbortSignal`, partial-output cleanup, integration fixtures generated from FFmpeg test sources.

Addition: probe assertions include pixel format, color range, and audio-stream presence.

Gate: an integration test compiles a known Composition, renders it, probes it, and verifies duration, dimensions, streams, codecs, frame rate, pixel format, and range.

## M4: Project Persistence and Versions

Deliver: PostgreSQL migrations for projects, assets, current project state, immutable project versions, and render jobs; repository/service boundaries; save/reopen APIs; numeric-revision optimistic concurrency; explicit version creation.

Gate: a project can be saved, reopened, modified, versioned, and protected from a stale update.

## M5: Asset Ingestion and Proxies

Deliver: storage adapter (local filesystem), safe upload ingestion, probing and metadata persistence, thumbnail/poster generation, editing proxies, derived-artifact state and failure handling.

Gate: originals remain unchanged; regenerated proxies do not create duplicate asset records; filenames cannot escape the storage root.

## M6: Asynchronous Render Jobs

Deliver: in-process queue (concurrency 1) behind a replaceable interface; state machine `queued → running → completed | failed | cancelled`; immutable version binding; SSE progress; cancellation and cleanup; output authorization and download endpoint; restricted CORS.

Gate: the UI can start, monitor, cancel, retry, and download a render without holding the original HTTP request open.

## M7: Frontend Vertical Slice

Connect the existing UI: create/save/reopen projects, ingest media, restore Canvas and Timeline, export the current immutable version, show job states, download the MP4. Includes the `toComposition` adapter and routing all editor mutations through `EditOperation`s.

Gate: the browser produces a 20–30 second vertical video from three images, two video ranges, and one music file without manually editing JSON.

## M8: LLM Planner

Deliver: `EditPlanner` provider interface; compact planner input; provider structured output; the same structural and semantic validation; clarification behavior; at least 20 fixed evaluation prompts; deterministic local planner retained for tests.

Gate: invalid or malicious model output cannot modify project state or reach FFmpeg.

## M9: Reference Analysis

After the vertical slice is reliable: `StyleProfileV0` (duration, aspect ratio, frame rate, scene cuts, average shot duration), displayed as analysis before being used to automate edits.

## Deferred

- Transitions and multiple simultaneous visual layers.
- `splitClip`; brightness, contrast, saturation effects.
- Redis/BullMQ (until the local job contract is proven).
- Collaboration, cloud scale, billing, full reference-video imitation.
- Frontend TypeScript `strict` mode.
- Extracting the kernel into a shared workspace package (ADR 0006).
- `.gitattributes` / line-ending policy.
- Continuous integration.
