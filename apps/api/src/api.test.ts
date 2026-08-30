import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { Server } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * End-to-end check of the Phase 1 milestone: sign in, then create and manage a
 * client website over REST. Runs against a real MongoDB started in memory, so
 * the models, indexes and access rules are all genuinely exercised.
 *
 * Since anyone can sign up, the tests below care most about one thing: that two
 * unrelated accounts cannot see or touch each other's websites.
 */

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;
let resetRateLimits: () => void;

// Config is read at import time, so the environment must be set up first.
before(async () => {
  mongo = await MongoMemoryServer.create();

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_test");
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value";
  process.env.ADMIN_ORIGIN = "http://localhost:3000";

  const { connectDb, disconnectDb } = await import("./db.js");
  const { createApp } = await import("./app.js");
  const { User, hashPassword } = await import("./models/user.js");
  ({ resetRateLimits } = await import("./middleware/rate-limit.js"));

  await connectDb(process.env.MONGODB_URI);
  disconnect = disconnectDb;

  // Two ordinary, unrelated accounts — the everyday case now that signup is
  // open — plus the one platform administrator, who is created by seeding.
  //
  // They carry a live subscription because websites are what money buys: an
  // account with none is allowed zero of them, so a fixture that builds
  // websites has to be paying for them. The ceiling itself is tested in
  // project-tokens.test.ts, not here.
  const subscribed = {
    plan: "starter",
    subscription: { status: "active", websites: 10, period: "monthly" },
  };

  await User.create({
    ...subscribed,
    email: "dev@example.com",
    name: "Dev",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("correct-horse"),
    projectIds: [],
  });
  await User.create({
    ...subscribed,
    email: "client@example.com",
    name: "Client",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("client-pass"),
    projectIds: [],
  });
  await User.create({
    ...subscribed,
    email: "boss@example.com",
    name: "Boss",
    emailVerifiedAt: new Date(),
    isPlatformAdmin: true,
    passwordHash: await hashPassword("boss-pass"),
    projectIds: [],
  });
  await User.create({
    email: "unconfirmed@example.com",
    name: "Unconfirmed",
    emailVerifiedAt: null,
    passwordHash: await hashPassword("never-clicked"),
    projectIds: [],
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

// The suite signs in far more often than a person would, and tripping the
// brute-force limiter mid-run would make failures look like access bugs.
// The limiter has its own tests, which opt out of this.
beforeEach(() => resetRateLimits?.());

/* ------------------------------------------------------------------ helpers */

type Json = Record<string, any>;

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; cookie?: string } = {}
): Promise<{ status: number; json: Json; setCookie: string | null }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return {
    status: res.status,
    json: (await res.json()) as Json,
    setCookie: res.headers.get("set-cookie"),
  };
}

const login = async (email: string, password: string) =>
  api("/api/auth/login", { method: "POST", body: { email, password } });

/* -------------------------------------------------------------------- tests */

describe("health", () => {
  it("reports ok", async () => {
    const res = await api("/health");
    assert.equal(res.status, 200);
    assert.equal(res.json.data.status, "ok");
  });
});

describe("auth", () => {
  it("rejects a wrong password without revealing the account exists", async () => {
    const res = await login("dev@example.com", "wrong");
    assert.equal(res.status, 401);
    assert.equal(res.json.success, false);
    assert.match(res.json.error, /do not match/);
  });

  it("gives the same message for an unknown email", async () => {
    const unknown = await login("nobody@example.com", "whatever");
    const wrong = await login("dev@example.com", "wrong");
    assert.equal(unknown.json.error, wrong.json.error);
  });

  it("signs in and returns an access token plus an httpOnly refresh cookie", async () => {
    const res = await login("dev@example.com", "correct-horse");
    assert.equal(res.status, 200);
    assert.equal(res.json.data.user.email, "dev@example.com");
    assert.equal(res.json.data.user.emailVerified, true);
    assert.ok(res.json.data.accessToken.length > 20);
    assert.match(res.setCookie ?? "", /pc_refresh=/);
    assert.match(res.setCookie ?? "", /HttpOnly/i);
  });

  it("never returns the password hash", async () => {
    const res = await login("dev@example.com", "correct-horse");
    assert.equal(JSON.stringify(res.json).includes("passwordHash"), false);
  });

  it("exchanges the refresh cookie for a fresh access token", async () => {
    const signIn = await login("dev@example.com", "correct-horse");
    const cookie = (signIn.setCookie ?? "").split(";")[0];
    const res = await api("/api/auth/refresh", { method: "POST", cookie });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.accessToken.length > 20);
  });

  it("refuses to refresh without a cookie", async () => {
    const res = await api("/api/auth/refresh", { method: "POST" });
    assert.equal(res.status, 401);
  });

  it("refuses to sign in until the email address is confirmed", async () => {
    const res = await login("unconfirmed@example.com", "never-clicked");
    assert.equal(res.status, 401);
    // Tagged so the dashboard can offer a "resend" button instead of guessing
    // from the wording.
    assert.equal(res.json.code, "email_not_verified");
    assert.equal(res.setCookie, null);
  });

  it("checks the password before mentioning verification, so this cannot find accounts", async () => {
    const wrongPassword = await login("unconfirmed@example.com", "not-the-password");
    // Identical to any other bad sign-in: revealing "that account exists but is
    // unverified" would tell a stranger the address is registered here.
    assert.match(wrongPassword.json.error, /do not match/);
    assert.equal(wrongPassword.json.code, undefined);
  });
});

