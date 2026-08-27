import { randomBytes } from "node:crypto";
import { Schema, model, type HydratedDocument, type InferSchemaType, type Types } from "mongoose";
import { sectionTypeNames, type ProjectDTO, type ProjectRole } from "@pagecraft/shared";
import { User, type UserDoc } from "./user.js";

/** Public, read-only key a client website uses to fetch its published content. */
export const newApiKey = () => `pk_live_${randomBytes(12).toString("hex")}`;

const projectSchema = new Schema(
  {
    /**
     * The account that created this website. Everything about who may see or
     * change it hangs off this field — without it, one signup could read
     * another's content.
     */
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
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

/**
 * Unique per owner, not globally. Two unrelated developers should both be able
 * to call a website "portfolio" — a shared namespace would leak the fact that
 * someone else already took the name, and would get worse as the CMS grows.
 */
projectSchema.index({ ownerId: 1, slug: 1 }, { unique: true });

export type ProjectDoc = HydratedDocument<InferSchemaType<typeof projectSchema>>;

export const Project = model("Project", projectSchema);

export const roleFor = (project: ProjectDoc, user: UserDoc): ProjectRole =>
  project.ownerId.toString() === user._id.toString() ? "owner" : "editor";

/**
 * Never returns `revalidateSecret` — it is a shared secret with the client's
 * site and has no reason to travel to a browser.
 */
export function toProjectDTO(
  project: ProjectDoc,
  ctx: { role: ProjectRole; ownerName: string }
): ProjectDTO {
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
    role: ctx.role,
    ownerName: ctx.ownerName,
  };
}

/** Maps a list of websites for one viewer, looking owner names up in one query. */
export async function describeProjects(
  projects: ProjectDoc[],
  viewer: UserDoc
): Promise<ProjectDTO[]> {
  const ownerIds = [...new Set(projects.map((p) => p.ownerId.toString()))];
  const owners = await User.find({ _id: { $in: ownerIds } }).select("name");
  const nameById = new Map(owners.map((o) => [o._id.toString(), o.name]));

  return projects.map((p) =>
    toProjectDTO(p, {
      role: roleFor(p, viewer),
      ownerName: nameById.get(p.ownerId.toString()) ?? "Unknown",
    })
  );
}

/** Single-website version of the above. */
export async function describeProject(project: ProjectDoc, viewer: UserDoc): Promise<ProjectDTO> {
  const owner = await User.findById(project.ownerId as Types.ObjectId).select("name");
  return toProjectDTO(project, {
    role: roleFor(project, viewer),
    ownerName: owner?.name ?? "Unknown",
  });
}
