# 0003: Render Jobs Bind to Immutable Project Versions

- Status: Accepted
- Date: 2026-11-16

## Context

Renders take time. If a job read the live project, edits made during rendering would produce an export matching no state the user saw, and retries would not be reproducible.

## Decision

- A project version is an immutable snapshot of the Composition and Canvas state that references assets by ID. It never copies media.
- Every render job stores the version ID it renders. Starting an export creates or selects a version first.
- Current project state uses a numeric revision for optimistic concurrency; versions are created at explicit checkpoints.

## Consequences

- Any export can be reproduced from its version and the original assets.
- Assets referenced by any version cannot be deleted while that version exists.
- The persistence schema (M4) needs separate tables for current state and versions.
