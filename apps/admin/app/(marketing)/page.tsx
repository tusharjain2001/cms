import { Hero } from "@/components/landing/hero";
import { PressRun } from "@/components/landing/press-run";
import { SectionTypeGrid } from "@/components/landing/section-types";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { Band, ButtonLink, Check, Cross, Eyebrow, H2, Lede } from "@/components/landing/bits";
import { SectionPapers } from "@/components/landing/flying-papers";
import {
  CountUp,
  GhostDrift,
  Marquee,
  Print,
  Stagger,
  StageController,
} from "@/components/landing/motion";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { links } from "@/lib/links";

/**
 * The landing page — the front door of the same app that serves the dashboard,
 * re-staged as a five-ink press: the reader scrolls and each chapter prints
 * itself on a stage that shifts through the ink washes (direction.md §3.4 band
 * map). Paper → Sun → Sky → Paper → Plate → Butter → Lilac → Paper → Mint, then
 * the rail footer.
 *
 * Still a server component that ships no client JavaScript of its own: every
 * moving part is a primitive from `motion.tsx` (the one marketing client
 * module). With JS off or under reduced motion the whole page reads as a
 * finished poster — bands statically coloured, marquee wrapped, press run
 * stacked, swashes struck, frame drawn.
 */

const description =
  "Build client websites in React and let the owner edit the words and photos. They change text and images in a dashboard a bakery owner can use; they never touch a colour, a font or a layout.";

export const metadata: Metadata = {
  title: "Pagecraft — a content-only CMS for React and Next.js sites",
  description,
  keywords: [
    "headless CMS",
    "Next.js CMS",
    "React CMS",
    "client website CMS",
    "content-only CMS",
    "WordPress alternative for developers",
  ],
  openGraph: { type: "website", siteName: "Pagecraft", description },
  twitter: { card: "summary_large_image", description },
};

/** The nine section types, as the marquee advertises them. */
const SECTION_LABELS = [
  "Hero",
  "Features",
  "Product Grid",
  "Gallery",
  "Testimonials",
  "FAQ",
  "Call to Action",
  "Contact",
  "Text Block",
];

const STATS = [
  {
    prefix: "~",
    value: 3,
    suffix: "s",
    title: "Publish to live",
    body:
      "Publish fires the site's revalidate webhook. The static page regenerates itself — no deploy, no developer.",
  },
  {
    value: 9,
    title: "Section types, out of the box",
    body:
      "Hero, Features, Product Grid, Gallery, Testimonials, FAQ, CTA, Contact, Text Block. Adding your own is one file.",
  },
  {
    value: 1,
    title: "Instance, every client site",
    body:
      "Each website is a project with its own key, its own library, and its own allowed sections.",
  },
];

const CANNOT = [
  "Change a colour, a font or a spacing",
  "Drag a layout apart or nest a container in a container",
  "Paste twelve typefaces in from a Word document",
  "Install a plugin that breaks the site at 11pm on a Friday",
  "Add a section type you never built for them",
];

const CAN = [
  "Change today's headline and prices before opening",
  "Swap a photo from their camera roll",
  "Add a new page and have it appear in the menu",
  "Hide the testimonials section for a week",
  "Preview privately, then publish when they are happy",
];

const COMPARISON = {
  columns: ["Pagecraft", "WordPress", "Site builders"],
  rows: [
    ["Design stays exactly as you shipped it", "Guaranteed", "Until a plugin", "No"],
    ["You write the front end in React", "Yes", "Headless, with effort", "No"],
    ["Editing UI a non-technical owner enjoys", "Built for it", "Dashboard sprawl", "Mixed"],
    ["Security patching on your Friday night", "None", "Ongoing", "None"],
    ["Cost for one website", "From $9 a month", "Hosting, plugins, upkeep", "Typically more"],
  ],
};

