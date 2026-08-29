import { Router, raw } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { Media, toMediaDTO } from "../models/media.js";
import { Project } from "../models/project.js";
import { requireActor, requireProjectAccess } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { assertStorageAllows } from "../lib/plan.js";
import { badRequest, forbidden, notFound, ok } from "../lib/respond.js";
import {
  createUploadTicket,
  destroyObject,
  hashBytes,
  objectKey,
  publicUrl,
  putObject,
  r2Configured,
} from "../lib/r2.js";

const router = Router();

const NOT_SET_UP =
  "Photo uploads are not set up yet. Add your Cloudflare R2 keys to the API's .env file.";

/* ------------------------------------------------------------------ upload */

const signSchema = z.object({
  /** SHA-256 (hex) of the file, so the object key is content-addressed. */
  contentHash: z.string().regex(/^[a-f0-9]{8,64}$/i, "contentHash must be a hex digest"),
  contentType: z.string().min(1).max(120),
  resourceType: z.enum(["image", "raw"]).default("image"),
  ext: z.string().max(8).optional(),
});

/**
 * Hands the browser a one-shot presigned PUT so it uploads straight to R2.
 * The file never passes through this API, which keeps big phone photos off
 * the server entirely. The object key is `<projectId>/<contentHash>`, so one
 * client's upload can never land in another's prefix.
 */
router.post(
  "/projects/:projectId/media/sign",
  requireActor,
  requireProjectAccess,
  validateBody(signSchema),
  async (req, res, next) => {
    try {
      if (!r2Configured()) throw badRequest(NOT_SET_UP);
      // Size is unknown before a presigned PUT, so this only refuses once the
      // website is already at its storage ceiling — register (below) does the
      // exact check with the real byte count.
      await assertStorageAllows(req.project!, 0);
      const { contentHash, contentType, ext } = req.body as z.infer<typeof signSchema>;
      const ticket = await createUploadTicket({
        projectId: req.project!._id.toString(),
        contentHash,
        contentType,
        ext,
      });
      return ok(res, ticket);
    } catch (err) {
      next(err);
    }
  }
);

/* ---------------------------------------------------- proxy upload fallback */

/**
 * The most a client may push through this server in one request.
 *
 * Deliberately smaller than what direct-to-R2 tolerates: these bytes occupy an
 * Express worker and the box's memory for the whole upload, which the presigned
 * path never does.
 *
 * NOTE FOR DEPLOYS: nginx caps the request body independently. `client_max_body_size`
 * on the API server block must be at least this, or nginx returns its own HTML
 * 413 and the friendly JSON error below is never reached.
 */
export const MAX_PROXY_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * What may be stored. An allowlist rather than a blocklist: anything not named
 * here is refused, so a new dangerous type is safe by default.
 *
 * `text/html` and every JavaScript spelling are absent on purpose. Media is
 * served from the CDN domain under this project's own prefix, and a stored HTML
 * or JS file there is a script someone else's browser will run.
 */
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "application/pdf",
]);

const uploadQuerySchema = z.object({
  resourceType: z.enum(["image", "raw"]).default("image"),
  ext: z.string().max(8).optional(),
  originalName: z.string().max(300).default(""),
  width: z.coerce.number().int().nonnegative().max(100_000).default(0),
  height: z.coerce.number().int().nonnegative().max(100_000).default(0),
});

/**
 * Uploads a file *through* the API instead of straight to R2.
 *
 * This is the fallback for the presigned PUT, which cannot work until the R2
 * bucket carries a CORS rule (see the long note on `putObject`). The dashboard
 * tries direct-to-R2 first and only lands here when that fails, so the good path
 * stays the default and this costs nothing when the bucket is configured.
 *
 * Two things make it safe to accept raw bytes from a signed-in client:
 *
 *  - The object key is derived from a hash **this server computes over the bytes
 *    it received**, never from a hash the client supplied. A client cannot aim
 *    the write at a key of its choosing.
 *  - The key is prefixed with `req.project._id`, resolved by `requireProjectAccess`
 *    from the URL — so the write lands in the caller's own tenant prefix by
 *    construction, not by trusting anything in the request body.
 */
