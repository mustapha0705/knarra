import { describe, expect, it } from "vitest";
import spikeCompositionJson from "./__fixtures__/spike.composition.json" with { type: "json" };
import type { Issue, IssueCode, IssuePath } from "./issues.js";
import { COMPOSITION_MIGRATIONS, type Migration, type MigrationRegistry } from "./migrations.js";
import { parseComposition } from "./parse.js";
import { COMPOSITION_SCHEMA_VERSION } from "./schema.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function rejected(input: unknown, migrations?: MigrationRegistry): Issue[] {
  const result = parseComposition(input, migrations ? { migrations } : {});
  if (result.ok) throw new Error("expected failure, got success");
  return result.error;
}

function summary(issues: Issue[]): [IssueCode, IssuePath][] {
  return issues.map((issue) => [issue.code, issue.path]);
}

/**
 * A synthetic, test-only "version 0": tracks were two separate fields and the
 * preset field had another name. No such data was ever stored; it exists to
 * prove the migration registry works.
 */
function spikeAsV0(): Record<string, unknown> {
  const { tracks, presetId, ...rest } = clone(spikeCompositionJson);
  return { ...rest, schemaVersion: 0, preset: presetId, visualTrack: tracks[0], audioTrack: tracks[1] };
}

const v0ToV1: Migration = (data) => {
  const { preset, visualTrack, audioTrack, ...rest } = data;
  return { ...rest, schemaVersion: 1, presetId: preset, tracks: [visualTrack, audioTrack] };
};

const TEST_MIGRATIONS: MigrationRegistry = new Map([[0, v0ToV1]]);

describe("parseComposition: current version", () => {
  it("passes a current-version composition through unchanged", () => {
    expect(parseComposition(spikeCompositionJson)).toEqual({ ok: true, value: spikeCompositionJson });
  });

  it("runs no migration for current-version data", () => {
    const never: MigrationRegistry = new Map([
      [
        COMPOSITION_SCHEMA_VERSION,
        () => {
          throw new Error("must not run");
        },
      ],
    ]);

    expect(parseComposition(spikeCompositionJson, { migrations: never }).ok).toBe(true);
  });

  it("has no production migrations while version 1 is the only version", () => {
    expect(COMPOSITION_SCHEMA_VERSION).toBe(1);
    expect(COMPOSITION_MIGRATIONS.size).toBe(0);
  });

  it("returns structural issues with their paths", () => {
    const broken = clone(spikeCompositionJson);
    broken.tracks[0]!.id = "../x";

    expect(summary(rejected(broken))).toEqual([["INVALID_STRUCTURE", ["tracks", 0, "id"]]]);
  });

  it("rejects unknown keys", () => {
    expect(summary(rejected({ ...clone(spikeCompositionJson), ffmpegArgs: ["-y"] }))).toEqual([
      ["INVALID_STRUCTURE", []],
    ]);
  });

  it("does not mutate its input", () => {
    const input = deepFreeze(clone(spikeCompositionJson));
    expect(parseComposition(input).ok).toBe(true);
  });
});

describe("parseComposition: version checks", () => {
  it("rejects a missing schemaVersion with an actionable message", () => {
    const { schemaVersion: _omitted, ...rest } = clone(spikeCompositionJson);
    const issues = rejected(rest);

    expect(summary(issues)).toEqual([["SCHEMA_VERSION_MISSING", ["schemaVersion"]]]);
    expect(issues[0]?.message).toContain("has no schemaVersion");
    expect(issues[0]?.message).toContain("schemaVersion 1");
  });

  it("rejects a future version and says to update", () => {
    const issues = rejected({ ...clone(spikeCompositionJson), schemaVersion: 2 });

    expect(summary(issues)).toEqual([["SCHEMA_VERSION_TOO_NEW", ["schemaVersion"]]]);
    expect(issues[0]?.message).toContain("schema version 2");
    expect(issues[0]?.message).toContain("Update Knarra");
  });

  it("rejects an older version that has no migration", () => {
    const issues = rejected(spikeAsV0());

    expect(summary(issues)).toEqual([["SCHEMA_VERSION_UNSUPPORTED", ["schemaVersion"]]]);
    expect(issues[0]?.message).toContain("no upgrade from version 0 to 1");
  });

  it.each([["1"], [1.5], [-1], [null], [true], [Number.NaN], [{}]])(
    "rejects %j as a schemaVersion",
    (schemaVersion) => {
      const issues = rejected({ ...clone(spikeCompositionJson), schemaVersion });

      expect(summary(issues)).toEqual([["SCHEMA_VERSION_INVALID", ["schemaVersion"]]]);
      expect(issues[0]?.message).toContain("must be a whole number");
    },
  );

  it.each([[null], ["{}"], [42], [[]], [undefined]])("rejects %j as a composition", (input) => {
    expect(summary(rejected(input))).toEqual([["INVALID_STRUCTURE", []]]);
  });

  it("checks the version before the structure", () => {
    // Future data may legitimately have a shape this version cannot judge.
    const issues = rejected({ schemaVersion: 99, somethingNew: true });

    expect(summary(issues)).toEqual([["SCHEMA_VERSION_TOO_NEW", ["schemaVersion"]]]);
  });
});

describe("parseComposition: migration registry (synthetic v0 -> v1)", () => {
  it("migrates old data to the current version, then parses it strictly", () => {
    expect(parseComposition(spikeAsV0(), { migrations: TEST_MIGRATIONS })).toEqual({
      ok: true,
      value: spikeCompositionJson,
    });
  });

  it("gives the migration a copy, leaving the input untouched", () => {
    const input = deepFreeze(spikeAsV0());
    const mutating: Migration = (data) => {
      const migrated = v0ToV1(data);
      data.visualTrack = null; // throws if `data` is the frozen input
      return migrated;
    };

    const result = parseComposition(input, { migrations: new Map([[0, mutating]]) });

    expect(result).toEqual({ ok: true, value: spikeCompositionJson });
    expect(input).toEqual(spikeAsV0());
  });

  it("still applies the strict parse to migrated data", () => {
    const sloppy: Migration = (data) => ({ ...v0ToV1(data), leftover: "from v0" });

    expect(summary(rejected(spikeAsV0(), new Map([[0, sloppy]])))).toEqual([["INVALID_STRUCTURE", []]]);
  });

  it("rejects a migration that does not advance the version", () => {
    const stuck: Migration = (data) => ({ ...v0ToV1(data), schemaVersion: 0 });
    const issues = rejected(spikeAsV0(), new Map([[0, stuck]]));

    expect(summary(issues)).toEqual([["MIGRATION_FAILED", ["schemaVersion"]]]);
    expect(issues[0]?.message).toContain("from schema version 0 to 1");
  });

  it("reports a migration that throws instead of throwing itself", () => {
    const broken: Migration = () => {
      throw new Error("visualTrack is missing");
    };
    const issues = rejected(spikeAsV0(), new Map([[0, broken]]));

    expect(summary(issues)).toEqual([["MIGRATION_FAILED", ["schemaVersion"]]]);
    expect(issues[0]?.message).toContain("visualTrack is missing");
  });
});
