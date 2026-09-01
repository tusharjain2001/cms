import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { Server } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";
import { formatMoney, PRICE_PER_WEBSITE_MONTHLY_CENTS as UNIT } from "@pagecraft/shared";

/**
 * The write-scoped project token and the plan quotas.
 *
 * These are the resale story's trust boundary, so the tests care most about what
 * a token must NOT be able to do: touch another website, change settings, or
 * mint more tokens. Runs against a real in-memory MongoDB so the access rules
 * and the quota counting are genuinely exercised.
 */

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;
let Page: typeof import("./models/page.js").Page;
let Media: typeof import("./models/media.js").Media;
let ProjectToken: typeof import("./models/project-token.js").ProjectToken;
let User: typeof import("./models/user.js").User;

before(async () => {
  mongo = await MongoMemoryServer.create();

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_tokens_test");
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value";
  process.env.ADMIN_ORIGIN = "http://localhost:3000";

  const { connectDb, disconnectDb } = await import("./db.js");
  const { createApp } = await import("./app.js");
  const { User: UserModel, hashPassword } = await import("./models/user.js");
  User = UserModel;
  ({ Page } = await import("./models/page.js"));
  ({ Media } = await import("./models/media.js"));
  ({ ProjectToken } = await import("./models/project-token.js"));

  await connectDb(process.env.MONGODB_URI);
  disconnect = disconnectDb;

  await User.create({
    email: "owner@example.com",
    name: "Owner",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("owner-pass"),
    projectIds: [],
    // Websites are what money buys, so a fixture that owns any must pay for
    // them — an account with no live subscription is allowed zero.
    plan: "starter",
    subscription: { status: "active", websites: 5, period: "monthly" },
  });
  await User.create({
    email: "other@example.com",
    name: "Other",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("other-pass"),
    projectIds: [],
    // Subscribed to start with, because the isolation tests need it to own a
    // website. The ceiling suite below strips this back down deliberately.
    plan: "starter",
    subscription: { status: "active", websites: 5, period: "monthly" },
  });

  server = createApp().listen(0);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  server?.close();
  await disconnect?.();
  await mongo?.stop();
});

type Json = Record<string, any>;

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; projectToken?: string } = {}
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.projectToken ? { "x-project-token": opts.projectToken } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: (await res.json()) as Json };
}

const login = async (email: string, password: string) => {
  const res = await api("/api/auth/login", { method: "POST", body: { email, password } });
  return res.json.data.accessToken as string;
};

async function makeProject(token: string, name: string): Promise<string> {
  const res = await api("/api/projects", { method: "POST", token, body: { name } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json.data.id as string;
}

/**
 * A refusal message must quote a price. Escaped before it becomes a RegExp,
 * because `formatMoney` returns "$7.99" and a bare `$` in a pattern means
 * end-of-string — the obvious version would silently never match.
 */
const priceRe = (minor: number) =>
  new RegExp(`${formatMoney(minor).replace(/[.*+?^${}()|[\\\]]/g, "\\$&")} a month`);

describe("write-scoped project tokens", () => {
  let ownerToken: string;
  let otherToken: string;
  let projectId: string;
  let rawToken: string;

  before(async () => {
    ownerToken = await login("owner@example.com", "owner-pass");
    otherToken = await login("other@example.com", "other-pass");
    projectId = await makeProject(ownerToken, "Owner Site");
  });

  it("owner mints a token and gets the secret exactly once", async () => {
    const res = await api(`/api/projects/${projectId}/tokens`, {
      method: "POST",
      token: ownerToken,
      body: { label: "Client dev" },
    });
    assert.equal(res.status, 201);
    assert.match(res.json.data.token, /^pwt_live_[a-f0-9]{48}$/);
    assert.equal(res.json.data.label, "Client dev");
    rawToken = res.json.data.token;

    // The list endpoint never returns the raw secret again.
    const list = await api(`/api/projects/${projectId}/tokens`, { token: ownerToken });
    assert.equal(list.json.data.length, 1);
    assert.equal(list.json.data[0].token, undefined);
    assert.ok(list.json.data[0].prefix.startsWith("pwt_live_"));
  });

  it("authors a page on its own website", async () => {
    const res = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      projectToken: rawToken,
      body: { title: "About" },
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(res.json.data.title, "About");
  });

  it("can read its own website (get_project via the token)", async () => {
    const res = await api(`/api/projects/${projectId}`, { projectToken: rawToken });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.id, projectId);
    // A token is an editor of the site, never its owner.
    assert.equal(res.json.data.role, "editor");
  });

  it("cannot touch another website", async () => {
    const otherProject = await makeProject(otherToken, "Other Site");
    const res = await api(`/api/projects/${otherProject}/pages`, {
      method: "POST",
      projectToken: rawToken,
      body: { title: "Sneaky" },
    });
    assert.equal(res.status, 403);
  });

  it("cannot change the website's settings", async () => {
    // Owner-only routes require an account JWT; a project token is not one.
    const res = await api(`/api/projects/${projectId}`, {
      method: "PATCH",
      projectToken: rawToken,
      body: { name: "Renamed by token" },
    });
    assert.equal(res.status, 401);
  });

  it("cannot mint more tokens", async () => {
    const res = await api(`/api/projects/${projectId}/tokens`, {
      method: "POST",
      projectToken: rawToken,
      body: { label: "escalation" },
    });
    assert.equal(res.status, 401);
  });

  it("stops working the moment it is revoked", async () => {
    const list = await api(`/api/projects/${projectId}/tokens`, { token: ownerToken });
    const tokenId = list.json.data[0].id as string;

    const del = await api(`/api/projects/${projectId}/tokens/${tokenId}`, {
      method: "DELETE",
      token: ownerToken,
    });
    assert.equal(del.status, 200);
    assert.equal(del.json.data.revoked, true);

    const after = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      projectToken: rawToken,
      body: { title: "After revoke" },
    });
    assert.equal(after.status, 401);
  });
});

