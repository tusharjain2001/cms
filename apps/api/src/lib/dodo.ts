import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CURRENCY,
  type BillingPeriod,
  type SubscriptionStatus,
  clampWebsites,
  pricePerWebsiteMinor,
} from "@pagecraft/shared";
import { env, isProd } from "../config/env.js";
import { HttpError, serviceUnavailable } from "./respond.js";

/**
 * The whole Dodo Payments integration, in one file — the same shape `lib/r2.ts`
 * and the old `lib/razorpay.ts` had. Nothing else in the API imports the
 * payment provider, so swapping it again means rewriting this file and
 * `routes/billing.ts` and touching nothing else. That boundary is the reason
 * this migration was a day rather than a fortnight.
 *
 * **Why Dodo rather than Razorpay.** The product is priced in USD, and Razorpay
 * cannot bill USD on a recurring basis — not a setting, a regulation. Its
 * recurring rails are RBI e-mandates, which may only be registered in INR, so
 * `POST /plans` with `currency: "USD"` is refused outright ("Currency provided
 * is not supported"). Confirmed empirically: on the same live account a one-off
 * USD *order* succeeded while a USD *plan* was rejected. Dodo is a **merchant
 * of record** — it is the legal seller, bills in USD worldwide, handles the
 * sales tax, and settles to an Indian bank. Do not re-attempt USD on Razorpay.
 *
 * **Why the ladder still works.** Dodo does seat-based subscriptions: one
 * product bought `quantity` times, and a `change-plan` call that prorates.
 * That is the same shape as the Razorpay design, so `$7.99 × N websites`
 * survived the move unchanged and customers still never re-enter a card to add
 * a website.
 *
 * **Why raw fetch rather than the SDK.** Five calls and one HMAC do not justify
 * a dependency, and `DODO_API_BASE` lets the tests point the same code at a
 * stub — the trick `R2_ENDPOINT` already plays.
 */

// ------------------------------------------------------------------ config

export const dodoEnabled = (): boolean =>
  Boolean(env.DODO_API_KEY && (env.DODO_PRODUCT_ID_MONTHLY || env.DODO_PRODUCT_ID_YEARLY));

/**
 * The Dodo product id for a billing period, or `null` if that period was never
 * configured. Returning null rather than throwing lets the billing screen offer
 * only the periods that actually work.
 */
export function productIdFor(period: BillingPeriod): string | null {
  return (period === "yearly" ? env.DODO_PRODUCT_ID_YEARLY : env.DODO_PRODUCT_ID_MONTHLY) ?? null;
}

export function periodOfProductId(productId: string | null | undefined): BillingPeriod {
  return productId && productId === env.DODO_PRODUCT_ID_YEARLY ? "yearly" : "monthly";
}

/**
 * What a given quantity costs per cycle, in the currency's minor unit — for
 * display only. What is actually charged is the Dodo product's price times the
 * quantity, which is why `checkProductPrice` exists.
 */
export const cycleAmountMinor = (websites: number, period: BillingPeriod) =>
  clampWebsites(websites) * pricePerWebsiteMinor(period);

// ------------------------------------------------------------------- types

export interface DodoSubscription {
  subscription_id: string;
  product_id?: string | null;
  /** pending | active | on_hold | paused | cancelled | failed | expired */
  status?: string;
  quantity?: number;
  currency?: string;
  recurring_pre_tax_amount?: number;
  next_billing_date?: string | null;
  cancel_at_next_billing_date?: boolean;
  customer?: { customer_id?: string; email?: string; name?: string } | null;
  metadata?: Record<string, string> | null;
}

export interface DodoCheckoutSession {
  session_id: string;
  checkout_url: string;
}

interface DodoPriceDetail {
  type?: string;
  price?: number;
  currency?: string;
  tax_inclusive?: boolean;
  payment_frequency_interval?: string;
  trial_period_days?: number;
}

