# Knarra: Claude Code Serious Development Playbook

## Where Knarra Is Now

The FFmpeg render spike is complete. It proved the full media-processing core at the command line:

- A still image became a timed video segment.
- A source video was trimmed.
- Both visual inputs were normalized to `1080x1920`, 30 fps, square pixels, and `yuv420p`.
- The visual segments were concatenated.
- Music was trimmed, faded, encoded as AAC, and mapped explicitly.
- The result was an eight-second H.264/AAC MP4 with fast-start metadata.

The next job is not to make that command larger. It is to build the layers that can produce commands like it reliably from saved Knarra projects.

The existing frontend already provides the Project Dashboard, media import, Canvas, Timeline, history, asset references, segments, command input, and review-before-apply flow. Preserve that work. The serious build begins underneath it.

## The Operating Decision

Use this structure:

- **One lead Claude Code session** owns repository understanding, architectural consistency, task selection, and integration.
- **Subagents** perform bounded research, codebase exploration, test review, security review, and other work that can return a concise report.
- **Separate implementation sessions or worktrees** are used only when tasks touch independent modules and their shared interfaces have already been frozen.
- **You** approve architecture, inspect diffs, run the vertical slice, and explain each layer before it is merged.

Do not turn on an experimental agent team for the first backend milestones. The Composition schema, validation rules, renderer, persistence model, and API contracts are tightly coupled. Build those foundations sequentially. Parallelize research and verification first; parallelize implementation later.

## Repository Documentation Layout

Ask the lead agent to create and maintain this structure:

```text
knarra/
├── CLAUDE.md
├── .claude/
│   └── agents/
│       ├── architecture-reviewer.md
│       └── test-reviewer.md
├── docs/
│   ├── engineering/
│   │   ├── CURRENT_STATE.md
│   │   ├── ARCHITECTURE.md
│   │   ├── MASTER_PLAN.md
│   │   ├── TASKS.md
│   │   ├── AGENT_WORKFLOW.md
│   │   └── LEARNING_LOG.md
│   └── decisions/
│       ├── 0001-composition-source-of-truth.md
│       ├── 0002-direct-ffmpeg-process-execution.md
│       ├── 0003-project-version-render-binding.md
│       └── 0004-originals-and-proxies.md
├── frontend/
└── backend/
```

Each file has one job:

| File | Purpose |
| --- | --- |
| `CLAUDE.md` | Short standing rules that every Claude session must follow. |
| `CURRENT_STATE.md` | What genuinely exists now, including incomplete or stubbed behavior. |
| `ARCHITECTURE.md` | Components, ownership boundaries, data flow, and invariants. |
| `MASTER_PLAN.md` | Milestones, dependencies, acceptance gates, and deferred work. |
| `TASKS.md` | Small executable tasks with status, dependencies, files, tests, and completion evidence. |
| `AGENT_WORKFLOW.md` | How lead sessions, subagents, branches, reviews, and commits operate. |
| `LEARNING_LOG.md` | Your explanation of what was built and why. |
| `docs/decisions/*` | Short architecture decision records for consequential choices. |

Keep `CLAUDE.md` concise. The full roadmap belongs in `docs/engineering/MASTER_PLAN.md`; loading a long roadmap into every session wastes context and makes instructions harder to follow.

## Architecture Invariants

These are non-negotiable unless you deliberately change them through an architecture decision record:

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

## Recommended Root `CLAUDE.md`

The lead agent should verify commands and paths against the repository before committing this, but its content should resemble:

