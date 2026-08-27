import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Phase 4: the media library and Cloudinary signing.
 *
 * Uploads themselves go browser → Cloudinary, so what matters on this side is
 * that the signature is right, the secret never leaks, and one client's
 * library is sealed off from another's.
 */

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;

let adminToken = "";
let clientToken = "";
let projectA = "";
let projectB = "";

const CLOUD = "demo-cloud";
const KEY = "123456789012345";
const SECRET = "test-cloudinary-secret";

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_media");
  process.env.JWT_ACCESS_SECRET = "media-test-access-secret";
  process.env.JWT_REFRESH_SECRET = "media-test-refresh-secret";
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  process.env.CLOUDINARY_API_KEY = KEY;
  process.env.CLOUDINARY_API_SECRET = SECRET;
  process.env.CLOUDINARY_FOLDER = "pagecraft";

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

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  adminToken = (
    await call("/api/auth/login", {
      method: "POST",
      body: { email: "dev@example.com", password: "correct-horse" },
    })
  ).json.data.accessToken;

  projectA = (
    await call("/api/projects", {
      method: "POST",
      token: adminToken,
      body: { name: "Rosewater Bakehouse" },
    })
  ).json.data.id;
  projectB = (
    await call("/api/projects", {
      method: "POST",
      token: adminToken,
      body: { name: "Halden Industrial" },
    })
  ).json.data.id;

  // A client with access to project A only.
  const { User: U, hashPassword: hp } = await import("./models/user.js");
  await U.create({
    email: "priya@example.com",
    name: "Priya",
    role: "client",
    passwordHash: await hp("client-pass"),
    projectIds: [projectA],
  });
  clientToken = (
    await call("/api/auth/login", {
      method: "POST",
      body: { email: "priya@example.com", password: "client-pass" },
    })
  ).json.data.accessToken;
});

after(async () => {
  server?.close();
  await disconnect?.();
  await mongo?.stop();
});

