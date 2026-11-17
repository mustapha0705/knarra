import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import spikeAssetsJson from "../domain/composition/__fixtures__/spike.assets.json" with { type: "json" };
import spikeCompositionJson from "../domain/composition/__fixtures__/spike.composition.json" with { type: "json" };
import type { Database } from "../persistence/db.js";
import { ProjectRepository } from "../persistence/projectRepository.js";
import { createMigratedTestDatabase } from "../persistence/testing/pglite.js";
import { ProjectService } from "../projects/service.js";
import { createProjectsRouter } from "./projects.js";

// The M4 gate over real HTTP: a project can be saved, reopened, modified,
// versioned, and protected from a stale update. Uses an embedded PostgreSQL.

let database: Database;
let server: Server;
let base: string;

function listen(router: express.Router): Promise<[Server, string]> {
  const app = express();
  app.use("/api/projects", router);
  return new Promise((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => {
      resolve([started, `http://127.0.0.1:${(started.address() as AddressInfo).port}/api/projects`]);
    });
  });
}

beforeAll(async () => {
  database = await createMigratedTestDatabase();
  [server, base] = await listen(createProjectsRouter(new ProjectService(new ProjectRepository(database))));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.close();
});

beforeEach(async () => {
  await database.exec("DELETE FROM projects");
});

interface Json {
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function call(method: string, path = "", body?: unknown): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${base}${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Json) : {} };
}

const assets = spikeAssetsJson.map((asset, index) => ({ ...asset, name: `clip ${index}.mov` }));
const composition = (id: string) => ({ ...structuredCloneJson(spikeCompositionJson), id });
function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function createProject(title = "My reel"): Promise<Json> {
  const { status, body } = await call("POST", "", { title });
  expect(status).toBe(201);
  return body.project as Json;
}

const saveBody = (project: Json, overrides: Json = {}) => ({
  expectedRevision: project.revision,
  title: project.title,
  composition: composition(project.id),
  editorState: { canvasNodes: [{ id: "node_1", x: 1, y: 2 }] },
  assets,
  ...overrides,
});

describe("M4 gate: save, reopen, modify, version, stale protection", () => {
  it("walks the whole lifecycle", async () => {
    // Create.
    const created = await createProject("Lagos trip");
    expect(created).toMatchObject({ title: "Lagos trip", revision: 1, assets: [], editorState: {} });
    expect(created.composition).toMatchObject({ schemaVersion: 1, id: created.id, presetId: "vertical-1080p30" });
    expect(created.composition.tracks.map((track: Json) => track.clips)).toEqual([[], []]);

    // Save.
    const saved = await call("PUT", `/${created.id}`, saveBody(created));
    expect(saved.status).toBe(200);
    expect(saved.body.project.revision).toBe(2);

    // Reopen.
    const reopened = await call("GET", `/${created.id}`);
    expect(reopened.status).toBe(200);
    expect(reopened.body.project).toEqual(saved.body.project);
    expect(reopened.body.project.composition).toEqual(composition(created.id));
    expect(reopened.body.project.editorState).toEqual({ canvasNodes: [{ id: "node_1", x: 1, y: 2 }] });
    expect(reopened.body.project.assets).toEqual(assets.map((asset) => ({ ...asset, verified: false })));

    // Version.
    const version = await call("POST", `/${created.id}/versions`, { label: "First cut" });
    expect(version.status).toBe(201);
    expect(version.body.version).toMatchObject({ versionNumber: 1, projectRevision: 2, label: "First cut" });

    // Modify.
    const modified = composition(created.id);
    modified.tracks[0]!.clips.pop();
    const second = await call("PUT", `/${created.id}`, saveBody(saved.body.project, { title: "Lagos trip v2", composition: modified }));
    expect(second.status).toBe(200);
    expect(second.body.project).toMatchObject({ title: "Lagos trip v2", revision: 3 });

    // The version did not move.
    const stored = await call("GET", `/${created.id}/versions/${version.body.version.id}`);
    expect(stored.body.version.composition).toEqual(composition(created.id));

    // Stale update: someone still holding revision 2 tries to save.
    const stale = await call("PUT", `/${created.id}`, saveBody(saved.body.project, { title: "Overwrite attempt" }));
    expect(stale.status).toBe(409);
    expect(stale.body.currentRevision).toBe(3);
    expect((await call("GET", `/${created.id}`)).body.project).toMatchObject({ title: "Lagos trip v2", revision: 3 });

    // Listed.
    const list = await call("GET");
    expect(list.body.projects).toEqual([
      expect.objectContaining({ id: created.id, title: "Lagos trip v2", revision: 3 }),
    ]);
    expect(list.body.projects[0]).not.toHaveProperty("composition");
  });
});

