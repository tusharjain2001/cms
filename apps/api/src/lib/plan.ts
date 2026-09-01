import {
  PRICE_PER_WEBSITE_MONTHLY_CENTS,
  type Plan,
  type QuotaUsageDTO,
  formatMoney,
  isEntitled,
  planFor,
  priceMinor,
  websiteAllowance,
} from "@pagecraft/shared";
import { User, type UserDoc, entitlementOf } from "../models/user.js";
import { Project, type ProjectDoc } from "../models/project.js";
import { Page } from "../models/page.js";
import { Media } from "../models/media.js";
import { bumpApiCall, apiCallsThisMonth } from "../models/usage.js";
import { paymentRequired, subscriptionRequired } from "./respond.js";

/**
 * Plan limits, enforced. This is the "non-payment half" of monetisation: an
 * account has a plan, a plan has quotas, and every place that would grow a
 * tenant checks the relevant quota and returns a friendly 402 when it is hit.
 *
 * **The website ceiling is the one that carries money.** It is not a constant
 * on the plan — it is `websiteAllowance()`, computed from the quantity the
 * customer's Razorpay subscription was bought with. An account with no live
 * subscription is allowed `FREE_WEBSITES` — one, today.
 *
 * **So the wall that sells the product is `assertCanAddPage`, not
 * `assertCanCreateProject`.** The free website is real and permanent; what it
 * cannot do is hold a second page. Anyone changing the free tier should change
 * `PLANS.free.maxPagesPerProject`, and expect that to be the number customers
 * hit.
 *
 * THE PAYMENT BOUNDARY: `lib/razorpay.ts` and `routes/billing.ts` are the only
 * files that know a payment provider exists. They write the account's
 * subscription; everything here only ever reads it.
 */

/** The plan that governs a website — always its OWNER's plan (the owner pays). */
export async function ownerPlanFor(project: ProjectDoc): Promise<Plan> {
  const owner = await User.findById(project.ownerId).select("plan");
  return planFor(owner?.plan);
}

/** Total media bytes stored for one website. */
async function storageBytesUsed(projectId: unknown): Promise<number> {
  const [row] = await Media.aggregate<{ total: number }>([
    { $match: { projectId } },
    { $group: { _id: null, total: { $sum: "$bytes" } } },
  ]);
  return row?.total ?? 0;
}

/** How many websites this account may own, and how many it already has. */
export async function websiteCapacity(
  owner: UserDoc
): Promise<{ allowed: number; used: number }> {
  const used = await Project.countDocuments({ ownerId: owner._id });
  return { allowed: websiteAllowance(entitlementOf(owner)), used };
}

/**
 * Refuses if this account is already at the number of websites it pays for.
 *
 * The two refusals are deliberately different. Somebody who has never
 * subscribed needs to be told the product costs money at all; somebody on one
 * website who wants a second needs the exact price of the next step. A single
 * generic "please upgrade" would fail both of them.
 */
export async function assertCanCreateProject(owner: UserDoc): Promise<void> {
  const { allowed, used } = await websiteCapacity(owner);

  // Only reachable if FREE_WEBSITES is ever set back to 0. Kept because that
  // reversal should not also require writing a refusal message from scratch.
  if (allowed === 0) {
    throw subscriptionRequired(
      `Pagecraft is ${formatMoney(PRICE_PER_WEBSITE_MONTHLY_CENTS)} a month for one website. ` +
        `Choose a plan to add your first one.`
    );
  }

  if (used >= allowed) {
    const next = used + 1;
    const price = `${formatMoney(priceMinor(next, "monthly"))} a month`;

    // The free account is at its ceiling too, but telling somebody their
    // "plan covers 1 website" when they never chose a plan reads as a bug.
    const e = entitlementOf(owner);
    if (e.plan === "free" || !isEntitled(e.status)) {
      throw subscriptionRequired(
        `Your free website is the one you already have. ` +
          `Choose a plan to run ${next} website${next === 1 ? "" : "s"} — ${price}.`
      );
    }

    throw subscriptionRequired(
      `Your plan covers ${allowed} website${allowed === 1 ? "" : "s"} and you already have ${used}. ` +
        `Increase it to ${next} for ${price}.`
    );
  }
}

/**
 * Refuses if this website is already at its page ceiling.
 *
 * **This is the upgrade prompt most customers will actually meet**, because
 * the free website allows exactly one page. So the free case gets its own
 * wording: "your Free plan includes 1 pages" is both ungrammatical and reads
 * like a quota nobody chose, where a free single-page site is the offer.
 */
export async function assertCanAddPage(project: ProjectDoc): Promise<void> {
  const plan = await ownerPlanFor(project);
  const count = await Page.countDocuments({ projectId: project._id });
  if (count < plan.maxPagesPerProject) return;

  if (plan.id === "free") {
    throw paymentRequired(
      `Your free website can have one page. ` +
        `Choose a plan — ${formatMoney(PRICE_PER_WEBSITE_MONTHLY_CENTS)} a month — to add as many as you like.`
    );
  }

  throw paymentRequired(
    `Your ${plan.name} plan includes ${plan.maxPagesPerProject} pages per website. Upgrade to add more.`
  );
}

/**
 * Refuses if storing `addBytes` more would exceed the website's storage quota.
 * Pass 0 to check "already over?" before a presigned upload whose size we do
 * not yet know.
 */
export async function assertStorageAllows(project: ProjectDoc, addBytes: number): Promise<void> {
  const plan = await ownerPlanFor(project);
  const used = await storageBytesUsed(project._id);
  if (used + Math.max(0, addBytes) > plan.maxStorageBytesPerProject) {
    const gb = (plan.maxStorageBytesPerProject / (1024 * 1024 * 1024)).toFixed(1);
    throw paymentRequired(
      `This website has reached its ${gb} GB of storage on the ${plan.name} plan. Delete some files or upgrade.`
    );
  }
}

/**
 * Records one content-API hit and refuses (402) once the month's quota is spent.
 * Returns nothing on success; the count lives in the usage meter.
 */
export async function enforceApiCallQuota(project: ProjectDoc): Promise<void> {
  const plan = await ownerPlanFor(project);
  const count = await bumpApiCall(project._id);
  if (count > plan.maxApiCallsPerMonth) {
    throw paymentRequired(
      `This website has used its ${plan.maxApiCallsPerMonth.toLocaleString()} API calls for the month on the ${plan.name} plan. It resets next month, or upgrade for more.`
    );
  }
}

/** Everything the dashboard needs to draw usage bars for one website. */
export async function computeQuotaUsage(project: ProjectDoc): Promise<QuotaUsageDTO> {
  const plan = await ownerPlanFor(project);
  const [owner, projects, pages, storageBytes, apiCalls] = await Promise.all([
    User.findById(project.ownerId),
    Project.countDocuments({ ownerId: project.ownerId }),
    Page.countDocuments({ projectId: project._id }),
    storageBytesUsed(project._id),
    apiCallsThisMonth(project._id),
  ]);
  return {
    plan: plan.id,
    planName: plan.name,
    // The website ceiling is what was paid for, never a number on the plan.
    projects: { used: projects, limit: owner ? websiteAllowance(entitlementOf(owner)) : 0 },
    pages: { used: pages, limit: plan.maxPagesPerProject },
    storageBytes: { used: storageBytes, limit: plan.maxStorageBytesPerProject },
    apiCallsThisMonth: { used: apiCalls, limit: plan.maxApiCallsPerMonth },
  };
}
