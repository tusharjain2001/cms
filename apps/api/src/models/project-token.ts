import { createHash, randomBytes } from "node:crypto";
import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import type { ProjectTokenDTO } from "@pagecraft/shared";

/**
 * A write-scoped API token for ONE website.
 *
 * The point of these is the resale story: an agency owner mints a token, hands
 * it to their client's developer, and that developer's tools (or the Pagecraft
 * MCP) can author content on exactly that one website — with no access to the
 * owner's account, their other websites, or this website's settings.
 *
 * Two security choices matter here:
 *  - The raw secret is shown **once**, at creation, and never stored. What is
 *    stored is its SHA-256, so a database leak does not hand anyone working
 *    tokens. (The read-only `apiKey` on the project is deliberately plaintext
 *    because it grants nothing but public content; a write token is not.)
 *  - Revoking is a hard delete of the row, so a leaked token stops working the
 *    instant the owner says so.
 */

const TOKEN_PREFIX = "pwt_live_";

const projectTokenSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    /** A human name so the owner knows which token to revoke ("Acme's laptop"). */
    label: { type: String, required: true, trim: true },
    /** SHA-256 of the raw secret. The secret itself is never stored. */
    tokenHash: { type: String, required: true, unique: true, index: true },
    /** A short, non-secret prefix shown in the UI so a token is recognisable. */
    prefix: { type: String, required: true },
    /** The account that minted it. */
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type ProjectTokenDoc = HydratedDocument<InferSchemaType<typeof projectTokenSchema>>;

export const ProjectToken = model("ProjectToken", projectTokenSchema);

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** True for anything shaped like one of our write tokens (cheap pre-check). */
export const looksLikeProjectToken = (v: string) => v.startsWith(TOKEN_PREFIX);

/**
 * Generates a fresh secret and the fields to store for it. The caller persists
 * the doc and returns `raw` to the browser exactly once.
 */
export function newProjectTokenSecret() {
  const raw = `${TOKEN_PREFIX}${randomBytes(24).toString("hex")}`;
  return {
    raw,
    tokenHash: hashToken(raw),
    // e.g. "pwt_live_a1b2c3d4…" — enough to recognise, not enough to use.
    prefix: `${raw.slice(0, TOKEN_PREFIX.length + 6)}…`,
  };
}

export function toProjectTokenDTO(t: ProjectTokenDoc): ProjectTokenDTO {
  return {
    id: t._id.toString(),
    label: t.label,
    prefix: t.prefix,
    createdAt: (t.get("createdAt") as Date).toISOString(),
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : undefined,
  };
}
