import { createHmac, timingSafeEqual } from "node:crypto";
import { type BillingPeriod, clampWebsites, pricePerWebsitePaise } from "@pagecraft/shared";
import { billingEnabled, env, isProd } from "../config/env.js";
import { HttpError, serviceUnavailable } from "./respond.js";

/**
 * The whole Razorpay integration, in one file — the same shape as `lib/r2.ts`.
 * Nothing else in the API imports the payment provider, so swapping it means
 * rewriting this file and `routes/billing.ts` and touching nothing else.
 *
 * **Why the ladder is a quantity, not a tier.** ₹999 buys one website, ₹1,998
 * buys two, ₹2,997 buys three. That is one Razorpay Plan ("one website, per
 * month")
 * bought `quantity` times, which means adding a fourth website is a quantity
 * change on an existing mandate rather than a new plan, a new price and a new
 * card authorisation. Twenty tiers would have been twenty things to keep in
 * step with `packages/shared/src/plans.ts`.
 *
 * **Why raw fetch rather than the `razorpay` npm package.** Four calls and two
 * HMACs do not justify a dependency, and `RAZORPAY_API_BASE` lets the tests
 * point the same code at a stub — the trick `R2_ENDPOINT` already plays.
 */

/** How many cycles a subscription is authorised for before it must be renewed. */
const TOTAL_COUNT: Record<BillingPeriod, number> = {
  monthly: 120, // ten years of monthly charges
  yearly: 10,
};

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  customer_id?: string;
  status: string;
  quantity: number;
  current_end?: number | null;
  current_start?: number | null;
  short_url?: string | null;
  notes?: Record<string, string>;
}

export const razorpayEnabled = () => billingEnabled;

/** The public key id the browser needs to open Checkout. Never the secret. */
export const razorpayKeyId = () => env.RAZORPAY_KEY_ID ?? null;

/**
 * The Razorpay Plan id for a billing period, or `null` if that period was
 * never configured. Returning null rather than throwing lets the billing
 * screen offer only the periods that actually work.
 */
export function planIdFor(period: BillingPeriod): string | null {
  return (period === "yearly" ? env.RAZORPAY_PLAN_ID_YEARLY : env.RAZORPAY_PLAN_ID_MONTHLY) ?? null;
}

export function periodOfPlanId(planId: string | null | undefined): BillingPeriod {
  return planId && planId === env.RAZORPAY_PLAN_ID_YEARLY ? "yearly" : "monthly";
}

