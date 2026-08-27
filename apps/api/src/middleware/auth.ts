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

/**
 * True when this user may open this website at all.
 *
 * Access is a relationship between one user and one website — owning it, or
 * having been added to it. It is never a property of the user alone, because
 * anyone can create an account and no account may see another's content. The
 * platform admin (whoever runs this instance) is the single exception.
 */
function userCanAccessProject(user: UserDoc, project: ProjectDoc): boolean {
  if (user.isPlatformAdmin) return true;
  if (project.ownerId.toString() === user._id.toString()) return true;
  return user.projectIds.some((pid) => pid.toString() === project._id.toString());
}

const userOwnsProject = (user: UserDoc, project: ProjectDoc): boolean =>
  user.isPlatformAdmin || project.ownerId.toString() === user._id.toString();

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

    // A token minted before the password changed is dead on arrival.
    if ((claims.sv ?? 0) !== user.sessionVersion) {
      throw unauthorized("Your password was changed. Please sign in again.");
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guards the settings a website's owner alone controls: its API key, revalidate
 * webhook, enabled section types, who else has access, and deleting it.
 *
 * Must run AFTER `requireProjectAccess`, which is what loads `req.project`.
 */
export function requireProjectOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !req.project) return next(unauthorized());
  if (!userOwnsProject(req.user, req.project)) {
    return next(forbidden("Only the owner of this website can change that."));
  }
  next();
}

/**
 * Blocks anything that creates or changes real content until the account's
 * email address has been confirmed. Signing in is already gated on this, so
 * this is defence in depth for tokens minted before the rule existed.
 */
export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.user.emailVerifiedAt) {
    return next(forbidden("Confirm your email address first — check your inbox."));
  }
  next();
}

/** Loads `:projectId` and checks the signed-in user may touch it. */
export async function requireProjectAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw unauthorized();

    const id = req.params.projectId ?? req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) throw notFound("That website does not exist.");

    const project = await Project.findById(id);
    if (!project) throw notFound("That website does not exist.");

    if (!userCanAccessProject(req.user, project)) {
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

    if (!userCanAccessProject(req.user, project)) {
      throw forbidden("You do not have access to that page.");
    }

    req.page = page;
    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
}
