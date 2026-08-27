import bcrypt from "bcryptjs";
import { Schema, model, type HydratedDocument, type InferSchemaType, type Types } from "mongoose";
import type { UserDTO } from "@pagecraft/shared";

/**
 * Anyone can create one of these by signing up, so nothing on this record
 * grants power over anyone else's content. What a user may touch is decided
 * entirely by which websites they own or have been added to — see
 * `middleware/auth.ts`.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    /** Null until the emailed link is clicked. Until then, sign-in is refused. */
    emailVerifiedAt: { type: Date, default: null },
    /**
     * Whoever runs this CMS instance. Granted by the seed script only — never
     * by signing up — and the one thing that can see across every account.
     */
    isPlatformAdmin: { type: Boolean, default: false },
    /** Websites this user was invited to. Websites they OWN are not listed here. */
    projectIds: [{ type: Schema.Types.ObjectId, ref: "Project" }],
    /**
     * Bumped whenever the password changes. Refresh tokens carry the value they
     * were signed with, so resetting a password instantly logs out every other
     * device — which is the entire point of resetting it after a break-in.
     */
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model("User", userSchema);

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const isVerified = (user: UserDoc) => user.emailVerifiedAt !== null;

export function toUserDTO(user: UserDoc): UserDTO {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    emailVerified: isVerified(user),
    isPlatformAdmin: user.isPlatformAdmin,
    projectIds: (user.projectIds as Types.ObjectId[]).map((id) => id.toString()),
  };
}
