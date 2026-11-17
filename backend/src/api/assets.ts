import express, { type Request, type Response, type Router } from "express";
import { ID_PATTERN } from "../domain/composition/index.js";
import type { AssetService, IngestOutcome } from "../assets/service.js";
import type { DerivativeKind } from "../persistence/assetRepository.js";
import { jsonErrors, jsonNotFound } from "./errors.js";

// Asset ingestion API (M5), mounted at /api/projects/:projectId/assets.
//
//   GET    /                       list the project's uploaded assets
//   POST   /                       upload: raw file body; display name in the
//                                  `X-File-Name` header (URI-encoded). Returns 201.
//   GET    /:assetId               one asset with its derivative states
//   POST   /:assetId/derivatives   (re)generate thumbnail and proxy; 202
//   GET    /:assetId/thumbnail     the JPEG, once ready
//   GET    /:assetId/proxy         the editing proxy MP4, once ready
//   DELETE /:assetId
//
// There is deliberately no route that serves an original: originals are for
// rendering only (invariant 8).

export function createAssetsRouter(service: AssetService | null): Router {
  const router = express.Router({ mergeParams: true });

  if (!service) {
    router.use((_req, res) => {
      res.status(503).json({
        error: "Project storage is not configured on this server. Set DATABASE_URL and restart the backend.",
      });
    });
    return router;
  }

  const ids = (req: Request, res: Response, withAsset: boolean): [string, string] | null => {
    const projectId = String(req.params.projectId ?? "");
    const assetId = withAsset ? String(req.params.assetId ?? "") : "";
    if (!ID_PATTERN.test(projectId) || (withAsset && !ID_PATTERN.test(assetId))) {
      res.status(404).json({ error: "Not found." });
      return null;
    }
    return [projectId, assetId];
  };

  const sendFailure = <T>(res: Response, outcome: IngestOutcome<T>): outcome is Extract<IngestOutcome<T>, { ok: false }> => {
    if (outcome.ok) return false;
    switch (outcome.error.kind) {
      case "project-not-found":
        res.status(404).json({ error: "This project does not exist." });
        break;
      case "not-found":
        res.status(404).json({ error: "This asset does not exist." });
        break;
      case "too-large":
        res.status(413).json({ error: "This file is too large." });
        break;
      case "empty":
        res.status(400).json({ error: "The uploaded file is empty." });
        break;
      case "unsupported":
        res.status(415).json({ error: "This file is not an image, video, or audio file Knarra can read." });
        break;
    }
    return true;
  };

  router.get("/", async (req, res) => {
    const found = ids(req, res, false);
    if (!found) return;
    res.json({ assets: await service.list(found[0]) });
  });

  router.post("/", async (req, res) => {
    const found = ids(req, res, false);
    if (!found) return;
    // Refuse a declared oversize body before reading it. The rest of the body
    // is read and discarded so the client receives the answer instead of a
    // reset connection.
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > service.maxBytes) {
      res.status(413).json({ error: "This file is too large." });
      req.resume();
      return;
    }

    let name: string | undefined;
    try {
      const header = req.headers["x-file-name"];
      name = typeof header === "string" ? decodeURIComponent(header) : undefined;
    } catch {
      name = undefined;
    }

    const outcome = await service.ingest(found[0], req, name);
    if (sendFailure(res, outcome)) return;

    // Derived files are made in the background; the client polls the asset.
    void service.generateDerivatives(found[0], outcome.value.id).catch((error: unknown) => {
      console.error("Derivative generation failed", error);
    });
    res.status(201).json({ asset: outcome.value });
  });

  router.get("/:assetId", async (req, res) => {
    const found = ids(req, res, true);
    if (!found) return;
    const outcome = await service.get(...found);
    if (sendFailure(res, outcome)) return;
    res.json({ asset: outcome.value });
  });

  router.post("/:assetId/derivatives", async (req, res) => {
    const found = ids(req, res, true);
    if (!found) return;
    const outcome = await service.get(...found);
    if (sendFailure(res, outcome)) return;
    void service.generateDerivatives(...found).catch((error: unknown) => {
      console.error("Derivative generation failed", error);
    });
    res.status(202).json({ asset: outcome.value });
  });

  const serveDerived = (kind: DerivativeKind, contentType: string) => async (req: Request, res: Response) => {
    const found = ids(req, res, true);
    if (!found) return;
    const path = await service.derivedFile(found[0], found[1], kind);
    if (!path) {
      res.status(404).json({ error: `This asset has no ${kind} yet.` });
      return;
    }
    res.type(contentType);
    res.sendFile(path, { dotfiles: "deny", headers: { "Cache-Control": "private, max-age=60" } }, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: `This asset has no ${kind} yet.` });
    });
  };

  router.get("/:assetId/thumbnail", serveDerived("thumbnail", "image/jpeg"));
  router.get("/:assetId/proxy", serveDerived("proxy", "video/mp4"));

  router.delete("/:assetId", async (req, res) => {
    const found = ids(req, res, true);
    if (!found) return;
    const outcome = await service.remove(...found);
    if (sendFailure(res, outcome)) return;
    res.status(204).end();
  });

  router.use(jsonNotFound);
  router.use(jsonErrors);
  return router;
}
