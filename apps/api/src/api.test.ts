import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Server } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * End-to-end check of the Phase 1 milestone: sign in, then create and manage a
 * client website over REST. Runs against a real MongoDB started in memory, so
 * the models, indexes and access rules are all genuinely exercised.
 */

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;

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

  await connectDb(process.env.MONGODB_URI);
  disconnect = disconnectDb;

  await User.create({
    email: "dev@example.com",
    name: "Dev",
    role: "admin",
    passwordHash: await hashPassword("correct-horse"),
    projectIds: [],
  });
  await User.create({
    email: "client@example.com",
    name: "Client",
    role: "client",
    passwordHash: await hashPassword("client-pass"),
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
    assert.equal(res.json.data.user.role, "admin");
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
});

describe("projects", () => {
  let adminToken: string;
  let clientToken: string;
  let projectId: string;

  before(async () => {
    adminToken = (await login("dev@example.com", "correct-horse")).json.data.accessToken;
    clientToken = (await login("client@example.com", "client-pass")).json.data.accessToken;
  });

  it("requires a token", async () => {
    const res = await api("/api/projects");
    assert.equal(res.status, 401);
  });

  it("creates a website and mints a public api key", async () => {
    const res = await api("/api/projects", {
      method: "POST",
      token: adminToken,
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
      token: adminToken,
      body: { revalidateSecret: "whsec_topsecret" },
    });
    const res = await api(`/api/projects/${projectId}`, { token: adminToken });
    assert.equal(res.json.data.hasRevalidateSecret, true);
    assert.equal(JSON.stringify(res.json).includes("whsec_topsecret"), false);
  });

  it("rejects a section type the registry does not know", async () => {
    const res = await api(`/api/projects/${projectId}`, {
      method: "PATCH",
      token: adminToken,
      body: { allowedSectionTypes: ["hero", "not-a-real-section"] },
    });
    assert.equal(res.status, 400);
  });

  it("lists the website for the developer", async () => {
    const res = await api("/api/projects", { token: adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.length, 1);
  });

  it("hides other people's websites from a client", async () => {
    const list = await api("/api/projects", { token: clientToken });
    assert.deepEqual(list.json.data, []);

    const direct = await api(`/api/projects/${projectId}`, { token: clientToken });
    assert.equal(direct.status, 403);
  });

  it("stops a client creating a website", async () => {
    const res = await api("/api/projects", {
      method: "POST",
      token: clientToken,
      body: { name: "Sneaky Site" },
    });
    assert.equal(res.status, 403);
  });

  it("rotates the api key", async () => {
    const before = await api(`/api/projects/${projectId}`, { token: adminToken });
    const after = await api(`/api/projects/${projectId}/rotate-key`, {
      method: "POST",
      token: adminToken,
    });
    assert.equal(after.status, 200);
    assert.notEqual(after.json.data.apiKey, before.json.data.apiKey);
  });

  it("refuses a duplicate slug with a readable message", async () => {
    const res = await api("/api/projects", {
      method: "POST",
      token: adminToken,
      body: { name: "Rosewater Bakehouse" },
    });
    assert.equal(res.status, 409);
    assert.match(res.json.error, /already taken/);
  });

  it("returns 404 for a website that does not exist", async () => {
    const res = await api("/api/projects/000000000000000000000000", { token: adminToken });
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
