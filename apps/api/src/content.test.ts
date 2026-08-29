import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Phase 2 end to end: build a page out of sections, publish it, and read it
 * back through the public API exactly as a client's website would.
 */

let mongo: MongoMemoryServer;
let server: Server;
let hook: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;

/** Records what the "client website" was told when a page was published. */
const hookCalls: { body: any; status: number }[] = [];
let hookStatus = 200;
let hookUrl = "";

let token: string;
let projectId: string;
let apiKey: string;
let homeId: string;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_content");
  process.env.JWT_ACCESS_SECRET = "content-test-access-secret";
  process.env.JWT_REFRESH_SECRET = "content-test-refresh-secret";

  const { connectDb, disconnectDb } = await import("./db.js");
  const { createApp } = await import("./app.js");
  const { User, hashPassword } = await import("./models/user.js");

  await connectDb(process.env.MONGODB_URI);
  disconnect = disconnectDb;

  await User.create({
    email: "dev@example.com",
    plan: "business", // this fixture owns several sites; quotas are tested elsewhere
    name: "Dev",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("correct-horse"),
    projectIds: [],
  });

  // Stand-in for the client's Next.js site and its /api/revalidate route.
  hook = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hookCalls.push({ body: JSON.parse(raw || "{}"), status: hookStatus });
      res.writeHead(hookStatus).end("{}");
    });
  });
  await new Promise<void>((r) => hook.listen(0, r));
  hookUrl = `http://127.0.0.1:${(hook.address() as any).port}/api/revalidate`;

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: "dev@example.com", password: "correct-horse" },
  });
  token = login.json.data.accessToken;

  const project = await api("/api/projects", {
    method: "POST",
    token,
    body: { name: "Rosewater Bakehouse", domain: "rosewaterbakehouse.com" },
  });
  projectId = project.json.data.id;
  apiKey = project.json.data.apiKey;

  await api(`/api/projects/${projectId}`, {
    method: "PATCH",
    token,
    body: { revalidateUrl: hookUrl, revalidateSecret: "whsec_test" },
  });
});

after(async () => {
  server?.close();
  hook?.close();
  await disconnect?.();
  await mongo?.stop();
});

type Json = Record<string, any>;

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; key?: string } = {}
): Promise<{ status: number; json: Json; headers: Headers }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.key ? { "x-api-key": opts.key } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: (await res.json()) as Json, headers: res.headers };
}

/* ------------------------------------------------------------------- pages */

describe("pages", () => {
  it("creates a home page at the root path", async () => {
    const res = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      token,
      body: { title: "Home" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.slug, "", "Home should live at /");
    assert.equal(res.json.data.status, "draft");
    homeId = res.json.data.id;
  });

  it("derives a web address from the page name", async () => {
    const res = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      token,
      body: { title: "Our Story" },
    });
    assert.equal(res.json.data.slug, "our-story");
  });

  it("refuses two pages at the same address", async () => {
    const res = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      token,
      body: { title: "Our Story" },
    });
    assert.equal(res.status, 409);
  });

  it("reorders the website menu", async () => {
    const list = await api(`/api/projects/${projectId}/pages`, { token });
    const ids = list.json.data.map((p: Json) => p.id).reverse();
    const res = await api(`/api/projects/${projectId}/pages/reorder`, {
      method: "PATCH",
      token,
      body: { ids },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data.map((p: Json) => p.id), ids);
  });

  it("rejects a reorder that does not match the real pages", async () => {
    const res = await api(`/api/projects/${projectId}/pages/reorder`, {
      method: "PATCH",
      token,
      body: { ids: ["000000000000000000000000"] },
    });
    assert.equal(res.status, 400);
  });
});

/* ---------------------------------------------------------------- sections */