function authHeader(): string {
  const token = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * One request to Razorpay.
 *
 * Their errors arrive as `{ error: { description } }`, and that description is
 * genuinely useful ("International payments are not enabled for this account"),
 * so it is surfaced rather than flattened into "payment failed" — that
 * particular message is the difference between a five-minute fix and an
 * afternoon.
 */
async function call<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown
): Promise<T> {
  if (!razorpayEnabled()) {
    throw serviceUnavailable(
      "Payments are not set up on this server yet, so nothing can be purchased.",
      "billing_not_configured"
    );
  }

  let res: Response;
  try {
    res = await fetch(`${env.RAZORPAY_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Razorpay unreachable is not the customer's fault and not a 4xx.
    throw serviceUnavailable("Could not reach the payment provider. Please try again.");
  }

  const text = await res.text();
  const json: unknown = text ? safeParse(text) : {};

  if (!res.ok) {
    const description =
      (json as { error?: { description?: string } })?.error?.description ??
      `Payment provider returned ${res.status}.`;
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

/**
 * Creates a subscription for `websites` sites. The customer authorises it in
 * Checkout; it does not become `active` until they do, which is why nothing
 * here grants access — only the webhook and the verified checkout callback do.
 */
export async function createSubscription(opts: {
  websites: number;
  period: BillingPeriod;
  userId: string;
  email: string;
  name: string;
}): Promise<RazorpaySubscription> {
  const quantity = clampWebsites(opts.websites);
  const planId = planIdFor(opts.period);
  if (!planId) {
    throw serviceUnavailable(
      `${opts.period === "yearly" ? "Yearly" : "Monthly"} billing is not set up on this server.`,
      "billing_not_configured"
    );
  }

  return call<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: planId,
    total_count: TOTAL_COUNT[opts.period],
    quantity,
    customer_notify: 1,
    // Notes come back on every webhook for this subscription, so the account
    // can be found from the event alone — no reverse lookup, and no chance of
    // crediting the wrong account if a customer somehow holds two.
    notes: {
      userId: opts.userId,
      email: opts.email,
      websites: String(quantity),
      period: opts.period,
    },
  });
}

/**
 * Changes how many websites an existing subscription covers.
 *
 * `schedule_change_at: "now"` because somebody adding a website wants to add
 * it now, not next month; Razorpay prorates the difference. Going *down* is
 * refused upstream unless the account has already deleted the websites — see
 * `routes/billing.ts`.
 */
export async function updateSubscriptionQuantity(
  subscriptionId: string,
  websites: number
): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("PATCH", `/subscriptions/${subscriptionId}`, {
    quantity: clampWebsites(websites),
    schedule_change_at: "now",
  });
}

export async function fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("GET", `/subscriptions/${subscriptionId}`);
}

/**
 * Cancels at the end of the paid-for cycle, never immediately: the customer
 * paid for this month and taking their websites away on the day they cancel
 * would be theft of the remainder.
 */
export async function cancelSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("POST", `/subscriptions/${subscriptionId}/cancel`, {
    cancel_at_cycle_end: 1,
  });
}

// ------------------------------------------------------------- signatures

/**
 * Constant-time compare of two hex digests.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself leak, so
 * the lengths are checked first and a mismatch is an ordinary `false`.
 */
function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifies what Razorpay Checkout hands back to the browser after a successful
 * mandate. Signed with the **API key secret** over
 * `payment_id|subscription_id`.
 *
 * This is what lets the dashboard light up immediately instead of waiting for
 * a webhook that may take seconds — but it is a convenience, not the source of
 * truth. The webhook is still what keeps the account correct afterwards.
 */
export function verifyCheckoutSignature(input: {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}): boolean {
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(`${input.razorpay_payment_id}|${input.razorpay_subscription_id}`)
    .digest("hex");
  return safeEqualHex(expected, input.razorpay_signature);
}

/**
 * Verifies a webhook, signed with the **webhook secret** over the raw request
 * body — raw, because re-serialising parsed JSON reorders keys and the digest
 * stops matching. `routes/billing.ts` mounts `express.raw` for this one route.
 *
 * With no secret configured this returns false, so an unconfigured server
 * rejects every webhook rather than trusting anyone who finds the URL.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/**
 * Shouts at boot about a Razorpay setup that *looks* fine but is not.
 *
 * The dangerous configuration is keys and plans without a webhook secret:
 * `billingEnabled` is true, checkout works, the first purchase is granted by
 * the verified signature — and every webhook after that is rejected. Nothing
 * looks wrong until a renewal a month later silently fails to land, or a
 * cancelled customer keeps their websites. That is not a failure anyone finds
 * by testing checkout, so it has to announce itself.
 */
export function warnAboutBillingConfig(): void {
  const say = (lines: string[]) => console.warn("\n" + lines.join("\n") + "\n");

  if (!razorpayEnabled()) {
    say([
      "⚠ Razorpay is not configured, so nobody can buy a website.",
      "  Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and a plan id in .env,",
      "  then run `npm run setup:razorpay` to create the plans.",
      "  (The dashboard explains this to signed-in users rather than showing a dead button.)",
    ]);
    return;
  }

  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    say([
      "⚠ RAZORPAY_WEBHOOK_SECRET is missing. Checkout will work — and then quietly rot.",
      "  Every webhook is REJECTED without it, so renewals, failed charges and",
      "  cancellations will never reach an account. You will not notice until a",
      "  renewal fails to land a month from now.",
      "  Fix: Razorpay dashboard → Webhooks → add https://<your-api>/api/billing/webhook",
      "  for the subscription.* events, and put its secret in .env.",
    ]);
  }

  const live = env.RAZORPAY_KEY_ID?.startsWith("rzp_live");
  if (live && !isProd) {
    say(["⚠ LIVE Razorpay keys outside production. Real cards will be charged."]);
  }
  if (!live && isProd) {
    say(["⚠ TEST Razorpay keys in production. No real payment will ever be taken."]);
  }
  if (!planIdFor("monthly") || !planIdFor("yearly")) {
    say([
      `⚠ Only the ${planIdFor("monthly") ? "monthly" : "yearly"} Razorpay plan is configured.`,
      "  The other billing period will be refused at checkout.",
      "  `npm run setup:razorpay` creates both.",
    ]);
  }
}

/** What a given quantity costs per cycle, in paise — for display only. */
export const cycleAmountPaise = (websites: number, period: BillingPeriod) =>
  clampWebsites(websites) * pricePerWebsitePaise(period);
