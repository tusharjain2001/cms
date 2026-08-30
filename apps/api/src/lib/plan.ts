import {
  PRICE_PER_WEBSITE_MONTHLY_PAISE,
  type Plan,
  type QuotaUsageDTO,
  formatInr,
  planFor,
  pricePaise,
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
 * subscription is allowed **zero** websites: there is no free trial, so even
 * the first website has to be paid for.
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

  if (allowed === 0) {
    throw subscriptionRequired(
      `Pagecraft is ₹${formatInr(PRICE_PER_WEBSITE_MONTHLY_PAISE)} a month for one website. ` +
        `Choose a plan to add your first one — there is no free trial.`
    );
  }

  if (used >= allowed) {
    const next = used + 1;
    throw subscriptionRequired(
      `Your plan covers ${allowed} website${allowed === 1 ? "" : "s"} and you already have ${used}. ` +
        `Increase it to ${next} for ₹${formatInr(pricePaise(next, "monthly"))} a month.`
    );
  }
}

/** Refuses if this website is already at its page ceiling. */
export async function assertCanAddPage(project: ProjectDoc): Promise<void> {
  const plan = await ownerPlanFor(project);
  const count = await Page.countDocuments({ projectId: project._id });
  if (count >= plan.maxPagesPerProject) {
    throw paymentRequired(
      `Your ${plan.name} plan includes ${plan.maxPagesPerProject} pages per website. Upgrade to add more.`
    );
  }
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
