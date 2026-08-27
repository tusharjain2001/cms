import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import type { MediaDTO } from "@pagecraft/shared";

/**
 * The per-project media library. Cloudinary holds the actual bytes; this holds
 * what the dashboard needs to show a grid and what a section stores when a
 * client picks a photo.
 */

const mediaSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "raw"], default: "image" },
    format: { type: String, default: "" },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    bytes: { type: Number, default: 0 },
    originalName: { type: String, default: "" },
    /** Read aloud to visitors who cannot see the photo. */
    alt: { type: String, default: "" },
  },
  { timestamps: true }
);

mediaSchema.index({ projectId: 1, publicId: 1 }, { unique: true });

export type MediaDoc = HydratedDocument<InferSchemaType<typeof mediaSchema>>;

export const Media = model("Media", mediaSchema);

export function toMediaDTO(m: MediaDoc): MediaDTO {
  return {
    id: m._id.toString(),
    publicId: m.publicId,
    url: m.url,
    resourceType: m.resourceType as "image" | "raw",
    format: m.format,
    width: m.width,
    height: m.height,
    bytes: m.bytes,
    originalName: m.originalName,
    alt: m.alt,
    createdAt: (m.get("createdAt") as Date).toISOString(),
  };
}