```markdown
# Knarra Development Instructions

## Product
Knarra is an AI-assisted, non-destructive video editor. The Canvas organizes source media; the Timeline Composition defines the rendered result.

## Read First
- `docs/engineering/CURRENT_STATE.md`
- `docs/engineering/ARCHITECTURE.md`
- `docs/engineering/TASKS.md`
- Relevant ADRs in `docs/decisions/`

## Architectural Rules
- Preserve the existing React/TypeScript dashboard and editor behavior.
- Keep Canvas state separate from the render Composition.
- Manual and AI-assisted edits must use the same typed operations and reducer.
- Validate untrusted data structurally and semantically.
- Never allow model output to contain shell commands, FFmpeg flags, paths, or filenames.
- Compile renders deterministically from validated project data.
- Run FFmpeg with `spawn()` and an argument array; never interpolate a shell command.
- Keep original media immutable and separate from proxies, thumbnails, and exports.
- Bind render jobs to immutable project versions.

## Working Rules
- Work on one task ID from `docs/engineering/TASKS.md` at a time.
- Before editing, restate the task, affected files, acceptance criteria, and tests.
- Do not change architecture, public contracts, dependencies, or database schema unless the task authorizes it.
- Do not perform unrelated cleanup or redesign.
- Add or update tests with every behavior change.
- Run the narrowest relevant tests first, then the required project checks.
- Report commands run, results, remaining risks, and files changed.
- Never mark a task complete without evidence matching its acceptance criteria.

## Safety
- Treat uploaded filenames and metadata as untrusted.
- Prevent path traversal and shell injection.
- Clean partial derived files after failed or cancelled jobs.
- Do not commit media fixtures, secrets, generated outputs, or local environment files unless explicitly required.

## Commands
The repository audit must replace this section with the exact verified install, dev, lint, type-check, unit-test, integration-test, migration, and render-fixture commands.
```

## Milestone Order

### M0 — Repository Baseline and Planning

Deliver:

- Accurate `CURRENT_STATE.md`
- Architecture map showing frontend state, backend boundaries, storage, and render flow
- Task graph with dependencies
- Verified commands and baseline test/build results
- ADRs for the decisions already made

Gate: no product code changes. You approve the documents before implementation begins.

### M1 — Composition Kernel

Deliver:

- Versioned Zod schemas for `Asset`, `TimelineClip`, `Track`, `Composition`, `RenderPreset`, and `EditOperation`
- TypeScript types derived from or aligned with runtime schemas
- Semantic validation for IDs, media kinds, source ranges, speeds, durations, and track compatibility
- Pure edit-operation reducer
- Migration boundary for future schema versions

Gate: unit tests prove valid compositions pass and invalid compositions fail with actionable errors.

This milestone is central and should be implemented by one session. Other agents may review it but should not edit it concurrently.

### M2 — Deterministic Render Compiler

Deliver:

```ts
compileRenderPlan(composition, assets, preset): RenderPlan
```

`RenderPlan` contains resolved inputs, filtergraph, output arguments, expected duration, and safe diagnostic metadata. Compilation performs no file writes and starts no processes.

Gate: golden tests cover the completed spike as Composition JSON, paths with spaces, image/video ordering, speed math, muted audio, and validation failures.

Carry forward one observation from the spike: the source video used full-range `yuvj420p`, which caused a deprecated pixel-format warning. Record a colorspace/range normalization test rather than suppressing the warning blindly.

### M3 — FFmpeg Executor and Media Probe

Deliver:

- `ffprobe` JSON adapter
- FFmpeg process adapter using `spawn()`
- Structured stderr and exit-code errors
- `-progress pipe:1` parser
- Cancellation through `AbortSignal`
- Partial-output cleanup
- Integration fixtures generated from FFmpeg test sources

Gate: an integration test compiles a known Composition, renders it, probes it, and verifies duration, dimensions, streams, codecs, and frame rate.

### M4 — Project Persistence and Versions

Deliver:

- PostgreSQL migrations for projects, assets, current project state, immutable project versions, and render jobs
- Repository/service boundaries so route handlers do not contain persistence logic
- Save/reopen APIs
- Numeric revision or equivalent optimistic concurrency protection
- Explicit version creation at meaningful checkpoints

