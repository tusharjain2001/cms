/**
 * Subscription plans and the per-tenant quotas they carry.
 *
 * This is the *shape* of monetisation, deliberately without any payment
 * provider: an account has a `plan`, a plan has limits, and the API enforces
 * those limits with friendly errors. Wiring a real payment provider later means
 * one thing — calling `setPlan` from its webhook (see the API's `lib/plan.ts`).
 * Nothing else has to change.
 *
 * Numbers are starting points, not gospel — they live in one place so tuning a
 * plan is a one-line edit, never a hunt through the codebase.
 */

export type PlanId = "free" | "pro" | "business";

export interface Plan {
  id: PlanId;
  name: string;
  /** Websites (projects) one account may own. */
  maxProjects: number;
  /** Pages per website. */
  maxPagesPerProject: number;
  /** Total media bytes stored per website. */
  maxStorageBytesPerProject: number;
  /** Content-API requests per website per calendar month. */
  maxApiCallsPerMonth: number;
  /**
   * Display price in the smallest currency unit (paise) per month; 0 = free.
   * Shown on the pricing/plan UI and read by the future payment boundary — it
   * does not itself charge anyone.
   */
  priceMonthlyPaise: number;
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    maxProjects: 1,
    maxPagesPerProject: 10,
    maxStorageBytesPerProject: 500 * MB,
    maxApiCallsPerMonth: 50_000,
    priceMonthlyPaise: 0,
  },
  pro: {
    id: "pro",
    name: "Pro",
    maxProjects: 10,
    maxPagesPerProject: 100,
    maxStorageBytesPerProject: 10 * GB,
    maxApiCallsPerMonth: 1_000_000,
    priceMonthlyPaise: 90_000, // ₹900/mo
  },
  business: {
    id: "business",
    name: "Business",
    maxProjects: 100,
    maxPagesPerProject: 1000,
    maxStorageBytesPerProject: 100 * GB,
    maxApiCallsPerMonth: 20_000_000,
    priceMonthlyPaise: 490_000, // ₹4,900/mo
  },
};

export const DEFAULT_PLAN: PlanId = "free";

export const isPlanId = (v: unknown): v is PlanId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(PLANS, v);

/** The plan for an id, falling back to Free for anything unknown/missing. */
export const planFor = (id: string | null | undefined): Plan => PLANS[isPlanId(id) ? id : DEFAULT_PLAN];
