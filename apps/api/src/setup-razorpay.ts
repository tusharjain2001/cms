import "dotenv/config";
import {
  PRICE_PER_WEBSITE_MONTHLY_PAISE,
  PRICE_PER_WEBSITE_YEARLY_PAISE,
  formatInr,
} from "@pagecraft/shared";

/**
 * Creates the two Razorpay Plans this CMS bills from, and prints the ids to
 * paste into `.env`.
 *
 * WHY A SCRIPT: the ladder is a subscription **quantity**, not a set of tiers,
 * so there are exactly two plans — "one website, monthly" and "one website,
 * yearly" — no matter how far the ladder goes. Getting their currency and
 * amount right matters more than it looks: a plan's amount cannot be edited
 * after creation, so a plan made at the wrong price has to be replaced, and
 * every subscription already on it keeps the old price forever.
 *
 * It is idempotent by name: run it twice and it reports the plans it already
 * made rather than creating duplicates.
 *
 *   RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=… npm run setup:razorpay
 *
 * Use TEST-mode keys (`rzp_test_…`) first. Test and live are separate
 * universes at Razorpay: plans made with test keys do not exist in live mode,
 * so this has to be run once against each.
 */

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const BASE = process.env.RAZORPAY_API_BASE ?? "https://api.razorpay.com/v1";

/**
 * The plans, keyed by the env var each id belongs in. `name` doubles as the
 * idempotency key — it is what an existing plan is matched on.
 */
const WANTED = [
  {
    envVar: "RAZORPAY_PLAN_ID_MONTHLY",
    name: "Pagecraft — one website (monthly)",
    period: "monthly" as const,
    interval: 1,
    amount: PRICE_PER_WEBSITE_MONTHLY_PAISE,
  },
  {
    envVar: "RAZORPAY_PLAN_ID_YEARLY",
    name: "Pagecraft — one website (yearly)",
    period: "yearly" as const,
    interval: 1,
    amount: PRICE_PER_WEBSITE_YEARLY_PAISE,
  },
];

interface Plan {
  id: string;
  item: { name: string; amount: number; currency: string };
  period: string;
}

function auth(): string {
  return `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64")}`;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const description = json?.error?.description ?? `Razorpay returned ${res.status}.`;
    throw new Error(description);
  }
  return json as T;
}

async function main() {
  if (!KEY_ID || !KEY_SECRET) {
    console.error(
      "\nRAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set (in apps/api/.env or the environment).\n" +
        "Find them in the Razorpay dashboard under Account & Settings → API Keys.\n"
    );
    process.exit(1);
  }

  const live = KEY_ID.startsWith("rzp_live");
  console.log(`\nUsing ${live ? "LIVE" : "TEST"} keys (${KEY_ID.slice(0, 12)}…)\n`);

  const existing = await call<{ items: Plan[] }>("GET", "/plans?count=100");
  const results: { envVar: string; id: string; reused: boolean }[] = [];

  for (const want of WANTED) {
    const match = existing.items?.find((p) => p.item?.name === want.name);
    if (match) {
      // Amounts are immutable at Razorpay, so a mismatch is a real problem the
      // operator has to resolve — silently reusing it would bill the wrong price.
      if (match.item.amount !== want.amount || match.item.currency !== "INR") {
        console.error(
          `  ✗ "${want.name}" already exists (${match.id}) at ${match.item.currency} ` +
            `${match.item.amount}, but this build expects INR ${want.amount}.\n` +
            `    Plan amounts cannot be edited. Rename or ignore that plan and change the\n` +
            `    name in this script, or align the price in packages/shared/src/plans.ts.`
        );
        process.exitCode = 1;
        continue;
      }
      console.log(`  · ${want.name} — already exists (${match.id})`);
      results.push({ envVar: want.envVar, id: match.id, reused: true });
      continue;
    }

    const created = await call<Plan>("POST", "/plans", {
      period: want.period,
      interval: want.interval,
      item: {
        name: want.name,
        // Paise, because Razorpay takes the smallest currency unit — the same
        // reason plans.ts holds prices as integers.
        amount: want.amount,
        currency: "INR",
        description: `One website on Pagecraft. Buy N websites as quantity N of this plan.`,
      },
      notes: { product: "pagecraft", unit: "one-website" },
    });

    console.log(`  ✓ ${want.name} — created (₹${formatInr(want.amount)}) ${created.id}`);
    results.push({ envVar: want.envVar, id: created.id, reused: false });
  }

  if (results.length) {
    console.log("\nPaste these into apps/api/.env:\n");
    for (const r of results) console.log(`${r.envVar}=${r.id}`);
  }

  console.log(
    "\nStill to do by hand in the Razorpay dashboard:\n" +
      "  1. Account & Settings → Webhooks → add\n" +
      "       https://api.<yourdomain>/api/billing/webhook\n" +
      "     subscribed to the subscription.* events, and copy its secret into\n" +
      "     RAZORPAY_WEBHOOK_SECRET.\n" +
      "  2. Confirm the Subscriptions product is active on the account, and\n" +
      "     that UPI AutoPay / e-mandate are enabled — those are what make a\n" +
      "     recurring charge actually renew.\n"
  );
}

main().catch((err) => {
  console.error(`\nCould not set up the plans: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
