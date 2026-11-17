# 0007: Python Media-Intelligence Subsystem Behind a Process Boundary

- Status: Accepted
- Date: 2026-11-16

## Context

Knarra will need media analysis whose best libraries are in Python: scene and shot detection, beat and tempo analysis, transcription, motion and color analysis, visual embeddings, reference-video StyleProfile generation, and asset similarity and ranking. The product core (project CRUD, Composition, edit operations, rendering, render jobs) is Node/TypeScript and must stay there. A networked service would add deployment, authentication, and failure modes before the vertical slice exists.

## Decision

1. **Ownership stays in Node/TypeScript.** Project CRUD, Composition ownership, edit operations, render orchestration, and render-job APIs never move to Python.
2. **Analysis-only Python package.** A standalone package at `media-intelligence/` (import name `knarra_mi`). It reads media and returns analysis results. It never mutates projects, Timelines, Compositions, or source media, and it never receives Composition or project data.
3. **No network service in the initial vertical slice.** The first interface is a command-line JSON interface:
   ```text
   python -m knarra_mi run --request <request.json> --result <result.json>
   ```
4. **Node invokes it as an external process** with `spawn()` and an argument array (as in ADR 0002), through an `AnalysisRunner` interface in `backend/src/analysis/`. Node writes the request file into a per-job working directory, supplies an `AbortSignal` and timeout, and reads the result file. The process writes only the result file and an optional scratch directory named in the request.
5. **Versioned, validated contract.** Every request and result carries `contractVersion`, and every result carries `analysisKind`, `schemaVersion`, and `analyzer: { name, version }`. Node validates each result with Zod schemas in `backend/src/domain/analysis/` before persisting it. Invalid, unknown-version, or mismatched results are rejected and never persisted. Shared golden JSON fixtures are validated by both the Python and Node test suites.
6. **Results are derived artifacts** (ADR 0004). They are stored per asset and keyed by asset ID, analysis kind, schema version, analyzer version, and input fingerprint, so they can be regenerated without duplicating records.
7. **Transport-independent design.** Analysis modules are pure functions from typed inputs (server-resolved file paths and parameters) to typed results. A single `dispatch(request) -> result` function routes requests. The CLI is a thin adapter over `dispatch`. A later FastAPI endpoint and job-queue worker would be additional adapters over the same `dispatch`, without changing analysis modules. Node switches transports by adding a new `AnalysisRunner` implementation.
8. **Scheduled after the first production render vertical slice (M7)**, starting in M9.

## Consequences

- Analysis can be developed and tested in Python independently of the backend, and its failures cannot corrupt project state.
- Contracts exist in two languages. Shared golden fixtures and contract tests are required to keep Zod and Python models in agreement.
- Process start-up cost is paid per request. This is acceptable for asset-level batch analysis. Moving to FastAPI or a queue needs a new ADR covering transport, authentication, and how file paths become storage references.
- Analysis can inform the LLM planner and the UI, but any resulting edit still goes through `EditOperation`s and validation (invariants 3–5).
- Python and the selected libraries become a development requirement once M9 starts. Specific libraries are chosen per task, not in this ADR.
