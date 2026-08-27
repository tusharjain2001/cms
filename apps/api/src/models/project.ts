import { randomBytes } from "node:crypto";
import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { sectionTypeNames, type ProjectDTO } from "@pagecraft/shared";

/** Public, read-only key a client website uses to fetch its published content. */
export const newApiKey = () => `pk_live_${randomBytes(12).toString("hex")}`;

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    domain: { type: String, default: "", trim: true },
    apiKey: { type: String, required: true, unique: true, index: true, default: newApiKey },
    /** Called on publish so the live Next.js site regenerates the page. */
    revalidateUrl: { type: String, default: "" },
    revalidateSecret: { type: String, default: "" },
    /** Only these section types appear in this client's "Add section" picker. */
    allowedSectionTypes: { type: [String], default: () => sectionTypeNames() },
  },
  { timestamps: true }
);

export type ProjectDoc = HydratedDocument<InferSchemaType<typeof projectSchema>>;

export const Project = model("Project", projectSchema);

/**
 * Never returns `revalidateSecret` — it is a shared secret with the client's
 * site and has no reason to travel to a browser.
 */
export function toProjectDTO(project: ProjectDoc): ProjectDTO {
  return {
    id: project._id.toString(),
    name: project.name,
    slug: project.slug,
    domain: project.domain,
    apiKey: project.apiKey,
    revalidateUrl: project.revalidateUrl || undefined,
    hasRevalidateSecret: Boolean(project.revalidateSecret),
    allowedSectionTypes: project.allowedSectionTypes,
    createdAt: (project.get("createdAt") as Date).toISOString(),
  };
}