const TESTIMONIALS = [
  {
    quote:
      "I used to charge for content edits and lose the client anyway. Now the bakery updates its own specials before 6am and my design still looks like my design.",
    name: "Maya Kessler",
    role: "Stella Digital · 11 client websites",
  },
  {
    quote:
      "I am not a computer person. I change the photo, press the blue button, and the website is right. That is the whole thing I needed.",
    name: "Priya Raval",
    role: "Owner, Rosewater Bakehouse",
  },
];

const FAQS = [
  {
    q: "Do I have to rebuild my client's existing site?",
    a: "No. Wrap the parts that change in section components and read them from the content API. Everything else stays as it is.",
  },
  {
    q: "What happens if Pagecraft is down when I deploy?",
    a: "The SDK reports an unreachable CMS separately from a real error, so your build can render a holding page instead of failing. Published pages already on your CDN keep serving.",
  },
  {
    q: "Can I stop a client using a section I did not build for them?",
    a: "Yes. Each project has an allowed list, ticked in Settings. Anything unticked never appears in their Add section list, and the API rejects it too.",
  },
  {
    q: "What happens to my client's site if they stop paying?",
    a: "The pages already published on their CDN keep serving — a billing problem never takes a live website down. Only editing stops, content stays readable for 30 days, and it exports as JSON at any time.",
  },
];