describe("the first-sign-in tour flag", () => {
  const asClient = async () => (await login("client@example.com", "client-pass")).json.data.accessToken as string;

  it("starts false on an account that has never finished it", async () => {
    const token = await asClient();
    const res = await api("/api/auth/me", { token });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.user.onboardingComplete, false);
  });

  it("records completion and answers with the same envelope as GET /me", async () => {
    const token = await asClient();
    const patched = await api("/api/auth/me", {
      method: "PATCH",
      token,
      body: { onboardingComplete: true },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.data.user.onboardingComplete, true);
    // Same shape, so the dashboard can adopt either response.
    assert.deepEqual(
      Object.keys(patched.json.data).sort(),
      Object.keys((await api("/api/auth/me", { token })).json.data).sort()
    );

    // And it survives a fresh sign-in — the whole point of storing it per
    // account rather than in the browser.
    assert.equal(
      (await api("/api/auth/me", { token: await asClient() })).json.data.user.onboardingComplete,
      true
    );
  });

  it("can be turned back off, so the tour can be asked for again", async () => {
    const token = await asClient();
    await api("/api/auth/me", { method: "PATCH", token, body: { onboardingComplete: true } });
    const off = await api("/api/auth/me", {
      method: "PATCH",
      token,
      body: { onboardingComplete: false },
    });
    assert.equal(off.json.data.user.onboardingComplete, false);
  });

  it("refuses anything but the tour flag, and refuses a stranger outright", async () => {
    const token = await asClient();
    assert.equal(
      (await api("/api/auth/me", { method: "PATCH", token, body: { isPlatformAdmin: true } }))
        .status,
      400
    );
    // The account is unchanged: nothing that decides access is settable here.
    assert.equal((await api("/api/auth/me", { token })).json.data.isPlatformAdmin, undefined);
    assert.equal((await api("/api/auth/me", { token })).json.data.user.isPlatformAdmin, false);

    assert.equal(
      (await api("/api/auth/me", { method: "PATCH", body: { onboardingComplete: true } })).status,
      401
    );
  });
});

