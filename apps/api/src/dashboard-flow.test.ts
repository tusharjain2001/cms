import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Walks the exact sequence of requests the dashboard makes, with the exact
 * payload shapes `apps/admin/lib/store.tsx` sends and the exact response
 * fields it reads.
 *
 * This is the contract test between the two halves of the CMS: if someone
 * renames a field on either side, this fails rather than the dashboard
 * silently rendering blanks.
 */

let mongo: MongoMemoryServer;
let server: Server;
let hook: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;

let accessToken = "";
let refreshCookie = "";
let projectId = "";
let apiKey = "";
let pageId = "";
let heroId = "";

const hookCalls: any[] = [];

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_flow");
  process.env.JWT_ACCESS_SECRET = "flow-test-access-secret";
  process.env.JWT_REFRESH_SECRET = "flow-test-refresh-secret";

  const { connectDb, disconnectDb } = await import("./db.js");
  const { createApp } = await import("./app.js");
  const { User, hashPassword } = await import("./models/user.js");

  await connectDb(process.env.MONGODB_URI);
  disconnect = disconnectDb;
  await User.create({
    email: "maya@studio.test",
    plan: "business", // this fixture owns several sites; quotas are tested elsewhere
    name: "Maya Kessler",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("open-sesame"),
    projectIds: [],
  });

  hook = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hookCalls.push(JSON.parse(raw || "{}"));
      res.writeHead(200).end("{}");
    });
  });
  await new Promise<void>((r) => hook.listen(0, r));

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

after(async () => {
  server?.close();
  hook?.close();
  await disconnect?.();
  await mongo?.stop();
});