router.post(
  "/projects/:projectId/media/upload",
  requireActor,
  requireProjectAccess,
  raw({ type: "*/*", limit: MAX_PROXY_UPLOAD_BYTES }),
  async (req, res, next) => {
    try {
      if (!r2Configured()) throw badRequest(NOT_SET_UP);

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw badRequest("That upload arrived empty. Please try the file again.");
      }

      const contentType = (req.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
        throw badRequest(`Files of type "${contentType || "unknown"}" cannot be uploaded.`);
      }

      const parsed = uploadQuerySchema.safeParse(req.query);
      if (!parsed.success) throw badRequest("That upload's details were not valid.");
      const meta = parsed.data;

      // We have the real bytes in hand and have not written anything yet, so
      // this is the clean place to enforce the storage quota with no orphan.
      await assertStorageAllows(req.project!, body.length);

      const projectId = req.project!._id.toString();
      // Hashed here, from the bytes actually received — the client's claim about
      // its own file is never what decides where the object lands.
      const key = objectKey(projectId, hashBytes(body), meta.ext);

      await putObject({ key, body, contentType });

      // Same idempotency as the direct path: a retried upload of identical bytes
      // resolves to the identical key, so it must return the existing row rather
      // than duplicate the library entry.
      const existing = await Media.findOne({ projectId: req.project!._id, publicId: key });
      if (existing) return ok(res, toMediaDTO(existing));

      const created = await Media.create({
        projectId: req.project!._id,
        publicId: key,
        url: publicUrl(key),
        resourceType: meta.resourceType,
        format: meta.ext ?? "",
        width: meta.width,
        height: meta.height,
        bytes: body.length,
        originalName: meta.originalName,
      });
      return ok(res, toMediaDTO(created), 201);
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
 * Called after R2 accepts the upload, to put the file in this project's
 * library. The object key is checked against the project so a tampered request
 * cannot register someone else's asset.
 */
router.post(
  "/projects/:projectId/media",
  requireActor,
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

      // The object is already in R2 (the browser PUT it via the presigned
      // ticket). If registering it would exceed the storage quota, remove the
      // object so a rejected upload leaves nothing behind, then refuse.
      try {
        await assertStorageAllows(req.project!, body.bytes);
      } catch (quotaErr) {
        await destroyObject(body.publicId).catch(() => {});
        throw quotaErr;
      }

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
  requireActor,
  requireProjectAccess,
  async (req, res, next) => {
    try {
      const items = await Media.find({ projectId: req.project!._id }).sort({ createdAt: -1 });
      return ok(res, {
        items: items.map(toMediaDTO),
        uploadsEnabled: r2Configured(),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Loads `:mediaId` and checks the caller (account OR project token) may touch it. */
async function loadMedia(req: Parameters<typeof requireActor>[0]) {
  const id = req.params.mediaId;
  if (!id || !Types.ObjectId.isValid(id)) throw notFound("That file is not in your library.");

  const item = await Media.findById(id);
  if (!item) throw notFound("That file is not in your library.");

  const project = await Project.findById(item.projectId);
  if (!project) throw notFound("That file is not in your library.");

  // A project token may only touch files on its own website.
  if (req.projectToken) {
    if (req.projectToken.projectId.toString() !== project._id.toString()) {
      throw forbidden("This token is for a different website.");
    }
    return item;
  }

  // Otherwise access follows the website the file belongs to — owning it, or
  // having been added to it. A media id from another account must not resolve.
  const user = req.user!;
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
  requireActor,
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

router.delete("/media/:mediaId", requireActor, async (req, res, next) => {
  try {
    const item = await loadMedia(req);
    const removed = await destroyObject(item.publicId);
    await item.deleteOne();
    return ok(res, {
      deleted: true,
      // Honest about the case where R2 did not confirm the delete.
      removedFromStorage: removed,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
