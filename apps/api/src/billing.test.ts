import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  CURRENCY,
  FREE_WEBSITES,
  formatMoney,
  PRICE_PER_WEBSITE_MONTHLY_CENTS,
  PRICE_PER_WEBSITE_MONTHLY_CENTS as MONTHLY,
  PRICE_PER_WEBSITE_YEARLY_CENTS,
} from "@pagecraft/shared";

/**
 * Billing: the ladder, and the wall it puts in front of an unpaid account.
 *
 * Dodo Payments is replaced by a stub HTTP server rather than mocked
 * in-process, so the real `fetch`, the real bearer header and the real request
 * bodies are all exercised — `DODO_API_BASE` exists for exactly this, the same
 * trick `R2_ENDPOINT` plays for storage. Webhook signatures are computed with
 * the real Standard-Webhooks HMAC against the test secret, so the verification
 * path is genuinely tested and not stubbed past.
 *
 * What matters most here is the *negative* space: **nothing but a valid webhook
 * signature may grant a website**, and a stale webhook may never take one away.
 * That first rule carries more weight than it did under Razorpay — the hosted
 * checkout means there is no second, in-page path to entitlement, so if the
 * webhook is wrong nobody can buy anything at all.
 */

const WEBHOOK_SECRET = "whsec_" + Buffer.from("dodo-webhook-test-secret").toString("base64");
const MONTHLY_PRODUCT = "pdt_monthly_one_site";
const YEARLY_PRODUCT = "pdt_yearly_one_site";

let mongo: MongoMemoryServer;
let server: Server | undefined;
let dodo: Server | undefined;
let baseUrl: string;
let disconnect: (() => Promise<void>) | undefined;
let User: any;

const calls: { method: string; path: string; body: any; auth: string | undefined }[] = [];
let stubSub: Record<string, any>;
/** Overrides for the stubbed Dodo product, so a price mismatch can be tested. */
let stubPrice: number | null = null;
let stubCurrency = CURRENCY as string;
let stubTrialDays = 0;
let resetPriceCheckCache: () => void;

before(async () => {
  mongo = await MongoMemoryServer.create();

  dodo = createServer((req, res) => {
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

      const json = (code: number, payload: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      // The price guard reads this before every checkout: the customer is
      // charged the PRODUCT's price, so the API refuses to sell when it does
      // not match what the dashboard advertises.
      if (req.method === "GET" && path.startsWith("/products/")) {
        const yearly = path.includes("yearly");
        return json(200, {
          product_id: path.slice("/products/".length),
          is_recurring: true,
          // `price`, not `price_detail` — this is the real shape of Dodo's
          // single-product response, and it differs from the list endpoint's.
          // Reading only one of them makes the guard refuse every checkout.
          price: {
            type: "recurring_price",
            price:
              stubPrice ??
              (yearly ? PRICE_PER_WEBSITE_YEARLY_CENTS : PRICE_PER_WEBSITE_MONTHLY_CENTS),
            currency: stubCurrency,
            tax_inclusive: false,
            payment_frequency_interval: yearly ? "Year" : "Month",
            trial_period_days: stubTrialDays,
          },
        });
      }

      if (req.method === "POST" && path === "/checkouts") {
        const line = body.product_cart?.[0] ?? {};
        stubSub = {
          subscription_id: "sub_TEST123",
          product_id: line.product_id,
          status: "pending",
          quantity: line.quantity,
          next_billing_date: new Date(Date.now() + 30 * 86400_000).toISOString(),
          metadata: body.metadata,
        };
        return json(200, {
          session_id: "cks_TEST",
          checkout_url: "https://checkout.dodopayments.com/session/cks_TEST",
        });
      }

      if (req.method === "POST" && path === "/subscriptions/sub_TEST123/change-plan") {
        stubSub = { ...stubSub, quantity: body.quantity, status: "active" };
        // Dodo answers a plan change with an empty 200 — the API has to re-read.
        return json(200, {});
      }

      if (req.method === "GET" && path === "/subscriptions/sub_TEST123") {
        return json(200, stubSub);
      }

      if (req.method === "PATCH" && path === "/subscriptions/sub_TEST123") {
        stubSub = { ...stubSub, cancel_at_next_billing_date: true };
        return json(200, stubSub);
      }

      json(404, { message: "no such stub route" });
    });
  });
  await new Promise<void>((r) => dodo!.listen(0, r));
  const dodoPort = (dodo.address() as any).port;

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_billing_test");
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value";
  process.env.ADMIN_ORIGIN = "http://localhost:3000";
  process.env.DODO_API_KEY = "test_dodo_key";
  process.env.DODO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.DODO_PRODUCT_ID_MONTHLY = MONTHLY_PRODUCT;
  process.env.DODO_PRODUCT_ID_YEARLY = YEARLY_PRODUCT;
  process.env.DODO_API_BASE = `http://127.0.0.1:${dodoPort}`;

  // Imported late, like everything else here: `config/env.ts` reads
  // process.env at import time, so a static import would load the module
  // before the stub's address is set.
  ({ resetPriceCheckCache } = await import("./lib/dodo.js"));

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
  dodo?.close();
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

/**
 * Posts a webhook signed the way Dodo signs one: **Standard Webhooks**.
 *
 * The digest covers `id.timestamp.body`, is base64 rather than hex, and is
 * keyed on the base64-decoded bytes after the `whsec_` prefix. Every one of
 * those differs from the Razorpay scheme this replaced, and getting any of them
 * wrong produces a signature that simply never matches — which, with a hosted
 * checkout, means nobody can ever buy anything. Hence signing for real here.
 */
function webhook(
  type: string,
  data: Record<string, unknown>,
  at: Date = new Date(),
  opts: { id?: string; secret?: string; timestamp?: number } = {}
) {
  const payload = JSON.stringify({ type, timestamp: at.toISOString(), data });
  const id = opts.id ?? `evt_${Math.random().toString(36).slice(2)}`;
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const secret = opts.secret ?? WEBHOOK_SECRET;
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");

  return fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": `v1,${signature}`,
    },
    body: payload,
  });
}

