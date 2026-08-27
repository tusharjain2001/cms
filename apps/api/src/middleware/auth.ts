import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { User, type UserDoc } from "../models/user.js";
import { Project, type ProjectDoc } from "../models/project.js";
import { Page, type PageDoc } from "../models/page.js";
import { forbidden, notFound, unauthorized } from "../lib/respond.js";
import { verifyAccessToken } from "../lib/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserDoc;
      project?: ProjectDoc;
      page?: PageDoc;
    }
  }
}

/** True when this user may touch this project. Admins may touch every one. */
function userCanAccessProject(user: UserDoc, projectId: string): boolean {
  if (user.role === "admin") return true;
  return user.projectIds.some((pid) => pid.toString() === projectId);
}

/** Requires a valid access token in `Authorization: Bearer …`. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw unauthorized();

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw unauthorized("Your session has expired. Please sign in again.");
    }

    const user = await User.findById(claims.sub);
    if (!user) throw unauthorized();

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Developer-only routes (project creation, settings, keys). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "admin") {
    return next(forbidden("Only your web developer can change this."));
  }
  next();
}

/**
 * Loads `:projectId` and checks the signed-in user may touch it.
 * Admins see every project; clients only the ones assigned to them.
 */
export async function requireProjectAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw unauthorized();

    const id = req.params.projectId ?? req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) throw notFound("That website does not exist.");

    const project = await Project.findById(id);
    if (!project) throw notFound("That website does not exist.");

    if (!userCanAccessProject(req.user, id)) {
      throw forbidden("You do not have access to that website.");
    }

    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Loads `:pageId` along with the website it belongs to, and checks access via
 * that website. Every page and section route hangs off this.
 */
export async function requirePageAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw unauthorized();

    const pageId = req.params.pageId;
    if (!pageId || !Types.ObjectId.isValid(pageId)) throw notFound("That page does not exist.");

    const page = await Page.findById(pageId);
    if (!page) throw notFound("That page does not exist.");

    const project = await Project.findById(page.projectId);
    if (!project) throw notFound("That page does not exist.");

    if (!userCanAccessProject(req.user, project._id.toString())) {
      throw forbidden("You do not have access to that page.");
    }

    req.page = page;
    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
}
