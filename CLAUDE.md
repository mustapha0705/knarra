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
- The Composition kernel (`backend/src/domain/composition`) must not import Express, `fs`, `child_process`, or database code.
- All Composition times are integer milliseconds (ADR 0005).
- Python media intelligence (`media-intelligence/`, from M9) is analysis-only: invoked as a CLI process with request/result JSON files, output validated by Node before persistence, never owns project state (ADR 0007).

## Working Rules
- Work on one task ID from `docs/engineering/TASKS.md` at a time.
- Before editing, restate the task, affected files, acceptance criteria, and tests.
- Do not change architecture, public contracts, dependencies, or database schema unless the task authorizes it.
- Do not perform unrelated cleanup or redesign.
- Add or update tests with every behavior change.
- Run the narrowest relevant tests first, then the required project checks.
- Report commands run, results, remaining risks, and files changed.
- Never mark a task complete without evidence matching its acceptance criteria.
- Follow the Task Completion Sequence in `docs/engineering/AGENT_WORKFLOW.md`: present automated results and a manual test checklist, then stop; only after Mustapha confirms the task passes, update task status, completion evidence, `CURRENT_STATE.md`, and the learning log yourself; propose one commit message and stop.
- Never commit. Mustapha runs every Git commit. Do not start the next task until Mustapha confirms the commit and a clean working tree.
- Never ask Mustapha to hand-edit task evidence, `CURRENT_STATE.md`, or the learning log.
- Frontend checks: if frontend files change, or a backend contract the frontend consumes changes, run the frontend type-check, lint, and build below. If a task is isolated from the frontend, say why the checks were omitted. Automated checks never replace the manual browser test, and never claim a browser test you did not perform.
- The existing frontend is integrated in stages (KNAR-302, KNAR-402, KNAR-502, KNAR-602; ADR 0008). M7 consolidates it; it is not the first frontend integration.

## Safety
- Treat uploaded filenames and metadata as untrusted.
- Prevent path traversal and shell injection.
- Clean partial derived files after failed or cancelled jobs.
- Do not commit media fixtures, secrets, generated outputs, or local environment files unless explicitly required.
- Never modify the media in `backend/ffmpeg-practice/`; never commit media or MP4 outputs.

## Commands
Verified on 2026-11-16 (Windows 11, Node 24.12.0, npm 11.12.1). Shell is PowerShell or Git Bash; `core.autocrlf=true`.

Frontend (`frontend/`):
- Install: `npm install`
- Dev server: `npm run dev` (proxies `/api` to `http://localhost:3001`)
- Lint: `npm run lint`
- Type-check: `npx tsc -p tsconfig.app.json --noEmit` and `npx tsc -p tsconfig.node.json --noEmit`
- Build: `npm run build`

Backend (`backend/`):
- Install: `npm install`
- Dev server: `npm run dev` (port 3001; requires `ffmpeg` and `ffprobe` on PATH)
- Type-check: `npm run typecheck` (`tsc --noEmit`; TypeScript files are strict, existing JavaScript is allowed but not checked)
- Unit tests: `npm test` (Vitest, `src/**/*.test.ts`); one area: `npm test -- <name>`, for example `npm test -- schema`
- M1 verification: `npm run typecheck && npm test`

Backend commands verified on 2026-11-17 (KNAR-101: TypeScript 7.0.2, Vitest 5.1.0, Zod 4.6.7, tsx 4.23.15).

Not yet available: frontend tests, integration tests, backend lint, migrations, render fixtures. Later tasks add them and must update this section.
