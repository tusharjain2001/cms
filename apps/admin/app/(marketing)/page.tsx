import { Hero } from "@/components/landing/hero";
import { PressRun } from "@/components/landing/press-run";
import { SectionTypeGrid } from "@/components/landing/section-types";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { Band, ButtonLink, Eyebrow, H2, Lede } from "@/components/landing/bits";
import { SectionPapers } from "@/components/landing/flying-papers";
import {
  CountUp,
  GhostDrift,
  Print,
  Stagger,
  StageController,
} from "@/components/landing/motion";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { links } from "@/lib/links";
import {
  faqSchema,
  graph,
  jsonLd,
  organizationSchema,
  pageMeta,
  productSchema,
  websiteSchema,
} from "@/lib/site-meta";
import { ONE_MONTH } from "@/lib/pricing";

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

export const metadata: Metadata = pageMeta({
  // Absolute rather than templated: the root template would make this
  // "Pagecraft — … · Pagecraft".
  title: "Pagecraft — a content-only CMS for React and Next.js sites",
  description,
  path: "/",
  keywords: [
    "headless CMS",
    "Next.js CMS",
    "React CMS",
    "client website CMS",
    "content-only CMS",
    "CMS MCP server",
    "AI agent CMS",
    "WordPress alternative for developers",
  ],
});

