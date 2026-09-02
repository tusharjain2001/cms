import { Router } from "express";
import { z } from "zod";
import {
  defaultContent,
  getSectionType,
  validateSectionContent,
  type SectionDTO,
  type ValidationIssue,
} from "@pagecraft/shared";
import {
  Page,
  draftSeoOf,
  newSectionId,
  setDraftSections,
  toPageDTO,
  toPageSummaryDTO,
  toSectionDTOs,
} from "../models/page.js";
import { requireActor, requirePageAccess, requireProjectAccess } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { assertCanAddPage } from "../lib/plan.js";
import { badRequest, conflict, notFound, ok } from "../lib/respond.js";
import { fireRevalidate } from "../lib/revalidate.js";
import { signPreviewToken } from "../lib/tokens.js";

const router = Router();

/**
 * NOTE: this router mounts at `/api`, because its routes span both
 * `/api/projects/:projectId/pages` and `/api/pages/:pageId`. That means a
 * blanket `router.use(requireAuth)` here would also guard every other `/api`
 * route that falls through to it — including the public, API-key-authenticated
 * content API. So auth is attached per route instead.
 */
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * The SEO block a client may edit.
 *
 * The maximums are deliberately a little past what Google will show (about 60
 * characters of title and 160 of description): the dashboard warns at the
 * ideal length, and refusing to *store* a slightly long title would mean
 * throwing away someone's work mid-sentence. `canonicalUrl` must be absolute
 * or empty — a relative canonical is silently ignored by every crawler, which
 * is worse than a rejected one.
 */
const seoSchema = z.object({
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(200).optional(),
  ogImage: z.string().max(500).optional(),
  canonicalUrl: z
    .string()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), {
      message: "A canonical address must start with http:// or https://.",
    })
    .optional(),
  noIndex: z.boolean().optional(),
});

/* ------------------------------------------------------- pages in a website */

router.get("/projects/:projectId/pages", requireActor, requireProjectAccess, async (req, res, next) => {
  try {
    const pages = await Page.find({ projectId: req.project!._id }).sort({ order: 1, createdAt: 1 });
    return ok(res, pages.map(toPageSummaryDTO));
  } catch (err) {
    next(err);
  }
});

const createPageSchema = z.object({
  title: z.string().min(1, "Give the page a name.").max(120),
  slug: z.string().max(120).optional(),
});

router.post(
  "/projects/:projectId/pages",
  requireActor,
  requireProjectAccess,
  validateBody(createPageSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createPageSchema>;
      // "Home" conventionally lives at the root.
      const raw = body.slug ?? body.title;
      const slug = slugify(raw) === "home" && !body.slug ? "" : slugify(raw);

      const clash = await Page.findOne({ projectId: req.project!._id, slug });
      if (clash) throw conflict("A page already uses that web address.");

      await assertCanAddPage(req.project!);

      const count = await Page.countDocuments({ projectId: req.project!._id });
      const page = await Page.create({
        projectId: req.project!._id,
        slug,
        title: body.title,
        order: count,
        status: "draft",
        draftDirty: true,
      });

      return ok(res, toPageDTO(page), 201);
    } catch (err) {
      next(err);
    }
  }
);

const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });

router.patch(
  "/projects/:projectId/pages/reorder",
  requireActor,
  requireProjectAccess,
  validateBody(reorderSchema),
  async (req, res, next) => {
    try {
      const { ids } = req.body as z.infer<typeof reorderSchema>;
      const pages = await Page.find({ projectId: req.project!._id });

      const known = new Set(pages.map((p) => p._id.toString()));
      if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
        throw badRequest("That list does not match the pages on this website.");
      }

      await Promise.all(
        ids.map((id, order) => Page.updateOne({ _id: id }, { $set: { order } }))
      );

      const updated = await Page.find({ projectId: req.project!._id }).sort({ order: 1 });
      return ok(res, updated.map(toPageSummaryDTO));
    } catch (err) {
      next(err);
    }
  }
);

/* ----------------------------------------------------------------- one page */

router.get("/pages/:pageId", requireActor, requirePageAccess, (req, res) => ok(res, toPageDTO(req.page!)));

const updatePageSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  slug: z.string().max(120).optional(),
  seo: seoSchema.optional(),
});