describe("sections", () => {
  let heroId: string;

  it("adds a section with valid empty content", async () => {
    const res = await api(`/api/pages/${homeId}/sections`, {
      method: "POST",
      token,
      body: { type: "hero" },
    });
    assert.equal(res.status, 201);
    heroId = res.json.data.section.id;
    // Registry defaults, not an empty object.
    assert.deepEqual(res.json.data.section.content.buttons, []);
    assert.equal(res.json.data.section.content.heading, "");
  });

  it("refuses a section type this website has not been given", async () => {
    await api(`/api/projects/${projectId}`, {
      method: "PATCH",
      token,
      body: { allowedSectionTypes: ["hero", "features", "cta"] },
    });
    const res = await api(`/api/pages/${homeId}/sections`, {
      method: "POST",
      token,
      body: { type: "gallery" },
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /not enabled for this website/);
  });

  it("refuses a section type that does not exist at all", async () => {
    const res = await api(`/api/pages/${homeId}/sections`, {
      method: "POST",
      token,
      body: { type: "crypto-widget" },
    });
    assert.equal(res.status, 400);
  });

  it("saves partial content as a draft while the client types", async () => {
    const res = await api(`/api/pages/${homeId}/sections/${heroId}`, {
      method: "PATCH",
      token,
      body: {
        name: "Main Banner",
        content: { heading: "Fresh sourdough, baked every morning", buttons: [] },
      },
    });
    assert.equal(res.status, 200);
    const hero = res.json.data.draftSections.find((s: Json) => s.id === heroId);
    assert.equal(hero.name, "Main Banner");
    assert.equal(hero.content.heading, "Fresh sourdough, baked every morning");
  });

  it("rejects content that would overflow the design", async () => {
    const res = await api(`/api/pages/${homeId}/sections/${heroId}`, {
      method: "PATCH",
      token,
      body: { content: { heading: "x".repeat(200) } },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.issues[0].path, "heading");
  });

  it("rejects more list items than the design can fit", async () => {
    const res = await api(`/api/pages/${homeId}/sections/${heroId}`, {
      method: "PATCH",
      token,
      body: {
        content: {
          heading: "Hi",
          buttons: Array.from({ length: 4 }, (_, i) => ({
            label: `B${i}`,
            href: "/x",
            variant: "Solid",
          })),
        },
      },
    });
    assert.equal(res.status, 400);
    assert.match(res.json.issues[0].message, /Maximum 3 buttons/);
  });

  it("hides a section without deleting it", async () => {
    const res = await api(`/api/pages/${homeId}/sections/${heroId}`, {
      method: "PATCH",
      token,
      body: { visible: false },
    });
    const hero = res.json.data.draftSections.find((s: Json) => s.id === heroId);
    assert.equal(hero.visible, false);
    await api(`/api/pages/${homeId}/sections/${heroId}`, {
      method: "PATCH",
      token,
      body: { visible: true },
    });
  });

  it("reorders sections and renumbers them from zero", async () => {
    await api(`/api/pages/${homeId}/sections`, { method: "POST", token, body: { type: "cta" } });
    const page = await api(`/api/pages/${homeId}`, { token });
    const ids = page.json.data.draftSections.map((s: Json) => s.id).reverse();

    const res = await api(`/api/pages/${homeId}/sections-reorder`, {
      method: "PATCH",
      token,
      body: { ids },
    });
    assert.deepEqual(res.json.data.draftSections.map((s: Json) => s.id), ids);
    assert.deepEqual(res.json.data.draftSections.map((s: Json) => s.order), [0, 1]);
  });

  it("deletes a section", async () => {
    const page = await api(`/api/pages/${homeId}`, { token });
    const cta = page.json.data.draftSections.find((s: Json) => s.type === "cta");
    const res = await api(`/api/pages/${homeId}/sections/${cta.id}`, { method: "DELETE", token });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.draftSections.some((s: Json) => s.id === cta.id), false);
  });
});

/* ----------------------------------------------------------------- publish */

describe("publish", () => {
  it("keeps drafts invisible to the website until published", async () => {
    const res = await api("/api/content/pages", { key: apiKey });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data, [], "nothing is published yet");
  });

  it("refuses to publish a page with a required field still blank", async () => {
    // Add a second hero and leave its headline empty.
    const added = await api(`/api/pages/${homeId}/sections`, {
      method: "POST",
      token,
      body: { type: "hero" },
    });
    const emptyId = added.json.data.section.id;

    const res = await api(`/api/pages/${homeId}/publish`, { method: "POST", token });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /not ready to go live/);
    assert.match(res.json.issues[0].message, /cannot be empty/);

    await api(`/api/pages/${homeId}/sections/${emptyId}`, { method: "DELETE", token });
  });

  it("publishes, timestamps, and clears the draft flag", async () => {
    const res = await api(`/api/pages/${homeId}/publish`, { method: "POST", token });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.page.status, "published");
    assert.equal(res.json.data.page.hasDraftChanges, false);
    assert.ok(res.json.data.page.publishedAt);
  });

  it("tells the client website to refresh, with the shared secret", async () => {
    const call = hookCalls.at(-1);
    assert.ok(call, "the webhook should have been called");
    assert.equal(call!.body.secret, "whsec_test");
    assert.deepEqual(call!.body.paths, ["/"]);
  });

  it("still publishes when the website cannot be reached", async () => {
    hookStatus = 500;
    await api(`/api/pages/${homeId}/sections`, { method: "POST", token, body: { type: "features" } });
    const page = await api(`/api/pages/${homeId}`, { token });
    const features = page.json.data.draftSections.find((s: Json) => s.type === "features");
    await api(`/api/pages/${homeId}/sections/${features.id}`, {
      method: "PATCH",
      token,
      body: {
        content: {
          heading: "Why people keep coming back",
          // `features` declares min 1, which publish enforces.
          items: [
            { title: "Slow fermented", description: "Overnight, always.", bullets: [] },
          ],
        },
      },
    });

    const res = await api(`/api/pages/${homeId}/publish`, { method: "POST", token });
    assert.equal(res.status, 200, "the publish itself must succeed");
    assert.equal(res.json.data.revalidated.ok, false);
    assert.match(res.json.data.revalidated.message, /saved and live in the CMS/);
    hookStatus = 200;
  });

  it("throws away unpublished changes on discard", async () => {
    const before = await api(`/api/pages/${homeId}`, { token });
    const liveCount = before.json.data.sections.length;

    await api(`/api/pages/${homeId}/sections`, { method: "POST", token, body: { type: "cta" } });
    const dirty = await api(`/api/pages/${homeId}`, { token });
    assert.equal(dirty.json.data.hasDraftChanges, true);
    assert.equal(dirty.json.data.draftSections.length, liveCount + 1);

    const res = await api(`/api/pages/${homeId}/discard-draft`, { method: "POST", token });
    assert.equal(res.json.data.draftSections.length, liveCount);
    assert.equal(res.json.data.hasDraftChanges, false);
  });
});

