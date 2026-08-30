import express, { Router } from "express";
import { z } from "zod";
import {
  type BillingPeriod,
  type CheckoutDTO,
  MAX_WEBSITES,
  MIN_WEBSITES,
  PAID_PLAN,
  PRICE_PER_WEBSITE_MONTHLY_PAISE,
  PRICE_PER_WEBSITE_YEARLY_PAISE,
  type SubscriptionDTO,
  type SubscriptionStatus,
  clampWebsites,
  formatInr,
  isEntitled,
  planFor,
  pricePaise,
  websiteAllowance,
} from "@pagecraft/shared";
import { Project } from "../models/project.js";
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
import { badRequest, conflict, ok, unauthorized } from "../lib/respond.js";
import {
  type RazorpaySubscription,
  cancelSubscription,
  createSubscription,
  cycleAmountPaise,
  fetchSubscription,
  periodOfPlanId,
  razorpayEnabled,
  razorpayKeyId,
  updateSubscriptionQuantity,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "../lib/razorpay.js";

/**
 * Billing — the only router that knows a payment provider exists.
 *
 * THE MODEL: ₹999 per website per month, ₹9,990 per website per year. Buying
 * three websites is quantity 3 of one Razorpay plan, not a third price tier.
 * There is **no free trial**: a fresh account's allowance is zero, so the very
 * first website is a purchase.
 *
 * WHAT GRANTS ACCESS, AND WHAT DOES NOT:
 *
 *   - `POST /subscription` creates a Razorpay subscription and grants nothing.
 *     It exists only so Checkout has something to authorise.
 *   - `POST /verify` grants access after checking the signature Checkout hands
 *     the browser. This is a *latency* optimisation — the customer should not
 *     stare at a spinner waiting for a webhook — and it is safe because the
 *     signature is HMAC'd with the API secret, which the browser never sees.
 *   - `POST /webhook` is the source of truth from then on: renewals, failed
 *     charges, cancellations and anything that happens while nobody is looking.
 *
 * Both writers funnel into `applySubscription`, so there is exactly one place
 * where an account's entitlement can change.
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
  const keyId = razorpayKeyId();

  return {
    plan: plan.id,
    planName: plan.name,
    status,
    websites: websiteAllowance(entitlementOf(user)),
    websitesUsed,
    period: billingPeriodOf(user),
    currentPeriodEnd: user.subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: Boolean(user.subscription?.cancelAtPeriodEnd),
    pricePerWebsitePaise: {
      monthly: PRICE_PER_WEBSITE_MONTHLY_PAISE,
      yearly: PRICE_PER_WEBSITE_YEARLY_PAISE,
    },
    currency: "INR",
    minWebsites: MIN_WEBSITES,
    maxWebsites: MAX_WEBSITES,
    billingEnabled: razorpayEnabled(),
    ...(razorpayEnabled() && keyId ? { keyId } : {}),
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
 * `eventAt` is Razorpay's timestamp for the change, not ours. Webhooks are
 * retried for days and arrive out of order, so an update older than the one
 * already applied is dropped — otherwise a re-delivered `cancelled` from last
 * week can land after this morning's `active` and lock a paying customer out
 * of websites they are still paying for.
 */
async function applySubscription(
  userId: unknown,
  sub: RazorpaySubscription,
  eventAt: Date
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;

  const applied = user.subscription?.lastEventAt;
  if (applied && applied.getTime() > eventAt.getTime()) return;

  const status = sub.status as SubscriptionStatus;
  const entitled = isEntitled(status);
  const period = periodOfPlanId(sub.plan_id);

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
        "subscription.razorpaySubscriptionId": sub.id,
        "subscription.razorpayPlanId": sub.plan_id ?? null,
        "subscription.razorpayCustomerId": sub.customer_id ?? null,
        "subscription.currentPeriodEnd": sub.current_end ? new Date(sub.current_end * 1000) : null,
        "subscription.cancelAtPeriodEnd": status === "cancelled" || status === "completed",
        "subscription.lastEventAt": eventAt,
      },
    }
  );
}

// ---------------------------------------------------------------- checkout

/**
 * Starts a purchase, or changes how many websites an existing one covers.
 *
 * Rate limited because each call creates a real object at Razorpay; a loop
 * here would litter the account with hundreds of abandoned subscriptions.
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
      const existingId = user.subscription?.razorpaySubscriptionId ?? null;
      const live = isEntitled(subscriptionStatusOf(user));

      // Going DOWN is refused while the websites still exist. Razorpay would
      // happily take the smaller quantity and we would be left holding more
      // websites than the customer pays for — with no honest way to choose
      // which one to switch off. Delete first, then reduce.
      const owned = await Project.countDocuments({ ownerId: user._id });
      if (websites < owned) {
        throw conflict(
          `You have ${owned} website${owned === 1 ? "" : "s"}, so your plan cannot cover ${websites}. ` +
            `Delete the ones you no longer need first.`
        );
      }

      // An existing, authorised mandate is amended rather than replaced, so
      // adding a website does not ask the customer for their card again.
      if (existingId && live && period === billingPeriodOf(user)) {
        const updated = await updateSubscriptionQuantity(existingId, websites);
        await applySubscription(user._id, updated, new Date());
        const fresh = await User.findById(user._id);
        return ok(res, {
          updated: true,
          subscription: fresh ? await toSubscriptionDTO(fresh) : null,
        });
      }

      const sub = await createSubscription({
        websites,
        period,
        userId: user._id.toString(),
        email: user.email,
        name: user.name,
      });

      // Recorded now, unauthorised, so the webhook can find this account even
      // if the customer closes the tab mid-payment.
      await applySubscription(user._id, sub, new Date());

      const checkout: CheckoutDTO = {
        subscriptionId: sub.id,
        keyId: razorpayKeyId() ?? "",
        websites: clampWebsites(websites),
        period,
        amountPaise: cycleAmountPaise(websites, period),
        currency: "INR",
        shortUrl: sub.short_url ?? null,
        customerEmail: user.email,
        customerName: user.name,
      };
      ok(res, { updated: false, checkout }, 201);
    } catch (err) {
      next(err);
    }
  }
);

const verifySchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/**
 * What the browser posts back the instant Checkout succeeds.
 *
 * The signature is HMAC'd with the API key secret, which never leaves the
 * server, so a forged call cannot buy anything. The subscription is then
 * re-fetched from Razorpay rather than trusted from the request body — the
 * signature proves *who paid*, not *what they bought*.
 */
