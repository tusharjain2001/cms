import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * The proxy upload path: bytes go browser → this API → R2, instead of browser →
 * R2 directly.
 *
 * It exists because the presigned PUT is a cross-origin request and the R2
 * bucket carries no CORS rule, so the browser kills it in preflight
 * ("CORS not configured for this bucket") — and setting that rule needs a
 * Cloudflare token with bucket-admin scope, which the API's object-scoped
 * credential does not have. Direct-to-R2 stays the intended path; this is the
 * fallback the dashboard drops to when it fails.
 *
 * Accepting raw bytes gives up the guarantees the presign got for free, so what
 * matters here is that they are re-established explicitly: the object key comes
 * from a hash the SERVER computes over the bytes it received, and the tenant
 * prefix comes from `requireProjectAccess`, never from the request body.
 *
 * This lives apart from media.test.ts because it points the S3 client at a local
 * stub via R2_ENDPOINT, and media.test.ts asserts that a presigned URL targets
 * the real `*.r2.cloudflarestorage.com` host. Separate files, separate
 * processes, so neither has to weaken its assertion.
 */

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;

let ownerToken = "";
let editorToken = "";
let projectA = "";
let projectB = "";

const BUCKET = "pagecraft-media";
const CDN = "https://cdn.mypagecraft.com";

const hexHash = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * A stand-in for R2, so this path is exercised for real rather than mocked. It
 * records what the S3 client actually PUT, which is how the tests below can
 * prove the stored key was derived from the bytes the server received.
 */
let r2Stub: Server;
const r2Objects = new Map<string, { body: Buffer; contentType: string }>();

before(async () => {
  r2Stub = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      // forcePathStyle puts the bucket first, and the SDK appends ?x-id=PutObject:
      //   /<bucket>/<key>?x-id=PutObject
      if (req.method === "PUT") {
        const path = (req.url ?? "").split("?")[0] ?? "";
        const key = decodeURIComponent(path.replace(`/${BUCKET}/`, ""));
        r2Objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: String(req.headers["content-type"] ?? ""),
        });
      }
      res.writeHead(200, { etag: '"stub"' }).end();
    });
  }).listen(0);

  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_media_proxy");
  process.env.JWT_ACCESS_SECRET = "proxy-test-access-secret";
  process.env.JWT_REFRESH_SECRET = "proxy-test-refresh-secret";
  process.env.R2_ACCOUNT_ID = "testaccount123";
  process.env.R2_ACCESS_KEY_ID = "test-access-key-id";
  process.env.R2_SECRET_ACCESS_KEY = "test-r2-secret-access-key";
  process.env.R2_BUCKET = BUCKET;
  process.env.R2_PUBLIC_BASE_URL = CDN;
  process.env.R2_ENDPOINT = `http://127.0.0.1:${(r2Stub.address() as any).port}`;

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

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  ownerToken = (
    await call("/api/auth/login", {
      method: "POST",
      body: { email: "dev@example.com", password: "correct-horse" },
    })
  ).json.data.accessToken;

  projectA = (
    await call("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: { name: "Rosewater Bakehouse" },
    })
  ).json.data.id;
  projectB = (
    await call("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: { name: "Halden Industrial" },
    })
  ).json.data.id;

  // Someone added to website A only — the developer's client.
  await User.create({
    email: "priya@example.com",
    name: "Priya",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("client-pass"),
    projectIds: [projectA],
  });
  editorToken = (
    await call("/api/auth/login", {
      method: "POST",
      body: { email: "priya@example.com", password: "client-pass" },
    })
  ).json.data.accessToken;
});

