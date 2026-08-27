import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { Media, toMediaDTO } from "../models/media.js";
import { Project } from "../models/project.js";
import { requireAuth, requireProjectAccess } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { badRequest, forbidden, notFound, ok } from "../lib/respond.js";
import {
  cloudinaryConfigured,
  createUploadTicket,
  destroyAsset,
} from "../lib/cloudinary.js";

const router = Router();

const NOT_SET_UP =
  "Photo uploads are not set up yet. Add your Cloudinary keys to the API's .env file.";

/* ------------------------------------------------------------------ upload */

const signSchema = z.object({
  resourceType: z.enum(["image", "raw"]).default("image"),
});

/**
 * Hands the browser a one-shot permit to upload straight to Cloudinary.
 * The file never passes through this API, which keeps big phone photos off
 * the server entirely.
 */
router.post(
  "/projects/:projectId/media/sign",
  requireAuth,
  requireProjectAccess,
  validateBody(signSchema),
  (req, res, next) => {
    try {
      if (!cloudinaryConfigured()) throw badRequest(NOT_SET_UP);
      const { resourceType } = req.body as z.infer<typeof signSchema>;
      return ok(res, createUploadTicket(req.project!._id.toString(), resourceType));
    } catch (err) {
      next(err);
    }
  }
);

const registerSchema = z.object({
  publicId: z.string().min(1),
  url: z.string().url(),
  resourceType: z.enum(["image", "raw"]).default("image"),
  format: z.string().max(20).default(""),
  width: z.number().int().nonnegative().default(0),
  height: z.number().int().nonnegative().default(0),
  bytes: z.number().int().nonnegative().default(0),
  originalName: z.string().max(300).default(""),
});

/**
 * Called after Cloudinary accepts the upload, to put the file in this
 * project's library. The folder is checked against the project so a tampered
 * request cannot register someone else's asset.
 */
router.post(
  "/projects/:projectId/media",
  requireAuth,
  requireProjectAccess,
  validateBody(registerSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof registerSchema>;
      const projectId = req.project!._id.toString();

      if (!body.publicId.includes(`/${projectId}/`) && !body.publicId.startsWith(`${projectId}/`)) {
        throw forbidden("That upload does not belong to this website.");
      }

      const existing = await Media.findOne({ projectId: req.project!._id, publicId: body.publicId });
      if (existing) return ok(res, toMediaDTO(existing));

      const created = await Media.create({ ...body, projectId: req.project!._id });
      return ok(res, toMediaDTO(created), 201);
    } catch (err) {
      next(err);
    }
  }
);

/* ----------------------------------------------------------------- library */

router.get(
  "/projects/:projectId/media",
  requireAuth,
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const items = await Media.find({ projectId: req.project!._id }).sort({ createdAt: -1 });
      return ok(res, {
        items: items.map(toMediaDTO),
        uploadsEnabled: cloudinaryConfigured(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Loads `:mediaId` and checks the caller may touch the project that owns it. */
async function loadMedia(req: Parameters<typeof requireAuth>[0]) {
  const id = req.params.mediaId;
  if (!id || !Types.ObjectId.isValid(id)) throw notFound("That file is not in your library.");

  const item = await Media.findById(id);
  if (!item) throw notFound("That file is not in your library.");

  // Access follows the website the file belongs to — owning it, or having been
  // added to it. A media id from another account's library must not resolve.
  const user = req.user!;
  const project = await Project.findById(item.projectId);
  if (!project) throw notFound("That file is not in your library.");

  const allowed =
    user.isPlatformAdmin ||
    project.ownerId.toString() === user._id.toString() ||
    user.projectIds.some((pid) => pid.toString() === project._id.toString());

  if (!allowed) throw forbidden("You do not have access to that file.");
  return item;
}

const altSchema = z.object({ alt: z.string().max(300) });

router.patch(
  "/media/:mediaId",
  requireAuth,
  validateBody(altSchema),
  async (req, res, next) => {
    try {
      const item = await loadMedia(req);
      item.alt = (req.body as z.infer<typeof altSchema>).alt;
      await item.save();
      return ok(res, toMediaDTO(item));
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/media/:mediaId", requireAuth, async (req, res, next) => {
  try {
    const item = await loadMedia(req);
    const removed = await destroyAsset(item.publicId, item.resourceType as "image" | "raw");
    await item.deleteOne();
    return ok(res, {
      deleted: true,
      // Honest about the case where Cloudinary did not confirm.
      removedFromStorage: removed,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