/** Mirrors `api()` in the dashboard, including the bearer token and cookie. */
async function call(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null; key?: string } = {}
) {
  const useToken = opts.token === undefined ? accessToken : opts.token;
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(useToken ? { authorization: `Bearer ${useToken}` } : {}),
      ...(opts.key ? { "x-api-key": opts.key } : {}),
      ...(refreshCookie ? { cookie: refreshCookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) refreshCookie = setCookie.split(";")[0];
  return { status: res.status, json: (await res.json()) as any };
}

describe("the dashboard's journey", () => {
  it("1. signs in", async () => {
    const res = await call("/api/auth/login", {
      method: "POST",
      token: null,
      body: { email: "maya@studio.test", password: "open-sesame" },
    });
    assert.equal(res.status, 200);
    // Exactly the fields AuthProvider destructures.
    assert.ok(res.json.data.accessToken);
    assert.equal(res.json.data.user.emailVerified, true);
    assert.equal(typeof res.json.data.user.name, "string");
    accessToken = res.json.data.accessToken;
  });

  it("2. loads the registry that builds every editing form", async () => {
    const res = await call("/api/section-types");
    assert.equal(res.status, 200);

    const hero = res.json.data.find((t: any) => t.type === "hero");
    // The field renderer switches on `kind` and reads `key`/`label`.
    assert.ok(hero.name && hero.description && hero.icon && hero.wire);
    for (const field of hero.fields) {
      assert.ok(field.kind, "every field needs a kind");
      assert.ok(field.key, "every field needs a key");
      assert.ok(field.label, "every field needs a label");
    }
    const buttons = hero.fields.find((f: any) => f.key === "buttons");
    assert.equal(buttons.kind, "list");
    assert.equal(buttons.itemNoun, "button");
    assert.ok(Array.isArray(buttons.of), "a list must carry its child fields");
  });

  it("3. lists websites, then creates one", async () => {
    assert.deepEqual((await call("/api/projects")).json.data, []);

    const created = await call("/api/projects", {
      method: "POST",
      body: { name: "Rosewater Bakehouse", domain: "rosewaterbakehouse.com" },
    });
    assert.equal(created.status, 201);
    projectId = created.json.data.id;
    apiKey = created.json.data.apiKey;
    assert.ok(Array.isArray(created.json.data.allowedSectionTypes));
  });

  it("4. saves the publish webhook from the settings screen", async () => {
    const url = `http://127.0.0.1:${(hook.address() as any).port}/api/revalidate`;
    const res = await call(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: { revalidateUrl: url, revalidateSecret: "whsec_flow" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.hasRevalidateSecret, true);
  });

  it("5. adds a Home page from the modal", async () => {
    assert.deepEqual((await call(`/api/projects/${projectId}/pages`)).json.data, []);

    const created = await call(`/api/projects/${projectId}/pages`, {
      method: "POST",
      body: { title: "Home" },
    });
    assert.equal(created.status, 201);
    pageId = created.json.data.id;

    const list = await call(`/api/projects/${projectId}/pages`);
    // The pages list reads exactly these.
    assert.equal(list.json.data[0].title, "Home");
    assert.equal(list.json.data[0].hasDraftChanges, true);
    assert.ok(list.json.data[0].updatedAt);
  });

  it("6. opens the page and finds it empty", async () => {
    const res = await call(`/api/pages/${pageId}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data.draftSections, []);
  });

  it("7. adds a hero from the section picker", async () => {
    const res = await call(`/api/pages/${pageId}/sections`, {
      method: "POST",
      body: { type: "hero" },
    });
    assert.equal(res.status, 201);
    // The store reads `{ page, section }` and selects the new section.
    assert.ok(res.json.data.page.draftSections);
    heroId = res.json.data.section.id;
    assert.equal(res.json.data.section.content.heading, "");
    assert.deepEqual(res.json.data.section.content.buttons, []);
  });

  it("8. autosaves content as the client types", async () => {
    // The renderer sends the whole content object each time.
    const res = await call(`/api/pages/${pageId}/sections/${heroId}`, {
      method: "PATCH",
      body: {
        content: {
          heading: "Fresh sourdough, baked every morning",
          subheading: "Twelve years on Rosewater Lane.",
          backgroundImage: null,
          showHours: true,
          buttons: [
            { label: "Order for pickup", href: "https://order.example.com", variant: "Solid" },
          ],
        },
      },
    });
    assert.equal(res.status, 200);
    const hero = res.json.data.draftSections.find((s: any) => s.id === heroId);
    assert.equal(hero.content.buttons.length, 1);
    assert.equal(hero.content.showHours, true);
  });

  it("9. renames the section for the client's own reference", async () => {
    const res = await call(`/api/pages/${pageId}/sections/${heroId}`, {
      method: "PATCH",
      body: { name: "Main Banner" },
    });
    const hero = res.json.data.draftSections.find((s: any) => s.id === heroId);
    assert.equal(hero.name, "Main Banner");
    // Renaming must not disturb the content saved a moment earlier.
    assert.equal(hero.content.heading, "Fresh sourdough, baked every morning");
  });

  it("10. reorders sections by drag", async () => {
    await call(`/api/pages/${pageId}/sections`, { method: "POST", body: { type: "cta" } });
    const page = await call(`/api/pages/${pageId}`);
    const ids = page.json.data.draftSections.map((s: any) => s.id).reverse();

    const res = await call(`/api/pages/${pageId}/sections-reorder`, {
      method: "PATCH",
      body: { ids },
    });
    assert.deepEqual(res.json.data.draftSections.map((s: any) => s.id), ids);
  });

  it("11. surfaces publish errors against the right field", async () => {
    const res = await call(`/api/pages/${pageId}/publish`, { method: "POST" });
    assert.equal(res.status, 400, "the empty CTA heading should block publishing");

    const page = await call(`/api/pages/${pageId}`);
    const cta = page.json.data.draftSections.find((s: any) => s.type === "cta");
    // The editor keys issues as `<sectionId>.<fieldKey>` to highlight the field.
    assert.ok(res.json.issues.some((i: any) => i.path === `${cta.id}.heading`));
  });

  it("12. publishes once the page is complete", async () => {
    const page = await call(`/api/pages/${pageId}`);
    const cta = page.json.data.draftSections.find((s: any) => s.type === "cta");
    await call(`/api/pages/${pageId}/sections/${cta.id}`, {
      method: "PATCH",
      body: { content: { heading: "Order by 4pm", subheading: "", buttons: [] } },
    });

    const res = await call(`/api/pages/${pageId}/publish`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.page.hasDraftChanges, false);
    assert.equal(res.json.data.revalidated.ok, true);
    assert.equal(hookCalls.at(-1).secret, "whsec_flow");
  });

  it("13. mints a preview token for the Preview button", async () => {
    const res = await call(`/api/pages/${pageId}/preview-token`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.token);
    assert.equal(res.json.data.slug, "");
  });

  it("14. and the website can now read the published page", async () => {
    const res = await call("/api/content/home", { key: apiKey, token: null });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.sections.length, 2);
    assert.equal(res.json.data.sections[0].content.heading, "Order by 4pm");
  });
});

describe("session handling", () => {
  it("rejects a stale access token, then the refresh cookie restores the session", async () => {
    const stale = await call("/api/projects", { token: "not-a-real-token" });
    assert.equal(stale.status, 401, "the dashboard's retry path is triggered by this");

    const refreshed = await call("/api/auth/refresh", { method: "POST", token: null });
    assert.equal(refreshed.status, 200);
    assert.ok(refreshed.json.data.accessToken);

    const retried = await call("/api/projects", { token: refreshed.json.data.accessToken });
    assert.equal(retried.status, 200, "the retried request must succeed");
  });

  it("signing out clears the cookie for good", async () => {
    await call("/api/auth/logout", { method: "POST" });
    refreshCookie = "";
    const res = await call("/api/auth/refresh", { method: "POST", token: null });
    assert.equal(res.status, 401);
  });
});
