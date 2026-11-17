# 0005: Composition Times Are Integer Milliseconds

- Status: Accepted
- Date: 2026-11-16

## Context

All existing frontend time fields are integer milliseconds (`sourceStartMs`, `durationMs`, `timelineStartMs`). Alternatives were integer frames (frame-exact but tied to one frame rate) and rational seconds (precise but harder to validate and explain).

## Decision

- Every time value in the Composition is a non-negative integer number of milliseconds.
- The render compiler converts milliseconds to seconds for FFmpeg and is responsible for frame quantization.
- A video clip's `durationMs` must equal `round((sourceEndMs − sourceStartMs) / speed)` within ±1 ms, to absorb rounding.

## Consequences

- Frontend data maps to the Composition without unit conversion.
- Frame-accuracy is tested in the compiler (M2), not enforced by the schema.
- At 30 fps one frame is about 33 ms, so millisecond values are never frame-aligned by themselves.
