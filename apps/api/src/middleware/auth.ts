import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { User, type UserDoc } from "../models/user.js";
import { Project, type ProjectDoc } from "../models/project.js";
import { Page, type PageDoc } from "../models/page.js";
import {
  ProjectToken,
  type ProjectTokenDoc,
  hashToken,
  looksLikeProjectToken,
} from "../models/project-token.js";
import { forbidden, notFound, unauthorized } from "../lib/respond.js";
import { verifyAccessToken } from "../lib/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserDoc;
      project?: ProjectDoc;
      page?: PageDoc;
      /**
       * Set instead of `user` when the caller authenticated with a write-scoped
       * project token rather than a signed-in account. It grants content
       * authoring on exactly `projectToken.projectId` and nothing else — never
       * a website's settings, and never any other website.
       */
      projectToken?: ProjectTokenDoc;
    }
  }
}

/** The project a token-authenticated request is confined to, or null. */
const tokenProjectId = (req: Request): string | null =>
  req.projectToken ? req.projectToken.projectId.toString() : null;

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
 * Authenticates a *content-authoring* request as EITHER a signed-in account
 * (Bearer access token, sets `req.user`) OR a write-scoped project token
 * (`pwt_…`, sets `req.projectToken`). Use this in place of `requireAuth` on the
 * routes a client's developer must be able to reach — pages, sections, publish,
 * media — so they can be handed one website without an account.
 *
 * The token is accepted either as `Authorization: Bearer pwt_…` (what the MCP
 * sends) or an `x-project-token` header. Owner-only routes deliberately keep
 * plain `requireAuth`, so a token can never reach a website's settings.
 */
export async function requireActor(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const xToken = (req.header("x-project-token") ?? "").trim();
    const rawToken = looksLikeProjectToken(bearer) ? bearer : xToken || "";

    if (rawToken) {
      const token = await ProjectToken.findOne({ tokenHash: hashToken(rawToken) });
      if (!token) throw unauthorized("That project token is not valid.");
      req.projectToken = token;
      // Record use, but not on every request — a coarse timestamp is plenty and
      // saves a write per call. Fire-and-forget; never blocks the request.
      const last = token.lastUsedAt?.getTime() ?? 0;
      if (Date.now() - last > 60_000) {
        void ProjectToken.updateOne({ _id: token._id }, { $set: { lastUsedAt: new Date() } }).catch(
          () => {}
        );
      }
      return next();
    }

    // No project token — fall back to account auth.
    return requireAuth(req, _res, next);
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

/** Loads `:projectId` and checks the caller (account OR project token) may touch it. */
export async function requireProjectAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    const id = req.params.projectId ?? req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) throw notFound("That website does not exist.");

    // A project token is confined to its own website, full stop.
    const scoped = tokenProjectId(req);
    if (scoped) {
      if (scoped !== id) throw forbidden("This token is for a different website.");
      const project = await Project.findById(id);
      if (!project) throw notFound("That website does not exist.");
      req.project = project;
      return next();
    }

    if (!req.user) throw unauthorized();
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
    const pageId = req.params.pageId;
    if (!pageId || !Types.ObjectId.isValid(pageId)) throw notFound("That page does not exist.");

    const page = await Page.findById(pageId);
    if (!page) throw notFound("That page does not exist.");

    const project = await Project.findById(page.projectId);
    if (!project) throw notFound("That page does not exist.");

    const scoped = tokenProjectId(req);
    if (scoped) {
      if (scoped !== project._id.toString()) throw forbidden("This token is for a different website.");
      req.page = page;
      req.project = project;
      return next();
    }

    if (!req.user) throw unauthorized();
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