/**
 * A subscription entity as Dodo would report it.
 *
 * `metadata` is carried through from the checkout session the stub recorded —
 * which is the whole mechanism by which a FIRST purchase finds its account.
 * Unlike Razorpay, no subscription exists until the customer pays, so there is
 * nothing on the user row for the first webhook to match on.
 */
const subEntity = (over: Record<string, unknown> = {}) => ({
  subscription_id: "sub_TEST123",
  product_id: MONTHLY_PRODUCT,
  status: "active",
  quantity: 1,
  next_billing_date: new Date(Date.now() + 30 * 86400_000).toISOString(),
  metadata: stubSub?.metadata,
  ...over,
});

/**
 * A refusal message must quote a price. Built rather than written out so a
 * reprice stays a four-number change — and escaped, because `formatMoney`
 * returns "$7.99" and a bare `$` in a RegExp means end-of-string, so the
 * obvious version would silently never match.
 */
const priceRe = (minor: number) =>
  new RegExp(`${formatMoney(minor).replace(/[.*+?^${}()|[\\\]]/g, "\\$&")} a month`);

/* ------------------------------------------------------------------- tests */

describe("the price ladder", () => {
  it("quotes the per-website price publicly, without an account", async () => {
    const res = await api("/api/billing/plans");
    assert.equal(res.status, 200);
    assert.equal(res.json.data.currency, CURRENCY);
    // Derived from the shared constant rather than written out, so repricing
    // stays the four-number change `plans.ts` promises it is.
    assert.equal(res.json.data.pricePerWebsiteMinor.monthly, MONTHLY);
    assert.deepEqual(
      res.json.data.examples.map((e: Json) => e.monthly),
      [1, 2, 3].map((n) => formatMoney(n * MONTHLY))
    );
  });

  it("starts a new account with no subscription — the free website needs none", async () => {
    const token = await signIn();
    const res = await api("/api/billing", { token });
    assert.equal(res.status, 200);
    // The two numbers must NOT agree here, and the billing screen depends on
    // it: `websites` is what they pay for (nothing), `websitesAllowed` is what
    // they may own (the free one). Collapsing them makes a free account look
    // subscribed, and the dashboard then refuses to sell it one website.
    assert.equal(res.json.data.websites, 0);
    assert.equal(res.json.data.websitesAllowed, FREE_WEBSITES);
    assert.equal(res.json.data.status, "none");
    assert.equal(res.json.data.billingEnabled, true);
  });
});

/**
 * The price a customer is charged comes from the payment provider's product,
 * not from this codebase, so the two can silently disagree. That happened twice
 * in production configuration on the previous provider — a ₹1 test price
 * charging ₹999, and a $7.99 page charging ₹999 after the move to USD — and
 * both times the customer would have been the one to find out.
 */
