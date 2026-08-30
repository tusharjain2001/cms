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
 * THE MODEL: you pay per website. One is ₹999 a month, two is ₹1,998, three
 * is ₹2,997 — a ladder, not a set of feature tiers, because website count is the one
 * number a customer knows before they buy. **There is no free trial**, and the
 * API genuinely enforces that: a fresh account may own zero websites. See the
 * header comment in `components/landing/pricing-plans.tsx` for why the old
 * two-tier table was replaced, and do not put a trial back on this page
 * without changing `websiteAllowance()` first.
 *
 * Copy is aimed at the person paying — a shop or practice owner, not a
 * developer. That is a deliberate shift from the landing page, which speaks to
 * whoever builds the site.
 */

const description =
  "₹999 a month per website. Edit your own words and photos, and your site updates itself. Add a second website for another ₹999 — no tiers, no trial, no surprises.";

export const metadata: Metadata = {
  title: "Pricing",
  description,
  openGraph: { type: "website", siteName: "Pagecraft", title: "Pricing · Pagecraft", description },
};

/**
 * The ladder written out. Not a feature comparison — there is nothing to
 * compare, because every website gets everything. The only thing that changes
 * down this table is the number of sites and the number on the bill.
 */
const LADDER = [1, 2, 3, 5, 10].map((websites) => ({
  websites,
  monthly: `₹${(websites * 999).toLocaleString("en-IN")}`,
  yearly: `₹${(websites * 9990).toLocaleString("en-IN")}`,
}));

/** What a website includes, at every rung. */
const INCLUDED: { label: string; value: string }[] = [
  { label: "Pages on your website", value: "Unlimited" },
  { label: "Photos and files", value: "10 GB per website" },
  { label: "Sections per page", value: "Unlimited" },
  { label: "Edits and publishing", value: "Unlimited" },
  { label: "Section types", value: "All nine" },
  { label: "Preview before publishing", value: "Yes" },
  { label: "Your site updates itself on publish", value: "Yes" },
  { label: "Download everything as a file", value: "Yes" },
  { label: "Support", value: "Email, one working day" },
];

const ADD_ONS = [
  {
    title: "More space for photos",
    body: "10 GB per website is included, and photos are resized automatically before they are stored — most websites never come close. You get an email long before it matters.",
    price: "₹199",
    unit: "per 10 GB / month",
  },
  {
    title: "A new kind of section",
    body: "For your developer. We build the section type to their design and it appears in your dashboard like any other.",
    price: "₹14,999",
    unit: "one-off",
  },
];

