import bcrypt from "bcryptjs";
import { Schema, model, type HydratedDocument, type InferSchemaType, type Types } from "mongoose";
import type { UserDTO } from "@pagecraft/shared";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    /** `admin` is you, the developer: full access to every project. */
    role: { type: String, enum: ["admin", "client"], required: true, default: "client" },
    /** Which client websites this user may edit. Ignored for admins. */
    projectIds: [{ type: Schema.Types.ObjectId, ref: "Project" }],
  },
  { timestamps: true }
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model("User", userSchema);

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function toUserDTO(user: UserDoc): UserDTO {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role as UserDTO["role"],
    projectIds: (user.projectIds as Types.ObjectId[]).map((id) => id.toString()),
  };
}