describe("projects", () => {
  it("gives every new project its own server-generated ID", async () => {
    const [a, b] = [await createProject(), await createProject()];

    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
  });

  it("trims the title", async () => {
    expect((await createProject("  Spaced  ")).title).toBe("Spaced");
  });

  it.each([
    ["no title", {}],
    ["an empty title", { title: "   " }],
    ["a very long title", { title: "x".repeat(201) }],
    ["a client-chosen ID", { title: "t", id: "../../etc" }],
    ["a non-string title", { title: 42 }],
  ])("rejects creating a project with %s", async (_name, body) => {
    expect((await call("POST", "", body)).status).toBe(422);
    expect((await call("GET")).body.projects).toEqual([]);
  });

  it("deletes a project", async () => {
    const project = await createProject();

    expect((await call("DELETE", `/${project.id}`)).status).toBe(204);
    expect((await call("GET", `/${project.id}`)).status).toBe(404);
    expect((await call("DELETE", `/${project.id}`)).status).toBe(404);
  });

  it.each(["nope", "..%2F..%2Fetc%2Fpasswd", "a.b", "x".repeat(65), "%20"])("answers 404 for the project ID %j", async (id) => {
    expect((await call("GET", `/${id}`)).status).toBe(404);
    expect((await call("PUT", `/${id}`, saveBody({ id: "nope", revision: 1, title: "t" }))).status).toBe(404);
    expect((await call("GET", `/${id}/versions`)).status).toBe(404);
  });
});

