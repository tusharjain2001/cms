import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Schema, model, type HydratedDocument, type InferSchemaType, type Types } from "mongoose";

/**
 * The one-shot links emailed to people: confirm your address, reset your
 * password, accept an invitation.
 *
 * These are NOT JWTs, deliberately. A JWT stays valid until it expires, and a
 * password-reset link that still works after it has been used — or after the
 * account has been secured — is exactly the kind of thing that gets accounts
 * stolen. A database row can be burned the moment it is spent.
 *
 * Only a SHA-256 of the token is stored, so a leaked database backup does not
 * hand anyone a working set of password-reset links.
 */

export type TokenKind = "verify" | "reset" | "invite";

const authTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["verify", "reset", "invite"], required: true },
    tokenHash: { type: String, required: true, index: true },
    /** Which website an `invite` grants access to. Unused by the other kinds. */
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Mongo sweeps expired rows away on its own, so spent links do not accumulate.
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthTokenDoc = HydratedDocument<InferSchemaType<typeof authTokenSchema>>;

export const AuthToken = model("AuthToken", authTokenSchema);

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

export const TOKEN_TTL: Record<TokenKind, number> = {
  verify: 24 * 60 * 60 * 1000,
  // Short on purpose: a reset link is the one thing that can take over an account.
  reset: 60 * 60 * 1000,
  invite: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Issues a fresh link and invalidates any earlier one of the same kind, so
 * pressing "resend" three times does not leave three usable links behind.
 */
export async function issueToken(
  userId: Types.ObjectId,
  kind: TokenKind,
  projectId?: Types.ObjectId
): Promise<string> {
  await AuthToken.updateMany(
    { userId, kind, usedAt: null, ...(projectId ? { projectId } : {}) },
    { usedAt: new Date() }
  );

  const raw = randomBytes(32).toString("base64url");
  await AuthToken.create({
    userId,
    kind,
    projectId,
    tokenHash: hash(raw),
    expiresAt: new Date(Date.now() + TOKEN_TTL[kind]),
  });
  return raw;
}

/**
 * Looks a token up and spends it in one step. Returns null for anything that is
 * unknown, expired, already used, or of the wrong kind — the caller cannot tell
 * these apart, and should not, because the difference is only useful to someone
 * probing for valid tokens.
 */
export async function consumeToken(raw: string, kind: TokenKind): Promise<AuthTokenDoc | null> {
  if (!raw) return null;

  const candidate = await AuthToken.findOne({ tokenHash: hash(raw), kind, usedAt: null });
  if (!candidate) return null;
  if (candidate.expiresAt.getTime() < Date.now()) return null;

  // Belt and braces: the lookup above already matched on the hash, but compare
  // in constant time so timing cannot be used to confirm a partial guess.
  const a = Buffer.from(candidate.tokenHash);
  const b = Buffer.from(hash(raw));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Atomic: two simultaneous clicks on the same link cannot both succeed.
  const spent = await AuthToken.findOneAndUpdate(
    { _id: candidate._id, usedAt: null },
    { usedAt: new Date() },
    { new: true }
  );
  return spent;
}
