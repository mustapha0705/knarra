import type { ErrorRequestHandler, RequestHandler } from "express";

/** Answers any request no route matched, as JSON instead of an HTML page. */
export const jsonNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found." });
};

/**
 * The last handler of an API router. Turns errors raised by body parsers and
 * route handlers into small JSON responses.
 *
 * Without it Express answers with an HTML page that, outside production,
 * includes a stack trace with server file paths.
 */
export const jsonErrors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = statusOf(error);
  if (status === 413) {
    res.status(413).json({ error: "The request is too large." });
  } else if (status !== null && status >= 400 && status < 500) {
    res.status(400).json({ error: "The request could not be read. Send valid JSON." });
  } else {
    console.error("API error", error);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
};

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  if (typeof status === "number") return status;
  if (typeof statusCode === "number") return statusCode;
  return null;
}
