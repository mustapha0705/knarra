import { err, ok, type Issue, type Result } from "./issues.js";

/**
 * Upgrades stored Composition data by exactly one schema version. It receives a
 * private copy and must return data whose `schemaVersion` is one higher.
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** Migrations keyed by the version they upgrade FROM. */
export type MigrationRegistry = ReadonlyMap<number, Migration>;

/**
 * Production migrations. Empty while version 1 is the only version that has
 * ever been stored. When version 2 is introduced, register `1 -> 2` here and
 * raise COMPOSITION_SCHEMA_VERSION in the same change.
 */
export const COMPOSITION_MIGRATIONS: MigrationRegistry = new Map();

/**
 * Runs the registered migrations in order, one version at a time, until the
 * data is at `targetVersion`. `data` is not mutated.
 */
export function migrateToVersion(
  data: Record<string, unknown>,
  fromVersion: number,
  targetVersion: number,
  registry: MigrationRegistry,
): Result<Record<string, unknown>, Issue[]> {
  // Nothing to upgrade: hand the data to the strict parse as it is.
  if (fromVersion >= targetVersion) return ok(data);

  let current: Record<string, unknown>;
  try {
    current = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  } catch {
    return err([
      {
        code: "INVALID_STRUCTURE",
        path: [],
        message: "This composition is not plain JSON data or is nested too deeply to read.",
      },
    ]);
  }

  for (let version = fromVersion; version < targetVersion; version += 1) {
    const migration = registry.get(version);
    if (!migration) {
      return err([
        {
          code: "SCHEMA_VERSION_UNSUPPORTED",
          path: ["schemaVersion"],
          message: `This composition uses schema version ${fromVersion}, and there is no upgrade from version ${version} to ${version + 1}. It cannot be opened by this version of Knarra, which reads version ${targetVersion}.`,
        },
      ]);
    }

    let next: unknown;
    try {
      next = migration(current);
    } catch (error) {
      return err([migrationFailed(version, error instanceof Error ? error.message : String(error))]);
    }

    if (!isRecord(next) || next.schemaVersion !== version + 1) {
      return err([
        migrationFailed(version, `it did not produce data with schemaVersion ${version + 1}`),
      ]);
    }
    current = next;
  }

  return ok(current);
}

function migrationFailed(fromVersion: number, reason: string): Issue {
  return {
    code: "MIGRATION_FAILED",
    path: ["schemaVersion"],
    message: `Upgrading this composition from schema version ${fromVersion} to ${fromVersion + 1} failed: ${reason}. The stored data was not changed.`,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
