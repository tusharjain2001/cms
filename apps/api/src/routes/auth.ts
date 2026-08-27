import { Router } from "express";
import { z } from "zod";
import { User, toUserDTO, verifyPassword } from "../models/user.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { ok, unauthorized } from "../lib/respond.js";
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/tokens.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

router.post("/login", validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await User.findOne({ email: email.toLowerCase() });

    // Same message either way, so the endpoint cannot be used to discover
    // which email addresses have accounts.
    const invalid = unauthorized("That email address and password do not match.");
    if (!user) throw invalid;
    if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

    setRefreshCookie(res, signRefreshToken(user._id.toString()));
    return ok(res, {
      user: toUserDTO(user),
      accessToken: signAccessToken({ sub: user._id.toString(), role: user.role as "admin" | "client" }),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized("Please sign in again.");

    let claims;
    try {
      claims = verifyRefreshToken(token);
    } catch {
      throw unauthorized("Please sign in again.");
    }

    const user = await User.findById(claims.sub);
    if (!user) throw unauthorized("Please sign in again.");

    // Rotate the refresh token on every use.
    setRefreshCookie(res, signRefreshToken(user._id.toString()));
    return ok(res, {
      user: toUserDTO(user),
      accessToken: signAccessToken({ sub: user._id.toString(), role: user.role as "admin" | "client" }),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => {
  clearRefreshCookie(res);
  return ok(res, { signedOut: true });
});

router.get("/me", requireAuth, (req, res) => ok(res, { user: toUserDTO(req.user!) }));

export default router;
