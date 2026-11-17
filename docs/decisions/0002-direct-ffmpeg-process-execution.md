# 0002: Run FFmpeg Directly with spawn() and an Argument Array

- Status: Accepted
- Date: 2026-11-16

## Context

The Export spike (`backend/ffmpeg-practice/render.js`) runs `spawn("ffmpeg", args)` with an argument array and no shell, and produced a correct MP4. Wrappers such as fluent-ffmpeg hide the exact arguments and are not actively maintained. Shell strings risk injection once user-controlled values exist.

## Decision

- Launch `ffmpeg` and `ffprobe` with `child_process.spawn()` and an argument array. Never use `exec`, `shell: true`, or string interpolation.
- No FFmpeg wrapper library.
- Arguments come only from the deterministic render compiler, which uses server-resolved paths.
- The executor owns progress (`-progress pipe:1`), cancellation (`AbortSignal`), bounded stderr capture, and partial-output cleanup.

## Consequences

- Exact arguments are visible and golden-testable.
- Knarra owns the progress parser and error mapping.
- FFmpeg and ffprobe must be on PATH or configured; the binary location becomes configuration in M3.
