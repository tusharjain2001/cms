import express, { Router } from "express";
import { z } from "zod";
import {
  type BillingPeriod,
  type CheckoutDTO,
  MAX_WEBSITES,
  MIN_WEBSITES,
  PAID_PLAN,
  PRICE_PER_WEBSITE_MONTHLY_CENTS,
  PRICE_PER_WEBSITE_YEARLY_CENTS,
  type SubscriptionDTO,
  CURRENCY,
  clampWebsites,
  formatMoney,
  isEntitled,
  paidWebsites,
  planFor,
  priceMinor,
  websiteAllowance,
} from "@pagecraft/shared";
import { env } from "../config/env.js";
import { Project } from "../models/project.js";
import { Payment, recordPayment, toPaymentDTO } from "../models/payment.js";
import {
  User,
  type UserDoc,
  billingPeriodOf,
  entitlementOf,
  planIdOf,
  subscriptionStatusOf,
} from "../models/user.js";
import { requireAuth, requireVerified } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { badRequest, conflict, ok, serviceUnavailable, unauthorized } from "../lib/respond.js";
import {
  type DodoPaymentEntity,
  type DodoSubscription,
  cancelSubscription,
  changeSubscriptionQuantity,
  checkProductPrice,
  createCheckoutSession,
  cycleAmountMinor,
  dodoEnabled,
  fetchSubscription,
  mapStatus,
  periodOfProductId,
  verifyWebhookSignature,
} from "../lib/dodo.js";

/**
 * Billing — the only router that knows a payment provider exists.
 *
 * THE MODEL: $7.99 per website per month, $79.90 per website per year. Buying
 * three websites is quantity 3 of one Dodo product, not a third price tier.
 * A fresh account's allowance is `FREE_WEBSITES` — one website, capped at a
 * single page. What a plan sells is room: more pages, and more websites.
 *
 * WHAT GRANTS ACCESS, AND WHAT DOES NOT:
 *
 *   - `POST /subscription` opens a hosted checkout and grants **nothing**.
 *   - `POST /webhook` is the **only** thing that grants access — renewals,
 *     failed charges, cancellations, and the first purchase alike.
 *
 * That is a real change from the Razorpay arrangement this replaced, which also
 * had a `POST /verify` route granting access from a signature handed to the
 * browser. Dodo hosts the payment page, so no such signature exists: the
 * customer leaves the site entirely and comes back to a return URL that proves
 * nothing. One source of truth is simpler and safer, but it has a consequence
 * the dashboard must handle — for a second or two after paying, the customer is
 * back on the billing screen and still not entitled. Do not "fix" that by
 * trusting the return URL; it is a plain redirect anyone can visit.
 *
 * `applySubscription` remains the one place an entitlement can change.
 */

const router = Router();

const periodSchema = z.enum(["monthly", "yearly"]);

const subscribeSchema = z.object({
  websites: z.number().int().min(MIN_WEBSITES).max(MAX_WEBSITES),
  period: periodSchema,
});

// ----------------------------------------------------------------- reading

async function toSubscriptionDTO(user: UserDoc): Promise<SubscriptionDTO> {
  const status = subscriptionStatusOf(user);
  const plan = planFor(planIdOf(user));
  const websitesUsed = await Project.countDocuments({ ownerId: user._id });

  return {
    plan: plan.id,
    planName: plan.name,
    status,
    // Two different numbers on purpose: what they pay for, and what they may
    // own. They only coincide on a paid account.
    websites: paidWebsites(entitlementOf(user)),
    websitesAllowed: websiteAllowance(entitlementOf(user)),
    websitesUsed,
    period: billingPeriodOf(user),
    currentPeriodEnd: user.subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: Boolean(user.subscription?.cancelAtPeriodEnd),
    pricePerWebsiteMinor: {
      monthly: PRICE_PER_WEBSITE_MONTHLY_CENTS,
      yearly: PRICE_PER_WEBSITE_YEARLY_CENTS,
    },
    currency: CURRENCY,
    minWebsites: MIN_WEBSITES,
    maxWebsites: MAX_WEBSITES,
    billingEnabled: dodoEnabled(),
  };
}

