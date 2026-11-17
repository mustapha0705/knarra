import express, { type Request, type Response, type Router } from "express";
import { ID_PATTERN } from "../domain/composition/index.js";
import type { Outcome, ProjectService } from "../projects/service.js";
import { jsonErrors, jsonNotFound } from "./errors.js";

// Project persistence API (M4).
//
//   GET    /                                list projects
//   POST   /                  { title }     create a project
//   GET    /:projectId                      open a project
//   PUT    /:projectId        { expectedRevision, title, composition, editorState, assets }
//   DELETE /:projectId
//   GET    /:projectId/versions
//   POST   /:projectId/versions { expectedRevision?, label? }
//   GET    /:projectId/versions/:versionId
//
// A save names the revision it was based on. If the project has changed since,
// the save is refused with 409 and the current revision, and nothing is written.

/**
 * `service` is null when no database is configured; every route then answers
 * 503 with an explanation instead of the server failing to start.
 */
export function createProjectsRouter(service: ProjectService | null): Router {
  const router = express.Router();

  if (!service) {
    router.use((_req, res) => {
      res.status(503).json({
        error: "Project storage is not configured on this server. Set DATABASE_URL and restart the backend.",
      });
    });
    return router;
  }

  router.use(express.json({ limit: "5mb" }));

  /** Sends the standard response for a failed outcome. Returns true if it did. */
  const sendFailure = <T>(res: Response, outcome: Outcome<T>): outcome is Extract<Outcome<T>, { ok: false }> => {
    if (outcome.ok) return false;
    const { error } = outcome;
    switch (error.kind) {
      case "invalid":
        res.status(422).json({
          error: "This request is not valid.",
          issues: error.issues.map(({ code, path, message }) => ({ code, path, message })),
        });
        break;
      case "not-found":
        res.status(404).json({ error: "This project does not exist." });
        break;
      case "stale":
        res.status(409).json({
          error: "This project was changed somewhere else after you opened it. Reload it before saving again.",
          currentRevision: error.currentRevision,
        });
        break;
      case "corrupt":
        console.error("Stored project data could not be read");
        res.status(500).json({ error: "This project could not be read." });
        break;
    }
    return true;
  };

  /** Reads an ID from the URL; answers 404 for anything that is not an ID. */
  const idParam = (req: Request, res: Response, name: string): string | null => {
    const value = String(req.params[name] ?? "");
    if (!ID_PATTERN.test(value)) {
      res.status(404).json({ error: "This project does not exist." });
      return null;
    }
    return value;
  };

  router.get("/", async (_req, res) => {
    res.json({ projects: await service.list() });
  });

  router.post("/", async (req, res) => {
    const outcome = await service.create(req.body);
    if (sendFailure(res, outcome)) return;
    res.status(201).json({ project: outcome.value });
  });

  router.get("/:projectId", async (req, res) => {
    const id = idParam(req, res, "projectId");
    if (!id) return;
    const outcome = await service.get(id);
    if (sendFailure(res, outcome)) return;
    res.json({ project: outcome.value });
  });

  router.put("/:projectId", async (req, res) => {
    const id = idParam(req, res, "projectId");
    if (!id) return;
    const outcome = await service.save(id, req.body);
    if (sendFailure(res, outcome)) return;
    res.json({ project: outcome.value });
  });

  router.delete("/:projectId", async (req, res) => {
    const id = idParam(req, res, "projectId");
    if (!id) return;
    const outcome = await service.delete(id);
    if (sendFailure(res, outcome)) return;
    res.status(204).end();
  });

  router.get("/:projectId/versions", async (req, res) => {
    const id = idParam(req, res, "projectId");
    if (!id) return;
    const outcome = await service.listVersions(id);
    if (sendFailure(res, outcome)) return;
    res.json({ versions: outcome.value });
  });

  router.post("/:projectId/versions", async (req, res) => {
    const id = idParam(req, res, "projectId");
    if (!id) return;
    const outcome = await service.createVersion(id, req.body);
    if (sendFailure(res, outcome)) return;
    res.status(201).json({ version: outcome.value });
  });

  router.get("/:projectId/versions/:versionId", async (req, res) => {
    const id = idParam(req, res, "projectId");
    const versionId = id ? idParam(req, res, "versionId") : null;
    if (!id || !versionId) return;
    const outcome = await service.getVersion(id, versionId);
    if (sendFailure(res, outcome)) return;
    res.json({ version: outcome.value });
  });

  router.use(jsonNotFound);
  router.use(jsonErrors);
  return router;
}
