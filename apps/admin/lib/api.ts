/**
 * The one place the dashboard talks to the CMS API.
 *
 * The access token is kept in memory only — never in localStorage, where any
 * script on the page could read it. Longevity comes from the refresh cookie,
 * which is httpOnly and therefore invisible to JavaScript. When a request comes
 * back 401 we silently refresh once and retry, so a client editing a page for
 * an hour never sees a session expire.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export interface ApiIssue {
  path: string;
  message: string;
}

/** Matches `ApiErrorCode` in @pagecraft/shared. */
export type ApiCode = "email_not_verified" | "email_not_configured";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: ApiIssue[] = [],
    /**
     * Set only where the UI has to branch on the reason rather than just show
     * the message — an unconfirmed sign-in needs a "resend" button, not a
     * sentence. Matching on the English text would break on the first reword.
     */
    public code?: ApiCode
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
/** Set when a refresh fails, so the app can send the user back to sign in. */
let onSessionLost: (() => void) | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken;
export const setSessionLostHandler = (fn: (() => void) | null) => {
  onSessionLost = fn;
};

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Internal: prevents an infinite refresh loop. */
  retrying?: boolean;
}

async function raw(path: string, opts: Options): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    // Carries the refresh cookie on /api/auth calls.
    credentials: "include",
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await raw(path, opts);
  } catch {
    throw new ApiError(0, "Could not reach the CMS. Check your connection and try again.");
  }

  if (res.status === 401 && !opts.retrying && !path.startsWith("/api/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) return api<T>(path, { ...opts, retrying: true });
    onSessionLost?.();
    throw new ApiError(401, "Your session has ended. Please sign in again.");
  }

  const payload = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; error: string; issues?: ApiIssue[]; code?: ApiCode }
    | null;

  if (!payload) throw new ApiError(res.status, "The CMS sent back something unexpected.");
  if (!payload.success) {
    throw new ApiError(res.status, payload.error, payload.issues ?? [], payload.code);
  }
  return payload.data;
}

/** Swaps the refresh cookie for a new access token. Returns false if signed out. */
export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await raw("/api/auth/refresh", { method: "POST" });
    if (!res.ok) return false;
    const payload = (await res.json()) as { success: boolean; data?: { accessToken: string } };
    if (!payload.success || !payload.data) return false;
    accessToken = payload.data.accessToken;
    return true;
  } catch {
    return false;
  }
}