Gate: a project can be saved, reopened, modified, versioned, and protected from a stale update.

### M5 — Asset Ingestion and Proxies

Deliver:

- Storage adapter with local filesystem implementation
- Safe upload ingestion
- Media probing and metadata persistence
- Thumbnail/poster generation
- Editing proxy generation
- Derived-artifact state and failure handling

Gate: uploaded originals remain unchanged; regenerated proxies do not create duplicate asset records; filenames cannot escape the storage root.

### M6 — Asynchronous Render Jobs

Deliver:

- Initially, an in-process queue with concurrency one behind a replaceable interface
- Job state machine: `queued -> running -> completed | failed | cancelled`
- Immutable project-version binding
- Progress events through SSE
- Cancellation and cleanup
- Output authorization and download endpoint

Gate: the UI can start, monitor, cancel, retry, and download a render without keeping the original HTTP request open.

Do not introduce Redis/BullMQ until the local job contract and lifecycle are proven.

### M7 — Frontend Vertical Slice

Connect the existing UI to real services:

- Create/save/reopen a project
- Ingest project media
- Restore Canvas and Timeline state
- Export the current immutable version
- Display queued, running, completed, failed, and cancelled states
- Download the resulting MP4

Gate: the browser produces a 20–30 second vertical monthly-dump video from three images, two video ranges, and one music file without manually editing JSON.

### M8 — LLM Planner

Deliver:

- `EditPlanner` provider interface
- Compact planner input containing instruction, selected context, asset catalog, Composition summary, and operation schema
- Provider structured output
- The same structural and semantic validation used everywhere else
- Clarification behavior for ambiguous or impossible requests
- Evaluation set of at least 20 fixed prompts
- Deterministic local planner retained for tests

Gate: invalid or malicious model output cannot modify project state or reach FFmpeg.

### M9 — Reference Analysis

Only after the vertical slice is reliable, add `StyleProfileV0` containing duration, aspect ratio, frame rate, scene cuts, and average shot duration. Display it as analysis before using it to automate edits.

## How to Divide Work Between Agents

### Use one agent for

- Composition schemas and core domain types
- Architectural decisions
- Database migrations
- Public API contracts
- Cross-cutting refactors
- Integration of frontend, API, persistence, and render jobs

These areas have a high conflict radius. A single owner should maintain one coherent mental model.

### Use subagents in parallel for

- Mapping existing frontend types and state flows
- Inspecting the FFmpeg spike and identifying edge cases
- Designing test fixtures and failure cases
- Reviewing schema invariants
- Reviewing process cancellation, path safety, and cleanup
- Comparing the implementation against an approved task
- Investigating one test failure without editing unrelated files

Subagents should usually return findings to the lead rather than commit code.

### Use separate implementation worktrees only when

- The shared contract has been committed.
- The tasks touch independent file sets.
- Each task has its own tests and acceptance criteria.
- A lead session will integrate and run the combined suite.

Good later parallel pair:

- Worktree A: thumbnail/proxy generation behind an already-defined media-service interface.
- Worktree B: frontend render-job status UI against an already-defined API contract.

Bad parallel pair:

- Agent A designs Composition types while Agent B writes the compiler and Agent C writes persistence for those still-changing types.

## Task Format

Every entry in `TASKS.md` should use this template:

```markdown
### KNAR-### — Short task name

- Status: ready | in-progress | blocked | review | done
- Milestone: M#
- Depends on: task IDs or none
- Owner/session: identifier
- Intended files: exact paths or modules
- Goal: one behavior change
- Non-goals: explicit exclusions
- Acceptance criteria:
  - observable result
  - failure behavior
- Required tests:
  - unit/integration/API/E2E cases
- Verification commands: exact commands
- Learning checkpoint: what Mustapha must be able to explain
- Completion evidence: filled in after implementation
```

Tasks should generally fit into one focused session and one conceptual commit. If a task needs several independent acceptance tests, changes multiple architectural layers, or cannot be summarized in one sentence, split it.