describe("deleting a website cascades", () => {
  it("removes its pages, media and tokens", async () => {
    const token = await login("owner@example.com", "owner-pass");
    // owner already owns "Owner Site" from the block above; make a throwaway one.
    // Free plan allows only 1 project, so remove the first via cascade later —
    // here we upgrade nothing and simply reuse a fresh account path: delete the
    // existing project first to free the quota slot, then create + populate.
    const existing = await api("/api/projects", { token });
    for (const p of existing.json.data as Json[]) {
      await api(`/api/projects/${p.id}`, { method: "DELETE", token });
    }

    const projectId = await makeProject(token, "Doomed Site");
    await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      token,
      body: { title: "Home" },
    });
    // A media row created directly — uploads need R2, which tests do not configure.
    await Media.create({
      projectId,
      publicId: `${projectId}/abc.png`,
      url: "https://media.example/abc.png",
      resourceType: "image",
      bytes: 1234,
    });
    await api(`/api/projects/${projectId}/tokens`, {
      method: "POST",
      token,
      body: { label: "temp" },
    });

    const del = await api(`/api/projects/${projectId}`, { method: "DELETE", token });
    assert.equal(del.status, 200);

    assert.equal(await Page.countDocuments({ projectId }), 0);
    assert.equal(await Media.countDocuments({ projectId }), 0);
    assert.equal(await ProjectToken.countDocuments({ projectId }), 0);
  });
});

/**
 * The website ceiling — the one quota that carries money.
 *
 * The free tier is one website, so the rule has three cases: the free one is
 * allowed, a second is not, and a subscription never buys more than its own
 * quantity. The page cap that makes the free website free is tested below.
 */
describe("the website ceiling", () => {
  /** Puts an account on a live subscription for `websites` sites. */
  const grant = (email: string, websites: number) =>
    User.updateOne(
      { email },
      { $set: { plan: "starter", subscription: { status: "active", websites, period: "monthly" } } }
    );

  /** Puts an account back to never-subscribed, owning nothing. */
  async function reset(email: string, token: string) {
    const existing = await api("/api/projects", { token });
    for (const p of existing.json.data as Json[]) {
      await api(`/api/projects/${p.id}`, { method: "DELETE", token });
    }
    await User.updateOne(
      { email },
      { $set: { plan: "free", subscription: { status: "none", websites: 0, period: "monthly" } } }
    );
  }

  it("gives an unpaid account exactly one website, and refuses the second", async () => {
    const email = "other@example.com";
    const token = await login(email, "other-pass");
    await reset(email, token);

    // The free website. No subscription, no card, no clock.
    const first = await api("/api/projects", { method: "POST", token, body: { name: "Site One" } });
    assert.equal(first.status, 201);

    const second = await api("/api/projects", { method: "POST", token, body: { name: "Site Two" } });
    assert.equal(second.status, 402);
    assert.equal(second.json.code, "subscription_required");
    // The refusal has to name the price, or the person reading it has no idea
    // what to do next — and must not talk about a "plan" they never chose.
    assert.match(
      second.json.error,
      priceRe(2 * UNIT)
    );
    assert.match(second.json.error, /free website/i);
    assert.doesNotMatch(second.json.error, /Your plan covers/);
  });

  it("allows exactly the number of websites the subscription covers", async () => {
    const email = "other@example.com";
    const token = await login(email, "other-pass");
    await reset(email, token);
    await grant(email, 1);

    const first = await api("/api/projects", { method: "POST", token, body: { name: "Site One" } });
    assert.equal(first.status, 201);

    const second = await api("/api/projects", { method: "POST", token, body: { name: "Site Two" } });
    assert.equal(second.status, 402);
    assert.equal(second.json.code, "subscription_required");
    // And it quotes the price of the next rung, not a generic "upgrade".
    assert.match(second.json.error, /covers 1 website/);
    assert.match(
      second.json.error,
      priceRe(2 * UNIT)
    );
  });

  it("lets a bigger subscription hold more websites", async () => {
    const email = "other@example.com";
    const token = await login(email, "other-pass");
    await reset(email, token);
    await grant(email, 3);

    for (const name of ["One", "Two", "Three"]) {
      const res = await api("/api/projects", { method: "POST", token, body: { name } });
      assert.equal(res.status, 201, `expected ${name} to be allowed`);
    }
    const fourth = await api("/api/projects", { method: "POST", token, body: { name: "Four" } });
    assert.equal(fourth.status, 402);
    assert.match(
      fourth.json.error,
      priceRe(4 * UNIT)
    );
  });

  it("stops counting once the subscription lapses", async () => {
    const email = "other@example.com";
    const token = await login(email, "other-pass");
    await reset(email, token);
    await grant(email, 2);
    assert.equal(
      (await api("/api/projects", { method: "POST", token, body: { name: "Kept" } })).status,
      201
    );

    // Retries exhausted. The website already built stays — nobody's live site
    // goes dark over a card — but no new one may be added.
    await User.updateOne({ email }, { $set: { "subscription.status": "halted" } });

    const res = await api("/api/projects", { method: "POST", token, body: { name: "Blocked" } });
    assert.equal(res.status, 402);
    assert.equal((await api("/api/projects", { token })).json.data.length, 1);
  });
});

