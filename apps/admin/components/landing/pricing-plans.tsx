"use client";

import Link from "next/link";
import { useState } from "react";
import { links } from "@/lib/links";

/**
 * The price ladder and the monthly/yearly toggle.
 *
 * This is the ONLY interactive element on any public page, which is why it is
 * the only "use client" component in `components/landing`. Keeping the stepper
 * here means the rest of the pricing page — stages, table, FAQ — stays
 * server-rendered (direction.md §5.11).
 *
 * THE MODEL (decided 30 Aug 2026): **you pay per website.** One is ₹999 a
 * month, two is ₹1,998, three is ₹2,997. That is the whole price list. It replaced a
 * two-tier Starter/Business table, and the reasons the old one existed are
 * worth knowing before anyone reinstates it:
 *
 *   - Tiers had to differ on *something*, and with one shared sign-in per
 *     account there were no seats to count and no websites to count either —
 *     which left page counts and storage as the only axes. Those are proxies
 *     for size, and a customer cannot predict them.
 *   - Website count is the one number a customer already knows before they
 *     buy, and the one that actually tracks what the product costs us.
 *
 * So there are no feature tiers here to keep in step: every paid account gets
 * every section type, unlimited edits, preview links and automatic publishing.
 *
 * **THERE IS NO FREE TRIAL.** Signing up and looking around is free; creating a
 * website is a purchase. The API enforces exactly that — a fresh account's
 * website allowance is zero (`websiteAllowance()` in
 * `packages/shared/src/plans.ts`). Do not add "14 days free" back to this page
 * without changing that first, or the button will promise something the
 * product refuses.
 *
 * These numbers MIRROR `packages/shared/src/plans.ts`, which is the source of
 * truth the API bills from. They are duplicated rather than imported because
 * importing that package pulls Zod into the public bundle for validation the
 * browser never does. Change one, change the other.
 */

type Billing = "monthly" | "yearly";

/**
 * ₹999 per website per month; ₹9,990 per year — twelve months for the price
 * of ten. Strictly linear, because Razorpay bills a subscription as plan amount
 * × quantity: a ladder that bent (₹1,999 for two) could not be one plan bought
 * twice, and would force a re-authorised mandate on every change. See
 * `packages/shared/src/plans.ts`.
 */
const PER_WEBSITE: Record<Billing, number> = { monthly: 999, yearly: 9990 };

const MIN_WEBSITES = 1;
const MAX_WEBSITES = 20;

/** The rungs shown as ready-made cards. Beyond three, the stepper does the talking. */
const SHOWCASE = [1, 2, 3];

const INCLUDED = [
  "Every section type your developer has built",
  "Unlimited pages and unlimited edits",
  "10 GB of photos and files per website",
  "Preview links before anything goes live",
  "Your site republishes itself the moment you press Publish",
  "Download everything as a file, whenever you like",
];

/**
 * Rupees with Indian digit grouping: 999 → "999", 1998 → "1,998".
 * `en-IN` matters — rupees group as 1,00,000, and the wrong grouping reads as a
 * foreign site.
 */
const money = (n: number) =>
  n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });

/**
 * A two-option segmented control. The active pill is a coral thumb that springs
 * between the two positions (`--ease-spring`). Both buttons are real
 * <button>s with `aria-pressed`, so the whole thing is keyboard-operable by
 * Tab + Enter/Space; the spring is pure decoration layered on top.
 */
