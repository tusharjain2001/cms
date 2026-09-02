import { randomUUID } from "node:crypto";
import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import type { PageDTO, PageSummaryDTO, SectionDTO, SeoDTO } from "@pagecraft/shared";

/**
 * A page holds TWO copies of its sections:
 *
 *   draftSections — what the client is editing right now
 *   sections      — what is live on their website
 *
 * Everything the dashboard does touches `draftSections` only. Publish copies
 * draft over live; discard copies live back over draft. That is what makes the
 * "your changes are only visible to you until you press Publish" promise true.
 */

const sectionSchema = new Schema(
  {
    id: { type: String, required: true, default: () => randomUUID() },
    type: { type: String, required: true },
    /** Client's own nickname for the section. Never rendered on the website. */
    name: { type: String, default: "" },
    order: { type: Number, required: true, default: 0 },
    visible: { type: Boolean, required: true, default: true },
    /** Shape is governed by the section registry, not by Mongoose. */
    content: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false }
);

const seoSchema = new Schema(
  {
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    ogImage: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    noIndex: { type: Boolean, default: false },
  },
  { _id: false }
);

const pageSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    // Deliberately not `required`: the home page's slug is "", which Mongoose
    // would reject as missing. The compound index below enforces uniqueness.
    slug: { type: String, default: "", lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    // What the page tells search engines and social networks about itself.
    // All optional with real fallbacks (see SeoDTO) — a client who never opens
    // the SEO panel still gets a page that indexes correctly. `noIndex` is the
    // only one that changes behaviour rather than wording.
    //
    // Live, exactly like `sections`. The public API serves this; the dashboard
    // edits `draftSeo` and publish copies one over the other.
    seo: { type: seoSchema, default: () => ({}) },
    /**
     * The editing copy.
     *
     * Absent on every page written before search settings existed, and absent
     * means "the same as live" rather than "empty" — see `draftSeoOf`. Without
     * that, adding this field would have silently blanked the meta titles of
     * every page already in the database.
     */
    draftSeo: { type: seoSchema, default: undefined },
    sections: { type: [sectionSchema], default: () => [] },
    draftSections: { type: [sectionSchema], default: () => [] },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    /** True whenever the draft has moved on from what is live. */
    draftDirty: { type: Boolean, default: true },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

// One slug per website, not globally — two clients may both have /about.
pageSchema.index({ projectId: 1, slug: 1 }, { unique: true });

export type PageDoc = HydratedDocument<InferSchemaType<typeof pageSchema>>;
export type SectionSub = InferSchemaType<typeof sectionSchema>;

export const Page = model("Page", pageSchema);

export const newSectionId = () => randomUUID();

/**
 * The SEO block, mapped once.
 *
 * Empty strings become `undefined` so a caller can write
 * `seo.metaTitle ?? page.title` and get the fallback rather than an empty
 * <title>. `noIndex` is the exception: it is a real boolean either way, since
 * "undefined" and "false" would mean the same thing to a site but read
 * differently in a toggle.
 */
type SeoSub = InferSchemaType<typeof seoSchema>;

function mapSeo(seo: SeoSub | undefined | null): SeoDTO {
  return {
    metaTitle: seo?.metaTitle || undefined,
    metaDescription: seo?.metaDescription || undefined,
    ogImage: seo?.ogImage || undefined,
    canonicalUrl: seo?.canonicalUrl || undefined,
    noIndex: seo?.noIndex === true,
  };
}

/**
 * The search settings the dashboard is editing.
 *
 * A page written before this field existed has no `draftSeo` at all, and that
 * has to read as "whatever is live" — otherwise the first time such a page is
 * opened the panel would show empty boxes over a perfectly good live listing,
 * and the next save would publish that emptiness.
 */
export function draftSeoOf(page: PageDoc): SeoSub {
  return (page.draftSeo ?? page.seo ?? {}) as SeoSub;
}

/** Plain objects, sorted, so callers never worry about Mongoose subdocuments. */
export function toSectionDTOs(sections: SectionSub[], visibleOnly = false): SectionDTO[] {
  return sections
    .filter((s) => (visibleOnly ? s.visible : true))
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      id: s.id,
      type: s.type,
      name: s.name || undefined,
      order: i,
      visible: s.visible,
      content: (s.content ?? {}) as SectionDTO["content"],
    }));
}

/** Full page for the dashboard, including the draft the client is editing. */
export function toPageDTO(page: PageDoc): PageDTO {
  return {
    id: page._id.toString(),
    slug: page.slug,
    title: page.title,
    order: page.order,
    status: page.status as PageDTO["status"],
    // The dashboard edits the draft, so this is the draft — the same reason
    // `draftSections` is what the editor renders.
    seo: mapSeo(draftSeoOf(page)),
    sections: toSectionDTOs(page.sections),
    draftSections: toSectionDTOs(page.draftSections),
    hasDraftChanges: page.draftDirty,
    updatedAt: (page.get("updatedAt") as Date).toISOString(),
    publishedAt: page.publishedAt?.toISOString(),
  };
}

/** Row for the pages list and for a website's navigation. */
export function toPageSummaryDTO(page: PageDoc): PageSummaryDTO {
  return {
    id: page._id.toString(),
    slug: page.slug,
    title: page.title,
    order: page.order,
    status: page.status as PageSummaryDTO["status"],
    hasDraftChanges: page.draftDirty,
    updatedAt: (page.get("updatedAt") as Date).toISOString(),
    seo: mapSeo(draftSeoOf(page)),
  };
}

/**
 * What a client website receives. Published sections only, hidden ones removed,
 * and no trace of the draft.
 */
export function toPublicPageDTO(page: PageDoc, useDraft = false) {
  const source = useDraft ? page.draftSections : page.sections;
  return {
    slug: page.slug,
    title: page.title,
    order: page.order,
    // Live settings, unless this is a preview of the draft — a preview that
    // showed the live meta description would defeat the point of previewing.
    seo: mapSeo(useDraft ? draftSeoOf(page) : page.seo),
    sections: toSectionDTOs(source, true),
    updatedAt: (page.get("updatedAt") as Date).toISOString(),
    publishedAt: page.publishedAt?.toISOString(),
  };
}

/**
 * Replace a page's draft wholesale.
 *
 * `content` is a Mixed path, so Mongoose cannot see edits made in place —
 * always rebuild the array and assign it, which is what this enforces.
 */
export function setDraftSections(page: PageDoc, sections: SectionDTO[]) {
  page.set(
    "draftSections",
    sections.map((s, i) => ({
      id: s.id,
      type: s.type,
      name: s.name ?? "",
      order: i,
      visible: s.visible,
      content: s.content,
    }))
  );
  page.draftDirty = true;
}
