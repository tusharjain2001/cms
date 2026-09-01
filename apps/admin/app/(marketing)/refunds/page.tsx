import type { Metadata } from "next";
import { Clause, Fill, Highlight, LegalPage, Points } from "@/components/landing/legal";
import { business, commercials, refunds } from "@/lib/legal";

/**
 * Refunds and cancellation.
 *
 * Required by the payment provider before a website is verified for payments, and the one
 * policy customers actually read. Every figure comes from `lib/legal.ts` and
 * `commercials`, so the page cannot drift from what the product charges.
 *
 * The behaviour described here is what the code genuinely does:
 * `POST /api/billing/cancel` cancels at cycle end (never immediately), losing a
 * subscription drops the account to Free without deleting anything, and a
 * downgrade below the number of websites you own is refused outright. If any of
 * that changes, this page changes with it.
 */

const description =
  "Cancel any time and keep what you have paid for. A full refund on your first payment within seven days, no questions asked.";

export const metadata: Metadata = {
  title: "Refunds and cancellation",
  description,
  openGraph: {
    type: "website",
    siteName: "Pagecraft",
    title: "Refunds and cancellation · Pagecraft",
    description,
  },
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refunds and cancellation"
      intro="Pagecraft is a subscription. You can stop it whenever you like, from inside the dashboard, without emailing anyone or explaining yourself."
    >
      <Highlight>
        <strong className="font-semibold text-ink">
          Changed your mind in the first {refunds.firstPaymentWindowDays} days?
        </strong>{" "}
        Email us and we refund your first payment in full. No conditions, and you do not have to say
        why.
      </Highlight>

      <Clause n={1} title="What you are paying for">
        <p>
          {commercials.pricePerWebsiteMonthly} per website per month, or{" "}
          {commercials.pricePerWebsiteYearly} per website per year, charged in{" "}
          {commercials.currency}. Two websites cost twice that, three cost three times, and so on up
          to {commercials.maxWebsites}.
        </p>
        <p>
          A free plan is available and does not expire: one website holding one page, at no charge
          and with no card. Nothing in this policy applies to it, because nothing has been paid.
          Paid plans begin only when you choose one, which is exactly why the refund window below
          exists.
        </p>
      </Clause>

      <Clause n={2} title="Cancelling">
        <p>
          Open <strong className="font-semibold text-ink">Plan &amp; billing</strong> in the
          dashboard and press <em>Stop renewing</em>. That is the whole process.
        </p>
        <Points
          items={[
            "Your subscription does not renew again.",
            "Nothing changes until the period you have already paid for runs out — you keep every website and every feature until that date.",
            "After that date your websites stay readable and editable. What stops is adding another one.",
            "Your live website keeps serving the pages it last published. It does not go dark because of a billing change.",
          ]}
        />
        <p>
          We cancel at the end of the cycle rather than immediately on purpose. You paid for this
          month; taking it away the moment you cancel would be keeping money for nothing.
        </p>
      </Clause>

      <Clause n={3} title="Refunds">
        <Points
          items={[
            <>
              <strong className="font-semibold text-ink">
                First payment, within {refunds.firstPaymentWindowDays} days:
              </strong>{" "}
              refunded in full on request. This applies to the first payment on an account, whether
              monthly or yearly.
            </>,
            <>
              <strong className="font-semibold text-ink">After that:</strong> we do not refund the
              unused part of a period that has already begun, because cancelling already lets you
              use what you paid for right up to the last day.
            </>,
            <>
              <strong className="font-semibold text-ink">If we broke it:</strong> if a fault on our
              side stopped you using Pagecraft for a meaningful stretch, tell us and we will refund
              or credit that time. You should not pay for something that did not work.
            </>,
            <>
              <strong className="font-semibold text-ink">Charged by mistake:</strong> a duplicate or
              a charge after you cancelled is refunded in full, always. Send us the payment id.
            </>,
          ]}
        />
      </Clause>

      <Clause n={4} title="How to ask for one">
        <p>
          Email{" "}
          <a
            href={`mailto:${business.supportEmail}`}
            className="font-semibold text-accent hover:underline"
          >
            {business.supportEmail}
          </a>{" "}
          from the address on your account, with the payment id from your receipt.
        </p>
        <p>
          We reply within {refunds.responseTime}. An approved refund goes back to the card or
          account you paid from — we cannot send it anywhere else — and Dodo Payments usually settles it
          within {refunds.settlementDays}.
        </p>
      </Clause>

      <Clause n={5} title="Changing how many websites you pay for">
        <Points
          items={[
            <>
              <strong className="font-semibold text-ink">Adding one</strong> takes effect
              immediately. Dodo Payments charges the difference for the rest of the current period, and
              you are not asked for your card again.
            </>,
            <>
              <strong className="font-semibold text-ink">Reducing</strong> is refused while you
              still hold that many websites — we have no honest way to decide which of your sites to
              switch off. Delete the ones you no longer need first, from Website settings, then
              lower the plan.
            </>,
            <>Reductions apply from the next billing date. The current period is not refunded.</>,
          ]}
        />
      </Clause>

      <Clause n={6} title="If a payment fails">
        <p>
          Dodo Payments retries automatically. Nothing happens to your websites while it does — a bounced
          card should not take a live site down. If the retries are exhausted, the subscription
          stops and you can no longer add websites, but everything you have built stays readable and
          editable, and your published pages keep serving.
        </p>
        <p>
          Pay again from Plan &amp; billing and your full allowance comes straight back.
        </p>
      </Clause>

      <Clause n={7} title="Getting your content out">
        <p>
          Your content is yours. You can export everything through the CMS at any time, subscribed
          or not, and we keep it for at least {commercials.contentRetentionDays} days after a
          subscription ends before it may be removed.
        </p>
      </Clause>

      <Clause n={8} title="Questions">
        <p>
          Email{" "}
          <a
            href={`mailto:${business.supportEmail}`}
            className="font-semibold text-accent hover:underline"
          >
            {business.supportEmail}
          </a>{" "}
          or call <Fill value={business.phone} /> during {business.supportHours}. Full details on
          the{" "}
          <a href="/contact" className="font-semibold text-accent hover:underline">
            contact page
          </a>
          .
        </p>
      </Clause>
    </LegalPage>
  );
}
