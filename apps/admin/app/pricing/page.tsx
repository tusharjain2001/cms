import type { Metadata } from "next";
import Link from "next/link";
import { PricingPlans } from "@/components/landing/pricing-plans";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { Band, H2 } from "@/components/landing/bits";
import { links } from "@/lib/links";

/**
 * The pricing page.
 *
 * One account is one website, and the website's owner pays for it. Two plans,
 * separated by how big the site is. See the header comment in
 * `components/landing/pricing-plans.tsx` for why the axes are what they are,
 * and the pricing note in CLAUDE.md for what is not yet enforced.
 *
 * Copy is aimed at the person paying — a shop or practice owner, not a
 * developer. That is a deliberate shift from the landing page, which speaks to
 * whoever builds the site.
 *
 * Only the monthly/yearly toggle is interactive; everything below is a server
 * component.
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

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteNav active="pricing" />

      <main>
        <Band className="animate-rise pt-14 text-center sm:pt-17">
          <h1 className="mx-auto max-w-[760px] text-[34px] leading-[1.08] font-bold tracking-[-1.1px] sm:text-[44px] lg:text-[48px] lg:tracking-[-1.4px]">
            One website. One simple price.
          </h1>
          <p className="mx-auto mt-4.5 max-w-[600px] text-[16px] leading-[1.6] text-quiet sm:text-[17px]">
            Less than a site builder, and your website stays exactly as your designer made it. Try
            it for fourteen days without giving us a card.
          </p>
        </Band>

        <Band className="pt-7">
          <PricingPlans />

          <div className="mx-auto mt-4 flex max-w-[760px] flex-wrap items-center gap-3.5 rounded-xl border border-line bg-rail px-5 py-4">
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
        </Band>

        {/* ------------------------------------------------------ comparison */}
        <Band className="pt-19">
          <H2 className="text-[26px]! tracking-[-.7px]! sm:text-[30px]!">
            The details, side by side
          </H2>
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

          <p className="mt-4 text-sub leading-[1.6] text-quiet">
            Look after several websites and want them under one sign-in?{" "}
            <a href={links.contact} className="font-semibold text-accent hover:underline">
              Tell us what you need
            </a>{" "}
            — that is a conversation, not a column on a table.
          </p>
        </Band>

        {/* --------------------------------------------------------- add-ons */}
        <Band className="pt-19">
          <ul className="grid gap-3.5 md:grid-cols-2">
            {ADD_ONS.map((a) => (
              <li key={a.title} className="rounded-xl border border-line bg-surface p-5.5">
                <h2 className="text-[14.5px] font-semibold">{a.title}</h2>
                <p className="mt-1.5 text-label leading-[1.55] text-quiet">{a.body}</p>
                <p className="mt-3.5 text-[20px] font-bold tracking-[-.4px] tabular-nums">
                  {a.price} <span className="text-mid font-normal text-muted">{a.unit}</span>
                </p>
              </li>
            ))}
          </ul>
        </Band>

        {/* ------------------------------------------------------------- faq */}
        <Band className="pt-19">
          <div className="grid gap-9 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <H2 className="text-[26px]! tracking-[-.7px]! sm:text-[30px]!">Billing questions</H2>
              <p className="mt-3 text-[15px] leading-[1.6] text-quiet">
                Anything unclear, mail{" "}
                <a href={links.contact} className="font-medium text-accent hover:underline">
                  hello@pagecraft.dev
                </a>{" "}
                before you pay, not after.
              </p>
            </div>
            <dl className="overflow-hidden rounded-xl border border-line bg-surface">
              {FAQS.map((f) => (
                <div key={f.q} className="border-b border-line-soft px-6 py-5 last:border-b-0">
                  <dt className="text-[14.5px] font-semibold">{f.q}</dt>
                  <dd className="mt-1.5 text-sub leading-[1.6] text-quiet">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Band>

        {/* ------------------------------------------------------ closing cta */}
        <Band className="pt-19 pb-24">
          <div className="rounded-2xl border border-accent-line bg-[linear-gradient(180deg,var(--color-accent-wash),var(--color-accent-soft))] px-8 py-12 text-center sm:px-10 sm:py-13">
            <H2 className="text-[28px]! tracking-[-.9px]! sm:text-[34px]!">
              Change your own website today.
            </H2>
            <p className="mx-auto mt-3.5 max-w-[540px] text-[15.5px] leading-[1.6] text-slate sm:text-[16px]">
              Fourteen days free, no card. Change a headline, swap a photo, press Publish, and watch
              your live website update itself.
            </p>
            <div className="mt-6.5 flex flex-wrap justify-center gap-2.5">
              <Link
                href={links.signUp}
                className="inline-block rounded-lg bg-accent px-6 py-3 text-[14.5px] font-semibold text-white transition-colors hover:bg-accent-dark"
              >
                Start 14 days free
              </Link>
              <Link
                href="/"
                className="inline-block rounded-lg border border-accent-line bg-surface px-6 py-3 text-[14.5px] font-semibold transition-colors hover:border-[#94aad9]"
              >
                Back to the overview
              </Link>
            </div>
          </div>
        </Band>
      </main>

      <SiteFooter />
    </div>
  );
}
