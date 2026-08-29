import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "@/components/landing/pricing-plans";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { Band, ButtonLink } from "@/components/landing/bits";
import { Print, Stagger, StageController } from "@/components/landing/motion";
import { links } from "@/lib/links";

/**
 * The pricing page — the calm two-stage version of the system (direction.md
 * §5.11): Paper → Sky at the plan grid → Paper, no marquee, no plate, no sticky
 * sequence. Bands reveal with print-wipes; the only interactivity is the
 * monthly/yearly toggle inside <PricingPlans>.
 *
 * One account is one website, and the website's owner pays for it. Two plans,
 * separated by how big the site is. See the header comment in
 * `components/landing/pricing-plans.tsx` for why the axes are what they are,
 * and the pricing note in CLAUDE.md for what is not yet enforced.
 *
 * Copy is aimed at the person paying — a shop or practice owner, not a
 * developer. That is a deliberate shift from the landing page, which speaks to
 * whoever builds the site.
 */

const description =
  "One website, one simple price. Edit your own words and photos, and your site updates itself. From $9 a month, with 14 days free.";

export const metadata: Metadata = {
  title: "Pricing",
  description,
  openGraph: { type: "website", siteName: "Pagecraft", title: "Pricing · Pagecraft", description },
};

const COMPARISON: { label: string; starter: string; business: string }[] = [
  { label: "Pages on your website", starter: "Up to 10", business: "Unlimited" },
  { label: "Photos and files", starter: "5 GB", business: "50 GB" },
  { label: "Sections per page", starter: "Unlimited", business: "Unlimited" },
  { label: "Edits and publishing", starter: "Unlimited", business: "Unlimited" },
  { label: "Section types", starter: "All nine", business: "All nine" },
  { label: "Preview before publishing", starter: "Yes", business: "Yes" },
  { label: "Your site updates itself on publish", starter: "Yes", business: "Yes" },
  { label: "Download everything as a file", starter: "Yes", business: "Yes" },
  { label: "Support", starter: "Email", business: "Email, one working day" },
];

const ADD_ONS = [
  {
    title: "More space for photos",
    body: "Photos are resized automatically before they are stored, so most websites never come close. You get an email long before it matters.",
    price: "$2",
    unit: "per 10 GB / month",
  },
  {
    title: "A new kind of section",
    body: "For your developer. We build the section type to their design and it appears in your dashboard like any other.",
    price: "$180",
    unit: "one-off",
  },
];

const FAQS = [
  {
    q: "Do I pay, or does my developer?",
    a: "Whoever holds the account pays. Most owners pay for it themselves and keep the sign-in, so the website stays theirs even if they change developer later. Some developers prefer to carry it inside a care plan — either works.",
  },
  {
    q: "Can my developer edit it too?",
    a: "Yes. Share your sign-in with them and you both work in the same dashboard. There is nothing extra to buy for a second person.",
  },
  {
    q: "What counts as one website?",
    a: "Everything at one address — every page, every section, every photo. If you run a second website, that is a second account and a second subscription.",
  },
  {
    q: "What happens after the 14 days?",
    a: "We ask for a card, not before. Nothing is charged during the trial and there is nothing to cancel if you walk away.",
  },
  {
    q: "What if I stop paying?",
    a: "Your content stays readable for 30 days and you can download all of it as a file at any time. The pages already published on your website keep working regardless — your site does not go dark over a billing problem.",
  },
  {
    q: "Will I outgrow Starter?",
    a: "Only if your website passes ten pages. Nothing breaks when you do — we tell you, and moving up is one click. Most small sites never need to.",
  },
];