const FAQS = [
  {
    q: "Is there a free trial?",
    a: "No. Signing up, looking around the dashboard and reading the developer docs cost nothing, but creating a website is a purchase — ₹999 for the first month. We would rather charge honestly on day one than run a clock you have to remember to cancel.",
  },
  {
    q: "What counts as one website?",
    a: "Everything at one address — every page, every section, every photo. A second website is a second ₹999 a month, on the same account and the same bill.",
  },
  {
    q: "Can I add a website later?",
    a: "Any time, from Plan & billing. It takes effect immediately, the difference is prorated, and you are not asked for your card again. Removing one works the same way — delete the website first, then reduce the plan.",
  },
  {
    q: "Do I pay, or does my developer?",
    a: "Whoever holds the account pays. Most owners pay for it themselves and keep the sign-in, so the website stays theirs even if they change developer later. A developer who looks after several client sites can also hold one account covering all of them — that is what the ladder is for.",
  },
  {
    q: "Can my developer edit it too?",
    a: "Yes. Share your sign-in with them and you both work in the same dashboard. There is nothing extra to buy for a second person — we charge for websites, not seats.",
  },
  {
    q: "What if I stop paying?",
    a: "Your content stays readable and editable, and the pages already published on your website keep working — your site does not go dark over a billing problem. What stops is adding another website. You can download everything as a file at any time.",
  },
  {
    q: "Which currency, and how is it charged?",
    a: "Indian rupees, through Razorpay — cards, UPI AutoPay, net banking. We never see your card. Monthly renews every month; yearly is ₹9,990 a website, twelve months for the price of ten.",
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
              ₹999 a month. Per website.
            </Print>
            <Print delay={90} className="mx-auto mt-5 max-w-[620px]">
              <p className="text-[16px] leading-[1.6] text-quiet sm:text-[17px]">
                Less than a site builder, and your website stays exactly as your designer made it.
                Two websites is ₹1,998, three is ₹2,997 — no tiers to decode, and nothing held back on a
                cheaper one.
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
                  There is no free trial: signing up and looking around costs nothing, but creating
                  a website is a purchase. We would rather charge honestly on day one than run a
                  clock you have to remember to cancel.
                </p>
                <Link
                  href={links.signUp}
                  className="ml-auto text-sub font-semibold text-accent hover:underline"
                >
                  Get started →
                </Link>
              </div>
            </Print>
          </Band>

          {/* ------------------------------------------------------- the ladder */}
          <Band stage="paper" className="pt-19">
            <Print as="header">
              <SectionHead>The whole price list</SectionHead>
            </Print>
            <Print delay={70}>
              <div className="mt-5.5 overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[480px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-sunken">
                      <th scope="col" className="w-[46%] px-5.5 py-4 text-label font-semibold">
                        Websites
                      </th>
                      <th
                        scope="col"
                        className="border-l border-line-mid px-4 py-4 text-label font-semibold"
                      >
                        Monthly
                      </th>
                      <th
                        scope="col"
                        className="border-l border-line-mid px-4 py-4 text-label font-semibold"
                      >
                        Yearly
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {LADDER.map((row) => (
                      <tr key={row.websites} className="border-b border-line-soft last:border-b-0">
                        <th
                          scope="row"
                          className="px-5.5 py-3.5 text-left text-sub font-medium text-ink tabular-nums"
                        >
                          {row.websites} website{row.websites === 1 ? "" : "s"}
                        </th>
                        <td className="border-l border-line-mid px-4 py-3.5 text-label font-medium text-ink tabular-nums">
                          {row.monthly} / mo
                        </td>
                        <td className="border-l border-line-mid px-4 py-3.5 text-label text-quiet tabular-nums">
                          {row.yearly} / yr
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Print>

            <p className="mt-4 text-sub leading-[1.6] text-quiet">
              It carries on at ₹999 each up to twenty websites. Past that,{" "}
              <a href={links.contact} className="font-semibold text-accent hover:underline">
                tell us what you need
              </a>{" "}
              — that is a conversation, not another row on a table.
            </p>
          </Band>

          {/* -------------------------------------- what a website includes */}
          <Band stage="paper" className="pt-19">
            <Print as="header">
              <SectionHead>What every website includes</SectionHead>
            </Print>
            <p className="mt-3 max-w-[620px] text-[15px] leading-[1.6] text-quiet">
              All of it, on every website you pay for. There is no cheaper rung that holds features
              back — the only thing the price tracks is how many sites you run.
            </p>
            <Print delay={70}>
              <div className="mt-5.5 overflow-hidden rounded-2xl border border-line bg-surface">
                <dl>
                  {INCLUDED.map((row) => (
                    <div
                      key={row.label}
                      className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line-soft px-5.5 py-3.5 last:border-b-0"
                    >
                      <dt className="text-sub font-medium text-ink">{row.label}</dt>
                      <dd className="text-label font-medium text-quiet tabular-nums">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Print>
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
                  <a href={links.contactEmail} className="font-medium text-accent hover:underline">
                    hello@mypagecraft.com
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
                  ₹999 a month, cancel whenever. Change a headline, swap a photo, press Publish,
                  and watch your live website update itself.
                </p>
                <div className="mt-6.5 flex flex-wrap justify-center gap-2.5">
                  <ButtonLink href={links.signUp}>Get started · ₹999 a month</ButtonLink>
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
