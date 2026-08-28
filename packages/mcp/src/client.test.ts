import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { PagecraftClient, PagecraftError } from "./client.js";
import type { McpConfig } from "./config.js";
import { API_KEY, EMAIL, PASSWORD, PROJECT_ID, startStubApi, type StubApi } from "./stub-api.js";

/**
 * The HTTP layer against a stub of the real API — so the two authentication
 * schemes, and the token renewal a long-running server depends on, are
 * verified without a database, a live key or a password anywhere.
 */

let api: StubApi;

before(async () => {
  api = await startStubApi();
});
after(() => api.close());
beforeEach(() => {
  api.calls.length = 0;
});

const config = (over: Partial<McpConfig> = {}): McpConfig => ({
  apiUrl: api.baseUrl,
  apiKey: API_KEY,
  email: EMAIL,
  password: PASSWORD,
  readOnly: false,
  ...over,
});

const client = (over: Partial<McpConfig> = {}) => new PagecraftClient({ config: config(over) });

describe("content API (read-only key)", () => {
  it("sends the key and unwraps the envelope", async () => {
    const pages = await client().content<{ slug: string }[]>("/pages");
    assert.deepEqual(pages, [{ slug: "", title: "Home", order: 0, seo: {} }]);
    assert.equal(api.calls[0].apiKey, API_KEY);
    assert.equal(api.calls[0].auth, undefined);
  });

  it("passes a preview token through as a query parameter", async () => {
    const page = await client().content<{ preview: boolean }>("/pages/index", { preview: "tok_1" });
    assert.equal(page.preview, true);
  });

  it("drops empty query values rather than sending key=", async () => {
    await client().content("/pages/index", { preview: undefined });
    assert.equal(api.calls[0].url, "/api/content/pages/index");
  });

  it("turns an API error into a PagecraftError carrying the status", async () => {
    await assert.rejects(client().content("/pages/missing"), (err: PagecraftError) => {
      assert.equal(err.status, 404);
      assert.match(err.message, /no published page/i);
      return true;
    });
  });

  it("explains what to set when there is no content key", async () => {
    await assert.rejects(
      client({ apiKey: undefined }).content("/pages"),
      /PAGECRAFT_API_KEY/
    );
  });

  it("reports an unreachable API as status 0 rather than crashing", async () => {
    const offline = new PagecraftClient({
      config: { apiUrl: "http://127.0.0.1:1", apiKey: "k", readOnly: false },
    });
    await assert.rejects(offline.content("/pages"), (err: PagecraftError) => {
      assert.equal(err.status, 0);
      assert.match(err.message, /Could not reach the Pagecraft API/);
      return true;
    });
  });
});