router.patch(
  "/pages/:pageId",
  requireActor,
  requirePageAccess,
  validateBody(updatePageSchema),
  async (req, res, next) => {
    try {
      const page = req.page!;
      const body = req.body as z.infer<typeof updatePageSchema>;

      if (body.slug !== undefined) {
        const slug = slugify(body.slug);
        const clash = await Page.findOne({
          projectId: page.projectId,
          slug,
          _id: { $ne: page._id },
        });
        if (clash) throw conflict("A page already uses that web address.");
        page.slug = slug;
      }
      if (body.title !== undefined) page.title = body.title;
      // Search settings are draft-first like everything else: what the client
      // types here is not live until they press Publish. `draftSeoOf` is what
      // makes a page written before this field existed merge correctly.
      if (body.seo) page.set("draftSeo", { ...draftSeoOf(page), ...body.seo });

      page.draftDirty = true;
      await page.save();
      return ok(res, toPageDTO(page));
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/pages/:pageId", requireActor, requirePageAccess, async (req, res, next) => {
  try {
    await req.page!.deleteOne();
    return ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------- sections (drafts only) */

const addSectionSchema = z.object({ type: z.string().min(1) });

router.post(
  "/pages/:pageId/sections",
  requireActor,
  requirePageAccess,
  validateBody(addSectionSchema),
  async (req, res, next) => {
    try {
      const { type } = req.body as z.infer<typeof addSectionSchema>;

      const def = getSectionType(type);
      if (!def) throw badRequest(`This CMS has no section called "${type}".`);

      // The developer decides which sections each website may use.
      if (!req.project!.allowedSectionTypes.includes(type)) {
        throw badRequest(`The ${def.name} section is not enabled for this website.`);
      }

      const page = req.page!;
      const current = toSectionDTOs(page.draftSections);
      const section: SectionDTO = {
        id: newSectionId(),
        type,
        name: def.name,
        order: current.length,
        visible: true,
        content: defaultContent(def),
      };

      setDraftSections(page, [...current, section]);
      await page.save();

      return ok(res, { page: toPageDTO(page), section }, 201);
    } catch (err) {
      next(err);
    }
  }
);

const patchSectionSchema = z.object({
  name: z.string().max(120).optional(),
  visible: z.boolean().optional(),
  content: z.unknown().optional(),
});

router.patch(
  "/pages/:pageId/sections/:sectionId",
  requireActor,
  requirePageAccess,
  validateBody(patchSectionSchema),
  async (req, res, next) => {
    try {
      const page = req.page!;
      const body = req.body as z.infer<typeof patchSectionSchema>;
      const current = toSectionDTOs(page.draftSections);
      const target = current.find((s) => s.id === req.params.sectionId);
      if (!target) throw notFound("That section is not on this page.");

      if (body.content !== undefined) {
        // Draft mode: limits and shape are enforced, blank required fields are
        // not, because the client saves continuously while typing.
        const result = validateSectionContent(target.type, body.content, "draft");
        if (!result.ok) throw badRequest("Some of that content is not valid.", result.issues);
        target.content = result.data;
      }
      if (body.name !== undefined) target.name = body.name;
      if (body.visible !== undefined) target.visible = body.visible;

      setDraftSections(page, current);
      await page.save();
      return ok(res, toPageDTO(page));
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/pages/:pageId/sections/:sectionId", requireActor, requirePageAccess, async (req, res, next) => {
  try {
    const page = req.page!;
    const current = toSectionDTOs(page.draftSections);
    const remaining = current.filter((s) => s.id !== req.params.sectionId);
    if (remaining.length === current.length) throw notFound("That section is not on this page.");

    setDraftSections(page, remaining);
    await page.save();
    return ok(res, toPageDTO(page));
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/pages/:pageId/sections-reorder",
  requireActor,
  requirePageAccess,
  validateBody(reorderSchema),
  async (req, res, next) => {
    try {
      const page = req.page!;
      const { ids } = req.body as z.infer<typeof reorderSchema>;
      const current = toSectionDTOs(page.draftSections);
      const byId = new Map(current.map((s) => [s.id, s]));

      if (ids.length !== current.length || ids.some((id) => !byId.has(id))) {
        throw badRequest("That list does not match the sections on this page.");
      }

      setDraftSections(page, ids.map((id) => byId.get(id)!));
      await page.save();
      return ok(res, toPageDTO(page));
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------- publish / discard */

router.post("/pages/:pageId/publish", requireActor, requirePageAccess, async (req, res, next) => {
  try {
    const page = req.page!;
    const draft = toSectionDTOs(page.draftSections);

    // Publish is the gate where "you still need a headline" becomes an error.
    const issues: ValidationIssue[] = [];
    for (const section of draft) {
      const result = validateSectionContent(section.type, section.content, "publish");
      if (!result.ok) {
        const label = section.name || getSectionType(section.type)?.name || section.type;
        issues.push(
          ...result.issues.map((i) => ({
            path: `${section.id}.${i.path}`,
            message: `${label}: ${i.message}`,
          }))
        );
      }
    }
    if (issues.length > 0) {
      throw badRequest("This page is not ready to go live yet.", issues);
    }

    page.set(
      "sections",
      draft.map((s, i) => ({
        id: s.id,
        type: s.type,
        name: s.name ?? "",
        order: i,
        visible: s.visible,
        content: s.content,
      }))
    );
    page.set("seo", draftSeoOf(page));
    page.status = "published";
    page.publishedAt = new Date();
    page.draftDirty = false;
    await page.save();

    // Tell the live website to regenerate. Never fails the publish.
    const revalidated = await fireRevalidate(req.project!, [`/${page.slug}`]);

    return ok(res, { page: toPageDTO(page), revalidated });
  } catch (err) {
    next(err);
  }
});

router.post("/pages/:pageId/discard-draft", requireActor, requirePageAccess, async (req, res, next) => {
  try {
    const page = req.page!;
    setDraftSections(page, toSectionDTOs(page.sections));
    page.set("draftSeo", page.seo);
    page.draftDirty = false;
    await page.save();
    return ok(res, toPageDTO(page));
  } catch (err) {
    next(err);
  }
});

/** Short-lived link so the client can see their draft on their real website. */
router.post("/pages/:pageId/preview-token", requireActor, requirePageAccess, (req, res) => {
  const page = req.page!;
  return ok(res, {
    token: signPreviewToken(page._id.toString()),
    slug: page.slug,
    expiresInMinutes: 30,
  });
});

export default router;
