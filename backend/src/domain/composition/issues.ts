/**
 * Stable machine-readable codes. Callers and tests match on `code`; the
 * `message` is for people and may be reworded.
 */
export const ISSUE_CODES = [
  // Structural (Zod) failures, mapped into the same Issue shape.
  "INVALID_STRUCTURE",
  // Semantic rules (validateComposition).
  "DUPLICATE_ID",
  "ASSET_CATALOG_DUPLICATE_ID",
  "ASSET_NOT_FOUND",
  "ASSET_KIND_MISMATCH",
  "ASSET_METADATA_MISSING",
  "SOURCE_RANGE_INVALID",
  "SOURCE_RANGE_OUT_OF_BOUNDS",
  "SPEED_OUT_OF_RANGE",
  "DURATION_MISMATCH",
  "IMAGE_DURATION_OUT_OF_RANGE",
  "VOLUME_OUT_OF_RANGE",
  "AUDIO_CLIPS_OVERLAP",
  "VISUAL_TRACK_EMPTY",
  "FADE_TOO_LONG",
  // Failures while applying an operation (applyOperations).
  "CLIP_NOT_FOUND",
  "INDEX_OUT_OF_RANGE",
  "CLIP_KIND_NOT_SUPPORTED",
  // Failures while reading stored data (parseComposition).
  "SCHEMA_VERSION_MISSING",
  "SCHEMA_VERSION_INVALID",
  "SCHEMA_VERSION_UNSUPPORTED",
  "SCHEMA_VERSION_TOO_NEW",
  "MIGRATION_FAILED",
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export type IssuePath = (string | number)[];

export interface Issue {
  code: IssueCode;
  /**
   * Location inside the Composition, for example
   * `["tracks", 0, "clips", 1, "sourceEndMs"]`. Issues about the asset catalog
   * itself start with `"assets"`; issues about a submitted operation start with
   * `"operations"` and its index in the batch.
   */
  path: IssuePath;
  message: string;
}

/**
 * Converts schema-library issues into kernel issues. The parameter is typed
 * structurally so this module does not depend on the schema library.
 */
export function structuralIssues(
  schemaIssues: readonly { path: readonly PropertyKey[]; message: string }[],
  prefix: IssuePath = [],
): Issue[] {
  return schemaIssues.map((issue) => ({
    code: "INVALID_STRUCTURE",
    path: [
      ...prefix,
      ...issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment))),
    ],
    message: issue.message,
  }));
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// Limits used by the semantic rules (ARCHITECTURE.md, Composition v1 Model).
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;
export const MIN_IMAGE_DURATION_MS = 100;
export const MAX_IMAGE_DURATION_MS = 60_000;
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 1;
export const DURATION_TOLERANCE_MS = 1;
