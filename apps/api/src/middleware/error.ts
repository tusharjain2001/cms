import type { NextFunction, Request, Response } from "express";
import { HttpError, fail } from "../lib/respond.js";
import { isProd } from "../config/env.js";

export function notFoundHandler(_req: Request, res: Response) {
  return fail(res, 404, "No such endpoint.");
}

/** Turns anything thrown in a route into the standard error envelope. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    return fail(res, err.status, err.message, err.issues);
  }

  // Duplicate key — the only Mongo error worth translating for a human.
  if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
    const field = Object.keys((err as { keyPattern?: object }).keyPattern ?? {})[0] ?? "value";
    return fail(res, 409, `That ${field} is already taken.`);
  }

  console.error("Unhandled error:", err);
  return fail(res, 500, isProd ? "Something went wrong." : String(err));
}