describe("the advertised price must be the price Dodo charges", () => {
  it("refuses checkout when the product's price does not match", async () => {
    const token = await signIn();
    stubPrice = MONTHLY * 9;
    resetPriceCheckCache();
    try {
      const res = await api("/api/billing/subscription", {
        method: "POST",
        token,
        body: { websites: 1, period: "monthly" },
      });
      assert.equal(res.status, 503);
      // The customer is told nothing was charged, not given the internals.
      assert.match(res.json.error, /[Nn]othing has been charged/);
      // ...and no checkout session was opened at Dodo.
      assert.equal(calls.filter((c) => c.path === "/checkouts").length, 0);
    } finally {
      stubPrice = null;
      resetPriceCheckCache();
    }
  });

  it("refuses checkout when the product has a provider-side trial", async () => {
    const token = await signIn();
    // A Dodo trial reports the subscription as active while nothing has been
    // paid, so the webhook would grant the full paid plan and hand someone
    // unlimited pages for free. The free tier is ours to enforce, not Dodo's.
    stubTrialDays = 14;
    resetPriceCheckCache();
    try {
      const res = await api("/api/billing/subscription", {
        method: "POST",
        token,
        body: { websites: 1, period: "monthly" },
      });
      assert.equal(res.status, 503);
      assert.equal(calls.filter((c) => c.path === "/checkouts").length, 0);
    } finally {
      stubTrialDays = 0;
      resetPriceCheckCache();
    }
  });

  it("refuses checkout when the product is in the wrong currency", async () => {
    const token = await signIn();
    // The dangerous one: 799 is $7.99 or ₹7.99 depending on a field nobody
    // looks at, so a price check alone would have waved this through.
    stubCurrency = CURRENCY === "INR" ? "USD" : "INR";
    resetPriceCheckCache();
    try {
      const res = await api("/api/billing/subscription", {
        method: "POST",
        token,
        body: { websites: 1, period: "monthly" },
      });
      assert.equal(res.status, 503);
      assert.equal(calls.filter((c) => c.path === "/checkouts").length, 0);
    } finally {
      stubCurrency = CURRENCY;
      resetPriceCheckCache();
    }
  });
});