describe("authoring API (account session)", () => {
  it("signs in once and reuses the token", async () => {
    const c = client();
    const before = api.loginCount();
    await c.authed("GET", "/api/projects");
    await c.authed("GET", "/api/projects");
    assert.equal(api.loginCount() - before, 1);
    assert.match(api.calls.at(-1)!.auth ?? "", /^Bearer access_/);
  });

  it("refuses without account credentials, and says the API key will not do", async () => {
    await assert.rejects(
      client({ email: undefined, password: undefined }).authed("GET", "/api/projects"),
      /read-only and cannot be used here/
    );
  });

  it("renews with the refresh cookie when the token expires, then retries", async () => {
    const c = client();
    await c.authed("GET", "/api/projects");

    const logins = api.loginCount();
    const refreshes = api.refreshCount();
    api.expireTokens();

    const projects = await c.authed<{ id: string }[]>("GET", "/api/projects");
    assert.equal(projects[0].id, PROJECT_ID);
    assert.equal(api.refreshCount() - refreshes, 1, "should have refreshed");
    assert.equal(api.loginCount() - logins, 0, "refresh must be preferred over a rate-limited sign-in");
  });

  it("shares one refresh across tool calls that expire together", async () => {
    // An assistant fires tool calls in parallel, so they hit the same expired
    // token at the same instant. Each renewing on its own would present the
    // already-rotated refresh cookie, be rejected, and fall back to login —
    // a burst of sign-ins against a limit of 10 per 15 minutes per email+IP.
    const c = client();
    await c.authed("GET", "/api/projects");

    const logins = api.loginCount();
    const refreshes = api.refreshCount();
    api.expireTokens();

    const results = await Promise.all(
      Array.from({ length: 6 }, () => c.authed<{ id: string }[]>("GET", "/api/projects"))
    );

    for (const projects of results) assert.equal(projects[0].id, PROJECT_ID);
    assert.equal(api.refreshCount() - refreshes, 1, "six parallel 401s must cost one refresh");
    assert.equal(api.loginCount() - logins, 0, "and never a sign-in");
  });

  it("shares one sign-in across tool calls that start with no token at all", async () => {
    const c = client();
    const logins = api.loginCount();

    await Promise.all(Array.from({ length: 6 }, () => c.authed("GET", "/api/projects")));

    assert.equal(api.loginCount() - logins, 1, "a cold start must sign in once, not six times");
  });

  it("treats a 401 naming a superseded token as stale news, not a reason to renew", async () => {
    // A request already in flight when someone else renews comes back 401 —
    // but its 401 is about the *old* token. Renewing again would rotate the
    // cookie a second time for nothing. The scripted fetch below pins the
    // interleaving that makes this happen, which real timing cannot.
    let liveToken = "";
    const counts = { login: 0, refresh: 0 };
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let alreadyHeldOne = false;

    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      });

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const auth = (init?.headers as Record<string, string> | undefined)?.authorization;

      if (url.endsWith("/api/auth/login")) {
        counts.login += 1;
        liveToken = "access_login";
        return json(200, { success: true, data: { accessToken: liveToken } }, {
          "set-cookie": "pc_refresh=refresh_1; Path=/api/auth; HttpOnly",
        });
      }
      if (url.endsWith("/api/auth/refresh")) {
        counts.refresh += 1;
        liveToken = `access_refreshed_${counts.refresh}`;
        return json(200, { success: true, data: { accessToken: liveToken } }, {
          "set-cookie": `pc_refresh=refresh_${counts.refresh + 1}; Path=/api/auth; HttpOnly`,
        });
      }

      if (auth !== `Bearer ${liveToken}`) {
        // Hold the very first 401 open, so it lands after the renewal it raced.
        if (!alreadyHeldOne) {
          alreadyHeldOne = true;
          await held;
        }
        return json(401, { success: false, error: "Your session has expired." });
      }
      return json(200, { success: true, data: [{ id: PROJECT_ID }] });
    };

    const c = new PagecraftClient({ config: config(), fetchImpl });

    await c.authed("GET", "/api/projects"); // signs in
    liveToken = "expired"; // every outstanding bearer is now stale

    const slow = c.authed<{ id: string }[]>("GET", "/api/projects");
    await new Promise((r) => setImmediate(r)); // let `slow` park on its held 401

    const fast = await c.authed<{ id: string }[]>("GET", "/api/projects");
    assert.equal(fast[0].id, PROJECT_ID);
    assert.equal(counts.refresh, 1, "the unblocked call renews once");

    release(); // now `slow` finally sees its 401, about a token two generations old
    assert.equal((await slow)[0].id, PROJECT_ID, "it must still succeed, on the new token");

    assert.equal(counts.refresh, 1, "and must not have renewed a second time");
    assert.equal(counts.login, 1, "nor fallen back to a rate-limited sign-in");
  });

  it("sends the rotated cookie back on the refresh, not the bearer token", async () => {
    const c = client();
    await c.authed("GET", "/api/projects");
    api.expireTokens();
    await c.authed("GET", "/api/projects");
    const refresh = api.calls.find((call) => call.url === "/api/auth/refresh");
    assert.match(refresh?.cookie ?? "", /pc_refresh=/);
  });

  it("falls back to signing in again when the refresh is rejected", async () => {
    const fresh = new PagecraftClient({ config: config() });
    await fresh.authed("GET", "/api/projects");

    api.breakRefresh();
    api.expireTokens();
    const logins = api.loginCount();

    await fresh.authed("GET", "/api/projects");
    assert.equal(api.loginCount() - logins, 1);
  });

  it("gives up after one retry instead of looping", async () => {
    const wrong = new PagecraftClient({ config: config({ password: "not the password" }) });
    await assert.rejects(wrong.authed("GET", "/api/projects"), (err: PagecraftError) => {
      assert.equal(err.status, 401);
      assert.match(err.message, /do not match/);
      return true;
    });
  });

  it("surfaces per-field issues from a refused publish", async () => {
    await assert.rejects(
      client().authed("POST", "/api/pages/page_unready/publish"),
      (err: PagecraftError) => {
        assert.equal(err.status, 400);
        assert.equal(err.issues?.length, 1);
        assert.match(err.issues![0].message, /Add a headline/);
        return true;
      }
    );
  });

  it("uses a supplied access token without signing in", async () => {
    const logins = api.loginCount();
    const c = new PagecraftClient({
      config: config({ accessToken: api.currentToken(), email: undefined, password: undefined }),
    });
    await c.authed("GET", "/api/projects");
    assert.equal(api.loginCount() - logins, 0);
  });

  it("cannot renew a bare access token, and says why", async () => {
    const c = new PagecraftClient({
      config: config({ accessToken: "stale_token", email: undefined, password: undefined }),
    });
    await assert.rejects(c.authed("GET", "/api/projects"), (err: PagecraftError) => {
      assert.equal(err.status, 401);
      return true;
    });
  });
});

describe("choosing a website", () => {
  it("falls back to PAGECRAFT_PROJECT_ID", () => {
    assert.equal(client({ defaultProjectId: "proj_default" }).projectId(), "proj_default");
    assert.equal(client({ defaultProjectId: "proj_default" }).projectId("proj_other"), "proj_other");
  });

  it("explains itself when neither is set", () => {
    assert.throws(() => client().projectId(), /pagecraft_list_projects/);
  });
});
