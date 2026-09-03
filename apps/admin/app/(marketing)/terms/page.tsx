import type { Metadata } from "next";
import { pageMeta } from "@/lib/site-meta";
import { Clause, Fill, Highlight, LegalPage, Points } from "@/components/landing/legal";
import { business, commercials, isFilled } from "@/lib/legal";

/**
 * Terms and conditions.
 *
 * Required by the payment provider before a website is verified for payments. Written to
 * describe what this product actually does — the shared sign-in, the
 * per-website ladder, the absence of a trial, what happens when a subscription
 * lapses — rather than the generic SaaS terms that would contradict all four.
 *
 * The commercial numbers come from `lib/legal.ts` so they cannot drift from
 * the pricing page or from what the API bills.
 */

const description =
  "The agreement between you and mypagecraft: what we provide, what you pay, who owns what, and how either of us can end it.";

export const metadata: Metadata = pageMeta({
  title: "Terms and conditions",
  description,
  path: "/terms",
  card: "legal",
});

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and conditions"
      intro="The agreement between you and us. We have tried to write it in the same plain English as the rest of the site, because terms nobody can read protect nobody."
    >
      <Highlight>
        In short: you pay {commercials.pricePerWebsiteMonthly} a month for each website, your
        content stays yours, we keep the service running honestly, and either of us can walk away at
        the end of a billing period.
      </Highlight>

      <Clause n={1} title="Who this agreement is with">
        <p>
          These terms are between you and the{" "}
          <strong className="font-semibold text-ink">
            <Fill value={business.legalName} />
          </strong>{" "}
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;), who operate {business.tradingName}. How to reach
          us is on the{" "}
          <a href="/contact" className="font-semibold text-accent hover:underline">
            contact page
          </a>
          .
        </p>
        <p>
          By creating an account or paying for a subscription, you accept these terms. If you are
          agreeing on behalf of a company, you confirm you are allowed to bind it.
        </p>
      </Clause>

      <Clause n={2} title="What mypagecraft is">
        <p>
          mypagecraft is a content management system. You or your developer build a website in your
          own code; mypagecraft stores the words and images that go into it and serves them to that
          website over an API. When you press Publish, we notify your website so it can rebuild
          itself.
        </p>
        <p>
          We do not host your website, register your domain, or design anything. Those stay with you
          and whoever builds your site.
        </p>
      </Clause>

      <Clause n={3} title="Your account">
        <Points
          items={[
            "You must give a real email address and confirm it before you can sign in.",
            "Keep your password to yourself, and pick one you do not use elsewhere.",
            <>
              <strong className="font-semibold text-ink">
                mypagecraft accounts are commonly shared
              </strong>{" "}
              between an owner and their developer. Anyone holding your sign-in can see and change
              everything on your websites, so share it only with people you trust. Everything done
              with your sign-in is treated as done by you.
            </>,
            "Changing your password signs out every device, including your developer's. That is deliberate.",
            "Tell us straight away if you think someone else has got in.",
          ]}
        />
      </Clause>

      <Clause n={4} title="What you pay">
        <Points
          items={[
            <>
              {commercials.pricePerWebsiteMonthly} per website per month, or{" "}
              {commercials.pricePerWebsiteYearly} per website per year, in {commercials.currency}.
              Two websites cost twice as much, three three times, up to {commercials.maxWebsites}.
            </>,
            <>
              <strong className="font-semibold text-ink">The free plan does not expire.</strong> One
              website of one page costs nothing and needs no card. A paid plan starts only when you
              choose one, and our refund policy is what protects you if you change your mind.
            </>,
            "Payment is taken by Dodo Payments, which acts as the merchant of record — they are the seller on your receipt and they collect any sales tax or VAT due where you are. Your subscription renews automatically until you stop it.",
            "Prices may change, but never for a period you have already paid for, and we will email you at least 30 days before a change affects you.",
            "Prices are exclusive of any taxes we are required to charge.",
          ]}
        />
        <p>
          Cancellation and refunds are set out in full in our{" "}
          <a href="/refunds" className="font-semibold text-accent hover:underline">
            refunds and cancellation policy
          </a>
          , which forms part of these terms.
        </p>
      </Clause>

      <Clause n={5} title="How many websites you may have">
        <p>
          Your account may hold exactly as many websites as your subscription covers. If a
          subscription lapses, your existing websites keep working and stay editable — we will not
          take a live site down over a payment — but you cannot add another until it is active
          again.
        </p>
      </Clause>

      <Clause n={6} title="Who owns what">
        <Points
          items={[
            <>
              <strong className="font-semibold text-ink">Your content is yours.</strong> The words,
              images and files you put into mypagecraft remain your property. We claim no ownership of
              them and no licence beyond what is needed to store them, serve them to your website,
              and back them up.
            </>,
            <>
              <strong className="font-semibold text-ink">The software is ours.</strong> mypagecraft
              itself, its design and its name stay ours. Using the service does not transfer any of
              that to you.
            </>,
            <>
              <strong className="font-semibold text-ink">You are responsible for your content.</strong>{" "}
              You confirm you have the right to publish everything you upload — including
              photographs you did not take yourself.
            </>,
          ]}
        />
      </Clause>

      <Clause n={7} title="What you must not do">
        <Points
          items={[
            "Publish anything unlawful, or anything that infringes someone else's rights.",
            "Use mypagecraft to store or distribute malware, or to deceive people about who you are.",
            "Try to reach another customer's account, content or files.",
            "Attack the service — flooding it with requests, working around rate limits, or probing it for weaknesses without our written permission.",
            "Resell access to mypagecraft as though it were your own product.",
          ]}
        />
        <p>
          If you find a security flaw, tell us at{" "}
          <a
            href={`mailto:${business.supportEmail}`}
            className="font-semibold text-accent hover:underline"
          >
            {business.supportEmail}
          </a>
          . We would much rather hear from you than from someone else.
        </p>
      </Clause>

      <Clause n={8} title="Keeping it running">
        <p>
          We work to keep mypagecraft available and quick, but we do not promise a specific uptime
          figure and we do not offer a service-level guarantee. Maintenance, third-party outages and
          faults happen.
        </p>
        <p>
          Your published website is deliberately insulated from this: it serves pages it has already
          built, so it stays up even when our API does not. If we are down for long enough to matter,
          tell us and we will credit or refund that time.
        </p>
      </Clause>

      <Clause n={9} title="Suspension and ending the agreement">
        <Points
          items={[
            "You can cancel at any time from Plan & billing. You keep everything until the period you have paid for ends.",
            "We may suspend an account that is breaking clause 7, and will tell you why and what to fix. Where the breach is not serious, we will give you a chance to put it right first.",
            <>
              We may close an account for a serious or repeated breach, or if required by law. Except
              where the law forbids it, we will give you at least{" "}
              {commercials.contentRetentionDays} days&rsquo; notice to export your content.
            </>,
            "We may withdraw the service entirely with at least 90 days' notice, and will refund any period paid for beyond that.",
          ]}
        />
      </Clause>

      <Clause n={10} title="Your data">
        <p>
          How we handle personal data is set out in our{" "}
          <a href="/privacy" className="font-semibold text-accent hover:underline">
            privacy policy
          </a>
          , which forms part of these terms. In short: we hold your account details and your
          content, we do not track you, and we have never sold personal data.
        </p>
      </Clause>

      <Clause n={11} title="Liability">
        <p>
          Nothing here limits our liability for death or personal injury caused by our negligence,
          for fraud, or for anything else the law does not let us limit.
        </p>
        <p>
          Beyond that, and to the extent the law allows: we are not liable for lost profits, lost
          business, or loss of data you could have exported; and our total liability to you in any
          twelve-month period is limited to the amount you paid us in that period.
        </p>
        <p>
          Keep your own backups of anything you could not bear to lose. Your content is exportable at
          any time precisely so that you can.
        </p>
      </Clause>

      <Clause n={12} title="Changes to these terms">
        <p>
          We may update these terms. Minor corrections take effect when published; anything that
          materially affects you will be emailed to you at least 30 days beforehand, and continuing
          to use mypagecraft after that means you accept it. If you do not, cancel — and if the change
          disadvantages you mid-period, we will refund the remainder.
        </p>
      </Clause>

      <Clause n={13} title="Governing law">
        <p>
          These terms are governed by the laws of {business.country}, and the courts of{" "}
          {isFilled(business.jurisdictionCity) ? business.jurisdictionCity : business.country}{" "}
          have exclusive jurisdiction over any dispute — except that consumers keep any right to
          bring a claim where they live.
        </p>
        <p>
          If any part of these terms turns out to be unenforceable, the rest stands.
        </p>
      </Clause>

      <Clause n={14} title="Getting in touch">
        <p>
          Email{" "}
          <a
            href={`mailto:${business.supportEmail}`}
            className="font-semibold text-accent hover:underline"
          >
            {business.supportEmail}
          </a>{" "}
          — we read it {business.supportHours}.
        </p>
      </Clause>
    </LegalPage>
  );
}