/* ---------------------------------------------------- public content API */

describe("public content api", () => {
  it("refuses an unknown api key", async () => {
    const res = await api("/api/content/pages", { key: "pk_live_nope" });
    assert.equal(res.status, 401);
  });

  it("refuses no api key at all", async () => {
    const res = await api("/api/content/pages");
    assert.equal(res.status, 401);
  });

  it("lists published pages for the website menu", async () => {
    const res = await api("/api/content/pages", { key: apiKey });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.length, 1);
    assert.equal(res.json.data[0].slug, "");
  });

  it("serves the home page with its ordered sections", async () => {
    const res = await api("/api/content/home", { key: apiKey });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.sections.length > 0);
    assert.deepEqual(
      res.json.data.sections.map((s: Json) => s.order),
      res.json.data.sections.map((_: Json, i: number) => i)
    );
  });

  it("is cacheable, which is what keeps a site fast", async () => {
    const res = await api("/api/content/home", { key: apiKey });
    assert.match(res.headers.get("cache-control") ?? "", /s-maxage=60/);
  });

  it("never exposes a draft", async () => {
    const res = await api("/api/content/home", { key: apiKey });
    assert.equal("draftSections" in res.json.data, false);
    assert.equal(res.json.data.preview, false);
  });

  it("omits sections the client has hidden", async () => {
    const page = await api(`/api/pages/${homeId}`, { token });
    const first = page.json.data.draftSections[0];
    await api(`/api/pages/${homeId}/sections/${first.id}`, {
      method: "PATCH",
      token,
      body: { visible: false },
    });
    await api(`/api/pages/${homeId}/publish`, { method: "POST", token });

    const res = await api("/api/content/home", { key: apiKey });
    assert.equal(res.json.data.sections.some((s: Json) => s.id === first.id), false);

    await api(`/api/pages/${homeId}/sections/${first.id}`, {
      method: "PATCH",
      token,
      body: { visible: true },
    });
    await api(`/api/pages/${homeId}/publish`, { method: "POST", token });
  });

  it("404s for a page that is not published", async () => {
    const res = await api("/api/content/pages/our-story", { key: apiKey });
    assert.equal(res.status, 404);
  });

  it("shows the draft through a signed preview token, uncached", async () => {
    await api(`/api/pages/${homeId}/sections`, { method: "POST", token, body: { type: "cta" } });
    const minted = await api(`/api/pages/${homeId}/preview-token`, { method: "POST", token });
    const previewToken = minted.json.data.token;

    const live = await api("/api/content/pages/index", { key: apiKey });
    const preview = await api(`/api/content/pages/index?preview=${previewToken}`, { key: apiKey });

    assert.equal(preview.json.data.preview, true);
    assert.equal(preview.json.data.sections.length, live.json.data.sections.length + 1);
    assert.match(preview.headers.get("cache-control") ?? "", /no-store/);
  });

  it("ignores a forged preview token", async () => {
    const res = await api("/api/content/pages/index?preview=not-a-real-token", { key: apiKey });
    assert.equal(res.json.data.preview, false);
  });

  it("cannot read another website's content with the wrong key", async () => {
    const other = await api("/api/projects", {
      method: "POST",
      token,
      body: { name: "Halden Industrial" },
    });
    const res = await api("/api/content/pages", { key: other.json.data.apiKey });
    assert.deepEqual(res.json.data, [], "a key only ever sees its own project");
  });
});

/* --------------------------------------------------- rate limiting the public api */

describe("public content api rate limit", () => {
  it("throttles a flood from one source before it can hammer the database", async () => {
    const { resetRateLimits } = await import("./middleware/rate-limit.js");
    resetRateLimits();

    const LIMIT = 120; // must match the max in routes/content.ts

    // The first request both counts as one and advertises the limit.
    const first = await api("/api/content/pages", { key: apiKey });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("ratelimit-limit"), String(LIMIT));

    // LIMIT more requests take the count to LIMIT+1; exactly one is refused.
    const rest = await Promise.all(
      Array.from({ length: LIMIT }, () => api("/api/content/pages", { key: apiKey }))
    );
    const blocked = rest.filter((r) => r.status === 429);
    assert.equal(blocked.length, 1, "one request past the limit is refused");
    assert.equal(blocked[0].json.success, false);
    assert.match(blocked[0].json.error, /too many requests/i);

    // The limiter runs before the key check, so even a bad key is throttled.
    const badKeyWhileBlocked = await api("/api/content/pages", { key: "pk_live_nope" });
    assert.equal(badKeyWhileBlocked.status, 429, "throttled before requireApiKey");

    resetRateLimits(); // leave no state behind for anything that runs after.
  });
});