/**
 * Dodo reports a product's price under **two different keys depending on the
 * endpoint**: `GET /products` (the list) returns `price_detail`, while
 * `GET /products/{id}` returns `price`. Both are read, because coding for one
 * of them makes the price guard refuse every checkout with "did not report a
 * recurring price" — which looks exactly like a misconfigured product and is
 * not.
 */
interface DodoProduct {
  product_id: string;
  name?: string;
  is_recurring?: boolean;
  price?: DodoPriceDetail | null;
  price_detail?: DodoPriceDetail | null;
}

/**
 * The slice of Dodo's payment entity we store. Deliberately partial — we keep
 * what a customer or an accountant would ask for, and nothing that looks like
 * card data (which never reaches this server anyway).
 */
export interface DodoPaymentEntity {
  payment_id: string;
  subscription_id?: string | null;
  customer?: { customer_id?: string; email?: string; name?: string } | null;
  total_amount?: number;
  settlement_amount?: number;
  currency?: string;
  status?: string;
  payment_method?: string;
  created_at?: string;
}

// ---------------------------------------------------------- status mapping

/**
 * Dodo's subscription states → ours.
 *
 * The load-bearing line is **`on_hold` → `pending`**. Dodo puts a subscription
 * on hold when a *renewal* charge fails and dunning begins; our `pending` is
 * defined as "the provider is retrying a failed charge" and is deliberately
 * **entitling**. Locking a paying customer out of websites that are live on
 * the internet because one card bounced is the wrong trade, and it was the
 * wrong trade under Razorpay too — this mapping is what preserves that.
 *
 * `failed` is different and terminal: the mandate never authorised in the first
 * place, so nothing was ever paid for and nothing is entitled.
 */
const STATUS_MAP: Record<string, SubscriptionStatus> = {
  pending: "created",
  active: "active",
  on_hold: "pending",
  paused: "paused",
  cancelled: "cancelled",
  failed: "halted",
  expired: "expired",
};

export function mapStatus(dodoStatus: string | null | undefined): SubscriptionStatus {
  if (!dodoStatus) return "none";
  return STATUS_MAP[dodoStatus] ?? "none";
}

// -------------------------------------------------------------------- call

function authHeader(): string {
  return `Bearer ${env.DODO_API_KEY}`;
}

/**
 * One request to Dodo.
 *
 * Their errors carry a human-readable message, and that message is genuinely
 * useful ("Currency provided is not supported" was the entire diagnosis of why
 * Razorpay had to go), so it is surfaced rather than flattened into "payment
 * failed" — that difference is a five-minute fix versus an afternoon.
 */