/** The account's subscription and the ladder it is priced on. */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized();
    ok(res, await toSubscriptionDTO(req.user));
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------ the writer

/**
 * The **only** function that changes what an account is entitled to.
 *
 * `eventAt` is the provider's timestamp for the change, not ours. Webhooks are
 * retried for days and arrive out of order, so an update older than the one
 * already applied is dropped — otherwise a re-delivered `cancelled` from last
 * week can land after this morning's `active` and lock a paying customer out of
 * websites they are still paying for.
 */
async function applySubscription(
  userId: unknown,
  sub: DodoSubscription,
  eventAt: Date
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;

  const applied = user.subscription?.lastEventAt;
  if (applied && applied.getTime() > eventAt.getTime()) return;

  const status = mapStatus(sub.status);
  const entitled = isEntitled(status);
  const period = periodOfProductId(sub.product_id);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        // Losing entitlement drops the account to Free rather than deleting
        // anything: their websites stay readable and editable, they simply
        // cannot create another one. Nobody's live site goes dark over a card.
        plan: entitled ? PAID_PLAN : "free",
        "subscription.status": status,
        "subscription.websites": clampWebsites(sub.quantity ?? 1),
        "subscription.period": period,
        "subscription.providerSubscriptionId": sub.subscription_id,
        "subscription.providerProductId": sub.product_id ?? null,
        "subscription.providerCustomerId": sub.customer?.customer_id ?? null,
        "subscription.currentPeriodEnd": sub.next_billing_date
          ? new Date(sub.next_billing_date)
          : null,
        // Dodo reports a scheduled cancellation as a flag on a still-active
        // subscription, so the flag is read directly rather than inferred from
        // the status — inferring it would either revoke access early or lose it.
        "subscription.cancelAtPeriodEnd": Boolean(sub.cancel_at_next_billing_date),
        "subscription.lastEventAt": eventAt,
      },
    }
  );
}

/** Where Dodo sends the customer back to after a hosted checkout. */
const returnUrl = () => `${env.APP_URL.replace(/\/+$/, "")}/billing?checkout=done`;

// ---------------------------------------------------------------- checkout

/**
 * Starts a purchase, or changes how many websites an existing one covers.
 *
 * Rate limited because each call creates a real object at Dodo; a loop here
 * would litter the account with hundreds of abandoned checkout sessions.
 */
router.post(
  "/subscription",
  requireAuth,
  requireVerified,
  rateLimit({
    max: 10,
    windowMs: 60 * 60 * 1000,
    message: "Too many checkout attempts. Please wait a few minutes.",
  }),
  validateBody(subscribeSchema),
  async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) throw unauthorized();

      const { websites, period } = req.body as { websites: number; period: BillingPeriod };
      const existingId = user.subscription?.providerSubscriptionId ?? null;
      const live = isEntitled(subscriptionStatusOf(user));

      // **Never sell at a price we did not quote.** The customer is charged the
      // Dodo product's price, not ours, so a product that no longer matches
      // `plans.ts` means the dashboard is advertising one price and Dodo is
      // about to take another. Refuse rather than take the money: an
      // over-charge is far more expensive to undo than a failed checkout.
      const priced = await checkProductPrice(period);
      if (!priced.ok) {
        throw serviceUnavailable(
          "Checkout is unavailable while our payment plans are being updated. " +
            "Nothing has been charged — please try again shortly.",
          "billing_not_configured"
        );
      }

      // Going DOWN is refused while the websites still exist. The provider
      // would happily take the smaller quantity and we would be left holding
      // more websites than the customer pays for — with no honest way to choose
      // which one to switch off. Delete first, then reduce.
      const owned = await Project.countDocuments({ ownerId: user._id });
      if (websites < owned) {
        throw conflict(
          `You have ${owned} website${owned === 1 ? "" : "s"}, so your plan cannot cover ${websites}. ` +
            `Delete the ones you no longer need first.`
        );
      }

      // An existing, authorised subscription is amended rather than replaced,
      // so adding a website does not send the customer back through checkout.
      if (existingId && live && period === billingPeriodOf(user)) {
        await changeSubscriptionQuantity(existingId, period, websites);
        // Dodo answers a plan change with an empty body, so the truth is
        // re-read rather than guessed at from what we asked for.
        const updated = await fetchSubscription(existingId);
        await applySubscription(user._id, updated, new Date());
        const fresh = await User.findById(user._id);
        return ok(res, {
          updated: true,
          subscription: fresh ? await toSubscriptionDTO(fresh) : null,
        });
      }

      const session = await createCheckoutSession({
        websites,
        period,
        userId: user._id.toString(),
        email: user.email,
        name: user.name,
        returnUrl: returnUrl(),
      });

      const checkout: CheckoutDTO = {
        sessionId: session.session_id,
        checkoutUrl: session.checkout_url,
        websites: clampWebsites(websites),
        period,
        amountMinor: cycleAmountMinor(websites, period),
        currency: CURRENCY,
      };
      ok(res, { updated: false, checkout }, 201);
    } catch (err) {
      next(err);
    }
  }
);