## Initial Claude Code Planning Session

First, checkpoint the completed spike in Git. Do not include large source media or generated MP4 outputs. Then start Claude Code from the repository root in plan mode:

```bash
claude --permission-mode plan
```

Paste this prompt:

```text
We are beginning the serious backend implementation of Knarra, an AI-assisted non-destructive video editor.

Important current state:
- The React/TypeScript frontend already has the Project Dashboard, media import, Canvas, Timeline, asset references and segments, undo/redo, a deterministic local planner, and review-before-apply edit operations.
- The FFmpeg render spike is complete. It produced an 8-second 1080x1920 H.264/AAC MP4 from one image, a trimmed video, and music using trim/setpts, scale/pad, concat, atrim/afade, explicit mapping, and faststart.
- The next target is a production vertical slice: save and reopen a project containing three images, two video ranges, and one audio file; apply validated edit operations; render a 20-30 second vertical MP4 asynchronously with progress and cancellation; and download it.

Architectural invariants:
1. Canvas state is separate from the Timeline Composition.
2. The Composition is the render source of truth.
3. Manual edits and approved AI edits use the same typed operations.
4. The LLM eventually emits allowlisted operations only; it never emits FFmpeg commands, flags, paths, or shell content.
5. Structural and semantic validation happen before project mutation.
6. Rendering compiles deterministically from validated Composition + assets + preset.
7. FFmpeg runs through child_process.spawn with an argument array.
8. Originals are immutable; proxies and thumbnails are derived; exports use originals.
9. Render jobs bind to immutable project versions.

Work in read-only planning mode. Do not edit source files.

Audit the repository thoroughly. You may use up to three subagents for isolated read-only investigations:
- current frontend domain/state and operation types;
- backend/spike structure and FFmpeg behavior;
- current tests, scripts, persistence, and missing infrastructure.

Return one integrated report containing:
1. The actual repository state, with file evidence. Distinguish implemented, stubbed, and absent behavior.
2. Conflicts or duplication between existing frontend types and the proposed backend domain model.
3. A recommended target architecture with module ownership and data flow.
4. A dependency-ordered milestone plan from Composition schema through LLM planning.
5. A task graph of small tasks, each with affected files, acceptance criteria, required tests, dependencies, and learning checkpoint.
6. Risks and open decisions that require my approval.
7. The exact contents or detailed outlines for CLAUDE.md, CURRENT_STATE.md, ARCHITECTURE.md, MASTER_PLAN.md, TASKS.md, AGENT_WORKFLOW.md, and the initial ADRs.
8. The exact first implementation task after the planning documents are approved.

Optimize for a fast vertical slice without sacrificing the architectural boundaries above. Do not propose advanced transitions, multiple simultaneous visual layers, collaboration, cloud scale, billing, or full reference-video imitation yet.
```

Review its report. Challenge any claim without file evidence. Ask it to resolve open decisions before code is written.

## Planning-Documents Commit

After you approve the plan, switch out of plan mode and use:

```text
Create only the approved repository instruction and engineering-planning files. Do not modify product source, dependencies, migrations, or configuration except the approved .claude files. Preserve the approved wording and architecture. Fill all commands from commands you verified in the repository. Run formatting or documentation checks if available, then show me the full diff. Do not commit until I approve the diff.
```

Commit the result separately:

```text
docs: establish Knarra backend architecture and execution plan
```

This commit becomes the stable starting point for later agent sessions.

## Prompt for Each Implementation Task

Start a fresh session or clear context at milestone boundaries. Give the agent exactly one ready task:

```text
Implement only KNAR-### from docs/engineering/TASKS.md.

Before editing:
1. Read CLAUDE.md, the task, relevant architecture sections, and relevant ADRs.
2. Inspect the existing implementation and tests.
3. Restate the goal, non-goals, affected files, invariants, and verification plan.
4. Stop and ask if the task conflicts with the repository or requires an unapproved contract/dependency/schema change.

During implementation:
- Keep the change limited to this task.
- Add the required tests.
- Do not perform unrelated refactors.
- Do not mark the task done or commit automatically.

After implementation:
- Run the task's verification commands.
- Review the diff for correctness, security, cleanup, and architecture compliance.
- Report files changed, commands and results, remaining risks, and what I should manually test.
- Draft the learning-log entry and a commit message, but wait for my approval.
```

## Review Pass

Before merging a meaningful task, have a separate reviewer context inspect the diff:

```text
Review the current diff against KNAR-###, CLAUDE.md, ARCHITECTURE.md, and the applicable ADRs. Do not edit files.

Prioritize:
1. Correctness and missing acceptance criteria
2. Domain/schema invariant violations
3. Shell injection, path traversal, unsafe file handling, and cleanup gaps
4. FFmpeg timing, stream mapping, colorspace, cancellation, and partial-output behavior
5. Persistence consistency and stale-write behavior
6. Missing or weak tests
7. Unrelated scope expansion

Report findings by severity with exact file references. If no material issues remain, state that explicitly and list residual risks.
```

The implementation agent fixes confirmed findings; the reviewer checks the resulting diff. You then run the manual acceptance test.

## Git and Worktree Discipline

- Keep `main` stable.
- Use one feature branch per milestone or coherent vertical slice.
- Make one conceptual commit per completed task.
- Do not let two agents edit the same branch concurrently.
- For parallel implementation, create separate worktrees and branches.
- Merge through the lead session only after each branch passes its own checks.
- Re-run the combined suite after integration.
- Never give an agent a dirty working tree without telling it which changes belong to you.

Example milestone branches:

```text
feat/composition-kernel
feat/render-compiler
feat/project-persistence
feat/media-ingestion
feat/render-jobs
feat/llm-planner
```

## Verification Gates

No task is done merely because code compiles. Use the appropriate evidence:

- **Schema/reducer:** focused unit tests and invalid cases
- **Compiler:** golden argument/filtergraph tests
- **FFmpeg execution:** real tiny render plus `ffprobe` assertions
- **Persistence:** API/database integration tests and stale-write test
- **Ingestion:** filesystem safety and idempotency tests
- **Render jobs:** state transition, progress, cancellation, cleanup, and retry tests
- **Frontend integration:** browser acceptance flow
- **LLM planner:** fixed evaluation cases and adversarial invalid output

At each milestone, demonstrate the smallest end-to-end behavior before adding breadth.

## Your Learning Contract

Agents can make the build faster without turning the project into code you do not understand. For every completed task, add a short entry to `LEARNING_LOG.md` answering:

1. What problem does this layer solve?
2. What inputs and outputs cross its boundary?
3. What invariant does it protect?
4. What failure case did the test expose?
5. How would I diagnose it without Claude?
6. What did I personally inspect, change, or test?

At the end of each milestone, explain the data flow on paper or in your own words before starting the next one.

## Immediate Next Actions

1. Confirm the generated MP4 plays correctly and keep the command/filtergraph notes.
2. Add the spike's generated MP4 and large demo media to `.gitignore`; retain only small legal fixtures if intentionally needed.
3. Commit a clean checkpoint for the completed spike.
4. Run the initial Claude Code planning session above.
5. Review and commit planning documents only.
6. Begin M1 with the first approved Composition-schema task.

The fastest safe route is therefore:

```text
completed spike
    -> repository audit
    -> committed architecture and task graph
    -> Composition kernel
    -> deterministic compiler
    -> FFmpeg executor
    -> persistence and media ingestion
    -> asynchronous jobs
    -> frontend vertical slice
    -> LLM planner
```

That sequence turns the successful command you already understand into a product engine without letting either the AI model or the implementation agents become the architecture.
