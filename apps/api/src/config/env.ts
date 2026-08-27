import "dotenv/config";
import { z } from "zod";

/**
 * Fail fast on missing configuration: a CMS that boots with a blank JWT secret
 * is worse than one that refuses to boot.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  ADMIN_ORIGIN: z.string().default("http://localhost:3000"),
  /** Where the dashboard lives, used to build links inside emails. */
  APP_URL: z.string().default("http://localhost:3000"),

  // Email is optional in the same way Cloudinary is: without it the CMS runs,
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
  MAIL_FROM: z.string().default("Pagecraft <no-reply@localhost>"),

  // Cloudinary is optional: without it the CMS runs fine, and the media
  // endpoints explain that uploads are not set up yet rather than failing.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default("pagecraft"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  console.error("Invalid environment configuration:\n" + lines.join("\n"));
  console.error("\nCopy apps/api/.env.example to apps/api/.env and fill it in.");
  process.exit(1);
}

export const env = parsed.data;

export const allowedOrigins = env.ADMIN_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);

export const isProd = env.NODE_ENV === "production";

/** Without a host and credentials there is nowhere to send a verification link. */
export const emailEnabled = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
