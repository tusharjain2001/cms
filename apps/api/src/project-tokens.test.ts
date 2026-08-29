import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { Server } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";

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

before(async () => {
  mongo = await MongoMemoryServer.create();

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_tokens_test");
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value";
  process.env.ADMIN_ORIGIN = "http://localhost:3000";

  const { connectDb, disconnectDb } = await import("./db.js");
  const { createApp } = await import("./app.js");
  const { User, hashPassword } = await import("./models/user.js");
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
  });
  await User.create({
    email: "other@example.com",
    name: "Other",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("other-pass"),
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

describe("plan quotas", () => {
  it("refuses a second website on the Free plan with a 402", async () => {
    const token = await login("other@example.com", "other-pass");
    // Clear any projects this account has so it starts at zero.
    const existing = await api("/api/projects", { token });
    for (const p of existing.json.data as Json[]) {
      await api(`/api/projects/${p.id}`, { method: "DELETE", token });
    }

    const first = await api("/api/projects", { method: "POST", token, body: { name: "Site One" } });
    assert.equal(first.status, 201);

    const second = await api("/api/projects", { method: "POST", token, body: { name: "Site Two" } });
    assert.equal(second.status, 402);
    assert.equal(second.json.code, "quota_exceeded");
    assert.match(second.json.error, /Free plan/);
  });
});
