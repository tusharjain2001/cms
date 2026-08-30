import { api } from "./api";
import type { BillingPeriod, CheckoutDTO, SubscriptionDTO } from "./dto";

/**
 * Billing, from the browser's side.
 *
 * THE MODEL: one price per website per month (see `lib/pricing.ts`). Three
 * websites is quantity 3 of one subscription, not a third plan. There is **no
 * free trial** — a new account may own zero websites until it pays.
 *
 * Everything here is a thin wrapper over the API except `openCheckout`, which
 * owns the one genuinely fiddly bit: Razorpay's Checkout script is a global
 * that has to be injected, waited for, and then handed a callback.
 */

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export const getSubscription = () => api<SubscriptionDTO>("/api/billing");

export interface StartResult {
  /** True when an existing mandate was simply amended — no card needed. */
  updated: boolean;
  subscription?: SubscriptionDTO | null;
  checkout?: CheckoutDTO;
}

/**
 * Buys, or changes, the number of websites this account covers.
 *
 * Returns `updated: true` when the account already had a live mandate and
 * Razorpay just changed its quantity — the customer is never asked for their
 * card again to add a fourth website.
 */
export const startSubscription = (websites: number, period: BillingPeriod) =>
  api<StartResult>("/api/billing/subscription", {
    method: "POST",
    body: { websites, period },
  });

export const cancelSubscription = () =>
  api<SubscriptionDTO>("/api/billing/cancel", { method: "POST" });

/**
 * Paise → a rupee price: 99_900 → "₹999", 199_800 → "₹1,998".
 *
 * `en-IN` grouping matters — rupees group as ₹1,00,000 rather than ₹100,000
 * past five digits, and the wrong grouping reads as a foreign site.
 */
export function inr(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
  })}`;
}

// ------------------------------------------------------------- checkout

interface RazorpayHandlerResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/**
 * Loads Razorpay's Checkout script once and resolves when the global exists.
 *
 * Injected on demand rather than in the layout: it is a third-party script on
 * every page load otherwise, and only the billing screen ever needs it.
 */
function loadCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("checkout-blocked")), {
        once: true,
      });
      return;
    }
    const el = document.createElement("script");
    el.src = CHECKOUT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("checkout-blocked"));
    document.head.appendChild(el);
  });
}

export type CheckoutOutcome =
  | { kind: "paid"; subscription: SubscriptionDTO }
  | { kind: "dismissed" }
  /** The script could not load — an ad blocker, usually. Send them to `url`. */
  | { kind: "blocked"; url: string | null };

/**
 * Opens Razorpay Checkout and settles when the customer has finished.
 *
 * The signature that comes back is posted to the API, which re-checks it with
 * the key secret. That is what lights the dashboard up immediately instead of
 * waiting on a webhook — but the webhook remains the source of truth, so a
 * customer who closes the tab mid-payment still ends up correctly subscribed.
 *
 * A blocked script is reported rather than thrown: Razorpay's own hosted page
 * (`shortUrl`) does the same job, and "your ad blocker ate the payment window"
 * is a fixable problem if we say so.
 */
export async function openCheckout(checkout: CheckoutDTO): Promise<CheckoutOutcome> {
  try {
    await loadCheckout();
  } catch {
    return { kind: "blocked", url: checkout.shortUrl };
  }
  if (!window.Razorpay) return { kind: "blocked", url: checkout.shortUrl };

  return new Promise<CheckoutOutcome>((resolve) => {
    const rzp = new window.Razorpay!({
      key: checkout.keyId,
      subscription_id: checkout.subscriptionId,
      name: "Pagecraft",
      description: `${checkout.websites} website${checkout.websites === 1 ? "" : "s"} · ${
        checkout.period === "yearly" ? "yearly" : "monthly"
      }`,
      prefill: { name: checkout.customerName, email: checkout.customerEmail },
      theme: { color: "#b93f20" },
      handler: (response: RazorpayHandlerResponse) => {
        api<SubscriptionDTO>("/api/billing/verify", { method: "POST", body: response })
          .then((subscription) => resolve({ kind: "paid", subscription }))
          // A verification failure is not a lost payment — the webhook will
          // still settle it — so this reads as "not yet", not as "it failed".
          .catch(() => resolve({ kind: "dismissed" }));
      },
      modal: { ondismiss: () => resolve({ kind: "dismissed" }) },
    });
    rzp.open();
  });
}
