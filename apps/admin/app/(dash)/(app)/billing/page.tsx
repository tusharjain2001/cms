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
  goToCheckout,
  startSubscription,
  money,
} from "@/lib/billing";
import type { BillingPeriod, PaymentDTO, SubscriptionDTO } from "@/lib/dto";
import { Button, Card, CardTitle, PageHeader } from "@/components/ui";

/**
 * Plan & billing.
 *
 * THE WHOLE SCREEN IS ONE NUMBER: how many websites this account pays for.
 * One website per unit — so the control is a stepper, not a
 * grid of tiers, and the price is arithmetic the customer can check in their
 * head. The free tier is one website of one page — so what a plan sells is
 * not access, it is room, and the copy here says that rather than implying the
 * product is locked.
 *
 * Three states it has to handle honestly:
 *
 *   - **Payments not configured on the server** (no Dodo keys). Say so,
 *     the way the media screen says R2 is missing, rather than showing a
 *     checkout button that dead-ends.
 *   - **Never subscribed.** The account has its one free single-page website.
 *     This screen is the way past that, so `/projects` links straight here
 *     when someone presses "New website" with no room left, and so does the
 *     pages screen when the free website is full.
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

  /**
   * Coming back from Dodo's hosted checkout.
   *
   * **Returning here proves nothing** — `?checkout=done` is a plain redirect
   * anyone can type. Access is granted only when Dodo's webhook reaches the
   * API, which is usually a second or two behind the customer's browser. So
   * this polls for the entitlement to appear rather than trusting the URL, and
   * says something honest while it waits.
   *
   * It gives up after ~20s and tells the customer their payment is still
   * settling instead of claiming it failed — because it almost certainly has
   * not. Webhooks are retried for days, so the account will be right shortly
   * whether or not anyone is looking at this page.
   */
  useEffect(() => {
    if (params.get("checkout") !== "done") return;

    let cancelled = false;
    let attempts = 0;
    setNotice("Payment received — setting up your plan…");

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const data = await getSubscription();
        if (cancelled) return;
        if (data.websites > 0) {
          setSub(data);
          setWant(Math.max(data.websites, data.websitesUsed, 1));
          setPeriod(data.period);
          setNotice(
            `Thank you — your plan covers ${data.websites} website${data.websites === 1 ? "" : "s"}.`
          );
          await refreshUser();
          // Drop the query string so a refresh does not replay all this.
          router.replace("/billing");
          return;
        }
      } catch {
        /* transient — keep waiting, the webhook is the thing that matters */
      }
      if (attempts >= 10) {
        setNotice(
          "Your payment went through and is still being confirmed. This page will be " +
            "correct within a minute — you do not need to pay again."
        );
        router.replace("/billing");
        return;
      }
      setTimeout(() => void tick(), 2000);
    };

    void tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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

  const perWebsite = sub.pricePerWebsiteMinor[period];
  const total = perWebsite * want;
  /**
   * `websites` is what they PAY for, not what they may own — a free account is
   * allowed one website but pays for none, so this is false for them and the
   * button reads "Subscribe" rather than "This is your plan".
   */
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

      if (!result.checkout) throw new Error("The payment page could not be opened.");

      // Dodo hosts the payment page, so this navigates away and nothing below
      // runs. The customer comes back to `?checkout=done`, which is handled by
      // the effect above. `busy` is deliberately left true — the page is on its
      // way out and re-enabling the button would only invite a second click.
      goToCheckout(result.checkout);
      return;
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
        <CardTitle
          sub={
            live
              ? undefined
              : `Your free website can hold one page. A plan lifts that, and adds room for more websites — ${ONE_MONTH} a month each.`
          }
        >
          {live
            ? `Your plan covers ${sub.websites} website${sub.websites === 1 ? "" : "s"}`
            : "You are on the free plan"}
        </CardTitle>

        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-mid text-muted">Websites used</dt>
            <dd className="mt-1 text-[22px] font-bold tabular-nums">
              {sub.websitesUsed}
              <span className="text-label font-normal text-muted"> of {sub.websitesAllowed}</span>
            </dd>
          </div>
          <div>
            <dt className="text-mid text-muted">Billing</dt>
            <dd className="mt-1 text-[22px] font-bold tabular-nums">
              {live ? money(sub.pricePerWebsiteMinor[sub.period] * sub.websites, sub.currency) : "—"}
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
              {money(total, sub.currency)}
              <span className="text-label font-normal text-muted">
                {period === "yearly" ? " / year" : " / month"}
              </span>
            </p>
            <p className="mt-1.5 text-mid text-muted tabular-nums">
              {want} × {money(perWebsite, sub.currency)} per website
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
                ? `Subscribe · ${money(total, sub.currency)}`
                : isChange
                  ? "Update my plan"
                  : "This is your plan"}
          </Button>
        </div>

        {/* Only meaningful once there is a plan to reduce. Shown to a free
            account about to buy its first website, it reads as a refusal. */}
        {live && want <= sub.websitesUsed && sub.websitesUsed > 0 && (
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
          <CardTitle sub="Every charge taken so far. Quote the payment id if you ever need to ask us about one.">
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
                      {/* Each row in its own currency, never today's. */}
                      {money(p.amountMinor, p.currency)}
                      {/* Anything but a clean capture has to say so, or a failed
                          charge reads as a successful one. */}
                      {p.status !== "captured" && (
                        <span className="ml-1.5 text-mid font-normal text-destructive">
                          {p.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 font-mono text-mid text-muted">{p.providerPaymentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-5 text-label text-quiet">
        Payments are handled by Dodo Payments, our merchant of record — we never see your card. Billed in US dollars to{" "}
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
