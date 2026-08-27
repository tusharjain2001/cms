import type { NextFunction, Request, Response } from "express";
import { Project } from "../models/project.js";
import { unauthorized } from "../lib/respond.js";

/**
 * Authenticates a client website by its public, read-only key.
 *
 * The key grants nothing but published content for one project, so it is safe
 * to ship in a site's environment (and, for a plain React SPA, safe enough in
 * the browser bundle).
 */
export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("x-api-key");
    const query = typeof req.query.key === "string" ? req.query.key : undefined;
    const key = (header ?? query ?? "").trim();

    if (!key) throw unauthorized("Missing API key.");

    const project = await Project.findOne({ apiKey: key });
    if (!project) throw unauthorized("That API key is not valid.");

    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
}
