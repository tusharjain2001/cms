import { Router } from "express";
import { z } from "zod";
import { isKnownSectionType, sectionTypeNames } from "@pagecraft/shared";
import { Project, describeProject, describeProjects, newApiKey } from "../models/project.js";
import { User } from "../models/user.js";
import {
  requireAuth,
  requireProjectAccess,
  requireProjectOwner,
  requireVerified,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { badRequest, conflict, ok } from "../lib/respond.js";

const router = Router();
router.use(requireAuth);

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
router.get("/", async (req, res, next) => {
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

/** Anyone with a confirmed account may create a website; they own what they create. */
router.post("/", requireVerified, validateBody(createSchema), async (req, res, next) => {
  try {
    const user = req.user!;
    const body = req.body as z.infer<typeof createSchema>;
    const slug = slugify(body.slug || body.name);
    if (!slug) throw badRequest("That name cannot be turned into a web address.");

    // Checked here so the message names the website rather than the index.
    if (await Project.exists({ ownerId: user._id, slug })) {
      throw conflict("You already have a website with that address.");
    }

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

router.get("/:projectId", requireProjectAccess, async (req, res, next) => {
  try {
    return ok(res, await describeProject(req.project!, req.user!));
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:projectId",
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

router.delete("/:projectId", requireProjectAccess, requireProjectOwner, async (req, res, next) => {
  try {
    const project = req.project!;
    await project.deleteOne();
    // Leave no dangling access on client accounts.
    await User.updateMany({ projectIds: project._id }, { $pull: { projectIds: project._id } });
    return ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

/** Old key keeps working until the client site is redeployed with the new one. */
router.post(
  "/:projectId/rotate-key",
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

export default router;
