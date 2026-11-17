# Master Plan

Milestones are dependency-ordered. Each ends with a gate that must be demonstrated before the next begins. Detailed tasks live in `TASKS.md`.

```text
M0 baseline ─► M1 composition kernel ─► M2 render compiler
   ─► M3 executor + probe        ─► KNAR-302 project-driven synchronous Export
   ─► M4 persistence + versions  ─► KNAR-402 project save and reopen
   ─► M5 ingestion + proxies     ─► KNAR-502 asset ingestion and proxies in the editor
   ─► M6 render jobs             ─► KNAR-602 asynchronous Export experience
   ─► M7 frontend architecture consolidation ─┬─► M8 LLM planner
                                              └─► M9 media-intelligence foundation + StyleProfile ─► M10 further analyzers
```

M8 and M9 both depend only on M7 and touch independent modules, so they may proceed in parallel worktrees once their contracts are committed.

## Integration Sequence

The React/TypeScript frontend already exists: Project Dashboard, Editor, Canvas, Timeline, media import, history, command UI, and initial Export wiring. Development proceeds in backend-first vertical slices (ADR 0008): a backend milestone establishes and stabilizes a contract, then a frontend integration checkpoint connects the existing frontend to it, and that slice is tested in the browser before the next milestone begins. M1 and M2 are backend-only.

1. **M1:** Composition and `EditOperation` contracts.
2. **M2–M3:** deterministic rendering.
3. **KNAR-302:** the existing editor exports a real Composition.
4. **M4 and KNAR-402:** projects save and reopen.
5. **M5 and KNAR-502:** uploaded assets, metadata, thumbnails, and proxies.
6. **M6 and KNAR-602:** background rendering, progress, cancellation, and download.
7. **M7:** frontend architecture consolidation.
8. **M8:** LLM planner behind the validated `EditOperation` boundary.
9. **M9+:** Python media-intelligence services.

A milestone is not finished until its integration checkpoint passes. Checkpoints connect the approved UI; they do not redesign it.

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

Integration checkpoint (KNAR-302): a `toComposition` adapter maps the existing editor state to a Composition; the existing Export control sends it to the backend, which validates, compiles, and renders it synchronously and returns the MP4. This replaces the hard-coded render spike with the first project-driven render. Because uploads do not exist until M5, the request carries the referenced media, which the server holds under server-generated temporary names and deletes after the render. Persistence, background jobs, progress streaming, cancellation, LLM planning, and full migration of every editor mutation stay out.

Checkpoint gate: clicking Export in the browser downloads an MP4 rendered from the current editor project, and an invalid Composition is rejected with an actionable error instead of reaching FFmpeg.

## M4: Project Persistence and Versions

Deliver: PostgreSQL migrations for projects, assets, current project state, immutable project versions, and render jobs; repository/service boundaries; save/reopen APIs; numeric-revision optimistic concurrency; explicit version creation.

Gate: a project can be saved, reopened, modified, versioned, and protected from a stale update.

Integration checkpoint (KNAR-402): Dashboard project creation creates backend project records; the editor saves the current project and Composition and reopens a saved project, with the revision and version behavior defined above. This is where the Dashboard and Editor first stop relying entirely on in-memory project data.

Checkpoint gate: a project created in the Dashboard survives a browser reload and reopens in the existing editor; a stale save is refused visibly.

## M5: Asset Ingestion and Proxies

Deliver: storage adapter (local filesystem), safe upload ingestion, probing and metadata persistence, thumbnail/poster generation, editing proxies, derived-artifact state and failure handling.

Gate: originals remain unchanged; regenerated proxies do not create duplicate asset records; filenames cannot escape the storage root.

Integration checkpoint (KNAR-502): the existing media-import interface uploads to the backend; the editor stores backend asset identifiers and displays persisted metadata, thumbnails, and editing proxies; originals are preserved for final rendering. The temporary Export upload from KNAR-302 is removed. The media-import UI is not redesigned.