/**
 * The page cap — the limit that actually defines the free tier.
 *
 * The free website is real and permanent, so `assertCanCreateProject` waves
 * everyone through and this is the wall they meet instead. It is therefore the
 * refusal most customers will ever see, which is why the wording is asserted
 * here and not just the status code.
 */
describe("the free website's one page", () => {
  const grant = (email: string, websites: number) =>
    User.updateOne(
      { email },
      { $set: { plan: "starter", subscription: { status: "active", websites, period: "monthly" } } }
    );

  async function freshSite(email: string, token: string): Promise<string> {
    const existing = await api("/api/projects", { token });
    for (const p of existing.json.data as Json[]) {
      await api(`/api/projects/${p.id}`, { method: "DELETE", token });
    }
    await User.updateOne(
      { email },
      { $set: { plan: "free", subscription: { status: "none", websites: 0, period: "monthly" } } }
    );
    const made = await api("/api/projects", { method: "POST", token, body: { name: "Free Site" } });
    assert.equal(made.status, 201);
    return made.json.data.id as string;
  }

  it("takes one page and refuses the second, quoting the price", async () => {
    const email = "other@example.com";
    const token = await login(email, "other-pass");
    const projectId = await freshSite(email, token);

    const home = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      token,
      body: { title: "Home" },
    });
    assert.equal(home.status, 201);

    const about = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      token,
      body: { title: "About" },
    });
    assert.equal(about.status, 402);
    assert.equal(about.json.code, "quota_exceeded");
    assert.match(
      about.json.error,
      priceRe(UNIT)
    );
    // "Your Free plan includes 1 pages" is both ungrammatical and reads like a
    // quota nobody chose, so the free case has wording of its own.
    assert.doesNotMatch(about.json.error, /1 pages/);
  });

  it("keeps the one page editable and publishable — free is not read-only", async () => {
    const email = "other@example.com";
    const token = await login(email, "other-pass");
    const projectId = await freshSite(email, token);

    const page = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      token,
      body: { title: "Home" },
    });
    const pageId = page.json.data.id as string;

    const section = await api(`/api/pages/${pageId}/sections`, {
      method: "POST",
      token,
      body: { type: "hero" },
    });
    assert.equal(section.status, 201, "a free page must still take sections");

    // Filled in because publish-mode validation enforces required fields — an
    // empty hero is refused on every plan, which is not what this is testing.
    const sectionId = section.json.data.section.id as string;
    const filled = await api(`/api/pages/${pageId}/sections/${sectionId}`, {
      method: "PATCH",
      token,
      body: { content: { heading: "Hello" } },
    });
    assert.equal(filled.status, 200);

    const published = await api(`/api/pages/${pageId}/publish`, { method: "POST", token });
    assert.equal(published.status, 200, "a free page must still go live");
  });

  it("lifts the cap the moment a subscription is live", async () => {
    const email = "other@example.com";
    const token = await login(email, "other-pass");
    const projectId = await freshSite(email, token);

    await api(`/api/projects/${projectId}/pages`, { method: "POST", token, body: { title: "Home" } });
    await grant(email, 1);

    // Same website, same account — paying lifts a limit rather than starting
    // anything over, which is what the upgrade copy promises.
    const about = await api(`/api/projects/${projectId}/pages`, {
      method: "POST",
      token,
      body: { title: "About" },
    });
    assert.equal(about.status, 201);
  });
});
