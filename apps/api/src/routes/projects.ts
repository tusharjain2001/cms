import { Router } from "express";
import { z } from "zod";
import { isKnownSectionType, sectionTypeNames } from "@pagecraft/shared";
import { Project, describeProject, describeProjects, newApiKey } from "../models/project.js";
import { User } from "../models/user.js";
import { Page } from "../models/page.js";
import { Media } from "../models/media.js";
import { Usage } from "../models/usage.js";
import {
  ProjectToken,
  newProjectTokenSecret,
  toProjectTokenDTO,
} from "../models/project-token.js";
import {
  requireActor,
  requireAuth,
  requireProjectAccess,
  requireProjectOwner,
  requireVerified,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { assertCanCreateProject, computeQuotaUsage } from "../lib/plan.js";
import { destroyObject } from "../lib/r2.js";
import { badRequest, conflict, ok } from "../lib/respond.js";

/**
 * Auth is attached per route rather than with a blanket `router.use`, because a
 * website's developer must be able to *read* their one website with a
 * write-scoped project token (`requireActor`), while everything that changes
 * settings, mints tokens or deletes the website stays account-and-owner only.
 */
const router = Router();

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const sectionTypeList = z
  .array(z.string())
  .refine((types) => types.every(isKnownSectionType), {
    message: "That list contains a section type this CMS does not know about.",
  });

const createSchema = z.object({
  name: z.string().min(1, "Give the website a name.").max(120),
  slug: z.string().max(80).optional(),
  domain: z.string().max(200).default(""),
  allowedSectionTypes: sectionTypeList.optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  domain: z.string().max(200).optional(),
  revalidateUrl: z.string().url("Enter a full https:// address.").or(z.literal("")).optional(),
  revalidateSecret: z.string().max(200).optional(),
  allowedSectionTypes: sectionTypeList.optional(),
});

/**
 * The websites this account owns, plus any it has been invited to — and
 * nothing else. Every account is its own world; the platform admin (whoever
 * runs this instance) is the one exception.
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const filter = user.isPlatformAdmin
      ? {}
      : { $or: [{ ownerId: user._id }, { _id: { $in: user.projectIds } }] };

    const projects = await Project.find(filter).sort({ createdAt: -1 });
    return ok(res, await describeProjects(projects, user));
  } catch (err) {
    next(err);
  }
});

/** Anyone with a confirmed account may create a website, up to their plan's limit. */
router.post("/", requireAuth, requireVerified, validateBody(createSchema), async (req, res, next) => {
  try {
    const user = req.user!;
    const body = req.body as z.infer<typeof createSchema>;
    const slug = slugify(body.slug || body.name);
    if (!slug) throw badRequest("That name cannot be turned into a web address.");

    // Checked here so the message names the website rather than the index.
    if (await Project.exists({ ownerId: user._id, slug })) {
      throw conflict("You already have a website with that address.");
    }

    await assertCanCreateProject(user);

    const project = await Project.create({
      ownerId: user._id,
      name: body.name,
      slug,
      domain: body.domain,
      apiKey: newApiKey(),
      allowedSectionTypes: body.allowedSectionTypes ?? sectionTypeNames(),
    });

    return ok(res, await describeProject(project, user), 201);
  } catch (err) {
    next(err);
  }
});

/** Readable by the owner/editors OR by a write-scoped token for this website. */
router.get("/:projectId", requireActor, requireProjectAccess, async (req, res, next) => {
  try {
    return ok(res, await describeProject(req.project!, req.user ?? null));
  } catch (err) {
    next(err);
  }
});

/** This website's usage against its plan — for the dashboard's quota display. */
router.get("/:projectId/usage", requireActor, requireProjectAccess, async (req, res, next) => {
  try {
    return ok(res, await computeQuotaUsage(req.project!));
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:projectId",
  requireAuth,
  requireProjectAccess,
  requireProjectOwner,
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      const project = req.project!;
      Object.assign(project, req.body as z.infer<typeof updateSchema>);
      await project.save();
      return ok(res, await describeProject(project, req.user!));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Deleting a website takes everything that belongs to it with it — pages, media
 * (both the R2 objects and their library rows), write tokens, and the usage
 * meter — so nothing is left orphaned in the database or in storage.
 */
router.delete("/:projectId", requireAuth, requireProjectAccess, requireProjectOwner, async (req, res, next) => {
  try {
    const project = req.project!;
    const projectId = project._id;

    // Remove the stored objects first (best-effort — a failed R2 delete must not
    // strand the whole cascade; the edge cache expires on its own anyway).
    const media = await Media.find({ projectId }).select("publicId");
    await Promise.all(media.map((m) => destroyObject(m.publicId).catch(() => {})));

    await Media.deleteMany({ projectId });
    await Page.deleteMany({ projectId });
    await ProjectToken.deleteMany({ projectId });
    await Usage.deleteMany({ projectId });
    await project.deleteOne();

    // Leave no dangling access on client accounts.
    await User.updateMany({ projectIds: projectId }, { $pull: { projectIds: projectId } });

    return ok(res, { deleted: true, mediaRemoved: media.length });
  } catch (err) {
    next(err);
  }
});

/** Old key keeps working until the client site is redeployed with the new one. */
router.post(
  "/:projectId/rotate-key",
  requireAuth,
  requireProjectAccess,
  requireProjectOwner,
  async (req, res, next) => {
    try {
      const project = req.project!;
      project.apiKey = newApiKey();
      await project.save();
      return ok(res, await describeProject(project, req.user!));
    } catch (err) {
      next(err);
    }
  }
);

/* --------------------------------------------------- write-scoped API tokens */

/** The tokens minted for this website (summaries only — never the secrets). */
router.get(
  "/:projectId/tokens",
  requireAuth,
  requireProjectAccess,
  requireProjectOwner,
  async (req, res, next) => {
    try {
      const tokens = await ProjectToken.find({ projectId: req.project!._id }).sort({ createdAt: -1 });
      return ok(res, tokens.map(toProjectTokenDTO));
    } catch (err) {
      next(err);
    }
  }
);

const mintSchema = z.object({ label: z.string().min(1, "Give the token a name.").max(80) });

/**
 * Mint a write-scoped token for this website. The raw secret is returned once,
 * here, and never again — the owner copies it now or mints a new one.
 */
router.post(
  "/:projectId/tokens",
  requireAuth,
  requireProjectAccess,
  requireProjectOwner,
  validateBody(mintSchema),
  async (req, res, next) => {
    try {
      const { label } = req.body as z.infer<typeof mintSchema>;
      const secret = newProjectTokenSecret();
      const doc = await ProjectToken.create({
        projectId: req.project!._id,
        label,
        tokenHash: secret.tokenHash,
        prefix: secret.prefix,
        createdByUserId: req.user!._id,
      });
      // `token` is the only time the full secret ever leaves the server.
      return ok(res, { token: secret.raw, ...toProjectTokenDTO(doc) }, 201);
    } catch (err) {
      next(err);
    }
  }
);

/** Revoke a token — a hard delete, so a leaked token stops working at once. */
router.delete(
  "/:projectId/tokens/:tokenId",
  requireAuth,
  requireProjectAccess,
  requireProjectOwner,
  async (req, res, next) => {
    try {
      const result = await ProjectToken.deleteOne({
        _id: req.params.tokenId,
        projectId: req.project!._id,
      });
      if (result.deletedCount === 0) throw badRequest("That token does not exist on this website.");
      return ok(res, { revoked: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