/** Stops the renewal. Access lasts until the cycle already paid for ends. */
router.post("/cancel", requireAuth, requireVerified, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw unauthorized();

    const id = user.subscription?.providerSubscriptionId;
    if (!id || !isEntitled(subscriptionStatusOf(user))) {
      throw badRequest("There is no active subscription to cancel.");
    }

    const sub = await cancelSubscription(id);
    // Deliberately NOT applySubscription: a cycle-end cancel leaves the
    // subscription `active` with a pending cancellation, and treating that as a
    // status change would either revoke access early or lose the flag.
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "subscription.cancelAtPeriodEnd": true,
          "subscription.currentPeriodEnd": sub.next_billing_date
            ? new Date(sub.next_billing_date)
            : (user.subscription?.currentPeriodEnd ?? null),
        },
      }
    );

    const fresh = await User.findById(user._id);
    ok(res, fresh ? await toSubscriptionDTO(fresh) : null);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------- webhook

/**
 * Dodo's callback — and, with a hosted checkout, the **only** thing that grants
 * access. Renewals, failed charges, cancellations and first purchases all
 * arrive here.
 *
 * It lives on its own router, mounted in `app.ts` **above** `express.json`,
 * because the signature is computed over the exact bytes Dodo sent. Once the
 * JSON parser has read the stream those bytes are gone, and re-serialising the
 * parsed object reorders keys so the digest silently stops matching — a failure
 * that presents as "payments mysteriously never activate".
 *
 * The route is public by necessity, so the signature is the entire door: with
 * no webhook secret configured every request is rejected, never waved through.
 */
export const dodoWebhookRouter = Router();

/** The shape Dodo wraps every event in. `data` is the entity that changed. */
interface DodoWebhookEvent {
  type?: string;
  timestamp?: string;
  data?: Partial<DodoSubscription> &
    Partial<DodoPaymentEntity> & {
      payload_type?: string;
      metadata?: Record<string, string> | null;
    };
}

/**
 * Which account an event belongs to, in order of trustworthiness.
 *
 * **This matters more here than it did under Razorpay.** There, the
 * subscription was created by our own API call, so its id could be written to
 * the account *before* any webhook arrived and every event had something to
 * match on. Dodo's hosted checkout returns only a session id — the
 * subscription does not exist until the customer pays — so for a first
 * purchase there is nothing on the account yet, and the event has to identify
 * itself.
 *
 *   1. `metadata.userId`, stamped on the checkout session and carried through
 *      to the subscription. Exact, and immune to a customer holding two
 *      accounts.
 *   2. The subscription id, once we have seen it once. This is what renewals
 *      and cancellations months later match on.
 *   3. The customer's email address — a **last resort**, and only reached when
 *      a first purchase arrives with no metadata. Safe because emails are
 *      unique in this schema and the address is the one we handed Dodo at
 *      checkout, but it is last for a reason: it trusts a field we did not
 *      stamp ourselves.
 */
async function accountFor(
  metadataUserId: string | undefined,
  subscriptionId: string | undefined,
  email: string | undefined
): Promise<unknown | null> {
  if (metadataUserId) return metadataUserId;

  if (subscriptionId) {
    const bySub = await User.findOne({
      "subscription.providerSubscriptionId": subscriptionId,
    }).select("_id");
    if (bySub) return bySub._id;
  }

  if (email) {
    const byEmail = await User.findOne({ email: email.toLowerCase() }).select("_id");
    if (byEmail) return byEmail._id;
  }

  return null;
}