router.post(
  "/verify",
  requireAuth,
  requireVerified,
  validateBody(verifySchema),
  async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) throw unauthorized();

      const body = req.body as z.infer<typeof verifySchema>;
      if (!verifyCheckoutSignature(body)) {
        throw badRequest("That payment could not be verified. Nothing has been charged twice.");
      }

      // Only the account this subscription was created for may claim it.
      if (
        user.subscription?.razorpaySubscriptionId &&
        user.subscription.razorpaySubscriptionId !== body.razorpay_subscription_id
      ) {
        throw badRequest("That payment belongs to a different subscription.");
      }

      const sub = await fetchSubscription(body.razorpay_subscription_id);
      const owner = sub.notes?.userId;
      if (owner && owner !== user._id.toString()) {
        throw badRequest("That payment belongs to a different account.");
      }

      await applySubscription(user._id, sub, new Date());
      const fresh = await User.findById(user._id);
      ok(res, fresh ? await toSubscriptionDTO(fresh) : null);
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

    const id = user.subscription?.razorpaySubscriptionId;
    if (!id || !isEntitled(subscriptionStatusOf(user))) {
      throw badRequest("There is no active subscription to cancel.");
    }

    const sub = await cancelSubscription(id);
    // Deliberately NOT applySubscription: Razorpay reports a cycle-end cancel
    // as still `active` with a pending cancellation, and treating it as a
    // status change would either revoke access early or lose the flag.
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "subscription.cancelAtPeriodEnd": true,
          "subscription.currentPeriodEnd": sub.current_end
            ? new Date(sub.current_end * 1000)
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
 * Razorpay's callback — the source of truth for everything that happens when
 * the customer is not sitting in front of the dashboard: renewals, failed
 * charges, cancellations, mandates authorised on Razorpay's own hosted page.
 *
 * It lives on its own router, mounted in `app.ts` **above** `express.json`,
 * because the signature is computed over the exact bytes Razorpay sent. Once
 * the JSON parser has read the stream those bytes are gone, and re-serialising
 * the parsed object reorders keys so the digest silently stops matching — a
 * failure that presents as "payments mysteriously never activate".
 *
 * The route is public by necessity, so the signature is the entire door: with
 * no webhook secret configured every request is rejected, never waved through.
 */
export const razorpayWebhookRouter = Router();

razorpayWebhookRouter.post(
  "/",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res, next) => {
    try {
      const signature = req.header("x-razorpay-signature") ?? "";
      const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

      if (!verifyWebhookSignature(raw, signature)) {
        // 400, not 5xx: Razorpay retries on 5xx, and redelivering a request
        // whose signature can never match just makes noise for days.
        return res.status(400).json({ success: false, error: "Invalid signature." });
      }

      const event = JSON.parse(raw.toString("utf8")) as {
        event?: string;
        created_at?: number;
        payload?: { subscription?: { entity?: RazorpaySubscription } };
      };

      const sub = event.payload?.subscription?.entity;
      if (sub?.id) {
        const eventAt = new Date((event.created_at ?? Math.floor(Date.now() / 1000)) * 1000);
        // `notes.userId` was stamped at creation, so the account comes from the
        // event itself — no email lookup, and no way to credit the wrong
        // account if one person holds two.
        const userId =
          sub.notes?.userId ??
          (await User.findOne({ "subscription.razorpaySubscriptionId": sub.id }).select("_id"))
            ?._id;
        if (userId) await applySubscription(userId, sub, eventAt);
      }

      // Always 200 once the signature checks out. A handler slip must not make
      // Razorpay redeliver forever — the next event carries the same state.
      res.json({ success: true, data: { received: true } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * The ladder, for anyone drawing a price. Public so the marketing pricing page
 * could read real numbers rather than a second hard-coded copy of them.
 */
router.get("/plans", (_req, res) => {
  ok(res, {
    currency: "INR",
    minWebsites: MIN_WEBSITES,
    maxWebsites: MAX_WEBSITES,
    pricePerWebsitePaise: {
      monthly: PRICE_PER_WEBSITE_MONTHLY_PAISE,
      yearly: PRICE_PER_WEBSITE_YEARLY_PAISE,
    },
    examples: [1, 2, 3].map((n) => ({
      websites: n,
      monthly: `₹${formatInr(pricePaise(n, "monthly"))}`,
      yearly: `₹${formatInr(pricePaise(n, "yearly"))}`,
    })),
    billingEnabled: razorpayEnabled(),
  });
});

export default router;
