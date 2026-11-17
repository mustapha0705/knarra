import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import spikeAssetsJson from "../domain/composition/__fixtures__/spike.assets.json" with { type: "json" };
import spikeCompositionJson from "../domain/composition/__fixtures__/spike.composition.json" with { type: "json" };
import { createPgDatabase, errorCode, type Database } from "./db.js";
import { loadMigrations, runMigrations, type Migration } from "./migrate.js";
import { ProjectRepository, type ProjectUpdate, type StoredAsset } from "./projectRepository.js";
import { createMigratedTestDatabase, createTestDatabase } from "./testing/pglite.js";

// Runs on an embedded PostgreSQL by default. Set TEST_DATABASE_URL to an EMPTY
// scratch database to run the same tests against a real PostgreSQL server; the
// tests drop and recreate its tables.
const realUrl = process.env.TEST_DATABASE_URL;

const drivers: [string, () => Promise<Database>][] = [["embedded PostgreSQL", createTestDatabase]];
if (realUrl) drivers.push(["PostgreSQL server", async () => createPgDatabase(realUrl)]);

const RESET = `
  DROP TABLE IF EXISTS render_jobs, project_versions, assets, projects, schema_migrations CASCADE;
  DROP FUNCTION IF EXISTS forbid_project_version_update() CASCADE;
`;

const assets: StoredAsset[] = spikeAssetsJson.map((asset, index) => ({
  ...(asset as Omit<StoredAsset, "name" | "verified">),
  name: `file ${index}.bin`,
  verified: false,
}));

const composition = (id: string) => ({ ...spikeCompositionJson, id });

const update = (id: string, expectedRevision: number, overrides: Partial<ProjectUpdate> = {}): ProjectUpdate => ({
  expectedRevision,
  title: "Summer reel",
  schemaVersion: 1,
  composition: composition(id),
  editorState: { canvasNodes: [{ id: "node_1", x: 10.5, y: -3 }], zoom: 1.25 },
  assets,
  ...overrides,
});

describe.each(drivers)("migrations on %s", (_name, connect) => {
  let database: Database;

  beforeEach(async () => {
    database = await connect();
    await database.exec(RESET);
  });
  afterAll(async () => {
    await database?.close();
  });

  const tables = async () =>
    (
      await database.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name",
      )
    ).rows.map((row) => row.table_name);

  it("creates the schema and records each migration", async () => {
    const migrations = await loadMigrations();

    const ran = await runMigrations(database, migrations);

    expect(ran).toEqual(migrations.map((migration) => migration.name));
    expect(ran[0]).toBe("0001_initial.sql");
    expect(await tables()).toEqual(["assets", "project_versions", "projects", "render_jobs", "schema_migrations"]);
  });

  it("does nothing the second time", async () => {
    const migrations = await loadMigrations();
    await runMigrations(database, migrations);

    expect(await runMigrations(database, migrations)).toEqual([]);
  });

  it("applies only new migrations, in name order", async () => {
    const first: Migration = { name: "0001_a.sql", sql: "CREATE TABLE a (id int)" };
    const second: Migration = { name: "0002_b.sql", sql: "CREATE TABLE b (id int); INSERT INTO b SELECT count(*) FROM a" };
    await runMigrations(database, [first]);

    expect(await runMigrations(database, [second, first])).toEqual(["0002_b.sql"]);
  });

  it("rolls a failed migration back completely and does not record it", async () => {
    const broken: Migration = { name: "0001_broken.sql", sql: "CREATE TABLE half_done (id int); SELECT * FROM no_such_table" };

    await expect(runMigrations(database, [broken])).rejects.toThrow();

    expect(await tables()).toEqual(["schema_migrations"]);
    expect((await database.query("SELECT name FROM schema_migrations")).rows).toEqual([]);
  });

  it("refuses to run against a database that has migrations the code does not know", async () => {
    await runMigrations(database, [{ name: "0009_from_the_future.sql", sql: "CREATE TABLE future (id int)" }]);

    await expect(runMigrations(database, [])).rejects.toThrow(/does not know/);
  });
});

describe("loadMigrations", () => {
  it("returns the migration files in order with their SQL", async () => {
    const migrations = await loadMigrations();

    expect(migrations.map((m) => m.name)).toEqual([...migrations.map((m) => m.name)].sort());
    expect(migrations[0]?.sql).toContain("CREATE TABLE projects");
  });
});

