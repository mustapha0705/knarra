import { err, ok, structuralIssues, type Issue, type Result } from "./issues.js";
import {
  COMPOSITION_MIGRATIONS,
  isRecord,
  migrateToVersion,
  type MigrationRegistry,
} from "./migrations.js";
import { COMPOSITION_SCHEMA_VERSION, compositionSchema } from "./schema.js";
import type { Composition } from "./types.js";

export interface ParseCompositionOptions {
  /** Overrides the production migrations. Intended for tests. */
  migrations?: MigrationRegistry;
}

/**
 * The entry point for stored or received Composition data.
 *
 * 1. Reads `schemaVersion`.
 * 2. Runs the registered migrations up to the current version.
 * 3. Performs the strict structural parse.
 *
 * Semantic validation is separate (validateComposition), because it needs the
 * asset catalog. The input is never mutated.
 */
export function parseComposition(
  input: unknown,
  options: ParseCompositionOptions = {},
): Result<Composition, Issue[]> {
  const current = COMPOSITION_SCHEMA_VERSION;

  if (!isRecord(input)) {
    return err([
      {
        code: "INVALID_STRUCTURE",
        path: [],
        message: "A composition must be a JSON object.",
      },
    ]);
  }

  const version = input.schemaVersion;

  if (version === undefined) {
    return err([
      {
        code: "SCHEMA_VERSION_MISSING",
        path: ["schemaVersion"],
        message: `This composition has no schemaVersion, so it cannot be read safely. Compositions written by this version of Knarra have schemaVersion ${current}.`,
      },
    ]);
  }

  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
    return err([
      {
        code: "SCHEMA_VERSION_INVALID",
        path: ["schemaVersion"],
        message: `schemaVersion must be a whole number such as ${current}, but it is ${JSON.stringify(version)}.`,
      },
    ]);
  }

  if (version > current) {
    return err([
      {
        code: "SCHEMA_VERSION_TOO_NEW",
        path: ["schemaVersion"],
        message: `This composition uses schema version ${version}, but this version of Knarra reads up to version ${current}. Update Knarra to open it.`,
      },
    ]);
  }

  const migrated = migrateToVersion(
    input,
    version,
    current,
    options.migrations ?? COMPOSITION_MIGRATIONS,
  );
  if (!migrated.ok) return migrated;

  const parsed = compositionSchema.safeParse(migrated.value);
  return parsed.success ? ok(parsed.data) : err(structuralIssues(parsed.error.issues));
}