function BillingToggle({
  billing,
  onChange,
}: {
  billing: Billing;
  onChange: (b: Billing) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Billing period"
      className="relative flex w-[300px] max-w-full items-stretch rounded-full border border-line bg-surface p-1"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-accent"
        style={{
          transform: billing === "yearly" ? "translateX(100%)" : "translateX(0)",
          transition: "transform 320ms var(--ease-spring)",
        }}
      />
      {(
        [
          { key: "monthly", label: "Monthly" },
          { key: "yearly", label: "Yearly · 2 mo free" },
        ] as const
      ).map((opt) => {
        const on = billing === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={on}
            className={`relative z-10 flex-1 cursor-pointer rounded-full px-4 py-2 text-label font-semibold transition-colors ${
              on ? "text-white" : "text-quiet hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** One rung of the ladder: N websites at N × the per-website price. */
function RungCard({
  websites,
  billing,
  featured,
}: {
  websites: number;
  billing: Billing;
  featured: boolean;
}) {
  const total = websites * PER_WEBSITE[billing];

  return (
    <div
      className={`relative flex flex-col gap-4.5 rounded-2xl bg-surface p-6 transition-[transform,border-color,box-shadow] duration-150 hover:translate-y-px hover:shadow-[inset_0_1px_0_rgba(34,37,43,0.05)] ${
        featured ? "border-2 border-accent" : "border border-line hover:border-btn-hover"
      }`}
    >
      {featured && (
        <span className="absolute -top-2.75 left-6 rounded-full bg-accent px-2.5 py-0.75 text-tiny font-semibold text-white">
          Where most people start
        </span>
      )}

      <div>
        <h2 className="text-[15px] font-semibold">
          {websites} website{websites === 1 ? "" : "s"}
        </h2>
        <p className="mt-1 text-mid leading-normal text-muted">
          {websites === 1
            ? "One address — a shop, a café, a practice."
            : `${websites} separate sites, one sign-in, one bill.`}
        </p>
      </div>

      <div>
        <p className="flex items-baseline gap-1.5">
          <span className="font-display text-[38px] font-bold leading-none tracking-[-0.02em] tabular-nums">
            ₹{money(billing === "yearly" ? total / 12 : total)}
          </span>
          <span className="text-label text-muted">
            {billing === "yearly" ? "/ month, billed yearly" : "/ month"}
          </span>
        </p>
        <p className="mt-1.5 text-helper text-muted tabular-nums">
          {billing === "yearly"
            ? `₹${money(total)} billed once a year`
            : `or ₹${money(websites * PER_WEBSITE.yearly)} a year`}
        </p>
      </div>

      <Link
        href={links.signUp}
        className={`block rounded-lg py-2.5 text-center text-sub font-semibold transition-colors ${
          featured
            ? "bg-accent text-white hover:bg-accent-dark"
            : "border border-btn bg-surface text-ink hover:border-btn-hover"
        }`}
      >
        Get started
      </Link>
    </div>
  );
}

export function PricingPlans() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [websites, setWebsites] = useState(4);

  const custom = websites * PER_WEBSITE[billing];

  return (
    <>
      <div className="flex justify-center">
        <BillingToggle billing={billing} onChange={setBilling} />
      </div>

      <div className="mx-auto mt-8 grid max-w-[960px] items-start gap-3.5 sm:grid-cols-3">
        {SHOWCASE.map((n) => (
          <RungCard key={n} websites={n} billing={billing} featured={n === 1} />
        ))}
      </div>

      {/* ---------------------------------------------------- more than three */}
      <div className="mx-auto mt-3.5 max-w-[960px] rounded-2xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-[200px]">
            <h3 className="text-[15px] font-semibold">Look after more than three?</h3>
            <p className="mt-1 text-mid leading-normal text-muted">
              It keeps going at ₹{money(PER_WEBSITE[billing])} each. Add and remove websites
              whenever you like.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="One fewer website"
              onClick={() => setWebsites((n) => Math.max(MIN_WEBSITES, n - 1))}
              disabled={websites <= MIN_WEBSITES}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-lg border border-btn text-[18px] leading-none transition-colors hover:border-btn-hover disabled:cursor-default disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[92px] text-center">
              <span
                aria-live="polite"
                className="block font-display text-[28px] font-bold leading-none tabular-nums"
              >
                {websites}
              </span>
              <span className="mt-1 block text-mid text-muted">
                website{websites === 1 ? "" : "s"}
              </span>
            </span>
            <button
              type="button"
              aria-label="One more website"
              onClick={() => setWebsites((n) => Math.min(MAX_WEBSITES, n + 1))}
              disabled={websites >= MAX_WEBSITES}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-lg border border-btn text-[18px] leading-none transition-colors hover:border-btn-hover disabled:cursor-default disabled:opacity-40"
            >
              +
            </button>
          </div>

          <p className="font-display text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums">
            ₹{money(custom)}
            <span className="ml-1.5 font-sans text-label font-normal text-muted">
              {billing === "yearly" ? "/ year" : "/ month"}
            </span>
          </p>

          <Link
            href={links.signUp}
            className="ml-auto rounded-lg bg-accent px-5 py-2.5 text-sub font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            Get started
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------- what every rung has */}
      <div className="mx-auto mt-3.5 max-w-[960px] rounded-2xl border border-line bg-sunken p-6">
        <h3 className="text-[15px] font-semibold">
          Every website includes all of it — there is no cheaper tier that holds things back
        </h3>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {INCLUDED.map((f) => (
            <li key={f} className="flex gap-2.5">
              <span aria-hidden className="shrink-0 text-helper text-published">
                ✓
              </span>
              <span className="text-label leading-normal">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
