import { randomUUID } from "node:crypto";
import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import type { PageDTO, PageSummaryDTO, SectionDTO } from "@pagecraft/shared";

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

const pageSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    // Deliberately not `required`: the home page's slug is "", which Mongoose
    // would reject as missing. The compound index below enforces uniqueness.
    slug: { type: String, default: "", lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    order: { type: Number, required: true, default: 0 },
    seo: {
      metaTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
      ogImage: { type: String, default: "" },
    },
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
    seo: {
      metaTitle: page.seo?.metaTitle || undefined,
      metaDescription: page.seo?.metaDescription || undefined,
      ogImage: page.seo?.ogImage || undefined,
    },
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
    seo: {
      metaTitle: page.seo?.metaTitle || undefined,
      metaDescription: page.seo?.metaDescription || undefined,
      ogImage: page.seo?.ogImage || undefined,
    },
    sections: toSectionDTOs(source, true),
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