describe("saving", () => {
  it("saves an incomplete project, such as an empty timeline", async () => {
    const project = await createProject();

    const saved = await call("PUT", `/${project.id}`, saveBody(project, { composition: project.composition, assets: [] }));

    expect(saved.status).toBe(200);
  });

  it("saves a project whose composition is not yet renderable", async () => {
    const project = await createProject();
    const unfinished = composition(project.id);
    (unfinished.tracks[0]!.clips[1] as Json).speed = 100;

    expect((await call("PUT", `/${project.id}`, saveBody(project, { composition: unfinished }))).status).toBe(200);
  });

  it.each<[string, (project: Json) => Json, unknown[]]>([
    ["a missing revision", () => ({ expectedRevision: undefined }), ["expectedRevision"]],
    ["a fractional revision", () => ({ expectedRevision: 1.5 }), ["expectedRevision"]],
    ["a structurally invalid composition", (p) => ({ composition: { ...composition(p.id), ffmpegArgs: ["-y"] } }), ["composition"]],
    ["a future schema version", (p) => ({ composition: { ...composition(p.id), schemaVersion: 2 } }), ["composition", "schemaVersion"]],
    ["another project's composition", () => ({ composition: composition("someone-else") }), ["composition", "id"]],
    ["an asset with a path", () => ({ assets: [{ ...assets[0], path: "C:/media/a.png" }] }), ["assets", 0]],
    ["an asset that claims to be verified", () => ({ assets: [{ ...assets[0], verified: true }] }), ["assets", 0]],
    ["an asset with a path-like ID", () => ({ assets: [{ ...assets[0], id: "../a" }] }), ["assets", 0, "id"]],
    ["duplicate asset IDs", () => ({ assets: [assets[0], assets[0]] }), ["assets", 1, "id"]],
    ["editor state that is not an object", () => ({ editorState: [1, 2] }), ["editorState"]],
    ["an unknown top-level field", () => ({ owner: "someone" }), []],
  ])("rejects %s and writes nothing", async (_name, change, path) => {
    const project = await createProject();

    const response = await call("PUT", `/${project.id}`, saveBody(project, change(project)));

    expect(response.status).toBe(422);
    expect(response.body.issues[0].path).toEqual(path);
    expect((await call("GET", `/${project.id}`)).body.project.revision).toBe(1);
  });

  it("rejects editor state with media embedded in it", async () => {
    const project = await createProject();
    const huge = { poster: "data:image/jpeg;base64," + "A".repeat(2 * 1024 * 1024) };

    const response = await call("PUT", `/${project.id}`, saveBody(project, { editorState: huge }));

    expect(response.status).toBe(422);
    expect(response.body.issues[0].path).toEqual(["editorState"]);
  });

  it("answers 413 as JSON for a body over the size limit", async () => {
    const project = await createProject();

    const response = await call("PUT", `/${project.id}`, saveBody(project, { editorState: { blob: "A".repeat(6 * 1024 * 1024) } }));

    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/too large/);
  });

  it("answers 400 as JSON, without a stack trace, for malformed JSON", async () => {
    const project = await createProject();

    const response = await fetch(`${base}/${project.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(text).not.toMatch(/at .*\.(js|ts):\d+/);
    expect(text).not.toContain("node_modules");
  });
});

describe("versions", () => {
  async function savedProject(): Promise<Json> {
    const project = await createProject();
    return (await call("PUT", `/${project.id}`, saveBody(project))).body.project as Json;
  }

  it("refuses a version of a project that cannot be rendered, and explains why", async () => {
    const project = await createProject();

    const response = await call("POST", `/${project.id}/versions`, {});

    expect(response.status).toBe(422);
    expect(response.body.issues.map((issue: Json) => issue.code)).toEqual(["VISUAL_TRACK_EMPTY"]);
    expect((await call("GET", `/${project.id}/versions`)).body.versions).toEqual([]);
  });

  it("refuses a version when a clip's asset is not in the project", async () => {
    const project = await createProject();
    await call("PUT", `/${project.id}`, saveBody(project, { assets: [assets[0]] }));

    const response = await call("POST", `/${project.id}/versions`);

    expect(response.status).toBe(422);
    expect(response.body.issues.map((issue: Json) => issue.code)).toContain("ASSET_NOT_FOUND");
  });

  it("refuses a version of a revision the caller is no longer looking at", async () => {
    const project = await savedProject();

    const response = await call("POST", `/${project.id}/versions`, { expectedRevision: project.revision - 1 });

    expect(response.status).toBe(409);
    expect(response.body.currentRevision).toBe(project.revision);
  });

  it("lists versions newest first, without their full contents", async () => {
    const project = await savedProject();
    await call("POST", `/${project.id}/versions`, { label: "one" });
    await call("POST", `/${project.id}/versions`, { label: "two" });

    const { body } = await call("GET", `/${project.id}/versions`);

    expect(body.versions.map((version: Json) => [version.versionNumber, version.label])).toEqual([
      [2, "two"],
      [1, "one"],
    ]);
    expect(body.versions[0]).not.toHaveProperty("composition");
  });

  it("offers no way to change or delete a version", async () => {
    const project = await savedProject();
    const { body } = await call("POST", `/${project.id}/versions`);
    const path = `/${project.id}/versions/${body.version.id}`;

    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect((await call(method, path, { label: "changed" })).status).toBe(404);
    }
    expect((await call("GET", path)).body.version.label).toBeNull();
  });

  it("answers 404 for a version of another project", async () => {
    const [a, b] = [await savedProject(), await savedProject()];
    const { body } = await call("POST", `/${a.id}/versions`);

    expect((await call("GET", `/${b.id}/versions/${body.version.id}`)).status).toBe(404);
    expect((await call("GET", `/${a.id}/versions/does-not-exist`)).status).toBe(404);
  });
});

describe("without a database", () => {
  it("answers 503 with an explanation on every route", async () => {
    const [offline, url] = await listen(createProjectsRouter(null));
    try {
      for (const [method, path] of [["GET", ""], ["POST", ""], ["GET", "/abc"], ["PUT", "/abc"]] as const) {
        const response = await fetch(`${url}${path}`, { method });
        expect(response.status).toBe(503);
        expect(((await response.json()) as Json).error).toContain("DATABASE_URL");
      }
    } finally {
      await new Promise<void>((resolve) => offline.close(() => resolve()));
    }
  });
});