const STATS = [
  {
    prefix: "~",
    value: 3,
    suffix: "s",
    title: "Publish to live",
    body:
      "Publish fires the site's revalidate webhook. The static page regenerates itself. No deploy, no developer.",
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
const OWNER_PROMISES = [
  {
    title: "From your phone",
    body: "Update today's specials or opening hours from the counter, before the doors open.",
  },
  {
    title: "Nothing breaks",
    body: "You change text and photos. Colours, fonts and layout are locked to the design you paid for.",
  },
  {
    title: "Preview, then publish",
    body: "See it privately first. One tap on Publish and the live site updates in seconds.",
  },
  {
    title: "Nobody to wait for",
    body: "Add a page, hide a section, swap a photo — without emailing anyone or paying for edits.",
  },
];

/**
 * The MCP band's three claims.
 *
 * Each one answers the objection that actually stops a developer: "an AI will
 * fill my client's site with rubbish", "it will publish something", "I am not
 * putting my password in a config file". Every answer is a mechanism that
 * already exists rather than a promise — which is the only kind of reassurance
 * worth printing.
 */
const AGENT_GUARDS = [
  {
    title: "It cannot invent anything",
    body:
      "The section registry is the schema. An agent can only fill fields you defined, on section types you switched on, within the limits you set. The API refuses the rest — the same refusal a person gets.",
  },
  {
    title: "Nothing goes live by accident",
    body:
      "Every write tool edits the draft. Publishing is one separate tool, and read-only mode removes all sixteen writes from the list entirely, so an assistant cannot reach for one.",
  },
  {
    title: "A token, not your password",
    body:
      "Mint a write token for one website on its Integration screen. It reaches that site and nothing else, it never expires, and revoking it costs one click and no password reset.",
  },
];

/** Things a developer actually types at it, in the order they would. */
const AGENT_PROMPTS = [
  "What section types is this website allowed to use?",
  "Draft an About page from this PDF, then show me the draft.",
  "Upload these six photos, write alt text, put them in the gallery.",
  "Give every page a search description under 160 characters.",
];

const FAQS = [
  {
    q: "I run the website, not build it. Do I need to know any code?",
    a: "No. You see plain fields — a headline, a paragraph, a photo — and a Publish button. Colours, fonts and layout are not yours to break, so there is nothing to learn and nothing to be careful about.",
  },
  {
    q: "What if I make a mistake?",
    a: "Nothing goes live until you press Publish, and you can preview privately first. Change your mind and Discard puts back exactly what the live site shows now.",
  },
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
    q: "Can I let an AI assistant build the content?",
    a: "Yes — that is what the MCP server is for. Claude, Cursor, Copilot and anything else that speaks MCP get 26 tools over the same REST API the dashboard uses, so the section registry, the field limits and the draft-until-Publish rule all still apply. An agent cannot invent a section type or change a colour any more than your client can.",
  },
  {
    q: "What happens to my client's site if they stop paying?",
    a: "The pages already published on their CDN keep serving — a billing problem never takes a live website down. Only editing stops, content stays readable for 30 days, and it exports as JSON at any time.",
  },
];

/**
 * A phone, drawn in markup: the owner's whole job in one screen — a section
 * card, a headline field, a photo, and the blue button. Decorative; the copy
 * beside it carries the meaning.
 */
function OwnerPhone() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[340px]">
      {/* sheets behind, like the hero */}
      <div className="absolute -top-4 -left-6 h-[120px] w-[92px] -rotate-[9deg] rounded-[7px] border border-ink/12 bg-wash-butter shadow-[0_10px_30px_-14px_rgba(27,30,36,0.45)]" />
      <div className="absolute -right-8 bottom-6 h-[110px] w-[86px] rotate-[8deg] rounded-[7px] border border-ink/12 bg-wash-mint shadow-[0_10px_30px_-14px_rgba(27,30,36,0.45)]" />

      <div className="relative rounded-[36px] border border-ink/20 bg-plate p-2.5 shadow-[0_44px_90px_-40px_rgba(27,30,36,0.55)]">
        <div className="overflow-hidden rounded-[28px] bg-canvas">
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pt-3 pb-1 font-mono text-[10px] text-quiet">
            <span>7:42</span>
            <span className="h-[5px] w-[54px] rounded-full bg-ink/70" />
            <span>●●●</span>
          </div>
          {/* header */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="font-mono text-[10.5px] tracking-[0.08em] text-quiet uppercase">Home</span>
            <span className="rounded-full bg-draft-bg px-2 py-[2px] font-mono text-[9.5px] font-semibold text-draft-ink">
              Draft
            </span>
          </div>
          {/* section cards */}
          <div className="space-y-1.5 px-3">
            <div className="rounded-lg border border-accent-line bg-accent-wash px-3 py-2 text-[12px] font-semibold text-ink">
              Main banner
            </div>
            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-quiet">
              Today&apos;s specials
            </div>
          </div>
          {/* the form */}
          <div className="mt-3 border-t border-line bg-surface px-4 pt-3.5 pb-4">
            <p className="font-mono text-[10px] tracking-[0.08em] text-quiet uppercase">Headline</p>
            <div className="mt-1.5 rounded-lg border border-accent bg-surface px-3 py-2 text-[13px] text-ink shadow-[0_0_0_3px_var(--color-accent-soft)]">
              Fresh sourdough, every morning
              <span className="ml-[1px] inline-block h-[14px] w-[1.5px] translate-y-[2px] animate-heartbeat bg-accent" />
            </div>
            <p className="mt-3.5 font-mono text-[10px] tracking-[0.08em] text-quiet uppercase">Photo</p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className="h-11 w-16 rounded-md bg-wash-sky" />
              <span className="text-[11.5px] font-medium text-accent">Choose from camera roll</span>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[11px] text-quiet">Saved just now</span>
              <span className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-semibold text-surface shadow-[0_6px_16px_-8px_var(--color-accent)]">
                Publish
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div id="top" className="min-h-screen">
      {/*
        One `@graph` rather than four scripts, so the nodes can point at each
        other by `@id` instead of each restating the publisher.

        The FAQ node is built from the same `FAQS` array the page renders, so
        the structured data and the visible answers can never disagree — which
        matters beyond tidiness: Google treats an FAQ marked up but not shown
        on the page as a manual-action offence.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            graph(organizationSchema(), websiteSchema(), productSchema(), faqSchema(FAQS))
          ),
        }}
      />
      <SiteNav />

      <StageController>
        <main>
          {/* ---------------------------------------------------- hero · paper */}
          <div data-stage="paper">
            <Hero />
          </div>

          {/* --------------------------- press run · sky (publish pipeline) */}
          <Band stage="sky" id="how" className="py-20 sm:py-24">
            <PressRun />
          </Band>

          {/* ------------------------------------- for site owners · paper */}
          <Band stage="paper" id="owners" className="py-20 sm:py-24">
            <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <Print>
                  <Eyebrow>For site owners</Eyebrow>
                </Print>
                <Print delay={70}>
                  <H2 className="mt-3">Change the words. Press Publish. Done.</H2>
                </Print>
                <Print delay={140}>
                  <Lede className="mt-4">
                    You do not need to be a computer person. Your website is a short list of
                    sections, each with a few plain fields, and the only button that matters is
                    the blue one.
                  </Lede>
                </Print>
                <Print delay={200}>
                  <ul className="mt-7 grid gap-3.5 sm:grid-cols-2">
                    {OWNER_PROMISES.map((item) => (
                      <li
                        key={item.title}
                        className="rounded-xl border border-line bg-surface p-4.5 transition-colors hover:border-accent-line"
                      >
                        <span className="flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.06em] text-ink uppercase">
                          <span aria-hidden className="text-published">✓</span>
                          {item.title}
                        </span>
                        <p className="mt-1.5 text-[13.5px] leading-[1.55] text-quiet">{item.body}</p>
                      </li>
                    ))}
                  </ul>
                </Print>
                <Print delay={260}>
                  <div className="mt-7 flex flex-wrap items-center gap-4">
                    <ButtonLink href={links.signUp}>Start free · no card</ButtonLink>
                    <span className="text-[13.5px] text-quiet">
                      One page free, for as long as you like. {ONE_MONTH} a month when your site
                      needs more. Your developer connects it once.
                    </span>
                  </div>
                </Print>
              </div>

              <Print delay={180}>
                <OwnerPhone />
              </Print>
            </div>
          </Band>

          {/* ------------------------------------- stats · paper */}
          <Band stage="paper" className="py-20 sm:py-24" bg={<SectionPapers preset="stats" />}>
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

          {/* --------------------------------- coding agents · butter (MCP) */}
          {/*
            The band the plate one hands off to: having just shown a developer
            the code they write, show them the part they do not have to.

            It sits on butter — the one wash the band map keeps between plate
            and lilac — so the ramp reads paper → sky → paper → plate → butter →
            paper → lilac → mint and the stage lights still cross-fade in order.
          */}
          <Band stage="butter" id="agent" className="py-20 sm:py-24">
            <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <Print>
                  <Eyebrow>Model Context Protocol</Eyebrow>
                </Print>
                <Print delay={70}>
                  <H2 className="mt-3">Your coding agent can build the site too.</H2>
                </Print>
                <Print delay={140}>
                  <Lede className="mt-4">
                    Point Claude, Cursor or Copilot at a Pagecraft website and it gets 26 tools:
                    read the section types, draft pages, fill sections, upload photos, write alt
                    text, publish. Not a chat box bolted onto a dashboard — the same REST API the
                    dashboard itself calls.
                  </Lede>
                </Print>

                <Print delay={200}>
                  <ul className="mt-7 flex flex-col gap-3.5">
                    {AGENT_GUARDS.map((item) => (
                      <li
                        key={item.title}
                        className="rounded-xl border border-ink/12 bg-surface/70 p-4.5 transition-colors hover:border-accent-line"
                      >
                        <span className="flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.06em] text-ink uppercase">
                          <span aria-hidden className="text-published">✓</span>
                          {item.title}
                        </span>
                        <p className="mt-1.5 text-[13.5px] leading-[1.55] text-quiet">
                          {item.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Print>

                <Print delay={260}>
                  <div className="mt-7 flex flex-wrap items-center gap-4">
                    <ButtonLink href={`${links.docs}#agent`}>Set it up</ButtonLink>
                    <span className="text-[13.5px] text-quiet">
                      One block of JSON in your MCP client. Nothing to install —{" "}
                      <code className="font-mono text-[12.5px] text-slate">npx</code> fetches it.
                    </span>
                  </div>
                </Print>
              </div>

              {/* The config, then what you say to it — the two halves of
                  actually using this, in the order you meet them. */}
              <Print delay={180}>
                <div className="overflow-hidden rounded-xl border border-ink/15 bg-plate">
                  <div className="border-b border-canvas/12 px-4 py-2.5 font-mono text-[11px] text-canvas/60">
                    claude_desktop_config.json
                  </div>
                  <pre className="overflow-x-auto px-5 py-4.5 font-mono text-[12.5px] leading-[1.85] text-canvas/90">
                    <code>
                      <span className="text-canvas/60">{"// nothing to install — npx fetches it"}</span>
                      {"\n{\n  "}
                      <span className="text-canvas/70">&quot;mcpServers&quot;</span>
                      {": {\n    "}
                      <span className="text-canvas/70">&quot;pagecraft&quot;</span>
                      {": {\n      command: "}
                      <span className="text-mint-pop">&quot;npx&quot;</span>
                      {",\n      args: ["}
                      <span className="text-mint-pop">&quot;-y&quot;</span>
                      {", "}
                      <span className="text-mint-pop">&quot;@mypagecraft/mcp&quot;</span>
                      {"],\n      env: {\n        "}
                      <span className="text-sun">PAGECRAFT_API_URL</span>
                      {": "}
                      <span className="text-mint-pop">&quot;https://api.yoursite.com&quot;</span>
                      {",\n        "}
                      <span className="text-sun">PAGECRAFT_PROJECT_TOKEN</span>
                      {": "}
                      <span className="text-mint-pop">&quot;pct_…&quot;</span>
                      {"\n      }\n    }\n  }\n}"}
                    </code>
                  </pre>

                  <div className="border-t border-canvas/12 px-5 py-4">
                    <p className="font-mono text-[11px] tracking-[0.08em] text-canvas/50 uppercase">
                      Then just ask
                    </p>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {AGENT_PROMPTS.map((prompt) => (
                        <li key={prompt} className="flex items-start gap-2.5">
                          <span aria-hidden className="mt-px shrink-0 font-mono text-mint-pop">
                            ›
                          </span>
                          <span className="text-[13.5px] leading-[1.5] text-canvas/85">
                            {prompt}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Print>
            </div>
          </Band>

          {/* ------------------------- section types · paper (the sheets, landed) */}
          <Band
            stage="paper"
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
                    reads the field definitions and builds the form itself, so you never write
                    an admin screen again.
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

          {/* ------------------------------------------------------- faq · lilac */}
          <Band stage="lilac" id="faq" className="py-20 sm:py-24" bg={<SectionPapers preset="faq" />}>
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
              <div className="max-w-[560px]">
                <Print>
                  <Eyebrow>FAQ</Eyebrow>
                </Print>
                <Print delay={70}>
                  <H2 className="mt-3">Questions owners and developers ask first.</H2>
                </Print>
              </div>
              <Print delay={140}>
                <p className="max-w-[300px] text-[14.5px] leading-[1.55] text-quiet">
                  Anything else, mail{" "}
                  <a href={links.contactEmail} className="font-medium text-accent hover:underline">
                    {links.contactAddress}
                  </a>{" "}
                  and a human answers, usually the same day.
                </p>
              </Print>
            </div>

            {/* The ledger: no card, just ink rules on the wash. Each row is a
                native <details>; the open question earns a highlighter stroke
                (sun — the one place it is allowed to touch text). */}
            <dl className="mt-10 border-t border-ink/20">
              <Stagger>
                {FAQS.map((f, i) => (
                  <details
                    key={f.q}
                    open={i === 0}
                    className="group border-b border-ink/15 [&_summary::-webkit-details-marker]:hidden"
                  >
                    <summary className="flex cursor-pointer items-start gap-5 py-6 select-none sm:gap-8 sm:py-7">
                      <span className="mt-[5px] inline-flex shrink-0 rounded-[4px] bg-surface px-1.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-quiet transition-colors duration-200 group-open:bg-sun group-open:text-sun-ink sm:mt-[9px]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 font-display text-[20px] leading-[1.15] font-bold tracking-[-0.015em] text-ink sm:text-[27px]">
                        <span className="bg-[linear-gradient(transparent_62%,var(--color-sun)_62%,var(--color-sun)_92%,transparent_92%)] bg-[length:0%_100%] bg-left bg-no-repeat transition-[background-size] duration-500 ease-out group-open:bg-[length:100%_100%]">
                          {f.q}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="mt-[2px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/20 text-[18px] leading-none text-ink transition-[transform,background-color,color,border-color] duration-200 group-hover:border-accent group-hover:text-accent group-open:rotate-45 group-open:border-accent group-open:bg-accent group-open:text-surface sm:mt-[6px]"
                      >
                        +
                      </span>
                    </summary>
                    <dd className="flex gap-5 pb-7 sm:gap-8">
                      <span
                        aria-hidden
                        className="w-[26px] shrink-0 text-right font-display text-[27px] leading-none font-extrabold text-accent sm:w-[30px]"
                      >
                        A
                      </span>
                      <p className="max-w-[640px] text-[15.5px] leading-[1.6] text-slate sm:text-[16.5px]">
                        {f.a}
                      </p>
                    </dd>
                  </details>
                ))}
              </Stagger>
            </dl>

            {/* The last line of the ledger: the docs, for people who would rather read. */}
            <Print delay={120}>
              <a
                href={links.docs}
                className="group flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-ink/15 py-6 sm:gap-8 sm:py-7"
              >
                <span className="inline-flex shrink-0 rounded-[4px] bg-surface px-1.5 py-[3px] font-mono text-[11px] font-semibold tracking-[0.08em] text-quiet uppercase">
                  Docs
                </span>
                <span className="flex-1 font-display text-[20px] leading-[1.15] font-bold tracking-[-0.015em] text-ink sm:text-[27px]">
                  Prefer to read? The full documentation.
                </span>
                <span className="font-mono text-[12.5px] font-semibold tracking-[0.04em] text-accent transition-transform duration-200 group-hover:translate-x-1">
                  Read the docs →
                </span>
              </a>
            </Print>
          </Band>

          {/* --------------------------------------------- final cta · mint */}
          <Band stage="mint" className="py-20 sm:py-28" bg={<SectionPapers preset="cta" />}>
            <div className="mx-auto max-w-[720px] text-center">
              <Print>
                <h2 className="font-display text-[clamp(3rem,7vw,4.5rem)] leading-[0.95] font-extrabold tracking-[-0.025em] text-ink">
                  <Swash>One</Swash> site.
                  <br />
                  Two happy people.
                </h2>
              </Print>
              <Print delay={90}>
                <p className="mx-auto mt-6 max-w-[540px] text-[16.5px] leading-[1.6] text-slate">
                  Developers: wire up one site in an afternoon. Owners: change a headline
                  tonight without asking anyone. Either way, start here.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <ButtonLink href={links.signUp} className="px-6! hover:animate-celebrate">
                    Start free · no card
                  </ButtonLink>
                  <ButtonLink href={links.docs} tone="outline" className="px-6!">
                    Read the developer docs
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
