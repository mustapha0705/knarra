# 0004: Originals Are Immutable; Proxies and Thumbnails Are Derived

- Status: Accepted
- Date: 2026-11-16

## Context

Source media can be large (the spike's source video is 229 MB, 1280x720 at 60 fps). Editing needs fast previews, while exports need full quality. Uploaded filenames are untrusted.

## Decision

- An uploaded original is stored once under a server-generated path and never modified.
- Thumbnails, posters, and editing proxies are derived artifacts tied to the original's asset ID. They can be deleted and regenerated without creating new asset records.
- Final exports always read originals, never proxies.
- Uploaded filenames are display metadata only and never become filesystem paths.

## Consequences

- Storage needs separate `originals/`, `derived/`, and `exports/` areas.
- Derived artifacts need their own state (pending, ready, failed) and failure handling.
- Proxy quality never affects export quality.
