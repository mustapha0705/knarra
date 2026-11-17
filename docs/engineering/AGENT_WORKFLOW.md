# Agent Workflow

## Roles

- **Lead session:** one Claude Code session owns repository understanding, architectural consistency, task selection, and integration.
- **Subagents:** bounded, read-only work that returns a concise report to the lead: codebase exploration, research, test review, security review, comparison against a task. Subagents do not edit or commit.
- **Implementation worktrees:** only for independent modules whose shared interfaces are already committed.
- **Mustapha:** approves architecture and plans, inspects diffs, runs the manual acceptance test, writes the learning log, and approves every commit.

## When to Parallelize

Use one agent for: Composition schemas and domain types, architectural decisions, database migrations, public API contracts, cross-cutting refactors, integration.

Use subagents in parallel for: mapping existing code, inspecting FFmpeg edge cases, designing fixtures and failure cases, reviewing schema invariants, reviewing cancellation/path safety/cleanup, comparing an implementation against a task, investigating one test failure.

Use separate worktrees only when all of these hold:

- The shared contract has been committed.
- The tasks touch independent file sets.
- Each task has its own tests and acceptance criteria.
- The lead session will integrate and run the combined suite.

M1 through M4 are built sequentially. Do not use an experimental agent team for them.

## Branches and Commits

- `main` stays stable.
- One feature branch per milestone: `feat/composition-kernel`, `feat/render-compiler`, `feat/project-persistence`, `feat/media-ingestion`, `feat/render-jobs`, `feat/llm-planner`.
- One conceptual commit per task, using Conventional Commits with the task ID, for example `feat(domain): KNAR-102 add Composition v1 schemas`.
- Never let two agents edit the same branch concurrently.
- Merge through the lead session only after each branch passes its own checks, then re-run the combined suite.
- Dirty-tree rule: before giving an agent a working tree with uncommitted changes, state which changes are yours and must not be touched.

## Definition of Done

A task is done only when all of these hold:

1. Its verification commands pass, and the output is recorded as completion evidence.
2. Evidence matches every acceptance criterion.
3. A review pass found no unresolved material issues.
4. A `LEARNING_LOG.md` entry exists.
5. Mustapha approved the diff and the commit.

## Prompt for Each Implementation Task

Start a fresh session or clear context at milestone boundaries.

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

Run in a separate reviewer context before merging a meaningful task:

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

The implementation agent fixes confirmed findings; the reviewer checks the resulting diff; Mustapha runs the manual acceptance test.

## Verification Evidence by Layer

| Layer | Evidence |
| --- | --- |
| Schema/reducer | Focused unit tests including invalid cases |
| Compiler | Golden argument and filtergraph tests |
| FFmpeg execution | Real tiny render plus ffprobe assertions |
| Persistence | API/database integration tests and stale-write test |
| Ingestion | Filesystem safety and idempotency tests |
| Render jobs | State transition, progress, cancellation, cleanup, retry tests |
| Frontend integration | Browser acceptance flow |
| LLM planner | Fixed evaluation cases and adversarial invalid output |

## Keeping Documents Current

- Update `CURRENT_STATE.md` when a task changes what is implemented, stubbed, or absent.
- Update the Commands section of `CLAUDE.md` when a task adds or changes a command.
- Changing an invariant or a recorded decision requires a new ADR, not an edit to an accepted one.
