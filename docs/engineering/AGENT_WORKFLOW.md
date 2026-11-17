# Agent Workflow

## Roles

- **Lead session:** one Claude Code session owns repository understanding, architectural consistency, task selection, and integration.
- **Subagents:** bounded, read-only work that returns a concise report to the lead: codebase exploration, research, test review, security review, comparison against a task. Subagents do not edit or commit.
- **Implementation worktrees:** only for independent modules whose shared interfaces are already committed.
- **Mustapha:** approves architecture and plans, reviews the implementation, runs the manual browser and product tests, approves the task result, and runs every Git commit.

## Responsibilities

This policy applies to every implementation task.

The agent owns:

- Implementing the task.
- Adding and updating tests.
- Running the required automated verification.
- Running the applicable frontend checks (see Automated Frontend Checks).
- Updating the task status.
- Writing the completion evidence.
- Updating `CURRENT_STATE.md`.
- Writing the learning-log entry.
- Proposing the commit message.

The agent never asks Mustapha to hand-edit project-management or learning documentation.

Mustapha owns:

- Reviewing the implementation.
- Performing the requested manual browser or product tests.
- Reporting any problems found.
- Approving the final task result.
- Running the final Git commit.

## Task Completion Sequence

For every task:

1. Work on only the approved task.
2. Implement it without committing.
3. Run all task-specific automated checks.
4. Run the applicable cross-project checks.
5. Present the automated results.
6. Give Mustapha a precise manual test checklist.
7. Stop and wait for Mustapha to test.
8. If Mustapha reports a problem, fix it, rerun the checks, and give the relevant manual retest.
9. Only after Mustapha confirms that the task passes, update the task status, completion evidence, `CURRENT_STATE.md`, and the learning log.
10. Propose one commit message. Do not present a final diff or diff summary unless Mustapha asks for one.
11. Stop and wait for Mustapha to commit.
12. Do not begin the next task until Mustapha confirms that the commit was made and the working tree is clean.

The agent must never commit automatically.

The agent must not ask Mustapha to commit while any of these hold:

- Known tests are failing.
- The manual test is unfinished.
- Completion documentation is missing.
- Unrelated changes remain in the task diff.

A documentation-only task follows the same sequence; its manual step is Mustapha's review of the documentation diff.

## Automated Frontend Checks

- If frontend files change, run the frontend type-check, lint, relevant tests, and production build when available.
- If a backend contract changes in a way the frontend consumes, run at least the frontend type-check and production build when feasible, even if no frontend file changed.
- If the task is entirely isolated from the frontend, frontend checks may be omitted, but the agent must state why.
- Run the backend checks required by the task regardless of whether frontend checks are needed.
- Never claim that automated checks replace Mustapha's manual browser test.
- Never claim to have manually tested browser behavior unless the agent actually operated and observed it.

Use only the commands defined in the Commands section of `CLAUDE.md`. Do not invent scripts that do not exist. If a useful check is unavailable, report that clearly instead of silently skipping it. Frontend commands today, run in `frontend/`:

| Check | Command |
| --- | --- |
| Type-check | `npx tsc -p tsconfig.app.json --noEmit` and `npx tsc -p tsconfig.node.json --noEmit` |
| Lint | `npm run lint` |
| Production build | `npm run build` |
| Tests | Not available yet; report as unavailable until a task adds a frontend test runner |

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
- One feature branch per milestone: `feat/composition-kernel`, `feat/render-compiler`, `feat/project-persistence`, `feat/media-ingestion`, `feat/render-jobs`, `feat/llm-planner`. A frontend integration checkpoint (KNAR-302, KNAR-402, KNAR-502, KNAR-602) runs on its milestone's branch, after that milestone's backend task.
- One conceptual commit per task, made by Mustapha, using Conventional Commits with the task ID, for example `feat(domain): KNAR-102 add Composition v1 schemas`.
- Never let two agents edit the same branch concurrently.
- Merge through the lead session only after each branch passes its own checks, then re-run the combined suite.
- Dirty-tree rule: before giving an agent a working tree with uncommitted changes, state which changes are yours and must not be touched.

## Definition of Done

A task is done only when all of these hold:

1. Its verification commands and the applicable frontend checks pass, and the output is recorded as completion evidence.
2. Evidence matches every acceptance criterion.
3. A review pass found no unresolved material issues.
4. Mustapha confirmed that the manual test passes.
5. The agent updated the task status, completion evidence, `CURRENT_STATE.md`, and wrote the `LEARNING_LOG.md` entry.
6. Mustapha approved the result and made the commit.

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
- Never commit. Do not mark the task done before I confirm it passes.

After implementation:
- Run the task's verification commands and the applicable frontend checks; if you omit frontend checks, say why.
- Review the diff for correctness, security, cleanup, and architecture compliance.
- Report files changed, commands and results, and remaining risks.
- Give me a precise manual test checklist, then stop and wait.

After I confirm the task passes:
- Update the task status, completion evidence, CURRENT_STATE.md, and the learning log yourself.
- Propose one commit message, then stop. No final diff summary unless I ask.
- Do not start the next task until I confirm the commit and a clean working tree.
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
| Frontend integration checkpoints (KNAR-302, 402, 502, 602) | Frontend type-check, lint, and build; Mustapha's manual browser test of that slice |
| Frontend consolidation (M7) | End-to-end browser acceptance flow |
| LLM planner | Fixed evaluation cases and adversarial invalid output |

## Keeping Documents Current

- The agent makes all of these updates; Mustapha is never asked to edit them by hand.
- Update `CURRENT_STATE.md` when a task changes what is implemented, stubbed, or absent.
- Update the Commands section of `CLAUDE.md` when a task adds or changes a command.
- Changing an invariant or a recorded decision requires a new ADR, not an edit to an accepted one.