describe("projects", () => {
  let devToken: string;
  let clientToken: string;
  let bossToken: string;
  let projectId: string;

  before(async () => {
    devToken = (await login("dev@example.com", "correct-horse")).json.data.accessToken;
    clientToken = (await login("client@example.com", "client-pass")).json.data.accessToken;
    bossToken = (await login("boss@example.com", "boss-pass")).json.data.accessToken;
  });

  it("requires a token", async () => {
    const res = await api("/api/projects");
    assert.equal(res.status, 401);
  });

  it("creates a website and mints a public api key", async () => {
    const res = await api("/api/projects", {
      method: "POST",
      token: devToken,
      body: { name: "Rosewater Bakehouse", domain: "rosewaterbakehouse.com" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.slug, "rosewater-bakehouse");
    assert.match(res.json.data.apiKey, /^pk_live_[0-9a-f]{24}$/);
    // Every section type is enabled until the developer narrows it.
    assert.ok(res.json.data.allowedSectionTypes.includes("hero"));
    projectId = res.json.data.id;
  });

  it("never leaks the revalidate secret", async () => {
    await api(`/api/projects/${projectId}`, {
      method: "PATCH",
      token: devToken,
      body: { revalidateSecret: "whsec_topsecret" },
    });
    const res = await api(`/api/projects/${projectId}`, { token: devToken });
    assert.equal(res.json.data.hasRevalidateSecret, true);
    assert.equal(JSON.stringify(res.json).includes("whsec_topsecret"), false);
  });

  it("rejects a section type the registry does not know", async () => {
    const res = await api(`/api/projects/${projectId}`, {
      method: "PATCH",
      token: devToken,
      body: { allowedSectionTypes: ["hero", "not-a-real-section"] },
    });
    assert.equal(res.status, 400);
  });

  it("lists the website for the account that created it, marked as owned", async () => {
    const res = await api("/api/projects", { token: devToken });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.length, 1);
    assert.equal(res.json.data[0].role, "owner");
    assert.equal(res.json.data[0].ownerName, "Dev");
  });

  it("hides one account's website from every other account", async () => {
    const list = await api("/api/projects", { token: clientToken });
    assert.deepEqual(list.json.data, []);

    const direct = await api(`/api/projects/${projectId}`, { token: clientToken });
    assert.equal(direct.status, 403);
  });

  it("lets any confirmed account create its own website without seeing anyone else's", async () => {
    const created = await api("/api/projects", {
      method: "POST",
      token: clientToken,
      body: { name: "Second Account Site" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.data.role, "owner");

    // The decisive check: creating a website reveals nothing about the CMS's
    // other tenants.
    const mine = await api("/api/projects", { token: clientToken });
    assert.equal(mine.json.data.length, 1);
    assert.equal(mine.json.data[0].name, "Second Account Site");
  });

  it("stops an unconfirmed account creating anything", async () => {
    const { User } = await import("./models/user.js");
    const { signAccessToken } = await import("./lib/tokens.js");
    const pending = (await User.findOne({ email: "unconfirmed@example.com" }))!;

    // Signing in is already blocked, so mint a token directly: this proves the
    // second line of defence holds even for a token issued some other way.
    const token = signAccessToken({ sub: pending._id.toString(), sv: pending.sessionVersion });
    const res = await api("/api/projects", {
      method: "POST",
      token,
      body: { name: "Unconfirmed Site" },
    });
    assert.equal(res.status, 403);
  });

  it("lets two different accounts use the same website address", async () => {
    // Slugs are unique per owner, not globally: one account taking "portfolio"
    // must not stop everyone else from using the word.
    const res = await api("/api/projects", {
      method: "POST",
      token: bossToken,
      body: { name: "Rosewater Bakehouse" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.slug, "rosewater-bakehouse");
  });

  it("shows the platform administrator every website", async () => {
    const res = await api("/api/projects", { token: bossToken });
    assert.ok(res.json.data.length >= 3, "the instance owner can see across accounts");
  });

  it("rotates the api key", async () => {
    const before = await api(`/api/projects/${projectId}`, { token: devToken });
    const after = await api(`/api/projects/${projectId}/rotate-key`, {
      method: "POST",
      token: devToken,
    });
    assert.equal(after.status, 200);
    assert.notEqual(after.json.data.apiKey, before.json.data.apiKey);
  });

  it("refuses a duplicate slug within one account, with a readable message", async () => {
    const res = await api("/api/projects", {
      method: "POST",
      token: devToken,
      body: { name: "Rosewater Bakehouse" },
    });
    assert.equal(res.status, 409);
    assert.match(res.json.error, /already have a website/);
  });

  it("returns 404 for a website that does not exist", async () => {
    const res = await api("/api/projects/000000000000000000000000", { token: devToken });
    assert.equal(res.status, 404);
  });
});

describe("section registry", () => {
  it("is served to the dashboard so it can build forms", async () => {
    const token = (await login("dev@example.com", "correct-horse")).json.data.accessToken;
    const res = await api("/api/section-types", { token });
    assert.equal(res.status, 200);

    const hero = res.json.data.find((d: Json) => d.type === "hero");
    assert.ok(hero, "hero should be registered");
    assert.equal(hero.fields.find((f: Json) => f.key === "buttons").max, 3);
  });
});
