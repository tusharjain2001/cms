import { createHmac, timingSafeEqual } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

/**
 * Cloudflare R2 as the media backbone (S3-compatible).
 *
 * Bytes go browser → R2 directly via a short-lived presigned PUT, so a client's
 * 8MB phone photo never passes through this API. Delivery is the R2 *custom
 * domain* (cdn.<domain>) fronted by Cloudflare Image Transformations — never the
 * un-cached r2.dev host. Object keys are content-hashed (`<tenantId>/<hash>`) so
 * they are cache-immutable and a re-upload of the same bytes dedupes for free.
 *
 * Env-gated the same way Cloudinary was: with the R2_* vars unset the CMS runs
 * fine, uploads are simply switched off, and the dashboard says so.
 *
 * ponytail: Phase-2 (per-tenant metering + orphan GC) is deliberately NOT built
 * here — see the media plan. Content-hash keys orphan the old object on replace;
 * an R2 lifecycle rule / GC job is the cleanup, tracked for later.
 */

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/** ~4–5 widths keeps the count of billed *unique* transforms predictable. */
export const SRCSET_WIDTHS = [320, 640, 960, 1280, 1920];

export const r2Configured = () =>
  Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_BASE_URL
  );

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: true,
      // R2 does not implement S3's newer flexible checksums; leaving them on
      // makes the SDK bake an x-amz-checksum param into the presigned PUT that
      // the browser's real body then fails to match. Only add it when required.
      requestChecksumCalculation: "WHEN_REQUIRED",
      // Fail fast rather than retry against an unreachable endpoint (also keeps
      // the offline delete test quick).
      maxAttempts: 1,
    });
  }
  return _client;
}

/** `<tenantId>/<contentHash>[.ext]` — content-hashed, so immutable + dedupes. */
export function objectKey(projectId: string, contentHash: string, ext?: string): string {
  const hash = contentHash.replace(/[^a-f0-9]/gi, "").slice(0, 64).toLowerCase();
  const suffix = ext ? "." + ext.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() : "";
  return `${projectId}/${hash}${suffix}`;
}

const base = () => (env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

/** Plain public URL on the CDN custom domain — what we store and render from. */
export function publicUrl(key: string): string {
  return `${base()}/${key}`;
}

/**
 * A Cloudflare Image Transformation URL: `/cdn-cgi/image/<opts>/<key>` on the
 * same custom-domain zone. `f=auto` serves AVIF/WebP where supported.
 */
export function transformUrl(key: string, width?: number, quality = 75): string {
  const opts = ["f=auto", `q=${quality}`, width ? `w=${width}` : "", "fit=scale-down"]
    .filter(Boolean)
    .join(",");
  return `${base()}/cdn-cgi/image/${opts}/${key}`;
}

/** Responsive srcset, capped to SRCSET_WIDTHS so unique-transform cost is bounded. */
export function srcSet(key: string, quality = 75): string {
  return SRCSET_WIDTHS.map((w) => `${transformUrl(key, w, quality)} ${w}w`).join(", ");
}

export interface UploadTicket {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  /** The browser MUST send exactly these headers on the PUT, or the signature fails. */
  headers: Record<string, string>;
}

/** A short-lived permit for the browser to PUT one file straight into R2. */
export async function createUploadTicket(opts: {
  projectId: string;
  contentHash: string;
  contentType: string;
  ext?: string;
}): Promise<UploadTicket> {
  const key = objectKey(opts.projectId, opts.contentHash, opts.ext);
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: opts.contentType,
    CacheControl: IMMUTABLE_CACHE,
  });
  const uploadUrl = await getSignedUrl(client(), command, { expiresIn: 600 });
  return {
    uploadUrl,
    key,
    publicUrl: publicUrl(key),
    headers: { "Content-Type": opts.contentType, "Cache-Control": IMMUTABLE_CACHE },
  };
}

/** Removes the object so deleting from the library is real. */
export async function destroyObject(key: string): Promise<boolean> {
  if (!r2Configured()) return false;
  try {
    await client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), {
      abortSignal: AbortSignal.timeout(8000),
    });
    return true;
  } catch {
    // The library row is removed regardless; an orphan is a small price next to
    // a delete that appears to fail.
    return false;
  }
}

/**
 * Private media: an HMAC token a Cloudflare Worker on the custom domain
 * validates before streaming the object from R2 via binding — so it STAYS
 * edge-cacheable, unlike an S3 presigned URL which bypasses the CDN and hits the
 * origin (and a billed Class-B op) on every view. Default marketing media to
 * public-cached; sign only the genuinely-private minority — over-signing kills
 * the north star.
 *
 * ponytail: this is the app-side signer only. The matching Worker and a
 * per-media `visibility` flag are Phase-2, built when a private-media
 * requirement actually lands. Gated on R2_URL_SIGNING_KEY.
 */
export function signedPrivateUrl(key: string, expiresInSec = 3600): string | null {
  if (!env.R2_URL_SIGNING_KEY) return null;
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const sig = createHmac("sha256", env.R2_URL_SIGNING_KEY).update(`${key}:${exp}`).digest("hex");
  return `${publicUrl(key)}?exp=${exp}&sig=${sig}`;
}

/** The check the Worker performs. Constant-time, expiry-enforced. */
export function verifyPrivateUrl(key: string, exp: number, sig: string): boolean {
  if (!env.R2_URL_SIGNING_KEY) return false;
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", env.R2_URL_SIGNING_KEY).update(`${key}:${exp}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
