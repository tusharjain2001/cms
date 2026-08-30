import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Billing: the ladder, and the wall it puts in front of an unpaid account.
 *
 * Razorpay is replaced by a stub HTTP server rather than mocked in-process, so
 * the real `fetch`, the real Basic auth header and the real request bodies are
 * all exercised — `RAZORPAY_API_BASE` exists for exactly this, the same trick
 * `R2_ENDPOINT` plays for storage. Signatures are computed with the real HMAC
 * against the test secrets, so the verification path is genuinely tested and
 * not stubbed past.
 *
 * What matters most here is the *negative* space: nothing but a valid
 * signature may grant a website, and a stale webhook may never take one away.
 */

const KEY_SECRET = "test-razorpay-key-secret";
const WEBHOOK_SECRET = "test-razorpay-webhook-secret";

let mongo: MongoMemoryServer;
let server: Server;
let razorpay: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;
let User: typeof import("./models/user.js").User;

/** Every request the stub received, so the tests can assert what we sent. */
const calls: { method: string; path: string; body: any; auth: string | undefined }[] = [];

/** The subscription the stub pretends to hold, mutated by the routes below. */
let stubSub: Record<string, any>;

before(async () => {
  mongo = await MongoMemoryServer.create();

  // ------------------------------------------------------- the Razorpay stub
  razorpay = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const path = req.url ?? "";
      calls.push({
        method: req.method ?? "",
        path,
        body,
        auth: req.headers.authorization,
      });

      if (req.method === "POST" && path === "/subscriptions") {
        stubSub = {
          id: "sub_TEST123",
          plan_id: body.plan_id,
          status: "created",
          quantity: body.quantity,
          current_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          short_url: "https://rzp.io/i/test",
          notes: body.notes,
        };
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(stubSub));
      }

      if (req.method === "PATCH" && path === "/subscriptions/sub_TEST123") {
        stubSub = { ...stubSub, quantity: body.quantity, status: "active" };
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(stubSub));
      }

      if (req.method === "GET" && path === "/subscriptions/sub_TEST123") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(stubSub));
      }

      if (req.method === "POST" && path === "/subscriptions/sub_TEST123/cancel") {
        stubSub = { ...stubSub, status: "active" };
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(stubSub));
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { description: "no such stub route" } }));
    });
  });
  await new Promise<void>((r) => razorpay.listen(0, r));
  const rzpPort = (razorpay.address() as any).port;

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_billing_test");
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value";
  process.env.ADMIN_ORIGIN = "http://localhost:3000";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.RAZORPAY_PLAN_ID_MONTHLY = "plan_monthly_one_site";
  process.env.RAZORPAY_PLAN_ID_YEARLY = "plan_yearly_one_site";
  process.env.RAZORPAY_API_BASE = `http://127.0.0.1:${rzpPort}`;

  const { connectDb, disconnectDb } = await import("./db.js");
  const { createApp } = await import("./app.js");
  const { User: UserModel, hashPassword } = await import("./models/user.js");
  User = UserModel;

  await connectDb(process.env.MONGODB_URI);
  disconnect = disconnectDb;

  await User.create({
    email: "buyer@example.com",
    name: "Buyer",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("buyer-pass"),
    projectIds: [],
  });

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

after(async () => {
  server?.close();
  razorpay?.close();
  await disconnect?.();
  await mongo?.stop();
});

type Json = Record<string, any>;

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

/**
 * One sign-in, reused. Logging in per test would trip the API's own limiter —
 * ten attempts per email and IP — which is exactly the protection that should
 * stay on rather than be turned off for the convenience of the tests.
 */
let cachedToken: string | null = null;
async function signIn(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { email: "buyer@example.com", password: "buyer-pass" },
  });
  cachedToken = res.json.data.accessToken as string;
  return cachedToken;
}

/** Posts a webhook signed the way Razorpay signs one. */
function webhook(event: string, entity: Record<string, unknown>, createdAt: number) {
  const payload = JSON.stringify({
    event,
    created_at: createdAt,
    payload: { subscription: { entity } },
  });
  return fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex"),
    },
    body: payload,
  });
}