describe.each(drivers)("ProjectRepository on %s", (name, connect) => {
  let database: Database;
  let repository: ProjectRepository;

  beforeAll(async () => {
    if (name === "embedded PostgreSQL") {
      database = await createMigratedTestDatabase();
    } else {
      database = await connect();
      await database.exec(RESET);
      await runMigrations(database, await loadMigrations());
    }
    repository = new ProjectRepository(database);
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.exec("DELETE FROM projects");
  });

  const create = (id = "proj-1", title = "Untitled") =>
    repository.create({ id, title, schemaVersion: 1, composition: composition(id) });

  describe("create, get, list, delete", () => {
    it("creates a project at revision 1 with no assets", async () => {
      const project = await create();

      expect(project).toMatchObject({
        id: "proj-1",
        title: "Untitled",
        revision: 1,
        schemaVersion: 1,
        composition: composition("proj-1"),
        editorState: {},
        assets: [],
      });
      expect(new Date(project.createdAt).toISOString()).toBe(project.createdAt);
    });

    it("returns the same project when read back", async () => {
      const created = await create();

      expect(await repository.get("proj-1")).toEqual(created);
    });

    it("returns null for an unknown project", async () => {
      expect(await repository.get("nope")).toBeNull();
    });

    it("rejects a duplicate ID", async () => {
      await create();

      const error = await create().catch((e: unknown) => e);

      expect(errorCode(error)).toBe("23505");
    });

    it("lists projects, most recently updated first", async () => {
      await create("proj-a", "A");
      await create("proj-b", "B");
      await repository.save("proj-a", update("proj-a", 1, { title: "A edited" }));

      const list = await repository.list();

      expect(list.map((project) => [project.id, project.title, project.revision])).toEqual([
        ["proj-a", "A edited", 2],
        ["proj-b", "B", 1],
      ]);
      expect(list[0]).not.toHaveProperty("composition");
    });

    it("deletes a project together with its assets and versions", async () => {
      await create();
      await repository.save("proj-1", update("proj-1", 1));
      await repository.createVersion("proj-1");

      expect(await repository.delete("proj-1")).toBe(true);

      expect(await repository.get("proj-1")).toBeNull();
      for (const table of ["assets", "project_versions"]) {
        const { rows } = await database.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
        expect(rows[0]?.count).toBe(0);
      }
      expect(await repository.delete("proj-1")).toBe(false);
    });
  });

  describe("save and reopen", () => {
    it("stores the composition, editor state, title, and assets, and bumps the revision", async () => {
      await create();

      const result = await repository.save("proj-1", update("proj-1", 1));

      expect(result.status).toBe("saved");
      const reopened = await repository.get("proj-1");
      expect(reopened).toMatchObject({
        title: "Summer reel",
        revision: 2,
        composition: composition("proj-1"),
        editorState: { canvasNodes: [{ id: "node_1", x: 10.5, y: -3 }], zoom: 1.25 },
        assets,
      });
      expect(result).toEqual({ status: "saved", project: reopened });
    });

    it("keeps assets in the order they were saved", async () => {
      await create();
      const reversed = [...assets].reverse();

      await repository.save("proj-1", update("proj-1", 1, { assets: reversed }));

      expect((await repository.get("proj-1"))?.assets.map((asset) => asset.id)).toEqual(reversed.map((a) => a.id));
    });

    it("replaces the asset list on every save", async () => {
      await create();
      await repository.save("proj-1", update("proj-1", 1));

      await repository.save("proj-1", update("proj-1", 2, { assets: [assets[0]!] }));

      expect((await repository.get("proj-1"))?.assets).toEqual([assets[0]]);
    });

    it("keeps each project's assets separate, even with the same asset IDs", async () => {
      await create("proj-a");
      await create("proj-b");
      await repository.save("proj-a", update("proj-a", 1));
      await repository.save("proj-b", update("proj-b", 1, { assets: [assets[2]!] }));

      expect((await repository.get("proj-a"))?.assets).toHaveLength(3);
      expect((await repository.get("proj-b"))?.assets).toHaveLength(1);
    });

    it("stores awkward text as data", async () => {
      await create();
      const title = `Robert'); DROP TABLE projects;-- "quoted" \\ back\\slash 日本語 🎬`;

      await repository.save("proj-1", update("proj-1", 1, { title, editorState: { note: title, nested: { "a.b": [null, true] } } }));

      const reopened = await repository.get("proj-1");
      expect(reopened?.title).toBe(title);
      expect(reopened?.editorState).toEqual({ note: title, nested: { "a.b": [null, true] } });
      expect(await repository.list()).toHaveLength(1);
    });
  });

  describe("stale-write protection", () => {
    it("refuses a save based on an old revision and changes nothing", async () => {
      await create();
      await repository.save("proj-1", update("proj-1", 1, { title: "First writer" }));

      const result = await repository.save("proj-1", update("proj-1", 1, { title: "Second writer", assets: [] }));

      expect(result).toEqual({ status: "stale", currentRevision: 2 });
      expect(await repository.get("proj-1")).toMatchObject({ title: "First writer", revision: 2, assets });
    });

    it("refuses a save that names a revision from the future", async () => {
      await create();

      expect(await repository.save("proj-1", update("proj-1", 7))).toEqual({ status: "stale", currentRevision: 1 });
    });

    it("lets exactly one of two concurrent saves from the same revision win", async () => {
      await create();

      const results = await Promise.all([
        repository.save("proj-1", update("proj-1", 1, { title: "Writer A" })),
        repository.save("proj-1", update("proj-1", 1, { title: "Writer B" })),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(["saved", "stale"]);
      expect((await repository.get("proj-1"))?.revision).toBe(2);
    });

    it("reports an unknown project as not found, not as stale", async () => {
      expect(await repository.save("nope", update("nope", 1))).toEqual({ status: "not-found" });
    });
  });

  describe("versions", () => {
    it("snapshots the current state with increasing numbers", async () => {
      await create();
      await repository.save("proj-1", update("proj-1", 1));

      const first = await repository.createVersion("proj-1", { label: "Before the cut" });
      await repository.save("proj-1", update("proj-1", 2, { title: "Changed later", assets: [] }));
      const second = await repository.createVersion("proj-1");

      expect(first).toMatchObject({
        status: "created",
        version: {
          projectId: "proj-1",
          versionNumber: 1,
          projectRevision: 2,
          label: "Before the cut",
          composition: composition("proj-1"),
          assets,
        },
      });
      expect(second).toMatchObject({ status: "created", version: { versionNumber: 2, projectRevision: 3, label: null, assets: [] } });
    });

    it("does not change when the project changes afterwards", async () => {
      await create();
      await repository.save("proj-1", update("proj-1", 1));
      const created = await repository.createVersion("proj-1");
      if (created.status !== "created") throw new Error("expected a version");

      await repository.save("proj-1", update("proj-1", 2, { editorState: { changed: true }, assets: [] }));

      expect(await repository.getVersion("proj-1", created.version.id)).toEqual(created.version);
    });

    it("cannot be updated, even with direct SQL", async () => {
      await create();
      await repository.createVersion("proj-1");

      await expect(database.query("UPDATE project_versions SET label = 'tampered'")).rejects.toThrow(/immutable/);
      await expect(database.query("UPDATE project_versions SET composition = '{}'::jsonb")).rejects.toThrow(/immutable/);
    });

    it("refuses a snapshot of a revision the project has moved past", async () => {
      await create();
      await repository.save("proj-1", update("proj-1", 1));

      expect(await repository.createVersion("proj-1", { expectedRevision: 1 })).toEqual({ status: "stale", currentRevision: 2 });
      expect(await repository.listVersions("proj-1")).toEqual([]);
    });

    it("numbers concurrent snapshots without gaps or duplicates", async () => {
      await create();

      const results = await Promise.all(Array.from({ length: 5 }, () => repository.createVersion("proj-1")));

      const numbers = results.map((result) => (result.status === "created" ? result.version.versionNumber : -1));
      expect(numbers.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it("lists versions newest first and finds one only under its own project", async () => {
      await create("proj-a");
      await create("proj-b");
      const a1 = await repository.createVersion("proj-a");
      await repository.createVersion("proj-a");
      if (a1.status !== "created") throw new Error("expected a version");

      expect((await repository.listVersions("proj-a")).map((version) => version.versionNumber)).toEqual([2, 1]);
      expect(await repository.listVersions("proj-b")).toEqual([]);
      expect(await repository.getVersion("proj-b", a1.version.id)).toBeNull();
      expect(await repository.createVersion("nope")).toEqual({ status: "not-found" });
    });
  });

  describe("database constraints", () => {
    it.each([
      ["a path-like project ID", "INSERT INTO projects (id, title, schema_version, composition) VALUES ('../x', 't', 1, '{}')"],
      ["an empty title", "INSERT INTO projects (id, title, schema_version, composition) VALUES ('p', '', 1, '{}')"],
      ["an unknown asset kind", "INSERT INTO assets (project_id, id, kind, name) VALUES ('proj-1', 'a', 'gif', 'n')"],
      ["a negative duration", "INSERT INTO assets (project_id, id, kind, name, duration_ms) VALUES ('proj-1', 'a', 'video', 'n', -1)"],
      ["an asset for a missing project", "INSERT INTO assets (project_id, id, kind, name) VALUES ('nope', 'a', 'video', 'n')"],
      ["a render job without a version", "INSERT INTO render_jobs (id, project_version_id) VALUES ('job-1', 'nope')"],
    ])("rejects %s", async (_name, sql) => {
      await create();

      await expect(database.exec(sql)).rejects.toThrow();
    });

    it("rejects an unknown render job status and accepts a job bound to a version", async () => {
      await create();
      const created = await repository.createVersion("proj-1");
      if (created.status !== "created") throw new Error("expected a version");

      await database.query("INSERT INTO render_jobs (id, project_version_id) VALUES ($1, $2)", ["job-1", created.version.id]);
      await expect(
        database.query("INSERT INTO render_jobs (id, project_version_id, status) VALUES ($1, $2, $3)", ["job-2", created.version.id, "paused"]),
      ).rejects.toThrow();

      const { rows } = await database.query<{ status: string; progress: number }>("SELECT status, progress FROM render_jobs");
      expect(rows).toEqual([{ status: "queued", progress: 0 }]);
    });
  });
});