Checkpoint gate: media imported in the browser is still present, with thumbnails and metadata, after the project is reopened, and Export renders from the stored originals.

## M6: Asynchronous Render Jobs

Deliver: in-process queue (concurrency 1) behind a replaceable interface; state machine `queued → running → completed | failed | cancelled`; immutable version binding; SSE progress; cancellation and cleanup; output authorization and download endpoint; restricted CORS.

Gate: a render can be started, monitored, cancelled, retried, and downloaded through the API without holding the original HTTP request open.

Integration checkpoint (KNAR-602): the Export control creates a render job instead of a synchronous request, displays real progress, supports cancellation and retry, downloads completed exports, and represents the queued, rendering, completed, failed, and cancelled states.

Checkpoint gate: the UI can start, monitor, cancel, retry, and download a render of the current immutable project version.

## M7: Frontend Architecture Consolidation

M7 does not begin frontend development or its backend integration; KNAR-302, KNAR-402, KNAR-502, and KNAR-602 have already connected the existing UI. M7 consolidates and hardens those staged integrations:

- Route editor mutations through validated `EditOperation`s.
- Remove duplicated or obsolete prototype domain logic.
- Reconcile frontend types with the committed backend contracts (including the `Editor*` renames).
- Complete end-to-end browser acceptance coverage.
- Harden error, loading, stale-revision, and recovery states.
- Preserve the approved UI unless integration requires a justified change.

Gate: the browser produces a 20–30 second vertical video from three images, two video ranges, and one music file without manually editing JSON, with every editor mutation applied through `EditOperation`s and the acceptance flow covered by browser tests.

## M8: LLM Planner

Deliver: `EditPlanner` provider interface; compact planner input; provider structured output; the same structural and semantic validation; clarification behavior; at least 20 fixed evaluation prompts; deterministic local planner retained for tests.

Gate: invalid or malicious model output cannot modify project state or reach FFmpeg.

## M9: Media-Intelligence Foundation and Reference Analysis

Starts only after the M7 consolidation is reliable. Boundary defined by ADR 0007.

Deliver:

- `media-intelligence/` Python package (`knarra_mi`) with `contracts/`, `analyzers/`, `dispatch`, and the CLI `python -m knarra_mi run --request <file> --result <file>`.
- Versioned contract envelope; shared golden fixtures validated by both Python and Node tests.
- `backend/src/domain/analysis` Zod schemas and `backend/src/analysis` `AnalysisRunner` with a process implementation (`spawn`, working directory, `AbortSignal`, timeout, cleanup).
- Persistence of validated results as derived analysis records.
- First analyzers: shot/scene detection, then `StyleProfileV0` (duration, aspect ratio, frame rate, scene cuts, average shot duration) for a reference video.
- UI displays StyleProfile as analysis only; no automatic edits.

Gate: Node runs a real analysis on a fixture video through the CLI, validates and persists the result; malformed, wrong-version, and failed results are rejected without persistence; a checksum test proves source media is unchanged; analyzers run in Python tests without Node.

## M10: Further Media Intelligence

Each analyzer is its own task with its own contract version: beat and tempo analysis, transcription, motion and color analysis, visual embeddings, asset similarity and ranking. Planner integration (analysis summaries as planner context) uses the same validated records.

Gate per analyzer: golden fixture contract test on both sides; real-media fixture test in Python; Node rejection tests.

## Deferred

- Transitions and multiple simultaneous visual layers.
- `splitClip`; brightness, contrast, saturation effects.
- Redis/BullMQ (until the local job contract is proven).
- Collaboration, cloud scale, billing, full reference-video imitation.
- Frontend TypeScript `strict` mode.
- Extracting the kernel into a shared workspace package (ADR 0006).
- `.gitattributes` / line-ending policy.
- Continuous integration.
- Running media intelligence behind FastAPI or a job queue (requires a new ADR; analysis modules stay unchanged per ADR 0007).
