"use client";

import Link from "next/link";
import { useState } from "react";
import { links } from "@/lib/links";

/**
 * The plan cards and the monthly/yearly toggle.
 *
 * This is the ONLY interactive element on any public page, which is why it is
 * the only "use client" component in `components/landing`. Keeping the toggle
 * here means the rest of the pricing page — table, add-ons, FAQ — stays
 * server-rendered.
 *
 * THE MODEL: one account is one website, and the website's owner pays for it.
 * The developer who built the site does not hold the account; the owner shares
 * their sign-in with whoever looks after the site. That decision is what
 * shapes everything below — see the pricing note in CLAUDE.md.
 *
 * Two consequences worth knowing before editing these plans:
 *
 *   1. Plans CANNOT differ by number of editors. With one shared login there
 *      is nobody to count. Until invites exist, seats are not a lever.
 *   2. Plans CANNOT differ by number of websites either, because an account
 *      only ever has one. That leaves how big the site is — pages and media —
 *      as the only honest axes, which is why there are two plans and not five.
 *
 * **The figures are placeholders and none of it is enforced yet**: no billing,
 * no page cap, no media metering, no trial clock.
 */

type Billing = "monthly" | "yearly";

interface Plan {
  name: string;
  blurb: string;
  price: { monthly: number; yearly: number };
  note: { monthly: string; yearly: string };
  featured?: boolean;
  badge?: string;
  /** The headline limit — what actually separates the two plans. */
  headline: string;
  inherits?: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    blurb: "A small site — a shop, a café, a practice.",
    price: { monthly: 9, yearly: 7.5 },
    note: { monthly: "or $90 a year", yearly: "$90 billed once a year" },
    headline: "Up to 10 pages",
    features: [
      "5 GB of photos and files",
      "All nine section types",
      "Unlimited edits and publishing",
      "Preview links before you publish",
      "Email support",
    ],
  },
  {
    name: "Business",
    blurb: "A bigger site with a proper catalogue.",
    price: { monthly: 19, yearly: 16 },
    note: { monthly: "or $190 a year", yearly: "$190 billed once a year" },
    featured: true,
    badge: "Most sites pick this",
    headline: "Unlimited pages",
    inherits: "Starter",
    features: [
      "50 GB of photos and files",
      "Priority email support, one working day",
      "First in line for new section types",
    ],
  },
];

/** $7.50 should read as "7.50", $19 as "19" — never "19.00" or "7.5". */
const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`cursor-pointer rounded-full px-4 py-2 text-label font-semibold transition-colors ${
        on ? "bg-accent text-white" : "bg-transparent text-quiet hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function PlanCard({ plan, billing }: { plan: Plan; billing: Billing }) {
  return (
    <div
      className={`relative flex flex-col gap-4.5 rounded-2xl border bg-surface p-6 ${
        plan.featured
          ? "border-accent shadow-[0_0_0_4px_#eaeff9,0_20px_40px_-30px_rgba(30,35,45,.4)]"
          : "border-line"
      }`}
    >
      {plan.badge && (
        <span className="absolute -top-2.75 left-6 rounded-full bg-accent px-2.5 py-0.75 text-tiny font-semibold text-white">
          {plan.badge}
        </span>
      )}

      <div>
        <h2 className="text-[15px] font-semibold">{plan.name}</h2>
        <p className="mt-1 text-mid leading-normal text-muted">{plan.blurb}</p>
      </div>

      <div>
        <p className="flex items-baseline gap-1.5">
          <span className="text-[34px] font-bold tracking-[-1px] tabular-nums">
            ${money(plan.price[billing])}
          </span>
          <span className="text-label text-muted">
            {billing === "yearly" ? "/ month, billed yearly" : "/ month"}
          </span>
        </p>
        <p className="mt-1 text-helper text-muted">{plan.note[billing]}</p>
      </div>

      <Link
        href={links.signUp}
        className={`block rounded-lg py-2.5 text-center text-sub font-semibold transition-colors ${
          plan.featured
            ? "bg-accent text-white hover:bg-accent-dark"
            : "border border-btn bg-surface text-ink hover:border-btn-hover"
        }`}
      >
        Start 14 days free
      </Link>

      <div className="h-px bg-line-soft" />

      <p className="text-[17px] font-bold tracking-[-.3px] text-accent">{plan.headline}</p>

      <ul className="flex flex-col gap-2.5">
        {plan.inherits && (
          <li className="text-label leading-normal font-semibold">
            Everything in {plan.inherits}, plus:
          </li>
        )}
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <span aria-hidden className="shrink-0 text-helper text-published">
              ✓
            </span>
            <span className="text-label leading-normal">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PricingPlans() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <>
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1.25">
          <Pill on={billing === "monthly"} onClick={() => setBilling("monthly")}>
            Monthly
          </Pill>
          <Pill on={billing === "yearly"} onClick={() => setBilling("yearly")}>
            Yearly · 2 months free
          </Pill>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-[760px] items-start gap-3.5 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <PlanCard key={plan.name} plan={plan} billing={billing} />
        ))}
      </div>
    </>
  );
}