/**
 * Informational section heading. Deliberately Karla, not the Bricolage display
 * H2: on this calm page the display face is reserved for the hero and the
 * prices (direction.md §4 — display never below 32px, so a small heading is set
 * in the body face rather than a shrunken display face).
 */
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[26px] font-bold tracking-[-0.5px] sm:text-[29px]">{children}</h2>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteNav active="pricing" />

      <StageController>
        <main>
          {/* -------------------------------------------------------- hero */}
          <Band stage="paper" className="pt-14 pb-9 text-center sm:pt-17">
            <Print
              as="h1"
              className="mx-auto max-w-[820px] font-display text-[clamp(2.75rem,6.5vw,4rem)] font-extrabold leading-[0.94] tracking-[-0.025em]"
            >
              One website. One simple price.
            </Print>
            <Print delay={90} className="mx-auto mt-5 max-w-[600px]">
              <p className="text-[16px] leading-[1.6] text-quiet sm:text-[17px]">
                Less than a site builder, and your website stays exactly as your designer made it.
                Try it for fourteen days without giving us a card.
              </p>
            </Print>
          </Band>

          {/* --------------------------------------------- plan grid (Sky) */}
          <Band stage="sky" className="py-9">
            <Print>
              <PricingPlans />
            </Print>

            <Print delay={90}>
              <div className="mx-auto mt-4 flex max-w-[760px] flex-wrap items-center gap-3.5 rounded-xl border border-line bg-surface px-5 py-4">
                <p className="text-sub text-quiet">
                  Both plans include every section type, unlimited edits, preview links and automatic
                  publishing to your live website. Nothing about the product is held back on the
                  cheaper plan — you are only paying for a bigger site.
                </p>
                <Link
                  href={links.signUp}
                  className="ml-auto text-sub font-semibold text-accent hover:underline"
                >
                  Start your 14 days →
                </Link>
              </div>
            </Print>
          </Band>

          {/* --------------------------------------------------- comparison */}
          <Band stage="paper" className="pt-19">
            <Print as="header">
              <SectionHead>The details, side by side</SectionHead>
            </Print>
            <Print delay={70}>
              <div className="mt-5.5 overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-sunken">
                      <th scope="col" className="w-[46%] px-5.5 py-4">
                        <span className="sr-only">Feature</span>
                      </th>
                      <th
                        scope="col"
                        className="border-l border-line-mid px-4 py-4 text-label font-semibold"
                      >
                        Starter
                      </th>
                      <th
                        scope="col"
                        className="border-l border-line-mid px-4 py-4 text-label font-bold text-accent"
                      >
                        Business
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map((row) => (
                      <tr key={row.label} className="border-b border-line-soft last:border-b-0">
                        <th
                          scope="row"
                          className="px-5.5 py-3.5 text-left text-sub font-medium text-ink"
                        >
                          {row.label}
                        </th>
                        <td className="border-l border-line-mid px-4 py-3.5 text-label text-quiet tabular-nums">
                          {row.starter}
                        </td>
                        <td className="border-l border-line-mid px-4 py-3.5 text-label font-medium text-ink tabular-nums">
                          {row.business}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Print>

            <p className="mt-4 text-sub leading-[1.6] text-quiet">
              Look after several websites and want them under one sign-in?{" "}
              <a href={links.contact} className="font-semibold text-accent hover:underline">
                Tell us what you need
              </a>{" "}
              — that is a conversation, not a column on a table.
            </p>
          </Band>

          {/* ------------------------------------------------------ add-ons */}
          <Band stage="paper" className="pt-19">
            <div className="grid gap-3.5 md:grid-cols-2">
              <Stagger>
                {ADD_ONS.map((a) => (
                  <div
                    key={a.title}
                    className="rounded-xl border border-line bg-surface p-5.5 transition-[transform,border-color] duration-150 hover:translate-y-px hover:border-btn-hover"
                  >
                    <h3 className="text-[14.5px] font-semibold">{a.title}</h3>
                    <p className="mt-1.5 text-label leading-[1.55] text-quiet">{a.body}</p>
                    <p className="mt-3.5 text-[20px] font-bold tracking-[-.4px] tabular-nums">
                      {a.price} <span className="text-mid font-normal text-muted">{a.unit}</span>
                    </p>
                  </div>
                ))}
              </Stagger>
            </div>
          </Band>

          {/* ---------------------------------------------------------- faq */}
          <Band stage="paper" className="pt-19">
            <div className="grid gap-9 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <Print as="header">
                  <SectionHead>Billing questions</SectionHead>
                </Print>
                <p className="mt-3 text-[15px] leading-[1.6] text-quiet">
                  Anything unclear, mail{" "}
                  <a href={links.contact} className="font-medium text-accent hover:underline">
                    hello@pagecraft.dev
                  </a>{" "}
                  before you pay, not after.
                </p>
              </div>
              <Print delay={70}>
                <dl className="overflow-hidden rounded-xl border border-line bg-surface">
                  {FAQS.map((f) => (
                    <div key={f.q} className="border-b border-line-soft px-6 py-5 last:border-b-0">
                      <dt className="text-[14.5px] font-semibold">{f.q}</dt>
                      <dd className="mt-1.5 text-sub leading-[1.6] text-quiet">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              </Print>
            </div>
          </Band>

          {/* -------------------------------------------------- closing cta */}
          <Band stage="paper" className="pt-19 pb-24">
            <Print>
              {/* Flat Press-Blue-soft panel — no gradient (direction.md §1, §7). */}
              <div className="rounded-2xl border border-accent-line bg-accent-soft px-8 py-12 text-center sm:px-10 sm:py-13">
                <h2 className="font-display text-[clamp(2rem,4.5vw,2.5rem)] font-extrabold leading-[0.95] tracking-[-0.025em]">
                  Change your own website today.
                </h2>
                <p className="mx-auto mt-3.5 max-w-[540px] text-[15.5px] leading-[1.6] text-slate sm:text-[16px]">
                  Fourteen days free, no card. Change a headline, swap a photo, press Publish, and
                  watch your live website update itself.
                </p>
                <div className="mt-6.5 flex flex-wrap justify-center gap-2.5">
                  <ButtonLink href={links.signUp}>Start 14 days free</ButtonLink>
                  <ButtonLink href="/" tone="outline">
                    Back to the overview
                  </ButtonLink>
                </div>
              </div>
            </Print>
          </Band>
        </main>
      </StageController>

      <SiteFooter />
    </div>
  );
}
