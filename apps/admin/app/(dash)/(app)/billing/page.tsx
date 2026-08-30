"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ONE_MONTH } from "@/lib/pricing";
import { ApiError } from "@/lib/api";
import {
  cancelSubscription,
  getPayments,
  getSubscription,
  openCheckout,
  startSubscription,
  inrFromPaise,
} from "@/lib/billing";
import type { BillingPeriod, PaymentDTO, SubscriptionDTO } from "@/lib/dto";
import { Button, Card, CardTitle, PageHeader } from "@/components/ui";

/**
 * Plan & billing.
 *
 * THE WHOLE SCREEN IS ONE NUMBER: how many websites this account pays for.
 * One website per unit — so the control is a stepper, not a
 * grid of tiers, and the price is arithmetic the customer can check in their
 * head. There is no free trial and nothing here pretends otherwise.
 *
 * Three states it has to handle honestly:
 *
 *   - **Payments not configured on the server** (no Razorpay keys). Say so,
 *     the way the media screen says R2 is missing, rather than showing a
 *     checkout button that dead-ends.
 *   - **Never subscribed.** The account owns zero websites and cannot create
 *     one; this screen is the way out of that, so `/projects` links straight
 *     here when someone presses "New website".
 *   - **Reducing below what they own.** Refused by the API, because there is no
 *     honest way for us to choose which website to switch off. The stepper
 *     stops at the number they actually have and says why.
 */