/* ------------------------------------------------------------------- tests */

describe("the price ladder", () => {
  it("quotes ₹999 a website, publicly, without an account", async () => {
    const res = await api("/api/billing/plans");
    assert.equal(res.status, 200);
    assert.equal(res.json.data.currency, "INR");
    assert.equal(res.json.data.pricePerWebsitePaise.monthly, 99_900);
    assert.deepEqual(
      res.json.data.examples.map((e: Json) => e.monthly),
      ["₹999", "₹1,998", "₹2,997"]
    );
  });

  it("starts a new account at zero websites — there is no trial", async () => {
    const token = await signIn();
    const res = await api("/api/billing", { token });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.websites, 0);
    assert.equal(res.json.data.status, "none");
    assert.equal(res.json.data.billingEnabled, true);
  });
});

describe("buying websites", () => {
  it("creates a subscription of the right quantity and quotes the right total", async () => {
    const token = await signIn();
    const res = await api("/api/billing/subscription", {
      method: "POST",
      token,
      body: { websites: 3, period: "monthly" },
    });

    assert.equal(res.status, 201);
    assert.equal(res.json.data.checkout.amountPaise, 299_700, "3 websites is ₹2,997");
    assert.equal(res.json.data.checkout.websites, 3);

    // The ladder is one plan bought three times, never a third plan.
    const created = calls.find((c) => c.path === "/subscriptions");
    assert.ok(created);
    assert.equal(created.body.plan_id, "plan_monthly_one_site");
    assert.equal(created.body.quantity, 3);
    // The account is stamped on the subscription, so a webhook can find it
    // without a reverse lookup.
    assert.ok(created.body.notes.userId);
    assert.match(created.auth ?? "", /^Basic /);
  });

  it("grants nothing until the payment is verified", async () => {
    const token = await signIn();
    const sub = await api("/api/billing", { token });
    assert.equal(sub.json.data.websites, 0, "created, not authorised");

    const project = await api("/api/projects", {
      method: "POST",
      token,
      body: { name: "Too Soon" },
    });
    assert.equal(project.status, 402);
    assert.equal(project.json.code, "subscription_required");
  });

  it("refuses a forged checkout signature", async () => {
    const token = await signIn();
    const res = await api("/api/billing/verify", {
      method: "POST",
      token,
      body: {
        razorpay_payment_id: "pay_FORGED",
        razorpay_subscription_id: "sub_TEST123",
        razorpay_signature: "0".repeat(64),
      },
    });
    assert.equal(res.status, 400);
    assert.equal((await api("/api/billing", { token })).json.data.websites, 0);
  });

  it("grants the websites once the real signature checks out", async () => {
    const token = await signIn();
    stubSub = { ...stubSub, status: "active" };

    const paymentId = "pay_REAL123";
    const signature = createHmac("sha256", KEY_SECRET)
      .update(`${paymentId}|sub_TEST123`)
      .digest("hex");

    const res = await api("/api/billing/verify", {
      method: "POST",
      token,
      body: {
        razorpay_payment_id: paymentId,
        razorpay_subscription_id: "sub_TEST123",
        razorpay_signature: signature,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.data.websites, 3);
    assert.equal(res.json.data.plan, "starter");
  });

  it("now allows exactly three websites and refuses the fourth", async () => {
    const token = await signIn();
    for (const name of ["One", "Two", "Three"]) {
      const res = await api("/api/projects", { method: "POST", token, body: { name } });
      assert.equal(res.status, 201, `expected ${name} to be allowed`);
    }
    const fourth = await api("/api/projects", { method: "POST", token, body: { name: "Four" } });
    assert.equal(fourth.status, 402);
    assert.equal(fourth.json.code, "subscription_required");
    assert.match(fourth.json.error, /₹3,996 a month/);
  });

  it("adds a website by amending the mandate, not by asking for the card again", async () => {
    const token = await signIn();
    const res = await api("/api/billing/subscription", {
      method: "POST",
      token,
      body: { websites: 4, period: "monthly" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.data.updated, true, "no new checkout");
    assert.equal(res.json.data.subscription.websites, 4);

    const patched = calls.find((c) => c.method === "PATCH");
    assert.ok(patched);
    assert.equal(patched.body.quantity, 4);
    // Immediately, not next cycle — somebody adding a website wants it now.
    assert.equal(patched.body.schedule_change_at, "now");

    assert.equal(
      (await api("/api/projects", { method: "POST", token, body: { name: "Four" } })).status,
      201
    );
  });

  it("refuses to shrink below the websites that already exist", async () => {
    const token = await signIn();
    const res = await api("/api/billing/subscription", {
      method: "POST",
      token,
      body: { websites: 1, period: "monthly" },
    });
    // There is no honest way for us to pick which three to switch off.
    assert.equal(res.status, 409);
    assert.match(res.json.error, /Delete the ones you no longer need/);
  });
});

describe("the webhook", () => {
  it("rejects anything it cannot verify", async () => {
    const payload = JSON.stringify({
      event: "subscription.cancelled",
      payload: { subscription: { entity: { id: "sub_TEST123", status: "cancelled", quantity: 0 } } },
    });

    const unsigned = await fetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    assert.equal(unsigned.status, 400);

    const wrong = await fetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": "deadbeef" },
      body: payload,
    });
    assert.equal(wrong.status, 400);

    const token = await signIn();
    assert.equal(
      (await api("/api/billing", { token })).json.data.websites,
      4,
      "an unverified webhook changed nothing"
    );
  });

  it("ignores an event older than the one already applied", async () => {
    const token = await signIn();
    const user = await User.findOne({ email: "buyer@example.com" });
    const applied = user!.subscription!.lastEventAt!.getTime();

    // A redelivery from "last week" that would cancel a live subscription.
    const stale = await webhook(
      "subscription.cancelled",
      { id: "sub_TEST123", status: "cancelled", quantity: 4, plan_id: "plan_monthly_one_site" },
      Math.floor(applied / 1000) - 7 * 86400
    );
    assert.equal(stale.status, 200, "acknowledged, so Razorpay stops retrying");

    assert.equal(
      (await api("/api/billing", { token })).json.data.websites,
      4,
      "but it did not take the websites away"
    );
  });

  it("revokes the allowance when the charges finally fail", async () => {
    const token = await signIn();
    const res = await webhook(
      "subscription.halted",
      { id: "sub_TEST123", status: "halted", quantity: 4, plan_id: "plan_monthly_one_site" },
      Math.floor(Date.now() / 1000) + 60
    );
    assert.equal(res.status, 200);

    const sub = await api("/api/billing", { token });
    assert.equal(sub.json.data.websites, 0);
    assert.equal(sub.json.data.plan, "free");

    // The websites already built stay — nobody's live site goes dark over a
    // card — but no new one may be added.
    assert.equal((await api("/api/projects", { token })).json.data.length, 4);
    assert.equal(
      (await api("/api/projects", { method: "POST", token, body: { name: "Five" } })).status,
      402
    );
  });

  it("restores it when the payment is retried successfully", async () => {
    const token = await signIn();
    await webhook(
      "subscription.charged",
      { id: "sub_TEST123", status: "active", quantity: 4, plan_id: "plan_monthly_one_site" },
      Math.floor(Date.now() / 1000) + 120
    );
    assert.equal((await api("/api/billing", { token })).json.data.websites, 4);
  });

  it("stops the money when the account is closed", async () => {
    const token = await signIn();
    // Websites have to go first — that rule predates billing and still holds.
    for (const p of (await api("/api/projects", { token })).json.data as Json[]) {
      await api(`/api/projects/${p.id}`, { method: "DELETE", token });
    }

    const before = calls.filter((c) => c.path.endsWith("/cancel")).length;
    const res = await api("/api/auth/me", { method: "DELETE", token });
    assert.equal(res.status, 200);

    // A closed account with a live mandate keeps being charged, and once the
    // user row is gone nothing links that subscription to anyone.
    const after = calls.filter((c) => c.path.endsWith("/cancel")).length;
    assert.equal(after, before + 1);
  });
});
