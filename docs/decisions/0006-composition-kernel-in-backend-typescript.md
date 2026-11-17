# 0006: The Composition Kernel Lives in the Backend, in TypeScript

- Status: Accepted
- Date: 2026-11-16

## Context

The backend is plain JavaScript ESM. The frontend is TypeScript with its own incompatible editor types. There is no root `package.json` or shared package. The kernel needs runtime schemas (Zod) and strong static types.

## Decision

- Convert the backend to TypeScript incrementally: TypeScript, tsx, and Vitest are added with `allowJs`, so existing JavaScript keeps running (KNAR-101).
- The kernel lives in `backend/src/domain/composition/`.
- The kernel imports only Zod and its own modules: no Express, `fs`, `child_process`, or database code.
- The backend kernel is authoritative. The frontend keeps its own editor types until M7, then adapts to the Composition.

## Consequences

- No monorepo setup is needed before M1.
- Because the kernel is framework-free, it can later be extracted into a shared workspace package used by the frontend. That extraction requires its own ADR.
- Until then, the frontend cannot import kernel types directly; the M7 adapter is the boundary.
