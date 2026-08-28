import type { ApiErrorCode, ApiResponse } from "@pagecraft/shared";
import { hasSessionCredentials, type McpConfig } from "./config.js";

/**
 * The HTTP layer between the MCP tools and the Pagecraft API.
 *
 * It speaks the API's two authentication schemes and keeps them apart on
 * purpose, because they are not equivalent:
 *
 * - `content()` sends `x-api-key` to `/api/content/*`. Published content only.
 * - `authed()` sends `Authorization: Bearer <accessToken>` everywhere else, and
 *   is what every write goes through.
 *
 * Access tokens expire after 15 minutes, so a server that stays open all day
 * has to be able to get a new one. It does that the same way the dashboard
 * does: `POST /api/auth/refresh` with the rotating refresh cookie, falling back
 * to a fresh sign-in. `POST /api/auth/login` is rate limited to 10 attempts per
 * 15 minutes per email+IP, which is exactly why the refresh path exists rather
 * than simply signing in again on every 401.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

export class PagecraftError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: ApiErrorCode,
    /** Per-field reasons — a publish that is not ready fills this in. */
    public issues?: ValidationIssue[]
  ) {
    super(message);
    this.name = "PagecraftError";
  }
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface PagecraftClientOptions {
  config: McpConfig;
  /** Test seam. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const REFRESH_COOKIE = "pc_refresh";

/** Node exposes `getSetCookie()`; the fallback keeps this honest elsewhere. */
function setCookieValues(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function readRefreshCookie(headers: Headers): string | undefined {
  for (const raw of setCookieValues(headers)) {
    const match = /(?:^|,\s*)pc_refresh=([^;]*)/.exec(raw);
    if (match) return match[1];
  }
  return undefined;
}

export class PagecraftClient {
  private readonly config: McpConfig;
  private readonly doFetch: typeof fetch;
  private accessToken?: string;
  private refreshToken?: string;
  /**
   * The one in-flight attempt to obtain an access token, shared by every caller
   * that needs one — the first sign-in *and* every post-401 renewal.
   *
   * Both paths go through it because an assistant fires tool calls in parallel,
   * so ten of them hit the same expired token at the same moment. Ten separate
   * renewals would be worse than merely wasteful: the refresh cookie **rotates**
   * on use, so nine of them would present a spent cookie, be rejected, and fall
   * through to `login()` — nine sign-ins against a limit of 10 per 15 minutes
   * per email+IP. One shared attempt makes that burst cost exactly one refresh.
   */
  private pending: Promise<boolean> | null = null;

  constructor({ config, fetchImpl }: PagecraftClientOptions) {
    this.config = config;
    this.doFetch = fetchImpl ?? globalThis.fetch;
    this.accessToken = config.accessToken;
  }

  get hasContentKey(): boolean {
    return Boolean(this.config.apiKey);
  }

  get hasSession(): boolean {
    return hasSessionCredentials(this.config);
  }

  /** Resolves the project a tool should act on, or explains what to set. */
  projectId(given?: string): string {
    const id = (given ?? this.config.defaultProjectId ?? "").trim();
    if (!id) {
      throw new PagecraftError(
        400,
        "No website chosen. Pass projectId, or set PAGECRAFT_PROJECT_ID so it does not have to be repeated. " +
          "pagecraft_list_projects shows the ids you have access to."
      );
    }
    return id;
  }

  /* ------------------------------------------------- the public content API */

  async content<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    if (!this.config.apiKey) {
      throw new PagecraftError(
        401,
        "This tool reads the public content API, which needs PAGECRAFT_API_KEY (the website's read-only key, on its Settings screen)."
      );
    }
    const res = await this.send("GET", `/api/content${path}${queryString(query)}`, undefined, {
      "x-api-key": this.config.apiKey,
    });
    return this.unwrap<T>(res);
  }

  /* --------------------------------------------------- the authoring API */

  async authed<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    if (!this.hasSession) {
      throw new PagecraftError(
        401,
        "This tool edits your website, which needs an account sign-in: set PAGECRAFT_EMAIL and PAGECRAFT_PASSWORD. " +
          "A website's API key is read-only and cannot be used here."
      );
    }

    await this.ensureToken();
    // Remember which token this request was signed with. If a parallel call has
    // already replaced it by the time our 401 lands, that 401 is stale news and
    // retrying with the new token costs nothing.
    const sentWith = this.accessToken;
    let res = await this.send(method, path, body, this.bearer());

    // One retry, and only for an expired or invalidated token.
    if (res.status === 401) {
      const renewed = await this.renew(sentWith);
      if (renewed) res = await this.send(method, path, body, this.bearer());
    }

    return this.unwrap<T>(res);
  }

  /** A raw PUT of file bytes to a presigned storage URL — not the Pagecraft API. */
  async putToStorage(url: string, body: Uint8Array, headers: Record<string, string>): Promise<void> {
    let res: Response;
    try {
      res = await this.doFetch(url, { method: "PUT", body, headers });
    } catch (err) {
      throw new PagecraftError(0, `Could not reach the storage endpoint: ${String(err)}`);
    }
    if (!res.ok) {
      throw new PagecraftError(res.status, `Storage refused the upload (HTTP ${res.status}).`);
    }
  }

  /* ------------------------------------------------------------- internals */

  private bearer(): Record<string, string> {
    return this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {};
  }

  private async send(
    method: HttpMethod,
    path: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<Response> {
    const init: RequestInit = { method, headers: { accept: "application/json", ...headers } };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { ...init.headers, "content-type": "application/json" };
    }
    try {
      return await this.doFetch(`${this.config.apiUrl}${path}`, init);
    } catch (err) {
      throw new PagecraftError(0, `Could not reach the Pagecraft API at ${this.config.apiUrl}: ${String(err)}`);
    }
  }

  private async unwrap<T>(res: Response): Promise<T> {
    const payload = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!payload) {
      throw new PagecraftError(res.status, `The API sent back something unexpected (HTTP ${res.status}).`);
    }
    if (!payload.success) {
      throw new PagecraftError(res.status, payload.error, payload.code, payload.issues);
    }
    return payload.data;
  }

  /**
   * Runs `work` unless an attempt is already in flight, in which case this
   * caller waits on that one and takes its answer. A rejection is shared too:
   * if the sign-in failed for everybody, it failed for this caller as well.
   */
  private share(work: () => Promise<boolean>): Promise<boolean> {
    if (!this.pending) {
      this.pending = work().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /** Signs in if there is no token yet. Concurrent callers share one attempt. */
  private async ensureToken(): Promise<void> {
    if (this.accessToken) return;
    await this.share(async () => {
      // A caller that queued behind an earlier renewal may find a token waiting.
      if (this.accessToken) return true;
      await this.login();
      return true;
    });
  }

  /**
   * Gets a new access token after a 401. Refresh first — it is unmetered and
   * rotates the cookie; a full sign-in is the fallback and is rate limited.
   * Returns false when there is nothing left to try, so the 401 stands.
   *
   * `sentWith` is the token the failed request carried. If the current token is
   * no longer that one, someone else has already renewed and there is nothing
   * to do but retry — no second refresh, no network call at all.
   */
  private async renew(sentWith?: string): Promise<boolean> {
    if (this.accessToken && this.accessToken !== sentWith) return true;

    return this.share(async () => {
      if (this.accessToken && this.accessToken !== sentWith) return true;
      this.accessToken = undefined;

      if (this.refreshToken) {
        const res = await this.send("POST", "/api/auth/refresh", undefined, {
          cookie: `${REFRESH_COOKIE}=${this.refreshToken}`,
        });
        if (res.ok) {
          await this.absorbSession(res);
          return true;
        }
        // A rejected refresh means the token is spent or the password changed.
        this.refreshToken = undefined;
      }

      if (!this.config.email || !this.config.password) return false;
      await this.login();
      return true;
    });
  }

  private async login(): Promise<void> {
    if (!this.config.email || !this.config.password) {
      throw new PagecraftError(
        401,
        "The access token has expired and there is no PAGECRAFT_EMAIL / PAGECRAFT_PASSWORD to sign in with again."
      );
    }
    const res = await this.send("POST", "/api/auth/login", {
      email: this.config.email,
      password: this.config.password,
    }, {});
    await this.absorbSession(res);
  }

  private async absorbSession(res: Response): Promise<void> {
    const cookie = readRefreshCookie(res.headers);
    if (cookie) this.refreshToken = cookie;
    const data = await this.unwrap<{ accessToken: string }>(res);
    this.accessToken = data.accessToken;
  }
}

function queryString(query?: Record<string, string | undefined>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}
