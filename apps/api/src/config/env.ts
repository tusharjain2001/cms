import "dotenv/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Fail fast on missing configuration: a CMS that boots with a blank JWT secret
 * is worse than one that refuses to boot.
 */

/**
 * Chooses localhost defaults for local dev and the real domains in production,
 * so a prod deploy that forgets ADMIN_ORIGIN/APP_URL boots CORS-open to the
 * live admin and emails working links — instead of silently defaulting to
 * localhost (blocked admin, unusable verification links). The .env on the box
 * still overrides these; this is the safety net when it does not.
 */
const prodDefault = process.env.NODE_ENV === "production";
const defaultAdminOrigin = prodDefault ? "https://mypagecraft.com" : "http://localhost:3000";
const defaultAppUrl = prodDefault ? "https://mypagecraft.com" : "http://localhost:3000";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  ADMIN_ORIGIN: z.string().default(defaultAdminOrigin),
  /** Where the dashboard lives, used to build links inside emails. */
  APP_URL: z.string().default(defaultAppUrl),

  // Email is optional in the same way R2 media is: without it the CMS runs,
  // but signing up cannot complete, so the API says so in plain English and
  // prints the link it would have sent to the server log for local work.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Blank means "decide from the port": 465 is implicit TLS, 587 is STARTTLS. */
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  // A "@localhost" sender is rejected by many receiving mail servers, so the
  // default is a real deliverable address rather than one that only works
  // nowhere; a self-hoster overrides it in .env.
  MAIL_FROM: z.string().default("Pagecraft <no-reply@mypagecraft.com>"),

  // Cloudflare R2 (S3-compatible) is the media backbone, and is optional the
  // same way: without these the CMS runs fine, uploads are switched off, and
  // the dashboard explains what is missing rather than showing a broken button.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  /** The R2 Custom Domain, e.g. https://cdn.mypagecraft.com — never the r2.dev host. */
  R2_PUBLIC_BASE_URL: z.string().optional(),
  /** HMAC secret for signed private-media URLs (validated by a CF Worker). Optional. */
  R2_URL_SIGNING_KEY: z.string().optional(),
  /**
   * Overrides the S3 endpoint, which is otherwise derived from the account id.
   * Leave unset in production — it exists so the tests can point the same client
   * at a local stub, and so a self-hoster can aim at MinIO or another
   * S3-compatible store.
   */
  R2_ENDPOINT: z.string().optional(),

  // Razorpay, optional in exactly the same way as R2 and SMTP: without these
  // the CMS runs, the billing screen explains what is missing instead of
  // showing a checkout button that cannot work, and nobody can create a
  // website (which is the honest outcome — the first one has to be paid for).
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  /**
   * The webhook signing secret from the Razorpay dashboard. Without it the
   * webhook route refuses every request rather than trusting unsigned callers:
   * an unverified webhook is a public endpoint that grants paid access.
   */
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  /**
   * The two Razorpay Plan ids for "one website", monthly and yearly. The
   * ladder is the subscription's `quantity` — 3 websites is quantity 3 of the
   * same plan, never a third plan — so there are exactly two of these no
   * matter how far the ladder goes.
   */
  RAZORPAY_PLAN_ID_MONTHLY: z.string().optional(),
  RAZORPAY_PLAN_ID_YEARLY: z.string().optional(),
  /** Overridable so tests can point the client at a local stub. */
  RAZORPAY_API_BASE: z.string().default("https://api.razorpay.com/v1"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  /**
   * This is the first thing anyone sees when the API will not start, and it
   * runs inside `npm run dev` where it competes with the dashboard's output —
   * so it says exactly what to do rather than something generic. It also
   * distinguishes "there is no .env" from "there is one but a value is blank",
   * because telling someone to create a file they already have sends them
   * looking in the wrong place.
   */
  const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
  const hasEnvFile = existsSync(envPath);

  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  console.error("\n" + "─".repeat(64));
  console.error("The Pagecraft API cannot start — its configuration is incomplete.\n");
  console.error(lines.join("\n"));

  if (hasEnvFile) {
    console.error(`\nFill the missing value(s) in:\n  ${envPath}`);
    if (parsed.error.issues.some((i) => i.path[0] === "MONGODB_URI")) {
      console.error(
        "\nMONGODB_URI is your database connection string. A free MongoDB Atlas\n" +
          "cluster takes about five minutes: https://www.mongodb.com/cloud/atlas/register\n" +
          "It looks like:  mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/pagecraft"
      );
    }
  } else {
    console.error("\nThere is no .env file yet. Create one:");
    console.error("  cp apps/api/.env.example apps/api/.env");
    console.error("…then fill it in.");
  }

  console.error(
    "\nUntil this is fixed the dashboard will load but cannot sign anyone in —\n" +
      'it will say "Could not reach the CMS".'
  );
  console.error("─".repeat(64) + "\n");
  process.exit(1);
}

export const env = parsed.data;

export const allowedOrigins = env.ADMIN_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);

export const isProd = env.NODE_ENV === "production";

/** Without a host and credentials there is nowhere to send a verification link. */
export const emailEnabled = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);

/**
 * Checkout needs the API keys *and* at least one plan id — a key with no plan
 * behind it produces a subscription call that fails at Razorpay rather than
 * here, which is a much worse place to find out.
 */
export const billingEnabled = Boolean(
  env.RAZORPAY_KEY_ID &&
    env.RAZORPAY_KEY_SECRET &&
    (env.RAZORPAY_PLAN_ID_MONTHLY || env.RAZORPAY_PLAN_ID_YEARLY)
);