export default function LandingPage() {
  return (
    <div id="top" className="min-h-screen">
      <SiteNav />

      <StageController>
        <main>
          {/* ---------------------------------------------------- hero · paper */}
          <div data-stage="paper">
            <Hero />
          </div>

          {/* --------------------------------- marquee strip · Sun (opaque) */}
          {/* No data-stage: Sun is a printed strip, not a wrapper wash. The
              stage light transitions paper → sky around it. */}
          <section
            aria-label="The section types you get out of the box"
            className="border-y border-ink/20 bg-sun py-3.5"
          >
            <Marquee>
              {SECTION_LABELS.map((label) => (
                <span
                  key={label}
                  className="flex shrink-0 items-center gap-6 pr-6 font-mono text-[12.5px] font-medium tracking-[0.08em] text-ink uppercase"
                >
                  {label}
                  <span aria-hidden className="text-sun-ink">
                    ✦
                  </span>
                </span>
              ))}
            </Marquee>
          </section>

          {/* ------------------------------------------- press run · sky */}
          <Band stage="sky" id="how" className="py-20 sm:py-24">
            <div className="max-w-[640px]">
              <Print>
                <Eyebrow>How it works</Eyebrow>
              </Print>
              <Print delay={70}>
                <H2 className="mt-3">You keep the design. They keep the words.</H2>
              </Print>
              <Print delay={140}>
                <Lede className="mt-4">
                  Three moving parts, and only one of them belongs to your client.
                </Lede>
              </Print>
            </div>
            <div className="mt-12">
              <PressRun />
            </div>
          </Band>

          {/* ------------------------------------- stats + can / cannot · paper */}
          <Band stage="paper" className="py-20 sm:py-24">
            <div className="grid gap-10 sm:grid-cols-3">
              {STATS.map((s, i) => (
                <Print key={s.title} delay={i * 70}>
                  <p className="font-display text-[clamp(2.75rem,7vw,4rem)] leading-none font-bold tracking-[-0.02em] text-ink">
                    {s.prefix}
                    <CountUp value={s.value} />
                    {s.suffix}
                  </p>
                  <p className="mt-4 font-mono text-[12px] tracking-[0.08em] text-ink uppercase">
                    {s.title}
                  </p>
                  <p className="mt-2 text-[14px] leading-[1.55] text-quiet">{s.body}</p>
                </Print>
              ))}
            </div>

            <div className="mt-14 overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="grid md:grid-cols-2">
                <div className="border-b border-line-mid p-8 md:border-r md:border-b-0 md:px-9 md:py-9">
                  <Eyebrow tone="muted">What your client cannot do</Eyebrow>
                  <ul className="mt-4 flex flex-col gap-3">
                    {CANNOT.map((item) => (
                      <Cross key={item}>{item}</Cross>
                    ))}
                  </ul>
                </div>
                <div className="p-8 md:px-9 md:py-9">
                  <Eyebrow>What they can do, on their phone, unsupervised</Eyebrow>
                  <ul className="mt-4 flex flex-col gap-3">
                    {CAN.map((item) => (
                      <Check key={item}>{item}</Check>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3.5 border-t border-line-mid bg-sunken px-8 py-4.5">
                <p className="text-[13.5px] text-quiet">
                  Blank required fields are tolerated while they type, and only checked the
                  moment they press Publish — with the error shown on the field, in plain
                  English.
                </p>
                <a
                  href={links.signIn}
                  className="ml-auto text-[13.5px] font-semibold text-accent hover:underline"
                >
                  Open the dashboard →
                </a>
              </div>
            </div>
          </Band>

          {/* ------------------------------------- for developers · plate */}
          <section
            data-stage="plate"
            id="code"
            className="relative overflow-hidden bg-plate py-20 sm:py-24"
          >
            <GhostDrift className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                aria-hidden
                className="font-display text-[18vw] leading-none font-extrabold whitespace-nowrap text-canvas"
                style={{ opacity: 0.06 }}
              >
                PAGECRAFT
              </span>
            </GhostDrift>

            <div className="relative mx-auto max-w-[1160px] px-5 sm:px-8">
              <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="text-canvas">
                  <p className="font-mono text-[12px] tracking-[0.1em] text-canvas/70 uppercase">
                    For developers
                  </p>
                  <H2 className="mt-3">Fifteen lines to wire a site up.</H2>
                  <p className="mt-4 text-[16px] leading-[1.55] text-canvas/80">
                    Install the SDK, map section types to your components, add a revalidate
                    route. Type-safe end to end, no admin UI to maintain, and a CMS outage
                    never fails your build.
                  </p>
                  <ul className="mt-6 flex flex-col gap-3">
                    {[
                      "TypeScript types generated from your own field definitions",
                      "ISR and on-demand revalidation, or plain runtime fetching",
                      "Signed direct-to-CDN uploads, resized image URLs included",
                      "Content exports as JSON — nothing about it is locked in",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span aria-hidden className="mt-px shrink-0 text-mint-pop">
                          ✓
                        </span>
                        <span className="text-[14px] leading-[1.5] text-canvas/90">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7 flex flex-wrap gap-2.5">
                    <ButtonLink href={links.signUp}>Start building</ButtonLink>
                    <a
                      href={links.docs}
                      className="inline-block rounded-lg border border-canvas/30 px-4.5 py-2.5 text-[13.5px] font-semibold text-canvas transition-colors hover:bg-canvas/10"
                    >
                      Read the docs
                    </a>
                  </div>
                </div>

                {/* The code becomes the most colourful text on the site: sun
                    keywords, mint-pop strings, paper identifiers, dim comments —
                    the one place the bright inks are text-safe (on plate). */}
                <Print>
                  <div className="overflow-hidden rounded-xl border border-canvas/15">
                    <div className="flex gap-0.5 border-b border-canvas/12 px-3 pt-2.5">
                      <span className="-mb-px rounded-t-md border border-canvas/15 border-b-plate bg-plate px-3 py-[7px] font-mono text-[11px] font-medium text-canvas">
                        registry.ts
                      </span>
                      <span className="px-3 py-[7px] font-mono text-[11px] text-canvas/60">
                        page.tsx
                      </span>
                      <span className="px-3 py-[7px] font-mono text-[11px] text-canvas/60">
                        revalidate.ts
                      </span>
                    </div>
                    <pre className="overflow-x-auto px-5 py-4.5 font-mono text-[12.5px] leading-[1.85] text-canvas/90">
                      <code>
                        <span className="text-canvas/60">
                          {"// one entry = one section type + its form"}
                        </span>
                        {"\n"}
                        <span className="text-sun">hero</span>
                        {": {\n  label: "}
                        <span className="text-mint-pop">&quot;Hero&quot;</span>
                        {",\n  description: "}
                        <span className="text-mint-pop">&quot;Big photo, headline, buttons&quot;</span>
                        {",\n  fields: {\n    heading:    "}
                        <span className="text-sun">text</span>
                        {"({ max: "}
                        <span className="text-mint-pop">140</span>
                        {", required: "}
                        <span className="text-mint-pop">true</span>
                        {" }),\n    subheading: "}
                        <span className="text-sun">para</span>
                        {"({ max: "}
                        <span className="text-mint-pop">260</span>
                        {" }),\n    backgroundImage: "}
                        <span className="text-sun">image</span>
                        {"(),\n    buttons: "}
                        <span className="text-sun">list</span>
                        {"(\n      { label: "}
                        <span className="text-sun">text</span>
                        {"({ max: "}
                        <span className="text-mint-pop">24</span>
                        {" }), href: "}
                        <span className="text-sun">link</span>
                        {"() },\n      { max: "}
                        <span className="text-mint-pop">3</span>
                        {" }\n    ),\n  },\n}\n\n"}
                        <span className="text-canvas/60">{"// and on the website"}</span>
                        {"\n<"}
                        <span className="text-sun">SectionRenderer</span>
                        {"\n  sections={page.sections}\n  components={{ hero: Hero, features: Features }}\n/>"}
                      </code>
                    </pre>
                  </div>
                </Print>
              </div>
            </div>
          </section>

          {/* ------------------------------------- section types · butter */}
          <Band
            stage="butter"
            id="sections"
            className="py-20 sm:py-24"
            bg={<SectionPapers preset="types" />}
          >
            <div className="flex flex-wrap items-end justify-between gap-8">
              <div className="max-w-[600px]">
                <Print>
                  <Eyebrow>Section types</Eyebrow>
                </Print>
                <Print delay={70}>
                  <H2 className="mt-3">Nine to start with. Add your own in one file.</H2>
                </Print>
                <Print delay={140}>
                  <Lede className="mt-4">
                    A section type is a set of fields plus your React component. The dashboard
                    reads the field definitions and builds the form itself — you never write an
                    admin screen again.
                  </Lede>
                </Print>
              </div>
              <Print delay={140}>
                <code className="rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-[12.5px] text-muted">
                  packages/shared/src/registry.ts
                </code>
              </Print>
            </div>
            <SectionTypeGrid />
          </Band>

          {/* ------------------------------- comparison + testimonials · lilac */}
          <Band stage="lilac" className="py-20 sm:py-24" bg={<SectionPapers preset="lilac" />}>
            <Print>
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line bg-sunken">
                      <th
                        scope="col"
                        className="w-[34%] px-6 py-4 text-[13px] font-semibold text-muted"
                      >
                        Handing a client the keys
                      </th>
                      {COMPARISON.columns.map((c, i) => (
                        <th
                          key={c}
                          scope="col"
                          className={`border-l border-line-mid px-4.5 py-4 text-[13.5px] font-semibold ${
                            i === 0 ? "bg-accent-wash font-bold text-accent" : "text-quiet"
                          }`}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.rows.map(([label, ours, ...theirs]) => (
                      <tr
                        key={label}
                        className="border-b border-line-soft transition-colors duration-150 last:border-b-0 hover:bg-sunken"
                      >
                        <th
                          scope="row"
                          className="px-6 py-4 text-left text-[13.5px] font-medium text-ink"
                        >
                          {label}
                        </th>
                        <td className="border-l border-line-mid bg-accent-wash px-4.5 py-4 text-[13px] font-semibold text-published">
                          {ours}
                        </td>
                        {theirs.map((cell, i) => (
                          <td
                            key={i}
                            className="border-l border-line-mid px-4.5 py-4 text-[13px] text-muted"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Print>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Stagger sticker>
                {TESTIMONIALS.map((t) => (
                  <figure
                    key={t.name}
                    className="pc-lift h-full rounded-2xl border border-line bg-surface p-7 hover:border-accent-line sm:p-8"
                  >
                    <blockquote className="font-display text-[26px] leading-[1.2] font-semibold tracking-[-0.01em] sm:text-[32px]">
                      &ldquo;{t.quote}&rdquo;
                    </blockquote>
                    <figcaption className="mt-6 font-mono text-[12px] tracking-[0.06em] text-muted uppercase">
                      {t.name} — {t.role}
                    </figcaption>
                  </figure>
                ))}
              </Stagger>
            </div>
          </Band>

          {/* ------------------------------------------------------- faq · paper */}
          <Band stage="paper" className="py-20 sm:py-24">
            <div className="grid gap-9 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <H2 className="text-[26px]! tracking-[-0.03em]! sm:text-[32px]!">
                  Questions developers ask first
                </H2>
                <p className="mt-3 text-[15px] leading-[1.6] text-quiet">
                  Anything else, mail{" "}
                  <a href={links.contact} className="font-medium text-accent hover:underline">
                    hello@pagecraft.dev
                  </a>{" "}
                  and a human answers.
                </p>
              </div>
              <dl className="overflow-hidden rounded-xl border border-line bg-surface">
                {FAQS.map((f) => (
                  <details
                    key={f.q}
                    className="group border-b border-line-soft last:border-b-0 [&_summary::-webkit-details-marker]:hidden"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-4.5 text-[14.5px] font-semibold transition-colors duration-150 select-none hover:bg-sunken">
                      {f.q}
                      <span
                        aria-hidden
                        className="shrink-0 text-accent transition-transform duration-200 group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <dd className="px-6 pb-5 text-[13.5px] leading-[1.6] text-quiet">{f.a}</dd>
                  </details>
                ))}
              </dl>
            </div>
          </Band>

          {/* --------------------------------------------- final cta · mint */}
          <Band stage="mint" className="py-20 sm:py-28" bg={<SectionPapers preset="cta" />}>
            <div className="mx-auto max-w-[720px] text-center">
              <Print>
                <h2 className="font-display text-[clamp(3rem,7vw,4.5rem)] leading-[0.95] font-extrabold tracking-[-0.025em] text-ink">
                  <Swash>Ship</Swash> the site.
                  <br />
                  Hand over the words.
                </h2>
              </Print>
              <Print delay={90}>
                <p className="mx-auto mt-6 max-w-[540px] text-[16.5px] leading-[1.6] text-slate">
                  Create an account, bring one client website, and see whether they ever email
                  you a headline change again.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <ButtonLink href={links.signUp} className="px-6! hover:animate-celebrate">
                    Create a free account
                  </ButtonLink>
                  <ButtonLink href={links.signIn} tone="outline" className="px-6!">
                    Explore the dashboard
                  </ButtonLink>
                </div>
              </Print>
            </div>
          </Band>
        </main>
      </StageController>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/**
 * A Sun highlighter struck behind a word — the same stroke the hero uses,
 * revealed left-to-right by a `<Print>`, statically rotated so it reads as a
 * hand-drawn swash. AA never rides on it: the word stays pure ink, and ink on
 * Sun clears AA anyway (10.98:1). The swash span is empty, so it needs no
 * `aria-hidden`.
 */
function Swash({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block align-baseline">
      <Print
        as="span"
        delay={220}
        className="absolute inset-x-[-0.08em] top-[0.18em] bottom-[0.14em] z-0 block -rotate-1 bg-sun"
      >
        {null}
      </Print>
      <span className="relative z-10">{children}</span>
    </span>
  );
}
