/**
 * Server-side helper for the website's `/api/revalidate` route — the thing
 * that makes "the client presses Publish and the site updates itself" work.
 */

export interface RevalidatePayload {
  secret: string;
  paths: string[];
}

export type RevalidateCheck =
  | { ok: true; paths: string[] }
  | { ok: false; status: number; error: string };

/**
 * Validates a publish webhook from the CMS.
 *
 * Compares the secret in constant time so a wrong guess cannot be narrowed
 * down by timing the response.
 */
export function checkRevalidateRequest(body: unknown, secret: string): RevalidateCheck {
  if (!secret) {
    return { ok: false, status: 500, error: "No revalidate secret is configured on this site." };
  }

  const payload = body as Partial<RevalidatePayload> | null;
  if (!payload || typeof payload.secret !== "string") {
    return { ok: false, status: 400, error: "Malformed request." };
  }
  if (!safeEqual(payload.secret, secret)) {
    return { ok: false, status: 401, error: "Invalid secret." };
  }

  const paths = Array.isArray(payload.paths)
    ? payload.paths.filter((p): p is string => typeof p === "string")
    : [];

  // A publish with no paths still means "something changed" — refresh the root.
  return { ok: true, paths: paths.length > 0 ? paths.map(tidy) : ["/"] };
}

/** `/` and `/about` — never a full URL, and never a path traversal. */
function tidy(path: string): string {
  const clean = path.replace(/\.\./g, "").replace(/\/+/g, "/");
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
