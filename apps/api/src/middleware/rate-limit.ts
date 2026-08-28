import type { NextFunction, Request, Response } from "express";
import { fail } from "../lib/respond.js";

/**
 * A small fixed-window limiter, held in memory.
 *
 * In memory is honest about what this is: protection against a script hammering
 * the signup form or guessing passwords, not a distributed quota system. It
 * resets when the API restarts and counts per instance, which is exactly right
 * for a single always-on Render service. If this CMS ever runs on several
 * instances at once, this is the piece to move to Redis — nothing else here
 * keeps state.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Without this the map grows one entry per attacker IP, forever.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
sweep.unref?.();

interface Options {
  /** How many requests are allowed inside the window. */
  max: number;
  windowMs: number;
  message: string;
  /**
   * What to count per. Defaults to the caller's IP; auth routes add the email
   * address so one person on a shared office IP cannot lock out their
   * colleagues, and so an attacker cannot spread guesses across addresses.
   */
  keyOn?: (req: Request) => string;
  /**
   * A fixed name for the bucket, replacing the request path.
   *
   * By default a bucket is per method+path, which is right for the signed-out
   * routes: one URL, one limit. It is *wrong* for anything under
   * `/projects/:projectId/...`, where the path carries an id the caller chooses
   * — every extra website would mint a fresh bucket and the limit would count
   * nothing. Give those a `scope` so one account shares one budget however many
   * websites it owns.
   */
  scope?: string;
}

export function rateLimit({ max, windowMs, message, keyOn, scope }: Options) {
  return (req: Request, res: Response, next: NextFunction) => {
    const bucketName = scope ?? `${req.method}:${req.baseUrl}${req.path}`;
    const key = `${bucketName}:${keyOn ? keyOn(req) : req.ip}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return fail(res, 429, message);
    }

    next();
  };
}

/**
 * Counts by signed-in account, falling back to IP for anyone not authenticated.
 *
 * Pair it with a `scope`: keyed on the user alone, the budget follows the
 * account across every website it owns, so creating more projects buys no extra
 * quota.
 */
export const byUserId = (req: Request) => req.user?._id.toString() ?? `ip:${req.ip}`;

/** Counts by IP and email together — see `keyOn` above. */
export const byEmailAndIp = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
  return `${req.ip}|${email}`;
};

/** Test seam: the suite runs many logins in a row and must not trip the limiter. */
export function resetRateLimits() {
  buckets.clear();
}
