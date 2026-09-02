import { Router } from "express";
import { Page, toPublicPageDTO } from "../models/page.js";
import { requireApiKey } from "../middleware/api-key.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { enforceApiCallQuota } from "../lib/plan.js";
import { notFound, ok } from "../lib/respond.js";
import { verifyPreviewToken } from "../lib/tokens.js";

/**
 * The read-only API a client's website calls.
 *
 * Published content only, never drafts (except through a signed, 30-minute
 * preview token for one specific page), and never anything belonging to
 * another project.
 */
const router = Router();

// The one surface the whole internet can reach. Throttle per IP *before* the
// key lookup, so a flood of bogus keys can't hammer the database. In-memory and
// per-instance, like the auth limiters — see middleware/rate-limit.ts.
// ponytail: fixed 120/min per IP; raise `max` if a large static-site build
// legitimately bursts past it (real sites are CDN-cached, so origin hits stay low).
router.use(
  rateLimit({
    max: 120,
    windowMs: 60 * 1000,
    message: "Too many requests. Please slow down and try again shortly.",
  })
);

router.use(requireApiKey);

// Meter this website's content-API usage against its plan's monthly quota, and
// refuse with a friendly 402 once it is spent. Runs after the key lookup so the
// count is attributed to the right website; the meter is atomic (see usage.ts).
router.use((req, res, next) => {
  enforceApiCallQuota(req.project!).then(() => next(), next);
});

/** Cached at the CDN, which is what keeps a plain React site fast. */
function cacheable(res: import("express").Response) {
  res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
}

/**
 * Navigation-ready list: every published page, in menu order.
 *
 * It carries `updatedAt` and the page's `noIndex` flag as well as its titles,
 * because this one request is also everything a site needs to emit a correct
 * `sitemap.xml` — a `<lastmod>` per URL and the ability to leave out the pages
 * their owner asked to keep out of search. Without those a site either ships a
 * sitemap that lies about freshness or makes one request per page to build it.
 * `sitemapEntries()` in the SDK consumes exactly this shape.
 */
router.get("/pages", async (req, res, next) => {
  try {
    const pages = await Page.find({ projectId: req.project!._id, status: "published" }).sort({
      order: 1,
    });

    cacheable(res);
    return ok(
      res,
      pages.map((p) => ({
        slug: p.slug,
        title: p.title,
        order: p.order,
        seo: {
          metaTitle: p.seo?.metaTitle || undefined,
          metaDescription: p.seo?.metaDescription || undefined,
          ogImage: p.seo?.ogImage || undefined,
          canonicalUrl: p.seo?.canonicalUrl || undefined,
          noIndex: p.seo?.noIndex === true,
        },
        updatedAt: (p.get("updatedAt") as Date).toISOString(),
        publishedAt: p.publishedAt?.toISOString(),
      }))
    );
  } catch (err) {
    next(err);
  }
});

/**
 * One page with its ordered, visible sections.
 * `?preview=<token>` swaps in the draft so the client can check their work.
 */
router.get("/pages/:slug", async (req, res, next) => {
  try {
    const slug = req.params.slug === "index" ? "" : req.params.slug;
    const preview = typeof req.query.preview === "string" ? req.query.preview : undefined;

    let usePreview = false;
    if (preview) {
      try {
        const { pageId } = verifyPreviewToken(preview);
        const page = await Page.findById(pageId);
        // The token must belong to this project AND this page.
        if (page && page.projectId.toString() === req.project!._id.toString() && page.slug === slug) {
          usePreview = true;
        }
      } catch {
        usePreview = false;
      }
    }

    const filter = usePreview
      ? { projectId: req.project!._id, slug }
      : { projectId: req.project!._id, slug, status: "published" as const };

    const page = await Page.findOne(filter);
    if (!page) throw notFound("There is no published page at that address.");

    // A preview must never be cached — it is one person checking a draft.
    if (usePreview) res.set("Cache-Control", "no-store");
    else cacheable(res);

    return ok(res, { ...toPublicPageDTO(page, usePreview), preview: usePreview });
  } catch (err) {
    next(err);
  }
});

/** Convenience for the home page, whose slug is empty. */
router.get("/home", async (req, res, next) => {
  try {
    const page = await Page.findOne({
      projectId: req.project!._id,
      slug: "",
      status: "published",
    });
    if (!page) throw notFound("There is no published home page.");
    cacheable(res);
    return ok(res, { ...toPublicPageDTO(page), preview: false });
  } catch (err) {
    next(err);
  }
});

export default router;
