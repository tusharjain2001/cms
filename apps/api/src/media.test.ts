import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Phase 4 (now on Cloudflare R2): the media library and presigned uploads.
 *
 * Uploads go browser → R2 via a short-lived presigned PUT, so what matters on
 * this side is that the presign is scoped to the right tenant prefix, the R2
 * secret never leaks, one client's library is sealed off from another's, and
 * the delivery/transform helpers build the capped, cacheable CDN URLs.
 */

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;

let adminToken = "";
let clientToken = "";
let projectA = "";
let projectB = "";

const ACCOUNT = "testaccount123";
const ACCESS_KEY = "test-access-key-id";
const SECRET = "test-r2-secret-access-key";
const BUCKET = "pagecraft-media";
const CDN = "https://cdn.mypagecraft.com";
const SIGNING_KEY = "test-url-signing-key";

const hexHash = (s: string) => createHash("sha256").update(s).digest("hex");

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_media");
  process.env.JWT_ACCESS_SECRET = "media-test-access-secret";
  process.env.JWT_REFRESH_SECRET = "media-test-refresh-secret";
  process.env.R2_ACCOUNT_ID = ACCOUNT;
  process.env.R2_ACCESS_KEY_ID = ACCESS_KEY;
  process.env.R2_SECRET_ACCESS_KEY = SECRET;
  process.env.R2_BUCKET = BUCKET;
  process.env.R2_PUBLIC_BASE_URL = CDN;
  process.env.R2_URL_SIGNING_KEY = SIGNING_KEY;

  const { connectDb, disconnectDb } = await import("./db.js");
  const { createApp } = await import("./app.js");
  const { User, hashPassword } = await import("./models/user.js");

  await connectDb(process.env.MONGODB_URI);
  disconnect = disconnectDb;

  await User.create({
    email: "dev@example.com",
    // This fixture owns several websites, so it needs a subscription that
    // covers them — under per-website pricing an account with none is allowed
    // zero. The website cap itself is tested in signup.test.ts.
    plan: "starter",
    subscription: { status: "active", websites: 20, period: "monthly" },
    name: "Dev",
    emailVerifiedAt: new Date(),
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

  // An invited editor with access to project A only — the developer's client.
  const { User: U, hashPassword: hp } = await import("./models/user.js");
  await U.create({
    email: "priya@example.com",
    name: "Priya",
    emailVerifiedAt: new Date(),
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

/* ------------------------------------------------------------ upload signing */

describe("presigned upload", () => {
  it("presigns a PUT scoped to this website's prefix", async () => {
    const contentHash = hexHash("counter-morning");
    const res = await call(`/api/projects/${projectA}/media/sign`, {
      method: "POST",
      token: adminToken,
      body: { contentHash, contentType: "image/jpeg", resourceType: "image", ext: "jpg" },
    });
    assert.equal(res.status, 200);
    const t = res.json.data;

    assert.equal(t.key, `${projectA}/${contentHash}.jpg`, "key = <tenantId>/<contentHash>.ext");
    assert.equal(t.publicUrl, `${CDN}/${projectA}/${contentHash}.jpg`);
    // A real S3v4 presigned PUT against the R2 endpoint.
    assert.match(t.uploadUrl, new RegExp(`^https://${ACCOUNT}\\.r2\\.cloudflarestorage\\.com/`));
    assert.match(t.uploadUrl, /X-Amz-Signature=/);
    assert.ok(t.uploadUrl.includes(`${projectA}/${contentHash}.jpg`), "presign targets the key");
  });

  it("tells the browser the immutable cache headers it must send", async () => {
    const res = await call(`/api/projects/${projectA}/media/sign`, {
      method: "POST",
      token: adminToken,
      body: { contentHash: hexHash("x"), contentType: "image/png" },
    });
    assert.equal(res.json.data.headers["Content-Type"], "image/png");
    assert.match(res.json.data.headers["Cache-Control"], /immutable/);
    assert.match(res.json.data.headers["Cache-Control"], /max-age=31536000/);
  });

  it("never sends the R2 secret to the browser", async () => {
    const res = await call(`/api/projects/${projectA}/media/sign`, {
      method: "POST",
      token: adminToken,
      body: { contentHash: hexHash("y"), contentType: "image/jpeg" },
    });
    assert.equal(JSON.stringify(res.json).includes(SECRET), false);
  });

  it("rejects a malformed content hash", async () => {
    const res = await call(`/api/projects/${projectA}/media/sign`, {
      method: "POST",
      token: adminToken,
      body: { contentHash: "not-a-hash!!", contentType: "image/jpeg" },
    });
    assert.equal(res.status, 400);
  });

  it("refuses to sign for a website the caller cannot touch", async () => {
    const res = await call(`/api/projects/${projectB}/media/sign`, {
      method: "POST",
      token: clientToken,
      body: { contentHash: hexHash("z"), contentType: "image/jpeg" },
    });
    assert.equal(res.status, 403);
  });

  it("refuses to sign for anyone signed out", async () => {
    const res = await call(`/api/projects/${projectA}/media/sign`, {
      method: "POST",
      body: { contentHash: hexHash("z"), contentType: "image/jpeg" },
    });
    assert.equal(res.status, 401);
  });
});

/* ------------------------------------------------------------------ library */

describe("the library", () => {
  let mediaId = "";
  // A function, NOT a const: `projectA` is empty until before() runs, and a
  // describe body runs at collection time.
  const keyA = () => `${projectA}/${hexHash("counter-morning")}.jpg`;

  it("registers a file after R2 accepts it", async () => {
    const res = await call(`/api/projects/${projectA}/media`, {
      method: "POST",
      token: adminToken,
      body: {
        publicId: keyA(),
        url: `${CDN}/${keyA()}`,
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
    const stolen = `${projectB}/${hexHash("stolen")}.jpg`;
    const res = await call(`/api/projects/${projectA}/media`, {
      method: "POST",
      token: adminToken,
      body: { publicId: stolen, url: `${CDN}/${stolen}` },
    });
    assert.equal(res.status, 403);
  });

  it("is idempotent, so a retried registration does not duplicate", async () => {
    const body = { publicId: keyA(), url: `${CDN}/${keyA()}` };
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
    const rig = `${projectB}/${hexHash("rig")}.jpg`;
    const other = await call(`/api/projects/${projectB}/media`, {
      method: "POST",
      token: adminToken,
      body: { publicId: rig, url: `${CDN}/${rig}` },
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
    // R2 is unreachable/uncredentialed in tests; the row is removed regardless.
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

/* --------------------------------------------------------- delivery helpers */

describe("CDN delivery + transforms", () => {
  it("builds a capped, f=auto srcset on the custom domain", async () => {
    const { srcSet, transformUrl, SRCSET_WIDTHS, publicUrl } = await import("./lib/r2.js");
    const key = `${projectA}/${hexHash("hero")}.jpg`;

    assert.equal(publicUrl(key), `${CDN}/${key}`);

    const one = transformUrl(key, 640);
    assert.match(one, new RegExp(`^${CDN}/cdn-cgi/image/`));
    assert.match(one, /f=auto/);
    assert.match(one, /w=640/);
    assert.ok(one.endsWith(key), "the key is the transform source");

    const set = srcSet(key);
    const entries = set.split(", ");
    assert.equal(entries.length, SRCSET_WIDTHS.length, "srcset is capped to the width list");
    assert.ok(entries.every((e) => e.includes("/cdn-cgi/image/") && e.includes("f=auto")));
  });
});

/* ---------------------------------------------------- private signed media */

describe("private media tokens", () => {
  it("signs a URL the worker can verify, and rejects tamper + expiry", async () => {
    const { signedPrivateUrl, verifyPrivateUrl } = await import("./lib/r2.js");
    const key = `${projectA}/${hexHash("secret-doc")}.pdf`;

    const url = signedPrivateUrl(key, 3600);
    assert.ok(url, "a signing key is configured, so a URL is produced");
    const u = new URL(url!);
    const exp = Number(u.searchParams.get("exp"));
    const sig = u.searchParams.get("sig")!;

    assert.equal(verifyPrivateUrl(key, exp, sig), true, "valid token verifies");
    assert.equal(verifyPrivateUrl(key, exp, sig.replace(/.$/, "0")), false, "tampered sig fails");
    assert.equal(verifyPrivateUrl(key, 1, sig), false, "expired token fails");
    assert.equal(verifyPrivateUrl(`${projectB}/other`, exp, sig), false, "wrong key fails");
  });
});

/* --------------------------------------------------- section content valid */

describe("image content still validates", () => {
  it("accepts a picked photo in a section, and rejects a malformed one", async () => {
    const { validateSectionContent, defaultContent, getSectionType } = await import(
      "@pagecraft/shared"
    );
    const hero = getSectionType("hero")!;
    const key = `${projectA}/${hexHash("counter-morning")}.jpg`;

    const good = validateSectionContent("hero", {
      ...defaultContent(hero),
      heading: "Hi",
      backgroundImage: {
        publicId: key,
        url: `${CDN}/${key}`,
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
