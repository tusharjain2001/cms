import { Router, raw } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { Media, toMediaDTO } from "../models/media.js";
import { Project } from "../models/project.js";
import { requireAuth, requireProjectAccess } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { byUserId, rateLimit } from "../middleware/rate-limit.js";
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

/**
 * What may be stored, whichever way the bytes arrive.
 *
 * An allowlist rather than a blocklist: anything not named here is refused, so
 * a new dangerous type is safe by default. Both upload paths check it — the
 * presigned PUT commits to a `Content-Type` at signing time, so signing is
 * exactly where that decision has to be made.
 *
 * Absent on purpose:
 *
 *  - `text/html` and every JavaScript spelling. Media is served from the CDN
 *    domain under this project's own prefix, and a stored HTML or JS file there
 *    is a script someone else's browser will run.
 *  - `image/svg+xml`. An SVG *is* a document: it can carry `<script>` and
 *    foreign objects, and a browser navigating to one executes them on the
 *    media domain, same-origin with every other file there. It is only safe
 *    served with `Content-Disposition: attachment` or from a sandboxed origin,
 *    and R2 serves neither — so it stays out until the delivery side can.
 */
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
]);

/** Normalises a header or field value to a bare, comparable MIME type. */
function normaliseType(value: string): string {
  return value.split(";")[0]!.trim().toLowerCase();
}

function assertUploadable(contentType: string): void {
  if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
    throw badRequest(`Files of type "${contentType || "unknown"}" cannot be uploaded.`);
  }
}

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
 *
 * The presigned URL fixes the `Content-Type` the PUT must send, so this is the
 * only moment the type can be vetted — once the ticket is out, R2 accepts those
 * bytes with no further say from us. Hence the same allowlist as the proxy path.
 */
router.post(
  "/projects/:projectId/media/sign",
  requireAuth,
  requireProjectAccess,
  validateBody(signSchema),
  async (req, res, next) => {
    try {
      if (!r2Configured()) throw badRequest(NOT_SET_UP);
      const { contentHash, contentType, ext } = req.body as z.infer<typeof signSchema>;
      const type = normaliseType(contentType);
      assertUploadable(type);
      const ticket = await createUploadTicket({
        projectId: req.project!._id.toString(),
        contentHash,
        contentType: type,
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
 * How much a single account may push through this server, however many websites
 * it owns.
 *
 * Every other limiter here counts per method+path, which would be a hole on this
 * route: `:projectId` is in the path and an account can create projects freely,
 * so a per-path bucket would reset with each new website. Keyed on the account
 * instead, and mounted *after* `requireProjectAccess` but *before* the body
 * parser, so a refused caller never gets to spend 15MB of this box's memory.
 *
 * 60 files in 10 minutes is far above a person filling a media library and far
 * below anything that could be used to store or serve bulk data through us.
 */
const proxyUploadLimit = rateLimit({
  max: 60,
  windowMs: 10 * 60_000,
  scope: "media-proxy-upload",
  keyOn: byUserId,
  message: "That is a lot of uploads at once. Please wait a few minutes and try again.",
});

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
  requireAuth,
  requireProjectAccess,
  proxyUploadLimit,
  raw({ type: "*/*", limit: MAX_PROXY_UPLOAD_BYTES }),
  async (req, res, next) => {
    try {
      if (!r2Configured()) throw badRequest(NOT_SET_UP);

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw badRequest("That upload arrived empty. Please try the file again.");
      }

      const contentType = normaliseType(req.get("content-type") ?? "");
      assertUploadable(contentType);

      const parsed = uploadQuerySchema.safeParse(req.query);
      if (!parsed.success) throw badRequest("That upload's details were not valid.");
      const meta = parsed.data;

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
        uploadsEnabled: r2Configured(),
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
