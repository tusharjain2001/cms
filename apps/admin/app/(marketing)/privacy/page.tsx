import type { Metadata } from "next";
import { pageMeta } from "@/lib/site-meta";
import { Clause, Fill, Highlight, LegalPage, Points } from "@/components/landing/legal";
import { business, commercials, subProcessors } from "@/lib/legal";

/**
 * Privacy policy.
 *
 * Written from what the code actually does rather than from a template, which
 * is the part a generic policy always gets wrong. Each claim below has a
 * counterpart in the source:
 *
 *   - passwords are bcrypt hashes           → models/user.ts
 *   - one-shot links are stored as SHA-256  → models/auth-token.ts
 *   - one httpOnly refresh cookie, no more  → routes/auth.ts, lib/api.ts
 *   - IPs live in memory for rate limiting  → middleware/rate-limit.ts
 *   - media URLs are public and guessable-  → lib/r2.ts (content-addressed keys)
 *     proof but not secret
 *   - card details never reach us           → lib/dodo.ts (hosted checkout only)
 *
 * If any of those change, change this page in the same commit.
 */

const description =
  "What mypagecraft stores, why, who else sees it, and how to get it back or have it deleted. No tracking, no advertising, no selling data.";

export const metadata: Metadata = pageMeta({
  title: "Privacy policy",
  description,
  path: "/privacy",
  card: "legal",
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="mypagecraft holds your account details and the content you write. That is nearly all of it. This page says exactly what we keep, who else touches it, and how to make us delete it."
    >
      <Highlight>
        We do not run analytics, advertising or tracking of any kind on this website, we set no
        third-party cookies, and we have never sold or shared personal data for anyone else&rsquo;s
        marketing. There is no opt-out because there is nothing to opt out of.
      </Highlight>

      <Clause n={1} title="Who is responsible">
        <p>
          {business.tradingName} is operated by the{" "}
          <strong className="font-semibold text-ink">
            <Fill value={business.legalName} />
          </strong>, and we are the
          data controller for everything described here. How to reach us is on
          the{" "}
          <a href="/contact" className="font-semibold text-accent hover:underline">
            contact page
          </a>
          .
        </p>
        <p>
          For anything about your data, write to{" "}
          <a
            href={`mailto:${business.privacyEmail}`}
            className="font-semibold text-accent hover:underline"
          >
            {business.privacyEmail}
          </a>
          .
        </p>
      </Clause>

      <Clause n={2} title="What we collect">
        <Points
          items={[
            <>
              <strong className="font-semibold text-ink">Your account:</strong> name, email address,
              and a password. The password is stored only as a bcrypt hash — we cannot read it, and
              a database leak would not reveal it. We also record when you confirmed your email
              address and whether you have finished the getting-started tour.
            </>,
            <>
              <strong className="font-semibold text-ink">What you create:</strong> your websites,
              their pages and sections, the words in them, and the photos and files you upload.
              This is your content; we hold it so the CMS can serve it.
            </>,
            <>
              <strong className="font-semibold text-ink">Billing:</strong> your Dodo Payments
              subscription and customer identifiers, which plan you are on, how many websites it
              covers, and when the period ends. <strong className="font-semibold text-ink">Card
              numbers never reach our servers</strong> — you enter them on Dodo&rsquo;s own
              checkout page, which is hosted on their domain, not ours.
            </>,
            <>
              <strong className="font-semibold text-ink">Email you send us.</strong> Support
              messages stay in our mailbox so we can answer and refer back to them.
            </>,
          ]}
        />
        <p>
          We do not ask for a date of birth, a gender, a postal address, or anything else we have no
          use for. If a field is not in the list above, we are not collecting it.
        </p>
      </Clause>

      <Clause n={3} title="IP addresses, and why we keep them so briefly">
        <p>
          Every signed-out page — signing in, signing up, resetting a password — is rate limited by
          IP address, because without that anyone could guess passwords or send confirmation emails
          to strangers in bulk. Those counters live in the server&rsquo;s memory, expire within
          minutes, and are never written to the database. We keep no access log tied to your
          account.
        </p>
      </Clause>

      <Clause n={4} title="Cookies">
        <p>
          One cookie: a sign-in token, marked httpOnly so no script on the page can read it, scoped
          to the sign-in routes alone. It is what keeps you signed in, and it is strictly necessary
          — clear it and you are simply signed out.
        </p>
        <p>
          There are no analytics cookies, no advertising cookies, and no third-party cookies on the
          public pages. Paying takes you to Dodo Payments&rsquo; own checkout page, which sets its
          own cookies under their privacy policy — we set none there, because it is not our site.
        </p>
      </Clause>

      <Clause n={5} title="Content you publish is public — by design">
        <p>
          The point of mypagecraft is to serve your published content to your live website, over a
          public read-only API. Anything you publish is public. Drafts are not: the public API
          serves only published content, and previews need a short-lived token.
        </p>
        <p>
          Photos and files you upload are served from a content-delivery network at unguessable but{" "}
          <strong className="font-semibold text-ink">public URLs</strong>. Anyone given the link can
          open it, and it is not protected by your sign-in. Do not upload anything through the media
          library that you would not be willing to publish.
        </p>
      </Clause>

      <Clause n={6} title="Why we are allowed to hold it">
        <Points
          items={[
            <>
              <strong className="font-semibold text-ink">To provide the service</strong> — your
              account and content exist because you asked us to run a CMS for you.
            </>,
            <>
              <strong className="font-semibold text-ink">To take payment</strong> — billing data,
              because you bought a subscription.
            </>,
            <>
              <strong className="font-semibold text-ink">To keep accounts secure</strong> — rate
              limiting and one-shot links, which is our legitimate interest and yours.
            </>,
            <>
              <strong className="font-semibold text-ink">Because the law says so</strong> — payment
              and tax records we are required to keep.
            </>,
          ]}
        />
      </Clause>

      <Clause n={7} title="Who else sees it">
        <p>
          Only the companies that make the product work. Each is bound to use the data solely to
          provide their service to us.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-sunken">
                <th scope="col" className="px-4 py-3 text-label font-semibold">
                  Company
                </th>
                <th scope="col" className="px-4 py-3 text-label font-semibold">
                  What for
                </th>
                <th scope="col" className="px-4 py-3 text-label font-semibold">
                  What they see
                </th>
              </tr>
            </thead>
            <tbody>
              {subProcessors.map((p) => (
                <tr key={p.name} className="border-b border-line-soft last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-left text-sub font-medium text-ink">
                    {p.name}
                  </th>
                  <td className="px-4 py-3 text-label text-quiet">{p.purpose}</td>
                  <td className="px-4 py-3 text-label text-quiet">{p.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Beyond these, we disclose personal data only where the law compels us to. We have never
          sold personal data and will not.
        </p>
      </Clause>

      <Clause n={8} title="How long we keep it">
        <Points
          items={[
            "Your account and content: for as long as your account is open.",
            <>
              After you close your account or a subscription ends, content stays for at least{" "}
              {commercials.contentRetentionDays} days so nothing is lost to a billing accident, and
              may be removed afterwards.
            </>,
            "Confirmation and password-reset links: they expire within hours, are single-use, and are stored only as a one-way hash. A used link is spent immediately.",
            "Payment records: as long as tax and accounting law requires, which is longer than the rest.",
          ]}
        />
        <p>
          Deleting a website from the dashboard removes its pages, sections, access tokens and the
          stored files themselves — including the copies held by our storage provider. There is no
          soft delete and no undo.
        </p>
      </Clause>

      <Clause n={9} title="How it is protected">
        <Points
          items={[
            "Passwords are bcrypt hashes. Nobody at mypagecraft can read yours.",
            "Everything travels over HTTPS.",
            "Sign-in tokens are short-lived, and changing your password invalidates every session on every device at once.",
            "Confirmation and reset links are single-use, and only a one-way hash of each is stored.",
            "One account can never read another account's websites, content or files. That rule is enforced on every request and covered by our tests.",
          ]}
        />
        <p>
          No system is perfect. If we discover a breach affecting your personal data, we will tell
          you and the relevant authority without undue delay, and we will tell you what actually
          happened rather than the smallest true thing.
        </p>
      </Clause>

      <Clause n={10} title="What you can ask us to do">
        <Points
          items={[
            "Get a copy of everything we hold about you.",
            "Correct anything wrong — your name and email are editable in the dashboard already.",
            "Delete your account and its content. You can do this yourself once your websites are deleted; ask us if you would rather we did it.",
            "Object to how we are using something, or ask us to restrict it.",
            "Take your content elsewhere. It is structured data and you can export it at any time.",
          ]}
        />
        <p>
          Email{" "}
          <a
            href={`mailto:${business.privacyEmail}`}
            className="font-semibold text-accent hover:underline"
          >
            {business.privacyEmail}
          </a>{" "}
          and we will act within 30 days. There is no charge. If you are unhappy with how we have
          handled it, you may complain to your data protection authority.
        </p>
      </Clause>

      <Clause n={11} title="If you are someone else's client">
        <p>
          Whoever owns a mypagecraft account controls the websites on it, and often shares that
          sign-in with the developer who built the site. Anyone holding those details can see and
          change everything on those websites. Share your sign-in only with people you trust, and
          change your password when that stops being true — it signs every other device out at once.
        </p>
      </Clause>

      <Clause n={12} title="Children">
        <p>
          mypagecraft is a business tool and is not directed at children. We do not knowingly collect
          data from anyone under 18. If you believe a child has given us personal data, tell us and
          we will remove it.
        </p>
      </Clause>

      <Clause n={13} title="Changes to this policy">
        <p>
          If we change how we handle personal data, we will update this page and move the date at
          the top. Where a change is significant, we will email you rather than hope you notice.
        </p>
      </Clause>
    </LegalPage>
  );
}
