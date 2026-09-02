import type { Metadata } from "next";
import { abs, graph, jsonLd, organizationSchema, pageMeta } from "@/lib/site-meta";
import { Clause, Fill, LegalPage, Points } from "@/components/landing/legal";
import { business, isFilled } from "@/lib/legal";

/**
 * Contact us.
 *
 * A payment provider's website review checks this page specifically, and looks for a
 * **postal address and a working phone number** — an email-only contact page
 * is the most common single reason a verification request is sent back. The
 * details come from `lib/legal.ts`; fill them in there.
 */

const description =
  "How to reach the people who run Pagecraft — email, phone and our registered address.";

export const metadata: Metadata = pageMeta({
  title: "Contact us",
  description,
  path: "/contact",
});

/**
 * The organisation, with whatever contact details are actually filled in.
 *
 * Every field is gated on `isFilled`, because `lib/legal.ts` ships the address
 * and phone as `FILL_ME` sentinels until an operator supplies them — and
 * publishing `"telephone": "__FILL_ME__"` to a search engine is worse than
 * publishing no phone number at all. The visible page shouts about a missing
 * value through `<Fill>`; the structured data simply omits it.
 */
function contactSchema() {
  const node: Record<string, unknown> = {
    ...organizationSchema(),
    "@type": "Organization",
    mainEntityOfPage: abs("/contact"),
  };
  if (isFilled(business.legalName)) node.legalName = business.legalName;
  if (isFilled(business.phone)) node.telephone = business.phone;
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
          Pagecraft is operated by <strong className="font-semibold text-ink"><Fill value={business.legalName} /></strong>.
        </p>
        <address className="not-italic">
          {business.address.map((line, i) => (
            <span key={i} className="block">
              <Fill value={line} />
            </span>
          ))}
          <span className="block">{business.country}</span>
        </address>
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
          We answer within one working day. Include the email address on your account, because
          that is how we find you.
        </p>
      </Clause>

      <Clause n={3} title="Phone">
        <p>
          <strong className="font-semibold text-ink">
            <Fill value={business.phone} />
          </strong>
          , {business.supportHours}.
        </p>
        <p>
          Outside those hours, email is faster than a voicemail — it reaches the same people and
          leaves a written record of what you asked for.
        </p>
      </Clause>

      <Clause n={4} title="What to send us">
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

      <Clause n={5} title="What we will never ask you for">
        <p>
          We will never ask for your password, a one-time code, or your card number — not by email,
          not on the phone. Nobody at Pagecraft needs any of them, and anyone who asks is not us.
        </p>
        <p>
          Card details are handled entirely by Dodo Payments and never reach our servers.
        </p>
      </Clause>
    </LegalPage>
    </>
  );
}