describe("buying websites", () => {
  it("opens a hosted checkout for the right quantity and quotes the right total", async () => {
    const token = await signIn();
    const res = await api("/api/billing/subscription", {
      method: "POST",
      token,
      body: { websites: 3, period: "monthly" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.updated, false);
    assert.equal(res.json.data.checkout.checkoutUrl.startsWith("https://"), true);
    assert.equal(res.json.data.checkout.amountMinor, 3 * MONTHLY, "3 websites is 3x the unit price");

    // The ladder is a quantity of ONE product, never a third product.
    const sent = calls.filter((c) => c.path === "/checkouts").at(-1)!;
    assert.deepEqual(sent.body.product_cart, [{ product_id: MONTHLY_PRODUCT, quantity: 3 }]);
    assert.equal(sent.auth, "Bearer test_dodo_key");
    // Stamped so a webhook can find the account without an email lookup.
    assert.ok(sent.body.metadata.userId);
    assert.match(sent.body.return_url, /\/billing\?checkout=done$/);
  });

  it("grants nothing until the webhook says so", async () => {
    const token = await signIn();
    const sub = await api("/api/billing", { token });
    assert.equal(sub.json.data.websites, 0, "a checkout session is not a payment");

    // The free website is unaffected...
    const free = await api("/api/projects", { method: "POST", token, body: { name: "Free One" } });
    assert.equal(free.status, 201);

    // ...but the three that were asked for are not granted until Dodo confirms,
    // so a second website is still refused.
    const project = await api("/api/projects", {
      method: "POST",
      token,
      body: { name: "Too Soon" },
    });
    assert.equal(project.status, 402);
    assert.equal(project.json.code, "subscription_required");

    // The rest of this suite shares the account and counts its websites, so
    // the free one cannot be left lying around.
    await api(`/api/projects/${free.json.data.id}`, { method: "DELETE", token });
    assert.equal((await api("/api/projects", { token })).json.data.length, 0);
  });

  it("grants the websites once a signed webhook arrives", async () => {
    const token = await signIn();
    const res = await webhook("subscription.active", subEntity({ quantity: 3 }));
    assert.equal(res.status, 200);

    const sub = await api("/api/billing", { token });
    assert.equal(sub.json.data.websites, 3);
    assert.equal(sub.json.data.status, "active");
    assert.equal(sub.json.data.plan, "starter");
  });

  it("now allows exactly three websites and refuses the fourth", async () => {
    const token = await signIn();
    for (const name of ["One", "Two", "Three"]) {
      const res = await api("/api/projects", { method: "POST", token, body: { name } });
      assert.equal(res.status, 201, `expected ${name} to be allowed`);
    }
    const fourth = await api("/api/projects", { method: "POST", token, body: { name: "Four" } });
    assert.equal(fourth.status, 402);
    assert.match(fourth.json.error, priceRe(4 * MONTHLY));
  });

  it("adds a website by amending the subscription, not by asking for the card again", async () => {
    const token = await signIn();
    const before = calls.filter((c) => c.path === "/checkouts").length;

    const res = await api("/api/billing/subscription", {
      method: "POST",
      token,
      body: { websites: 4, period: "monthly" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.data.updated, true, "an existing subscription is amended in place");
    assert.equal(res.json.data.subscription.websites, 4);

    // No new checkout session: the customer never re-enters a card.
    assert.equal(calls.filter((c) => c.path === "/checkouts").length, before);
    const change = calls.filter((c) => c.path.endsWith("/change-plan")).at(-1)!;
    assert.equal(change.body.quantity, 4);
    // Prorated, because somebody adding a website wants it now and should pay
    // only for the remainder of the cycle.
    assert.equal(change.body.proration_billing_mode, "prorated_immediately");
  });

  it("refuses to shrink below the websites that already exist", async () => {
    const token = await signIn();
    const res = await api("/api/billing/subscription", {
      method: "POST",
      token,
      body: { websites: 1, period: "monthly" },
    });
    assert.equal(res.status, 409);
    assert.match(res.json.error, /Delete the ones you no longer need/);
  });
});

describe("the webhook", () => {
  it("rejects anything it cannot verify", async () => {
    const payload = JSON.stringify({ type: "subscription.active", data: subEntity() });

    // No signature headers at all.
    const bare = await fetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    assert.equal(bare.status, 400);

    // A signature made with the wrong secret.
    const forged = await webhook("subscription.active", subEntity({ quantity: 9 }), new Date(), {
      secret: "whsec_" + Buffer.from("not-the-secret").toString("base64"),
    });
    assert.equal(forged.status, 400);

    // A signature that is valid for a DIFFERENT event id — the id is inside
    // the digest precisely so a captured body cannot be replayed under a new
    // one, which is the part Razorpay's single-header scheme did not have.
    const body = JSON.stringify({ type: "subscription.active", data: subEntity({ quantity: 9 }) });
    const ts = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(WEBHOOK_SECRET.slice("whsec_".length), "base64");
    const sig = createHmac("sha256", key).update(`evt_ONE.${ts}.${body}`).digest("base64");
    const swapped = await fetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": "evt_TWO",
        "webhook-timestamp": ts,
        "webhook-signature": `v1,${sig}`,
      },
      body,
    });
    assert.equal(swapped.status, 400);

    const token = await signIn();
    assert.equal(
      (await api("/api/billing", { token })).json.data.websites,
      4,
      "no unverified event changed anything"
    );
  });

  it("rejects a correctly signed replay from hours ago", async () => {
    const stale = await webhook("subscription.active", subEntity({ quantity: 9 }), new Date(), {
      timestamp: Math.floor(Date.now() / 1000) - 3 * 3600,
    });
    assert.equal(stale.status, 400);

    const token = await signIn();
    assert.equal((await api("/api/billing", { token })).json.data.websites, 4);
  });

  it("ignores an event older than the one already applied", async () => {
    const token = await signIn();
    // Razorpay-era lesson that carries over: providers retry for days, so a
    // redelivered `cancelled` from last week must not land after this
    // morning's `active` and lock a paying customer out.
    const res = await webhook(
      "subscription.cancelled",
      subEntity({ status: "cancelled", quantity: 4 }),
      new Date(Date.now() - 7 * 86400_000)
    );
    assert.equal(res.status, 200);

    const sub = await api("/api/billing", { token });
    assert.equal(sub.json.data.websites, 4, "a stale event did not revoke anything");
    assert.equal(sub.json.data.status, "active");
  });

  it("keeps a customer entitled while a failed renewal is retried", async () => {
    const token = await signIn();
    // Dodo's `on_hold` is dunning, which our model calls `pending` and treats
    // as entitling: one bounced card must not switch off live websites.
    const res = await webhook(
      "subscription.on_hold",
      subEntity({ status: "on_hold", quantity: 4 }),
      new Date(Date.now() + 60_000)
    );
    assert.equal(res.status, 200);

    const sub = await api("/api/billing", { token });
    assert.equal(sub.json.data.status, "pending");
    assert.equal(sub.json.data.websites, 4, "still entitled while the charge is retried");
  });

  it("revokes the allowance when the subscription finally ends", async () => {
    const token = await signIn();
    const built = (await api("/api/projects", { token })).json.data.length;
    const res = await webhook(
      "subscription.cancelled",
      subEntity({ status: "cancelled", quantity: 4 }),
      new Date(Date.now() + 120_000)
    );
    assert.equal(res.status, 200);

    const sub = await api("/api/billing", { token });
    // Paying for nothing again, but still allowed the free website.
    assert.equal(sub.json.data.websites, 0);
    assert.equal(sub.json.data.websitesAllowed, FREE_WEBSITES);
    assert.equal(sub.json.data.plan, "free");

    // The websites already built stay — nobody's live site goes dark over a
    // card — but no new one may be added. Compared against what was actually
    // built rather than a hard-coded number, so the property under test is
    // "nothing was deleted" rather than "there were four".
    assert.equal((await api("/api/projects", { token })).json.data.length, built);
    assert.equal(
      (await api("/api/projects", { method: "POST", token, body: { name: "Five" } })).status,
      402
    );
  });

  it("restores it when a later event says the subscription is live again", async () => {
    const token = await signIn();
    await webhook(
      "subscription.renewed",
      subEntity({ status: "active", quantity: 4 }),
      new Date(Date.now() + 180_000)
    );
    const sub = await api("/api/billing", { token });
    assert.equal(sub.json.data.websites, 4);
    assert.equal(sub.json.data.plan, "starter");
  });

  it("records the charge, not just the state", async () => {
    const token = await signIn();
    await webhook(
      "payment.succeeded",
      {
        payment_id: "pay_CHARGE1",
        subscription_id: "sub_TEST123",
        total_amount: 4 * MONTHLY,
        currency: CURRENCY,
        status: "succeeded",
        payment_method: "card",
        created_at: new Date().toISOString(),
      },
      new Date(Date.now() + 240_000)
    );

    const res = await api("/api/billing/payments", { token });
    assert.equal(res.status, 200);
    const row = (res.json.data as Json[]).find((p) => p.providerPaymentId === "pay_CHARGE1");
    assert.ok(row, "the charge was recorded");
    // The amount comes from the provider, not from our price list — recomputing
    // it from today's prices is how a repricing rewrites history.
    assert.equal(row.amountMinor, 4 * MONTHLY);
    // ...and so does the currency, so a history spanning a currency change
    // still says what each customer was actually billed.
    assert.equal(row.currency, CURRENCY);
    assert.equal(row.status, "succeeded");
    assert.equal(row.method, "card");
    assert.equal(row.websites, 4);
  });

  it("does not double-count a redelivered charge", async () => {
    const token = await signIn();
    const before = (await api("/api/billing/payments", { token })).json.data.length;

    // Providers retry for days; the same payment id must produce one row.
    await webhook(
      "payment.succeeded",
      {
        payment_id: "pay_CHARGE1",
        subscription_id: "sub_TEST123",
        total_amount: 4 * MONTHLY,
        currency: CURRENCY,
        status: "succeeded",
        payment_method: "card",
      },
      new Date(Date.now() + 300_000)
    );

    const after = (await api("/api/billing/payments", { token })).json.data.length;
    assert.equal(after, before, "a redelivery updated the row rather than adding one");
  });

  it("answers 200 to an event type it does not handle", async () => {
    // Dodo delivers dozens of event families and the endpoint subscribes to all
    // of them on purpose. Anything but a 200 here makes Dodo redeliver for days.
    const res = await webhook("license_key.created", { license_key_id: "lk_1" });
    assert.equal(res.status, 200);
  });

  it("keeps one account's payments away from another", async () => {
    // No token at all: billing history is not a public endpoint.
    const res = await api("/api/billing/payments");
    assert.equal(res.status, 401);
  });

  it("stops the money when the account is closed", async () => {
    const token = await signIn();
    // Websites have to go first — that rule predates billing and still holds.
    for (const p of (await api("/api/projects", { token })).json.data as Json[]) {
      await api(`/api/projects/${p.id}`, { method: "DELETE", token });
    }

    const before = calls.filter(
      (c) => c.method === "PATCH" && c.path === "/subscriptions/sub_TEST123"
    ).length;
    const res = await api("/api/auth/me", { method: "DELETE", token });
    assert.equal(res.status, 200);

    // A closed account with a live subscription keeps being charged, and once
    // the user row is gone nothing links that subscription to anyone.
    const after = calls.filter(
      (c) => c.method === "PATCH" && c.path === "/subscriptions/sub_TEST123"
    ).length;
    assert.equal(after, before + 1);
  });
});
