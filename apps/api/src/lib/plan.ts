import { type Plan, type PlanId, type QuotaUsageDTO, planFor } from "@pagecraft/shared";
import { User, type UserDoc, planIdOf } from "../models/user.js";
import { Project, type ProjectDoc } from "../models/project.js";
import { Page } from "../models/page.js";
import { Media } from "../models/media.js";
import { bumpApiCall, apiCallsThisMonth } from "../models/usage.js";
import { paymentRequired } from "./respond.js";

/**
 * Plan limits, enforced. This is the "non-payment half" of monetisation: an
 * account has a plan, a plan has quotas, and every place that would grow a
 * tenant checks the relevant quota and returns a friendly 402 when it is hit.
 *
 * THE PAYMENT BOUNDARY: `setPlan` is the single function a real payment
 * provider (Stripe, Razorpay…) calls from its webhook to move an account
 * between plans. Nothing else in the app needs to know payments exist — wire
 * the webhook to this and the quotas start reflecting what the customer bought.
 */
export async function setPlan(userId: unknown, plan: PlanId): Promise<void> {
  await User.updateOne({ _id: userId }, { $set: { plan } });
}

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

/** Refuses if this account is already at its website ceiling. */
export async function assertCanCreateProject(owner: UserDoc): Promise<void> {
  const plan = planFor(planIdOf(owner));
  const count = await Project.countDocuments({ ownerId: owner._id });
  if (count >= plan.maxProjects) {
    throw paymentRequired(
      `Your ${plan.name} plan includes ${plan.maxProjects} website${plan.maxProjects === 1 ? "" : "s"}. Upgrade to add more.`
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
  const [projects, pages, storageBytes, apiCalls] = await Promise.all([
    Project.countDocuments({ ownerId: project.ownerId }),
    Page.countDocuments({ projectId: project._id }),
    storageBytesUsed(project._id),
    apiCallsThisMonth(project._id),
  ]);
  return {
    plan: plan.id,
    planName: plan.name,
    projects: { used: projects, limit: plan.maxProjects },
    pages: { used: pages, limit: plan.maxPagesPerProject },
    storageBytes: { used: storageBytes, limit: plan.maxStorageBytesPerProject },
    apiCallsThisMonth: { used: apiCalls, limit: plan.maxApiCallsPerMonth },
  };
}
