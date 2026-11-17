# 0008: The Existing Frontend Is Integrated in Stages, Backend First

- Status: Accepted
- Date: 2026-11-17

## Context

The React/TypeScript frontend already exists: Project Dashboard, Editor, Canvas, Timeline, media import, history, command UI, and initial Export wiring. The original plan connected it to the backend once, in an M7 "frontend vertical slice", after persistence, ingestion, and render jobs were all built. That defers every contract mismatch between the editor and the backend to one late milestone, and leaves the hard-coded Export spike in place for five milestones.

## Decision

1. **Backend-first vertical slices.** A backend milestone establishes and stabilizes a contract. A frontend integration checkpoint at the end of that milestone connects the existing frontend to it. The slice is tested in the browser before the next milestone begins.
2. **M1 and M2 stay backend-only.** They establish the Composition, `EditOperation`, and render-plan contracts.
3. **Checkpoints:**
   - KNAR-302 (end of M3): the editor exports a real Composition through a `toComposition` adapter; the backend validates, compiles, and renders it synchronously.
   - KNAR-402 (end of M4): projects save and reopen.
   - KNAR-502 (end of M5): uploaded assets, metadata, thumbnails, and proxies.
   - KNAR-602 (end of M6): render jobs with progress, cancellation, retry, and download.
4. **Temporary media transfer in KNAR-302.** Until M5, the Export request carries the media the Composition references. The server stores it under server-generated temporary names, never uses uploaded filenames as paths or FFmpeg arguments, and deletes it after the render. KNAR-502 removes this.
5. **M7 is frontend architecture consolidation**, not the start of frontend integration: route editor mutations through validated `EditOperation`s, remove prototype domain logic, reconcile frontend types with backend contracts, complete browser acceptance coverage, and harden error, loading, stale-revision, and recovery states.
6. **The approved UI is preserved.** A checkpoint changes the UI only when integration requires it and the change is justified in the task.

This supersedes the timing wording in earlier ADRs, without changing their decisions:

- ADR 0001 "the M7 adapter": the adapter is introduced by KNAR-302.
- ADR 0006 "the frontend keeps its own editor types until M7" and "the M7 adapter is the boundary": the adapter boundary exists from KNAR-302; the type reconciliation completes in M7.
- ADR 0007 "after the first production render vertical slice (M7)": media intelligence still starts in M9, after the M7 consolidation.

## Consequences

- Contract mismatches surface one milestone at a time, while the contract is still fresh.
- The hard-coded Export spike is replaced at the end of M3 instead of M7.
- Between KNAR-302 and M7 the frontend holds both prototype domain logic and the adapter. M7 exists to remove that duplication.
- KNAR-302 handles untrusted uploads before the M5 storage layer exists, so its temporary handling must already satisfy the path-safety and cleanup rules.
- All architecture invariants are unchanged: the Composition is the render source of truth, edits are validated `EditOperation`s, rendering is deterministic, originals are preserved, proxies are for editing, and model output cannot execute media or shell operations.
