import { Router, type Response } from "express";
import { z } from "zod";
import {
  User,
  hashPassword,
  isVerified,
  toUserDTO,
  verifyPassword,
  type UserDoc,
} from "../models/user.js";
import { AuthToken, consumeToken, issueToken } from "../models/auth-token.js";
import { Project } from "../models/project.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { byEmailAndIp, rateLimit } from "../middleware/rate-limit.js";
import { badRequest, ok, serviceUnavailable, unauthorized } from "../lib/respond.js";
import { emailEnabled } from "../config/env.js";
import {
  sendDuplicateSignupEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../lib/mailer.js";
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/tokens.js";

const router = Router();

/**
 * Everything here is reachable by anyone on the internet, so every route that
 * takes an email address is rate limited and none of them reveal whether a
 * given address has an account. Two rules run through the whole file:
 *
 *   1. Signup, "forgot password" and "resend" always answer the same way,
 *      whether or not the address exists. Otherwise this file becomes a free
 *      tool for discovering who has an account here.
 *   2. Nothing that could be mistaken for a session is issued before the email
 *      address has been confirmed.
 */

const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "That password is too long.");

const signupSchema = z.object({
  name: z.string().min(1, "Tell us your name.").max(80).trim(),
  email: z.string().email("Enter a valid email address."),
  password,
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const emailOnlySchema = z.object({ email: z.string().email("Enter a valid email address.") });
const tokenSchema = z.object({ token: z.string().min(1, "That link is not valid.") });
const resetSchema = z.object({ token: z.string().min(1, "That link is not valid."), password });

/** Issued only once an account is real, confirmed, and the password checked out. */
function grantSession(res: Response, user: UserDoc) {
  setRefreshCookie(res, signRefreshToken(user._id.toString(), user.sessionVersion));
  return {
    user: toUserDTO(user),
    accessToken: signAccessToken({ sub: user._id.toString(), sv: user.sessionVersion }),
  };
}

/* --------------------------------------------------------------- signing up */

router.post(
  "/signup",
  rateLimit({
    max: 5,
    windowMs: 60 * 60 * 1000,
    message: "Too many accounts created from here. Please try again later.",
  }),
  validateBody(signupSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof signupSchema>;
      const email = body.email.toLowerCase().trim();

      // Refusing up front is kinder than accepting a signup nobody can finish.
      if (!emailEnabled) {
        throw serviceUnavailable(
          "New accounts are temporarily unavailable because this CMS cannot send email yet.",
          "email_not_configured"
        );
      }

      const existing = await User.findOne({ email });
      if (existing) {
        /**
         * The response below is identical to the success case on purpose: an
         * endpoint that says "that email is taken" is an endpoint that tells a
         * stranger who has an account here. The person who actually owns the
         * address is told instead, in their inbox, where it is useful.
         */
        await sendDuplicateSignupEmail(existing.email, existing.name);
      } else {
        const user = await User.create({
          email,
          name: body.name,
          passwordHash: await hashPassword(body.password),
          emailVerifiedAt: null,
          isPlatformAdmin: false,
          projectIds: [],
        });
        await sendVerificationEmail(user.email, user.name, await issueToken(user._id, "verify"));
      }

      return ok(res, {
        emailSent: true,
        message: "Check your email for a link to confirm your address.",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/verify-email",
  rateLimit({
    max: 20,
    windowMs: 60 * 60 * 1000,
    message: "Too many attempts. Please try again later.",
  }),
  validateBody(tokenSchema),
  async (req, res, next) => {
    try {
      const spent = await consumeToken((req.body as z.infer<typeof tokenSchema>).token, "verify");
      if (!spent) {
        throw badRequest("That confirmation link has expired or has already been used.");
      }

      const user = await User.findById(spent.userId);
      if (!user) throw badRequest("That confirmation link is no longer valid.");

      if (!isVerified(user)) {
        user.emailVerifiedAt = new Date();
        await user.save();
      }

      // Signed straight in: making someone confirm their email and then
      // immediately type their password again is friction for nothing.
      return ok(res, grantSession(res, user));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/resend-verification",
  rateLimit({
    max: 3,
    windowMs: 15 * 60 * 1000,
    message: "We have just sent one. Please wait a few minutes before asking again.",
    keyOn: byEmailAndIp,
  }),
  validateBody(emailOnlySchema),
  async (req, res, next) => {
    try {
      const email = (req.body as z.infer<typeof emailOnlySchema>).email.toLowerCase().trim();
      const user = await User.findOne({ email });

      if (user && !isVerified(user)) {
        await sendVerificationEmail(user.email, user.name, await issueToken(user._id, "verify"));
      }

      // Same answer for an unknown address, an unverified one and an already
      // verified one — see the note at the top of this file.
      return ok(res, { emailSent: true, message: "If that address needs confirming, a new link is on its way." });
    } catch (err) {
      next(err);
    }
  }
);

/* --------------------------------------------------------------- signing in */

router.post(
  "/login",
  rateLimit({
    max: 10,
    windowMs: 15 * 60 * 1000,
    message: "Too many sign-in attempts. Please wait a few minutes and try again.",
    keyOn: byEmailAndIp,
  }),
  validateBody(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password: given } = req.body as z.infer<typeof loginSchema>;
      const user = await User.findOne({ email: email.toLowerCase().trim() });

      // Same message either way, so the endpoint cannot be used to discover
      // which email addresses have accounts.
      const invalid = unauthorized("That email address and password do not match.");
      if (!user) throw invalid;
      if (!(await verifyPassword(given, user.passwordHash))) throw invalid;

      /**
       * Checked AFTER the password, not before. Answering "confirm your email"
       * to anyone who types an address would turn this into the account-finder
       * the identical-message rule above exists to prevent.
       */
      if (!isVerified(user)) {
        throw unauthorized(
          "Confirm your email address before signing in. Check your inbox for the link we sent.",
          "email_not_verified"
        );
      }

      return ok(res, grantSession(res, user));
    } catch (err) {
      next(err);
    }
  }
);

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
    if ((claims.sv ?? 0) !== user.sessionVersion) {
      clearRefreshCookie(res);
      throw unauthorized("Your password was changed. Please sign in again.");
    }
    if (!isVerified(user)) throw unauthorized("Please confirm your email address.");

    // Rotate the refresh token on every use.
    return ok(res, grantSession(res, user));
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req, res) => {
  clearRefreshCookie(res);
  return ok(res, { signedOut: true });
});

router.get("/me", requireAuth, (req, res) => ok(res, { user: toUserDTO(req.user!) }));

/**
 * The only thing an account may change about itself here is whether it has
 * finished the first-sign-in tour. Deliberately narrow: nothing that decides
 * access — `isPlatformAdmin`, `projectIds`, `emailVerifiedAt` — is settable by
 * the account it belongs to.
 *
 * Answers with the same `{ user }` envelope as GET /me so the dashboard can
 * adopt the response either way.
 */
router.patch(
  "/me",
  requireAuth,
  validateBody(z.object({ onboardingComplete: z.boolean() })),
  async (req, res, next) => {
    try {
      const { onboardingComplete } = req.body as { onboardingComplete: boolean };
      const user = req.user!;

      // Re-finishing an already-finished tour must not move the timestamp:
      // when it was first done is the interesting fact.
      if (onboardingComplete) {
        if (!user.onboardingCompletedAt) {
          user.onboardingCompletedAt = new Date();
          await user.save();
        }
      } else if (user.onboardingCompletedAt) {
        // Lets someone ask for the tour again from the dashboard.
        user.onboardingCompletedAt = null;
        await user.save();
      }

      return ok(res, { user: toUserDTO(user) });
    } catch (err) {
      next(err);
    }
  }
);

/* ---------------------------------------------------------- password rescue */

router.post(
  "/forgot-password",
  rateLimit({
    max: 3,
    windowMs: 15 * 60 * 1000,
    message: "A reset link has just been sent. Please wait a few minutes before asking again.",
    keyOn: byEmailAndIp,
  }),
  validateBody(emailOnlySchema),
  async (req, res, next) => {
    try {
      const email = (req.body as z.infer<typeof emailOnlySchema>).email.toLowerCase().trim();
      const user = await User.findOne({ email });

      // An unverified account is not sent a reset link: that would be a way to
      // take over an address you do not own by signing up with it first.
      if (user && isVerified(user)) {
        await sendPasswordResetEmail(user.email, user.name, await issueToken(user._id, "reset"));
      }

      return ok(res, {
        emailSent: true,
        message: "If there is an account with that address, a reset link is on its way.",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/reset-password",
  rateLimit({
    max: 10,
    windowMs: 60 * 60 * 1000,
    message: "Too many attempts. Please try again later.",
  }),
  validateBody(resetSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof resetSchema>;
      const spent = await consumeToken(body.token, "reset");
      if (!spent) throw badRequest("That reset link has expired or has already been used.");

      const user = await User.findById(spent.userId);
      if (!user) throw badRequest("That reset link is no longer valid.");

      user.passwordHash = await hashPassword(body.password);
      // Whoever prompted the reset is signed out everywhere, immediately.
      user.sessionVersion += 1;
      // Someone proved they can read the inbox, so the address is confirmed.
      if (!isVerified(user)) user.emailVerifiedAt = new Date();
      await user.save();

      // Every other outstanding link for this account dies with the password.
      await AuthToken.updateMany(
        { userId: user._id, usedAt: null, kind: { $in: ["reset", "verify"] } },
        { usedAt: new Date() }
      );

      return ok(res, grantSession(res, user));
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------------- the account */

router.delete("/me", requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;

    /**
     * Websites are not deleted along with their owner, because an editor may be
     * relying on one and a live site is reading from it. Closing an account you
     * still own has to be a deliberate two-step.
     */
    const owned = await Project.countDocuments({ ownerId: user._id });
    if (owned > 0) {
      throw badRequest(
        `Delete your ${owned === 1 ? "website" : `${owned} websites`} first, or hand them to someone else.`
      );
    }

    await AuthToken.deleteMany({ userId: user._id });
    await user.deleteOne();
    clearRefreshCookie(res);
    return ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
