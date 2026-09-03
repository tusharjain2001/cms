import type { Metadata } from "next";
import { abs, graph, jsonLd, organizationSchema, pageMeta } from "@/lib/site-meta";
import { Clause, LegalPage, Points } from "@/components/landing/legal";
import { business, isFilled } from "@/lib/legal";

/**
 * Contact us.
 *
 * A payment provider's website review checks this page specifically, and
 * usually looks for a postal address and a phone number. **Neither is
 * published** — decided 4 Sep 2026 — so this is an email-only contact page.
 * If a reviewer sends the site back for that reason, add the address lines in
 * `lib/legal.ts` and the block below renders again on its own.
 */

const description =
  "How to reach the people who run mypagecraft, and what to include so we can help quickly.";

export const metadata: Metadata = pageMeta({
  title: "Contact us",
  description,
  path: "/contact",
});

/**
 * The organisation, with whatever contact details are actually set.
 *
 * Every field is gated on `isFilled`, so an address or GSTIN left empty in
 * `lib/legal.ts` is simply omitted from the structured data rather than
 * published as an empty string.
 */
function contactSchema() {
  const node: Record<string, unknown> = {
    ...organizationSchema(),
    "@type": "Organization",
    mainEntityOfPage: abs("/contact"),
  };
  if (isFilled(business.legalName)) node.legalName = business.legalName;
  const street = business.address.filter(isFilled);
  if (street.length > 0) {
    node.address = {
      "@type": "PostalAddress",
      streetAddress: street.join(", "),
      addressCountry: business.country,
    };
  }
  if (isFilled(business.gstin)) node.taxID = business.gstin;
  return node;
}

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(graph(contactSchema())) }}
      />
    <LegalPage
      title="Contact us"
      intro="A real person reads every message. If something is broken or you are stuck mid-payment, say so in the subject line and it goes to the front of the queue."
    >
      <Clause n={1} title="Who you are dealing with">
        <p>
          {business.tradingName} is operated by the{" "}
          <strong className="font-semibold text-ink">{business.legalName}</strong>, based in{" "}
          {business.country}.
        </p>
        {business.address.length > 0 && (
          <address className="not-italic">
            {business.address.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </address>
        )}
        {isFilled(business.gstin) && (
          <p className="font-mono text-label text-muted">GSTIN: {business.gstin}</p>
        )}
      </Clause>

      <Clause n={2} title="Email">
        <p>
          <a
            href={`mailto:${business.supportEmail}`}
            className="font-semibold text-accent hover:underline"
          >
            {business.supportEmail}
          </a>{" "}
          — for anything at all: a question before you buy, a bug, a refund, or a request about
          your personal data.
        </p>
        <p>
          We read the inbox {business.supportHours}, and answer within one working day. Include
          the email address on your account, because that is how we find you.
        </p>
        <p>
          Email is the only channel, on purpose: it reaches the same people a phone would and
          leaves a written record of what you asked for.
        </p>
      </Clause>

      <Clause n={3} title="What to send us">
        <Points
          items={[
            <>
              <strong className="font-semibold text-ink">Something is broken:</strong> the website
              name, the page you were on, and what you expected to happen. A screenshot settles most
              of it in one round trip.
            </>,
            <>
              <strong className="font-semibold text-ink">Billing or a refund:</strong> the email
              address on the account and the payment id from your receipt. See our{" "}
              <a href="/refunds" className="font-semibold text-accent hover:underline">
                refunds and cancellation policy
              </a>
              .
            </>,
            <>
              <strong className="font-semibold text-ink">Your personal data:</strong> what you want
              — a copy, a correction, or deletion. See the{" "}
              <a href="/privacy" className="font-semibold text-accent hover:underline">
                privacy policy
              </a>
              .
            </>,
            <>
              <strong className="font-semibold text-ink">A section type you need built:</strong>{" "}
              your developer&rsquo;s design for it, and the website it is for.
            </>,
          ]}
        />
      </Clause>

      <Clause n={4} title="What we will never ask you for">
        <p>
          We will never ask for your password, a one-time code, or your card number — not by email,
          not by any other channel. Nobody at mypagecraft needs any of them, and anyone who asks
          is not us. We will never phone you.
        </p>
        <p>
          Card details are handled entirely by Dodo Payments and never reach our servers.
        </p>
      </Clause>
    </LegalPage>
    </>
  );
}