async function call<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): Promise<T> {
  if (!dodoEnabled()) {
    throw serviceUnavailable(
      "Payments are not set up on this server yet, so nothing can be purchased.",
      "billing_not_configured"
    );
  }

  let res: Response;
  try {
    res = await fetch(`${env.DODO_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        // Dodo sits behind Cloudflare, which 403s some non-browser user
        // agents outright (observed: a bare `Python-urllib` request came back
        // as Cloudflare error 1010, nothing to do with the key). Node's own
        // default UA is not obviously safer, and the failure would present as
        // a baffling 403 on a key that works fine elsewhere — so identify
        // ourselves explicitly rather than rely on the runtime's default.
        "User-Agent": "Pagecraft/1.0 (+https://mypagecraft.com)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // The provider being unreachable is not the customer's fault and not a 4xx.
    throw serviceUnavailable("Could not reach the payment provider. Please try again.");
  }

  const text = await res.text();
  const json: unknown = text ? safeParse(text) : {};

  if (!res.ok) {
    const err = json as { message?: string; error?: string; detail?: string };
    const description =
      err?.message ?? err?.error ?? err?.detail ?? `Payment provider returned ${res.status}.`;
    throw new HttpError(res.status >= 500 ? 502 : 400, description);
  }

  return json as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------ buying

/**
 * Opens a hosted checkout for `websites` sites.
 *
 * **This grants nothing.** Dodo hosts the payment page, so unlike Razorpay's
 * in-page modal there is no signature handed back to the browser to verify —
 * the customer leaves, pays, and returns to `returnUrl`. The webhook is
 * therefore the *only* thing that grants access, which is simpler and safer
 * than the two-sources-of-truth arrangement it replaces.
 *
 * `metadata.userId` comes back on every webhook for the resulting
 * subscription, so the account is found from the event alone — no reverse
 * lookup, and no chance of crediting the wrong account if a customer somehow
 * holds two.
 */
export async function createCheckoutSession(opts: {
  websites: number;
  period: BillingPeriod;
  userId: string;
  email: string;
  name: string;
  returnUrl: string;
}): Promise<DodoCheckoutSession> {
  const quantity = clampWebsites(opts.websites);
  const productId = productIdFor(opts.period);
  if (!productId) {
    throw serviceUnavailable(
      `${opts.period === "yearly" ? "Yearly" : "Monthly"} billing is not set up on this server.`,
      "billing_not_configured"
    );
  }

  return call<DodoCheckoutSession>("POST", "/checkouts", {
    product_cart: [{ product_id: productId, quantity }],
    customer: { email: opts.email, name: opts.name },
    return_url: opts.returnUrl,
    metadata: {
      userId: opts.userId,
      websites: String(quantity),
      period: opts.period,
    },
  });
}

/**
 * Changes how many websites an existing subscription covers.
 *
 * `prorated_immediately` because somebody adding a website wants it now, not
 * next month, and should pay only for the remainder of the cycle. Going *down*
 * is refused upstream unless the account has already deleted the websites —
 * see `routes/billing.ts`.
 *
 * `on_payment_failure: "prevent_change"` is the careful choice: if the prorated
 * charge fails we would rather leave the customer on the plan they are paying
 * for than hand them a website they have not paid for and try to claw it back.
 *
 * Returns nothing useful — Dodo answers 200 with an empty body — so the caller
 * re-reads the subscription rather than trusting a local guess.
 */
export async function changeSubscriptionQuantity(
  subscriptionId: string,
  period: BillingPeriod,
  websites: number
): Promise<void> {
  const productId = productIdFor(period);
  if (!productId) {
    throw serviceUnavailable(
      `${period === "yearly" ? "Yearly" : "Monthly"} billing is not set up on this server.`,
      "billing_not_configured"
    );
  }

  await call<unknown>("POST", `/subscriptions/${subscriptionId}/change-plan`, {
    product_id: productId,
    quantity: clampWebsites(websites),
    proration_billing_mode: "prorated_immediately",
    on_payment_failure: "prevent_change",
  });
}

export async function fetchSubscription(subscriptionId: string): Promise<DodoSubscription> {
  return call<DodoSubscription>("GET", `/subscriptions/${subscriptionId}`);
}

/**
 * Cancels at the end of the paid-for cycle, never immediately: the customer
 * paid for this month and taking their websites away on the day they cancel
 * would be theft of the remainder.
 */
export async function cancelSubscription(subscriptionId: string): Promise<DodoSubscription> {
  await call<unknown>("PATCH", `/subscriptions/${subscriptionId}`, {
    cancel_at_next_billing_date: true,
    cancel_reason: "cancelled_by_customer",
  });
  return fetchSubscription(subscriptionId);
}

// ------------------------------------------------------------- the price guard

export type PriceCheck = { ok: true } | { ok: false; reason: string };

/**
 * Definitive verdicts only. A network blip must not permanently disable
 * billing, so failures to *reach* Dodo are never cached — only answers.
 */
const priceChecks = new Map<BillingPeriod, PriceCheck>();

/** Test seam. */
export function resetPriceCheckCache(): void {
  priceChecks.clear();
}

/**
 * **Does the Dodo product we are about to charge actually cost what the product
 * says it costs?**
 *
 * The price a customer pays does not come from this codebase — it comes from
 * the product configured in Dodo's dashboard, exactly as it used to come from
 * an immutable Razorpay Plan. Change the constants in `plans.ts` and forget to
 * update the dashboard and we advertise one price while charging another. That
 * happened twice on Razorpay: a ₹1 test price charging ₹999, and a $7.99 page
 * charging ₹999 after the move to USD.
 *
 * **Currency is the half that matters most.** Amounts differ by a factor; a
 * currency differs by *meaning*, and `799` is $7.99 or ₹7.99 depending on a
 * field nobody reads.
 *
 * Checked once per period per process and cached, so it costs one extra API
 * call rather than one per checkout.
 */
export async function checkProductPrice(period: BillingPeriod): Promise<PriceCheck> {
  const cached = priceChecks.get(period);
  if (cached) return cached;

  const productId = productIdFor(period);
  if (!productId) {
    const verdict: PriceCheck = {
      ok: false,
      reason: `No Dodo product is configured for ${period} billing.`,
    };
    priceChecks.set(period, verdict);
    return verdict;
  }

  // Deliberately NOT cached on failure: if Dodo is briefly unreachable we want
  // to ask again, not to have decided that billing is broken forever.
  const product = await call<DodoProduct>("GET", `/products/${productId}`);

  const want = pricePerWebsiteMinor(period);
  const detail = product.price_detail ?? product.price ?? null;
  const got = detail?.price;
  const gotCurrency = detail?.currency;
  const recurring = product.is_recurring !== false;
  const trialDays = detail?.trial_period_days ?? 0;

  let verdict: PriceCheck;
  if (got === undefined || gotCurrency === undefined) {
    verdict = {
      ok: false,
      reason: `Dodo product ${productId} did not report a recurring price. Is it a subscription product?`,
    };
  } else if (!recurring) {
    // A one-off product would take one payment and never renew, and no
    // renewal webhook would ever arrive to keep the account entitled.
    verdict = {
      ok: false,
      reason: `Dodo product ${productId} is a one-time product, but this build sells a subscription.`,
    };
  } else if (trialDays > 0) {
    /**
     * A provider-side trial is a hole in the free tier, not a feature.
     *
     * The free tier is one website of one page, enforced here by
     * `assertCanAddPage`. A Dodo trial makes the subscription report as
     * **active** while nothing has been paid, so the webhook grants the full
     * paid plan and someone gets unlimited pages for `trialDays` on a
     * subscription this API believes is settled. Refusing is the only way to
     * make "do not set a trial" a rule rather than a note in a README.
     */
    verdict = {
      ok: false,
      reason:
        `Dodo product ${productId} has a ${trialDays}-day trial. This build enforces its own ` +
        `free tier (one website, one page) and a provider trial would grant paid access it ` +
        `knows nothing about. Set the trial period to 0 in the Dodo dashboard.`,
    };
  } else if (gotCurrency !== CURRENCY || got !== want) {
    verdict = {
      ok: false,
      reason:
        `Dodo product ${productId} charges ${gotCurrency} ${got}, but this build sells ` +
        `${CURRENCY} ${want} per website per ${period === "yearly" ? "year" : "month"}. ` +
        `Fix the product in the Dodo dashboard, or align packages/shared/src/plans.ts.`,
    };
  } else {
    verdict = { ok: true };
  }

  priceChecks.set(period, verdict);
  return verdict;
}

// -------------------------------------------------------------- signatures

/** Constant-time compare that tolerates a length mismatch instead of throwing. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface WebhookHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

/** How far out of date a webhook may be before it is treated as a replay. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies a Dodo webhook. **Standard Webhooks**, not Razorpay's scheme, and
 * the differences all matter:
 *
 *   - Three headers, not one: `webhook-id`, `webhook-timestamp`,
 *     `webhook-signature`.
 *   - The signed message is `id.timestamp.rawBody` — so a captured body cannot
 *     be replayed under a different id, and the timestamp is inside the digest
 *     rather than merely alongside it.
 *   - The digest is **base64**, not hex.
 *   - The secret is `whsec_<base64>`; the bytes after the prefix are the key,
 *     base64-decoded. HMAC'ing the printable string instead is the classic way
 *     to get "signature never matches".
 *   - The header may carry several space-separated versioned signatures
 *     (`v1,<sig> v1,<sig>`) during a secret rotation, and any one matching is a
 *     pass.
 *
 * The body must be **raw** — re-serialising parsed JSON reorders keys and the
 * digest stops matching — which is why `app.ts` mounts this route above
 * `express.json`.
 *
 * With no secret configured this returns false, so an unconfigured server
 * rejects every webhook rather than trusting anyone who finds the URL.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, headers: WebhookHeaders): boolean {
  const secret = env.DODO_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  // A webhook older than the tolerance is a replay, even with a valid digest.
  const sent = Number(headers.timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - sent) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest("base64");

  // "v1,<sig> v1,<other>" — any match passes, so a secret rotation does not
  // drop events on the floor.
  return headers.signature
    .split(" ")
    .map((part) => (part.includes(",") ? part.slice(part.indexOf(",") + 1) : part))
    .some((candidate) => safeEqual(expected, candidate));
}

// ------------------------------------------------------------ boot warnings

/**
 * Shouts at boot about a Dodo setup that *looks* fine but is not.
 *
 * The dangerous configuration is a key and products without a webhook secret:
 * `billingEnabled` is true, checkout works, the customer pays — and then every
 * webhook is rejected, so nothing is ever granted. With a hosted checkout the
 * webhook is the *only* path to access, which makes this worse than it was
 * under Razorpay, where a verified callback covered the first purchase.
 */
export function warnAboutBillingConfig(): void {
  const say = (lines: string[]) => console.warn("\n" + lines.join("\n") + "\n");

  if (!dodoEnabled()) {
    say([
      "⚠ Dodo Payments is not configured, so nobody can buy a website.",
      "  Set DODO_API_KEY and a product id in .env.",
      "  Create the products in the Dodo dashboard: one website, monthly and yearly.",
      "  (The dashboard explains this to signed-in users rather than showing a dead button.)",
    ]);
    return;
  }

  if (!env.DODO_WEBHOOK_SECRET) {
    say([
      "⚠ DODO_WEBHOOK_SECRET is missing. Checkout will work and grant NOTHING.",
      "  Dodo hosts the payment page, so the webhook is the only thing that",
      "  grants access. Without the secret every webhook is rejected, and a",
      "  customer who pays will simply stay on the free plan.",
      "  Fix: Dodo dashboard → Developer → Webhooks → add",
      "  https://<your-api>/api/billing/webhook, then put its secret in .env.",
    ]);
  }

  const live = !env.DODO_API_KEY?.startsWith("test_");
  if (live && !isProd) {
    say(["⚠ LIVE Dodo keys outside production. Real cards will be charged."]);
  }
  if (!live && isProd) {
    say(["⚠ TEST Dodo keys in production. No real payment will ever be taken."]);
  }
  if (!productIdFor("monthly") || !productIdFor("yearly")) {
    say([
      `⚠ Only the ${productIdFor("monthly") ? "monthly" : "yearly"} Dodo product is configured.`,
      "  The other billing period will be refused at checkout.",
    ]);
  }
}

/**
 * Shouts at boot if the configured products do not match the advertised price.
 *
 * Fire-and-forget on purpose: a slow or unreachable Dodo must not delay the API
 * starting, and the checkout route re-checks anyway.
 */
export function verifyProductPricesAtBoot(): void {
  if (!dodoEnabled()) return;
  for (const period of ["monthly", "yearly"] as const) {
    if (!productIdFor(period)) continue;
    void checkProductPrice(period)
      .then((v) => {
        if (!v.ok) {
          console.warn(
            [
              "",
              `⚠ THE ADVERTISED PRICE IS NOT THE PRICE DODO WILL CHARGE (${period}).`,
              `  ${v.reason}`,
              "  Checkout for this period is refused until it matches.",
              "",
            ].join("\n")
          );
        }
      })
      .catch(() => {
        // Unreachable at boot is not evidence of a mismatch. Stay quiet; the
        // checkout route will find out for real when someone tries to buy.
      });
  }
}
