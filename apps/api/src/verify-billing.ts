import "dotenv/config";
import { CURRENCY, formatMoney, pricePerWebsiteMinor } from "@pagecraft/shared";
import { checkProductPrice, dodoEnabled, productIdFor } from "./lib/dodo.js";

/**
 * `npm run verify:billing` — asks Dodo whether the products in `.env` charge
 * what this build advertises, and says so in plain English.
 *
 * WHY THIS EXISTS: it replaces `setup:razorpay`, which *created* Razorpay plans
 * because plan amounts there were immutable and had to be right at birth. Dodo
 * products are made in its dashboard by hand, so there is nothing to create —
 * but there is still everything to get wrong, and the failure mode is the
 * expensive one: the dashboard advertises $7.99 and the customer is charged
 * something else.
 *
 * That has already happened twice on the previous provider (a ₹1 test price
 * charging ₹999, and a $7.99 page charging ₹999 after the move to USD), which
 * is why the same check also runs at boot and again before every checkout.
 * This script is just the version you can run on demand after pasting a new
 * product id, rather than discovering the mismatch from a customer.
 */
async function main(): Promise<void> {
  if (!dodoEnabled()) {
    console.error(
      "\n✗ Dodo Payments is not configured.\n" +
        "  Set DODO_API_KEY and at least one product id in apps/api/.env.\n"
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nChecking Dodo products against this build (${CURRENCY}):\n`);

  let bad = false;
  for (const period of ["monthly", "yearly"] as const) {
    const id = productIdFor(period);
    const want = formatMoney(pricePerWebsiteMinor(period));

    if (!id) {
      console.log(`  · ${period.padEnd(7)} — not configured. That period is refused at checkout.`);
      continue;
    }

    try {
      const verdict = await checkProductPrice(period);
      if (verdict.ok) {
        console.log(`  ✓ ${period.padEnd(7)} — ${id} charges ${want} per website. Correct.`);
      } else {
        console.error(`  ✗ ${period.padEnd(7)} — ${verdict.reason}`);
        bad = true;
      }
    } catch (err) {
      // Dodo's own wording is the whole diagnosis, so it is surfaced verbatim
      // rather than flattened — the same reason `lib/dodo.ts` does it.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${period.padEnd(7)} — could not read ${id}: ${message}`);
      bad = true;
    }
  }

  if (bad) {
    console.error(
      "\nCheckout is refused for any period above that failed, so nobody can be\n" +
        "charged the wrong amount. Fix the product in the Dodo dashboard, or\n" +
        "align packages/shared/src/plans.ts with it.\n"
    );
    process.exitCode = 1;
  } else {
    console.log("\nAll configured products match the advertised price.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
