# 0001: The Timeline Composition Is the Render Source of Truth

- Status: Accepted
- Date: 2026-11-16

## Context

The editor holds Canvas nodes, folders, timeline clips, and segments in one `EditorProject` document with one undo stack (`frontend/src/features/editor/types.ts`). Asset slider values (`asset.metadata`) and clip fields (`clip.speed`, `clip.volume`) are separate sources of truth, and images sit on an `overlay` lane with undefined compositing semantics. A renderer cannot be deterministic over that shape.

## Decision

- The versioned Timeline Composition alone defines the rendered video.
- The Canvas organizes media and communicates intent. It is stored separately and never read by the renderer.
- Composition v1 has exactly one sequential visual track (images and video clips in order) and one background-audio track. Additional visual layers are deferred.
- Manual edits and approved AI edits both change the Composition only through typed `EditOperation`s and the same reducer.

## Consequences

- The M7 adapter must map `overlay` image clips onto the visual track and move effect values from asset metadata onto clips.
- Canvas changes no longer need to share the Composition's undo history.
- Overlays, picture-in-picture, and transitions require a later ADR.