dodoWebhookRouter.post("/", express.raw({ type: "*/*", limit: "1mb" }), async (req, res, next) => {
  try {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

    if (
      !verifyWebhookSignature(raw, {
        id: req.header("webhook-id"),
        timestamp: req.header("webhook-timestamp"),
        signature: req.header("webhook-signature"),
      })
    ) {
      // 400, not 5xx: Dodo retries on 5xx, and redelivering a request whose
      // signature can never match just makes noise for days.
      return res.status(400).json({ success: false, error: "Invalid signature." });
    }

    const event = JSON.parse(raw.toString("utf8")) as DodoWebhookEvent;
    const data = event.data ?? {};
    const eventAt = event.timestamp ? new Date(event.timestamp) : new Date();
    const type = event.type ?? "";

    if (type.startsWith("subscription.") && data.subscription_id) {
      const userId = await accountFor(
        data.metadata?.userId,
        data.subscription_id,
        data.customer?.email
      );
      if (userId) {
        await applySubscription(userId, data as DodoSubscription, eventAt);
      }
    } else if (type.startsWith("payment.") && data.payment_id) {
      /**
       * Record the money, not just the state.
       *
       * The amount comes from Dodo rather than from our own price list on
       * purpose: what was charged is a fact, and recomputing it from today's
       * prices is how a repricing quietly rewrites history. `settlement_amount`
       * is deliberately ignored — a customer's bill is what they were charged,
       * not what reached us after the provider's fee.
       */
      const subscriptionId = data.subscription_id ?? undefined;
      const userId = await accountFor(
        data.metadata?.userId,
        subscriptionId,
        data.customer?.email
      );
      if (userId) {
        const owner = await User.findById(userId).select("subscription");
        await recordPayment({
          userId,
          providerPaymentId: data.payment_id,
          providerSubscriptionId: subscriptionId ?? null,
          amountMinor: data.total_amount ?? 0,
          // Dodo's own currency for this charge, never ours: a history that
          // spans a currency change must keep each row in the one it was taken.
          currency: data.currency ?? CURRENCY,
          status: data.status ?? "succeeded",
          method: data.payment_method ?? null,
          websites: owner?.subscription?.websites ?? null,
          period: owner?.subscription?.period ?? null,
          paidAt: data.created_at ? new Date(data.created_at) : eventAt,
        });
      }
    }

    // Always 200 once the signature checks out — including for the dozens of
    // event types this handler ignores. A handler slip, or an event nobody
    // deliberately subscribed to, must not make Dodo redeliver for days.
    res.json({ success: true, data: { received: true } });
  } catch (err) {
    next(err);
  }
});

/**
 * This account's billing history — what the customer sees instead of emailing
 * to ask when they were charged.
 *
 * Capped at 100 rows: a monthly subscription takes eight years to reach that,
 * and an unbounded list is a slow query waiting to happen.
 */
router.get("/payments", requireAuth, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) throw unauthorized();
    const rows = await Payment.find({ userId: user._id }).sort({ paidAt: -1 }).limit(100);
    ok(res, rows.map(toPaymentDTO));
  } catch (err) {
    next(err);
  }
});

/**
 * The ladder, for anyone drawing a price. Public so the marketing pricing page
 * could read real numbers rather than a second hard-coded copy of them.
 */
router.get("/plans", (_req, res) => {
  ok(res, {
    currency: CURRENCY,
    minWebsites: MIN_WEBSITES,
    maxWebsites: MAX_WEBSITES,
    pricePerWebsiteMinor: {
      monthly: PRICE_PER_WEBSITE_MONTHLY_CENTS,
      yearly: PRICE_PER_WEBSITE_YEARLY_CENTS,
    },
    examples: [1, 2, 3].map((n) => ({
      websites: n,
      monthly: formatMoney(priceMinor(n, "monthly")),
      yearly: formatMoney(priceMinor(n, "yearly")),
    })),
    billingEnabled: dodoEnabled(),
  });
});

export default router;