after(async () => {
  server?.close();
  r2Stub?.close();
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

/** Posts raw bytes, the way the dashboard's fallback upload does. */
async function upload(
  path: string,
  body: Buffer,
  opts: { token?: string; contentType?: string } = {}
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": opts.contentType ?? "image/jpeg",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: new Uint8Array(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

describe("proxy upload — storing the file", () => {
  it("derives the object key from a hash the SERVER took of the bytes", async () => {
    const bytes = Buffer.from("a photograph of a bakery counter");
    const res = await upload(
      `/api/projects/${projectA}/media/upload?ext=jpg&originalName=shop.jpg&width=800&height=600`,
      bytes,
      { token: ownerToken }
    );

    assert.equal(res.status, 201);
    // Content-addressed under this website's prefix — nothing the client sent
    // chose this key.
    const key = `${projectA}/${hexHash("a photograph of a bakery counter")}.jpg`;
    assert.equal(res.json.data.publicId, key);
    assert.equal(res.json.data.url, `${CDN}/${key}`);
    assert.equal(res.json.data.bytes, bytes.length);
    assert.equal(res.json.data.originalName, "shop.jpg");
    assert.equal(res.json.data.width, 800);
    assert.equal(res.json.data.height, 600);

    // ...and the bytes really reached storage, unchanged and immutably cached.
    const stored = r2Objects.get(key);
    assert.ok(stored, "the object should have been written to R2");
    assert.equal(stored.body.toString(), bytes.toString());
    assert.equal(stored.contentType, "image/jpeg");
  });

  it("puts the file in the library, so it appears in the picker", async () => {
    const res = await call(`/api/projects/${projectA}/media`, { token: ownerToken });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.uploadsEnabled, true);
    assert.ok(res.json.data.items.some((i: any) => i.originalName === "shop.jpg"));
  });

  it("is idempotent, so a retried upload does not duplicate the library row", async () => {
    const bytes = Buffer.from("retried bytes");
    const first = await upload(`/api/projects/${projectA}/media/upload?ext=png`, bytes, {
      token: ownerToken,
      contentType: "image/png",
    });
    const second = await upload(`/api/projects/${projectA}/media/upload?ext=png`, bytes, {
      token: ownerToken,
      contentType: "image/png",
    });

    assert.equal(first.status, 201);
    assert.equal(second.status, 200, "the retry resolves to the existing row");
    assert.equal(first.json.data.id, second.json.data.id);
  });
});

describe("proxy upload — who may write where", () => {
  it("refuses a website the caller cannot reach, before storing a byte", async () => {
    const before = r2Objects.size;
    const res = await upload(`/api/projects/${projectB}/media/upload?ext=jpg`, Buffer.from("x"), {
      token: editorToken,
    });
    assert.equal(res.status, 403);
    assert.equal(r2Objects.size, before, "nothing should have been written");
  });

  it("writes into the caller's own tenant prefix", async () => {
    const res = await upload(`/api/projects/${projectA}/media/upload?ext=jpg`, Buffer.from("priya"), {
      token: editorToken,
    });
    assert.equal(res.status, 201);
    assert.ok(res.json.data.publicId.startsWith(`${projectA}/`));
    assert.equal(res.json.data.publicId.includes(projectB), false);
  });

  it("refuses anyone signed out", async () => {
    const res = await upload(`/api/projects/${projectA}/media/upload`, Buffer.from("x"));
    assert.equal(res.status, 401);
  });
});

describe("proxy upload — what may be stored", () => {
  it("refuses HTML and JavaScript, which would be stored XSS on the CDN domain", async () => {
    for (const contentType of ["text/html", "application/javascript", "text/javascript"]) {
      const res = await upload(
        `/api/projects/${projectA}/media/upload?ext=html`,
        Buffer.from("<script>alert(1)</script>"),
        { token: ownerToken, contentType }
      );
      assert.equal(res.status, 400, `${contentType} should be refused`);
      assert.match(res.json.error, /cannot be uploaded/i);
    }
  });

  it("accepts the types the library actually renders", async () => {
    for (const [i, contentType] of ["image/png", "image/webp", "application/pdf"].entries()) {
      const res = await upload(
        `/api/projects/${projectA}/media/upload?resourceType=raw`,
        Buffer.from(`allowed-${i}`),
        { token: ownerToken, contentType }
      );
      assert.equal(res.status, 201, `${contentType} should be accepted`);
    }
  });

  it("refuses an empty body", async () => {
    const res = await upload(`/api/projects/${projectA}/media/upload`, Buffer.alloc(0), {
      token: ownerToken,
    });
    assert.equal(res.status, 400);
  });

  it("answers a file over the cap with a readable 413, not a bare 500", async () => {
    // body-parser rejects on Content-Length, so this never transfers 16MB.
    const tooBig = Buffer.alloc(16 * 1024 * 1024, 0x41);
    const res = await upload(`/api/projects/${projectA}/media/upload?ext=jpg`, tooBig, {
      token: ownerToken,
    });
    assert.equal(res.status, 413);
    assert.match(res.json.error, /too large/i);
  });
});