export default function BillingPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [sub, setSub] = useState<SubscriptionDTO | null>(null);
  const [payments, setPayments] = useState<PaymentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [want, setWant] = useState(1);

  /**
   * `?want=2` — how `/projects` hands over when someone is one website short.
   * They arrive with the right quantity already chosen instead of having to
   * work out that "I have one, I need two".
   */
  const wanted = Number(params.get("want") ?? "");

  const load = useCallback(async () => {
    try {
      const data = await getSubscription();
      setSub(data);
      setPeriod(data.period);
      setWant(Math.max(data.websites || 0, data.websitesUsed, wanted || 0, 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your plan.");
    } finally {
      setLoading(false);
    }
    // Deliberately after, and deliberately swallowed: a receipt list that fails
    // to load must not stop someone paying or cancelling.
    try {
      setPayments(await getPayments());
    } catch {
      /* history is a convenience, not a blocker */
    }
  }, [wanted]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="max-w-[860px] px-6 py-10 lg:px-11">
        <PageHeader title="Plan &amp; billing" />
        <div className="h-40 animate-pulse rounded-xl border border-line bg-sunken" />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="max-w-[860px] px-6 py-10 lg:px-11">
        <PageHeader title="Plan &amp; billing" />
        <Card>
          <p className="text-label text-quiet">{error ?? "Could not load your plan."}</p>
        </Card>
      </div>
    );
  }

  const perWebsite = sub.pricePerWebsitePaise[period];
  const total = perWebsite * want;
  const live = sub.websites > 0;
  const isChange = live && (want !== sub.websites || period !== sub.period);
  /** Never offer to buy fewer websites than already exist — the API refuses it. */
  const floor = Math.max(sub.minWebsites, sub.websitesUsed);

  async function buy() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await startSubscription(want, period);

      // An existing mandate amended in place: nothing to authorise, the new
      // allowance is live already.
      if (result.updated) {
        if (result.subscription) setSub(result.subscription);
        setNotice(`Your plan now covers ${want} website${want === 1 ? "" : "s"}.`);
        await refreshUser();
        return;
      }

      if (!result.checkout) throw new Error("The payment window could not be opened.");

      const outcome = await openCheckout(result.checkout);
      if (outcome.kind === "paid") {
        setSub(outcome.subscription);
        setNotice(
          `Thank you — your plan covers ${outcome.subscription.websites} website${
            outcome.subscription.websites === 1 ? "" : "s"
          }.`
        );
        await refreshUser();
      } else if (outcome.kind === "blocked") {
        setError(
          outcome.url
            ? "The payment window was blocked, most likely by an ad blocker. Use the secure link below instead."
            : "The payment window was blocked, most likely by an ad blocker."
        );
        if (outcome.url) window.open(outcome.url, "_blank", "noopener");
      } else {
        // Dismissed. Re-read rather than assume — they may have paid on
        // Razorpay's hosted page in another tab.
        await load();
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Something went wrong starting that payment."
      );
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      setSub(await cancelSubscription());
      setNotice("Your subscription will not renew. Nothing changes until the current period ends.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel that subscription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[860px] px-6 py-10 lg:px-11">
      <PageHeader
        title="Plan &amp; billing"
        sub={`One website is ${ONE_MONTH} a month. Every extra website is another ${ONE_MONTH}.`}
      />

      {/* Payments switched off on the server — the same courtesy the media
          screen pays when R2 is missing: say what is wrong, do not pretend. */}
      {!sub.billingEnabled && (
        <Card className="mb-4 border-draft-ink/25 bg-draft-bg">
          <CardTitle sub="Whoever runs this CMS has not connected a payment provider yet, so nothing can be bought from here.">
            Payments are not set up
          </CardTitle>
          <p className="text-label text-quiet">
            Ask them to set <code className="font-mono">RAZORPAY_KEY_ID</code>,{" "}
            <code className="font-mono">RAZORPAY_KEY_SECRET</code> and a plan id in the API&rsquo;s{" "}
            <code className="font-mono">.env</code>.
          </p>
        </Card>
      )}

      {notice && (
        <div className="mb-4 rounded-xl border border-published-line bg-published-bg px-4 py-3 text-label">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-destructive-line bg-destructive-soft px-4 py-3 text-label">
          {error}
        </div>
      )}

      {/* ------------------------------------------------------- what you have */}
      <Card className="mb-4">
        <CardTitle sub={live ? undefined : "There is no free trial — the first website is a purchase."}>
          {live
            ? `Your plan covers ${sub.websites} website${sub.websites === 1 ? "" : "s"}`
            : "You have no plan yet"}
        </CardTitle>

        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-mid text-muted">Websites used</dt>
            <dd className="mt-1 text-[22px] font-bold tabular-nums">
              {sub.websitesUsed}
              <span className="text-label font-normal text-muted"> of {sub.websites}</span>
            </dd>
          </div>
          <div>
            <dt className="text-mid text-muted">Billing</dt>
            <dd className="mt-1 text-[22px] font-bold tabular-nums">
              {live ? inrFromPaise(sub.pricePerWebsitePaise[sub.period] * sub.websites) : "—"}
              {live && (
                <span className="text-label font-normal text-muted">
                  {sub.period === "yearly" ? " / year" : " / month"}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-mid text-muted">
              {sub.cancelAtPeriodEnd ? "Access ends" : "Renews"}
            </dt>
            <dd className="mt-1 text-[22px] font-bold tabular-nums">
              {sub.currentPeriodEnd
                ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </dd>
          </div>
        </dl>

        {sub.cancelAtPeriodEnd && (
          <p className="mt-4 text-label text-quiet">
            This subscription will not renew. Your websites keep working until the date above, and
            the content stays readable afterwards — you simply cannot add another website.
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------- choose a size */}
      <Card>
        <CardTitle sub="Change this whenever you like. Adding a website takes effect immediately and is prorated.">
          {live ? "Change how many websites you pay for" : "Choose how many websites you need"}
        </CardTitle>

        {/* monthly / yearly */}
        <div
          role="group"
          aria-label="Billing period"
          className="mb-6 inline-flex rounded-full border border-line bg-sunken p-1"
        >
          {(["monthly", "yearly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-label font-semibold transition-colors ${
                period === p ? "bg-accent text-white" : "text-quiet hover:text-ink"
              }`}
            >
              {p === "monthly" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Button
              aria-label="One fewer website"
              disabled={want <= floor || busy}
              onClick={() => setWant((n) => Math.max(floor, n - 1))}
              className="h-10 w-10 rounded-lg border border-btn text-[18px] leading-none"
            >
              −
            </Button>
            <span className="min-w-[104px] text-center">
              <span className="block text-[30px] font-bold leading-none tabular-nums">{want}</span>
              <span className="mt-1 block text-mid text-muted">
                website{want === 1 ? "" : "s"}
              </span>
            </span>
            <Button
              aria-label="One more website"
              disabled={want >= sub.maxWebsites || busy}
              onClick={() => setWant((n) => Math.min(sub.maxWebsites, n + 1))}
              className="h-10 w-10 rounded-lg border border-btn text-[18px] leading-none"
            >
              +
            </Button>
          </div>

          <div>
            <p className="text-[30px] font-bold leading-none tabular-nums">
              {inrFromPaise(total)}
              <span className="text-label font-normal text-muted">
                {period === "yearly" ? " / year" : " / month"}
              </span>
            </p>
            <p className="mt-1.5 text-mid text-muted tabular-nums">
              {want} × {inrFromPaise(perWebsite)} per website
            </p>
          </div>

          <Button
            variant="primary"
            className="ml-auto rounded-lg px-5 py-2.5 text-sub font-semibold"
            disabled={busy || !sub.billingEnabled || (live && !isChange)}
            onClick={() => void buy()}
          >
            {busy
              ? "Working…"
              : !live
                ? `Subscribe · ${inrFromPaise(total)}`
                : isChange
                  ? "Update my plan"
                  : "This is your plan"}
          </Button>
        </div>

        {want <= sub.websitesUsed && sub.websitesUsed > 0 && (
          <p className="mt-5 text-label text-quiet">
            You have {sub.websitesUsed} website{sub.websitesUsed === 1 ? "" : "s"}, so your plan
            cannot cover fewer. Delete one first if you want to pay for less.
          </p>
        )}

        {live && !sub.cancelAtPeriodEnd && (
          <p className="mt-5 border-t border-line-soft pt-5 text-label text-quiet">
            Finished with Pagecraft?{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => void stop()}
              className="cursor-pointer font-semibold text-destructive hover:underline disabled:opacity-50"
            >
              Stop renewing
            </button>
            . Your websites keep working until the period you have paid for ends.
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------ history */}
      {payments.length > 0 && (
        <Card className="mt-4">
          <CardTitle sub="Every charge Razorpay has taken. Quote the payment id if you ever need to ask us about one.">
            Payments
          </CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="pb-2.5 text-label font-semibold">
                    Date
                  </th>
                  <th scope="col" className="pb-2.5 text-label font-semibold">
                    For
                  </th>
                  <th scope="col" className="pb-2.5 text-label font-semibold">
                    Amount
                  </th>
                  <th scope="col" className="pb-2.5 text-label font-semibold">
                    Payment id
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-line-soft last:border-b-0">
                    <td className="py-3 text-label text-quiet tabular-nums">
                      {new Date(p.paidAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 text-label text-quiet">
                      {p.websites
                        ? `${p.websites} website${p.websites === 1 ? "" : "s"}`
                        : "Subscription"}
                      {p.period ? ` · ${p.period}` : ""}
                    </td>
                    <td className="py-3 text-label font-medium text-ink tabular-nums">
                      {inrFromPaise(p.amountPaise)}
                      {/* Anything but a clean capture has to say so, or a failed
                          charge reads as a successful one. */}
                      {p.status !== "captured" && (
                        <span className="ml-1.5 text-mid font-normal text-destructive">
                          {p.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 font-mono text-mid text-muted">{p.razorpayPaymentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-5 text-label text-quiet">
        Payments are handled by Razorpay — we never see your card. Billed in rupees to{" "}
        <span className="font-medium text-ink">{user?.email}</span>.{" "}
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="cursor-pointer font-semibold text-accent hover:underline"
        >
          Back to your websites
        </button>
      </p>
    </div>
  );
}