async function call(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

const assetUrl = (project: string, name: string) =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/v1/pagecraft/${project}/${name}`;

describe("upload signing", () => {
  it("signs exactly the way Cloudinary verifies", async () => {
    const res = await call(`/api/projects/${projectA}/media/sign`, {
      method: "POST",
      token: adminToken,
      body: { resourceType: "image" },
    });
    assert.equal(res.status, 200);
    const t = res.json.data;

    // Recompute independently: sorted `k=v&k=v` + secret, SHA-1.
    const expected = createHash("sha1")
      .update(`folder=${t.folder}&timestamp=${t.timestamp}${SECRET}`)
      .digest("hex");
    assert.equal(t.signature, expected);
  });

  it("scopes the upload folder to this website", async () => {
    const res = await call(`/api/projects/${projectA}/media/sign`, {
      method: "POST",
      token: adminToken,
      body: {},
    });
    assert.equal(res.json.data.folder, `pagecraft/${projectA}`);
    assert.match(res.json.data.uploadUrl, new RegExp(`/v1_1/${CLOUD}/image/upload$`));
  });

  it("never sends the api secret to the browser", async () => {
    const res = await call(`/api/projects/${projectA}/media/sign`, {
      method: "POST",
      token: adminToken,
      body: {},
    });
    assert.equal(JSON.stringify(res.json).includes(SECRET), false);
  });

  it("refuses to sign for a website the caller cannot touch", async () => {
    const res = await call(`/api/projects/${projectB}/media/sign`, {
      method: "POST",
      token: clientToken,
      body: {},
    });
    assert.equal(res.status, 403);
  });

  it("refuses to sign for anyone signed out", async () => {
    const res = await call(`/api/projects/${projectA}/media/sign`, { method: "POST", body: {} });
    assert.equal(res.status, 401);
  });
});

describe("the library", () => {
  let mediaId = "";

  it("registers a file after Cloudinary accepts it", async () => {
    const res = await call(`/api/projects/${projectA}/media`, {
      method: "POST",
      token: adminToken,
      body: {
        publicId: `pagecraft/${projectA}/counter-morning`,
        url: assetUrl(projectA, "counter-morning.jpg"),
        format: "jpg",
        width: 2400,
        height: 1350,
        bytes: 839_000,
        originalName: "counter-morning.jpg",
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.width, 2400);
    mediaId = res.json.data.id;
  });

  it("rejects a file that claims to belong to another website", async () => {
    const res = await call(`/api/projects/${projectA}/media`, {
      method: "POST",
      token: adminToken,
      body: {
        publicId: `pagecraft/${projectB}/stolen`,
        url: assetUrl(projectB, "stolen.jpg"),
      },
    });
    assert.equal(res.status, 403);
  });

  it("is idempotent, so a retried registration does not duplicate", async () => {
    const body = {
      publicId: `pagecraft/${projectA}/counter-morning`,
      url: assetUrl(projectA, "counter-morning.jpg"),
    };
    const res = await call(`/api/projects/${projectA}/media`, {
      method: "POST",
      token: adminToken,
      body,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.id, mediaId);

    const list = await call(`/api/projects/${projectA}/media`, { token: adminToken });
    assert.equal(list.json.data.items.length, 1);
  });

  it("tells the dashboard whether uploads are switched on", async () => {
    const list = await call(`/api/projects/${projectA}/media`, { token: adminToken });
    assert.equal(list.json.data.uploadsEnabled, true);
  });

  it("saves alt text for people who cannot see the photo", async () => {
    const res = await call(`/api/media/${mediaId}`, {
      method: "PATCH",
      token: adminToken,
      body: { alt: "Trays of sourdough cooling on the counter." },
    });
    assert.equal(res.status, 200);
    assert.match(res.json.data.alt, /sourdough/);
  });

  it("keeps one website's library invisible to another's editor", async () => {
    const listB = await call(`/api/projects/${projectB}/media`, { token: clientToken });
    assert.equal(listB.status, 403);

    const listA = await call(`/api/projects/${projectA}/media`, { token: clientToken });
    assert.equal(listA.status, 200);
    assert.equal(listA.json.data.items.length, 1);
  });

  it("stops a client editing a file from a website they cannot reach", async () => {
    const other = await call(`/api/projects/${projectB}/media`, {
      method: "POST",
      token: adminToken,
      body: {
        publicId: `pagecraft/${projectB}/rig`,
        url: assetUrl(projectB, "rig.jpg"),
      },
    });
    const res = await call(`/api/media/${other.json.data.id}`, {
      method: "PATCH",
      token: clientToken,
      body: { alt: "nope" },
    });
    assert.equal(res.status, 403);
  });

  it("deletes from the library and reports whether storage confirmed", async () => {
    const res = await call(`/api/media/${mediaId}`, { method: "DELETE", token: adminToken });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.deleted, true);
    // Cloudinary is unreachable in tests, and the row is removed regardless.
    assert.equal(typeof res.json.data.removedFromStorage, "boolean");

    const list = await call(`/api/projects/${projectA}/media`, { token: adminToken });
    assert.equal(list.json.data.items.length, 0);
  });

  it("404s for a file id that does not exist", async () => {
    const res = await call("/api/media/000000000000000000000000", {
      method: "PATCH",
      token: adminToken,
      body: { alt: "x" },
    });
    assert.equal(res.status, 404);
  });
});

describe("image content still validates", () => {
  it("accepts a picked photo in a section, and rejects a malformed one", async () => {
    const { validateSectionContent, defaultContent, getSectionType } = await import(
      "@pagecraft/shared"
    );
    const hero = getSectionType("hero")!;

    const good = validateSectionContent("hero", {
      ...defaultContent(hero),
      heading: "Hi",
      backgroundImage: {
        publicId: `pagecraft/${projectA}/counter-morning`,
        url: assetUrl(projectA, "counter-morning.jpg"),
        width: 2400,
        height: 1350,
        alt: "Sourdough cooling",
      },
    });
    assert.equal(good.ok, true);

    const bad = validateSectionContent("hero", {
      ...defaultContent(hero),
      heading: "Hi",
      backgroundImage: { publicId: "x", url: "not-a-url", width: 0, height: 0 },
    });
    assert.equal(bad.ok, false);
  });
});
