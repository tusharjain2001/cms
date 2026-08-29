import { EditorMock } from "@/components/landing/editor-mock";
import { SectionTypeGrid } from "@/components/landing/section-types";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import {
  Band,
  ButtonLink,
  Check,
  Cross,
  Eyebrow,
  H2,
  Lede,
  MaybeLink,
} from "@/components/landing/bits";
import type { Metadata } from "next";
import { links } from "@/lib/links";

/**
 * The landing page — the front door of the same app that serves the dashboard.
 *
 * It sits outside `app/(dash)`, so it is the one route with no session
 * provider above it. Every band is a server component and the page ships no
 * client JavaScript of its own, which means Next prerenders it to plain HTML
 * at build time and search engines get the real text. Nothing here needs to be
 * interactive: the one piece that looks like a running app, the editor mock,
 * is markup rather than a script or a screenshot.
 */

const description =
  "Build client websites in React and let the owner edit the words and photos. They change text and images in a dashboard a bakery owner can use; they never touch a colour, a font or a layout.";

export const metadata: Metadata = {
  // Overrides the "%s · Pagecraft" template — the front page states the whole name.
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

const STATS = [
  {
    figure: "~3s",
    title: "Publish to live",
    body: "Publish fires the site's revalidate webhook. The static page regenerates itself — no deploy, no developer.",
  },
  {
    figure: "9",
    title: "Section types, out of the box",
    body: "Hero, Features, Product Grid, Gallery, Testimonials, FAQ, CTA, Contact, Text Block. Adding your own is one file.",
  },
  {
    figure: "1",
    title: "Instance, every client site",
    body: "Each website is a project with its own key, its own library, and its own allowed sections.",
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
    <div id="top" className="min-h-screen bg-canvas">
      <SiteNav />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <Band className="animate-rise pt-16 text-center sm:pt-[76px]">
          <p className="mb-5.5 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-semibold text-accent">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            For freelance developers and small studios
          </p>
          <h1 className="mx-auto max-w-[840px] text-[38px] leading-[1.05] font-bold tracking-[-1.2px] sm:text-[52px] lg:text-[60px] lg:leading-[1.03] lg:tracking-[-1.6px]">
            Your React code.
            <br />
            Your client&rsquo;s words.
          </h1>
          <p className="mx-auto mt-5.5 max-w-[620px] text-[16.5px] leading-[1.6] text-quiet sm:text-[18px]">
            Pagecraft is a headless CMS for the websites you build by hand. Clients edit text and
            photos in a dashboard a bakery owner can use. They never touch a colour, a font or a
            layout.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <ButtonLink href={links.signUp}>Create a free account</ButtonLink>
            <ButtonLink href={links.developers} tone="outline">
              See how it works
            </ButtonLink>
          </div>
          <p className="mt-4 text-label text-muted">
            Fourteen days free · No card to start · Bring your own Next.js sites
          </p>
        </Band>

        {/* --------------------------------------------- the product, shown */}
        <Band className="pt-11 sm:pt-13">
          <EditorMock />
        </Band>

        {/* ----------------------------------------------------------- stats */}
        <Band className="pt-16">
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
            {STATS.map((s) => (
              <div key={s.title} className="bg-surface px-6 py-6.5">
                <p className="text-[30px] font-bold tracking-[-.8px] text-accent">{s.figure}</p>
                <h2 className="mt-2 text-sub font-semibold">{s.title}</h2>
                <p className="mt-1 text-label leading-[1.5] text-quiet">{s.body}</p>
              </div>
            ))}
          </div>
        </Band>

        {/* --------------------------------------------------- how it works */}
        <Band id="how" className="scroll-mt-20 pt-20 sm:pt-22">
          <div className="max-w-[620px]">
            <Eyebrow>How it works</Eyebrow>
            <H2 className="mt-3">You keep the design. They keep the words.</H2>
            <Lede className="mt-3.5">
              Three moving parts, and only one of them belongs to your client.
            </Lede>
          </div>

          <ol className="mt-8 grid gap-4 lg:grid-cols-3">
            <li className="rounded-xl border border-line bg-surface p-5.5">
              <StepHead n={1}>You build the sections</StepHead>
              <div className="mb-3.5 flex h-28 flex-col gap-1.5 rounded-[9px] border border-line-mid bg-sunken p-3">
                <p className="font-mono text-[10.5px] text-muted">components/sections/</p>
                <div className="flex flex-col gap-[5px]">
                  {["Hero.tsx", "Features.tsx", "ProductGrid.tsx"].map((f) => (
                    <span key={f} className="flex items-center gap-[7px]">
                      <span aria-hidden className="h-[5px] w-[5px] rounded-[1px] bg-accent" />
                      <span className="font-mono text-[10.5px] text-slate">{f}</span>
                    </span>
                  ))}
                  <span className="flex items-center gap-[7px]">
                    <span aria-hidden className="h-[5px] w-[5px] rounded-[1px] bg-field" />
                    <span className="font-mono text-[10.5px] text-faint">…six more</span>
                  </span>
                </div>
              </div>
              <p className="text-sub leading-[1.6] text-quiet">
                One React component per section type, in your own Next.js project. Tailwind, CSS
                modules, whatever you already use. Nothing about layout or colour ever comes from
                the CMS.
              </p>
            </li>

            <li className="rounded-xl border border-line bg-surface p-5.5">
              <StepHead n={2}>Your client fills them in</StepHead>
              <div className="mb-3.5 flex h-28 flex-col gap-1.5 rounded-[9px] border border-line-mid bg-sunken p-2.5">
                {["Main Banner", "Why Choose Us", "Our Breads"].map((name, i) => (
                  <span
                    key={name}
                    className={`flex items-center gap-[7px] rounded-[7px] border bg-surface px-2 py-[7px] ${
                      i === 0
                        ? "border-accent shadow-[0_0_0_2px_#eaeff9]"
                        : "border-line"
                    }`}
                  >
                    <span aria-hidden className="text-[11px] tracking-[-1px] text-grip">
                      ⠿
                    </span>
                    <span className="truncate text-tiny font-semibold">{name}</span>
                    <span aria-hidden className="ml-auto text-[9px] text-muted">
                      ◉
                    </span>
                  </span>
                ))}
              </div>
              <p className="text-sub leading-[1.6] text-quiet">
                Add, remove, reorder, hide, type. Plain-English labels, character counts, one clear
                Publish button. No colour pickers, no fonts, no drag-and-drop canvas.
              </p>
            </li>

            <li className="rounded-xl border border-line bg-surface p-5.5">
              <StepHead n={3}>The live site updates itself</StepHead>
              <div className="mb-3.5 flex h-28 flex-col justify-center gap-2.5 rounded-[9px] border border-line-mid bg-sunken p-3">
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-accent px-2.5 py-1 text-[10.5px] font-semibold text-white">
                    Publish
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-field" />
                  <span className="font-mono text-[10px] text-muted">POST /revalidate</span>
                </span>
                <span className="flex items-center gap-2 rounded-[7px] border border-published-line bg-published-bg px-2.5 py-[7px]">
                  <span aria-hidden className="text-[10px] text-published">
                    ◉
                  </span>
                  <span className="truncate text-[10.5px] font-medium text-published-ink">
                    rosewaterbakehouse.com regenerated
                  </span>
                </span>
              </div>
              <p className="text-sub leading-[1.6] text-quiet">
                Publish copies the draft over the live content and calls your revalidate webhook.
                Static-speed pages that stay current. Pages added after your last deploy still work.
              </p>
            </li>
          </ol>
        </Band>

        {/* -------------------------------------------------- can't do / can */}
        <Band className="pt-20 sm:pt-22">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="grid md:grid-cols-2">
              <div className="border-b border-line-mid p-8 md:border-r md:border-b-0 md:px-8.5 md:py-9">
                <Eyebrow tone="muted">What your client cannot do</Eyebrow>
                <ul className="mt-3.5 flex flex-col gap-2.5">
                  {CANNOT.map((item) => (
                    <Cross key={item}>{item}</Cross>
                  ))}
                </ul>
              </div>
              <div className="bg-[#fbfcfe] p-8 md:px-8.5 md:py-9">
                <Eyebrow>What they can do, on their phone, unsupervised</Eyebrow>
                <ul className="mt-3.5 flex flex-col gap-2.5">
                  {CAN.map((item) => (
                    <Check key={item}>{item}</Check>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3.5 border-t border-line-mid bg-sunken px-8 py-4.5">
              <p className="text-sub text-quiet">
                Blank required fields are tolerated while they type, and only checked the moment
                they press Publish — with the error shown on the field, in plain English.
              </p>
              <a
                href={links.signIn}
                className="ml-auto text-sub font-semibold text-accent hover:underline"
              >
                Open the dashboard →
              </a>
            </div>
          </div>
        </Band>

        {/* --------------------------------------------------- section types */}
        <Band id="sections" className="scroll-mt-20 pt-20 sm:pt-22">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div className="max-w-[600px]">
              <Eyebrow>Section types</Eyebrow>
              <H2 className="mt-3">Nine to start with. Add your own in one file.</H2>
              <Lede className="mt-3.5">
                A section type is a set of fields plus your React component. The dashboard reads the
                field definitions and builds the form itself — you never write an admin screen
                again.
              </Lede>
            </div>
            <code className="rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-label text-muted">
              packages/shared/src/registry.ts
            </code>
          </div>
          <SectionTypeGrid />
        </Band>

        {/* ------------------------------------------------- for developers */}
        <Band id="code" className="scroll-mt-20 pt-20 sm:pt-22">
          <div className="grid items-center gap-9 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <Eyebrow>For developers</Eyebrow>
              <H2 className="mt-3">Fifteen lines to wire a site up.</H2>
              <Lede className="mt-3.5">
                Install the SDK, map section types to your components, add a revalidate route.
                Type-safe end to end, no admin UI to maintain, and a CMS outage never fails your
                build.
              </Lede>
              <ul className="mt-5.5 flex flex-col gap-2.5">
                <Check>TypeScript types generated from your own field definitions</Check>
                <Check>ISR and on-demand revalidation, or plain runtime fetching</Check>
                <Check>Signed direct-to-CDN uploads, resized image URLs included</Check>
                <Check>Content exports as JSON — nothing about it is locked in</Check>
              </ul>
              <div className="mt-6.5 flex flex-wrap gap-2.5">
                <MaybeLink
                  href={links.docs}
                  className="inline-block rounded-lg border border-btn bg-surface px-4.5 py-2.5 text-sub font-semibold transition-colors hover:border-btn-hover"
                >
                  Read the docs
                </MaybeLink>
                <MaybeLink
                  href={links.github}
                  className="inline-block rounded-lg border border-btn bg-surface px-4.5 py-2.5 text-sub font-semibold transition-colors hover:border-btn-hover"
                >
                  View on GitHub
                </MaybeLink>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-field bg-surface shadow-[0_24px_50px_-40px_rgba(30,35,45,.4)]">
              <div className="flex gap-0.5 border-b border-line bg-chip-hover px-3 pt-2.5">
                <span className="-mb-px rounded-t-md border border-line border-b-surface bg-surface px-3 py-[7px] font-mono text-micro font-medium">
                  registry.ts
                </span>
                <span className="px-3 py-[7px] font-mono text-micro text-muted">page.tsx</span>
                <span className="px-3 py-[7px] font-mono text-micro text-muted">revalidate.ts</span>
              </div>
              <pre className="overflow-x-auto px-5 py-4.5 font-mono text-[12.5px] leading-[1.85] text-slate">
                <code>
                  <span className="text-muted">{"// one entry = one section type + its form"}</span>
                  {"\nhero: {\n  label: "}
                  <span className="text-published">&quot;Hero&quot;</span>
                  {",\n  description: "}
                  <span className="text-published">&quot;Big photo, headline, buttons&quot;</span>
                  {",\n  fields: {\n    heading:    text({ max: "}
                  <span className="text-destructive">140</span>
                  {", required: "}
                  <span className="text-destructive">true</span>
                  {" }),\n    subheading: para({ max: "}
                  <span className="text-destructive">260</span>
                  {" }),\n    backgroundImage: image(),\n    buttons: list(\n      { label: text({ max: "}
                  <span className="text-destructive">24</span>
                  {" }), href: link() },\n      { max: "}
                  <span className="text-destructive">3</span>
                  {" }\n    ),\n  },\n}\n\n"}
                  <span className="text-muted">{"// and on the website"}</span>
                  {"\n<"}
                  <span className="text-accent">SectionRenderer</span>
                  {"\n  sections={page.sections}\n  components={{ hero: Hero, features: Features }}\n/>"}
                </code>
              </pre>
            </div>
          </div>
        </Band>

        {/* ------------------------------------------------------ comparison */}
        <Band className="pt-20 sm:pt-22">
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-sunken">
                  <th
                    scope="col"
                    className="w-[34%] px-5.5 py-4 text-label font-semibold text-muted"
                  >
                    Handing a client the keys
                  </th>
                  {COMPARISON.columns.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={`border-l border-line-mid px-4.5 py-4 text-sub font-semibold ${
                        i === 0 ? "font-bold text-accent" : "text-quiet"
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.rows.map(([label, ours, ...theirs]) => (
                  <tr key={label} className="border-b border-line-soft last:border-b-0">
                    <th
                      scope="row"
                      className="px-5.5 py-4 text-left text-sub font-medium text-ink"
                    >
                      {label}
                    </th>
                    <td className="border-l border-line-mid px-4.5 py-4 text-label font-semibold text-published">
                      {ours}
                    </td>
                    {theirs.map((cell, i) => (
                      <td
                        key={i}
                        className="border-l border-line-mid px-4.5 py-4 text-label text-muted"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Band>

        {/* ---------------------------------------------------- testimonials */}
        <Band className="pt-20 sm:pt-22">
          <div className="grid gap-4 md:grid-cols-2">
            <Quote
              initials="MK"
              name="Maya Kessler"
              role="Stella Digital · 11 client websites"
              tone="accent"
            >
              I used to charge for content edits and lose the client anyway. Now the bakery updates
              its own specials before 6am and my design still looks like my design.
            </Quote>
            <Quote
              initials="PR"
              name="Priya Raval"
              role="Owner, Rosewater Bakehouse"
              tone="warm"
            >
              I am not a computer person. I change the photo, press the blue button, and the website
              is right. That is the whole thing I needed.
            </Quote>
          </div>
        </Band>

        {/* ------------------------------------------------------------- faq */}
        <Band className="pt-20 sm:pt-22">
          <div className="grid gap-9 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <H2 className="text-[26px]! sm:text-[32px]! tracking-[-.8px]!">
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
                <div key={f.q} className="border-b border-line-soft px-6 py-5 last:border-b-0">
                  <dt className="text-[14.5px] font-semibold">{f.q}</dt>
                  <dd className="mt-1.5 text-sub leading-[1.6] text-quiet">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Band>

        {/* ------------------------------------------------------ closing cta */}
        <Band className="pt-20 pb-24 sm:pt-22">
          <div className="rounded-2xl border border-accent-line bg-[linear-gradient(180deg,var(--color-accent-wash),var(--color-accent-soft))] px-8 py-12 text-center sm:px-10 sm:py-14">
            <H2>Stop being your client&rsquo;s copy editor.</H2>
            <p className="mx-auto mt-4 max-w-[540px] text-[15.5px] leading-[1.6] text-slate sm:text-[16.5px]">
              Create an account, bring one client website, and see whether they ever email you a
              headline change again.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2.5">
              <ButtonLink href={links.signUp} className="px-6!">
                Create a free account
              </ButtonLink>
              <ButtonLink href={links.signIn} tone="outline-accent" className="px-6!">
                Explore the dashboard
              </ButtonLink>
            </div>
          </div>
        </Band>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function StepHead({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="mb-4 flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-accent-soft text-tiny font-bold text-accent"
      >
        {n}
      </span>
      <span className="text-[14.5px] font-semibold">{children}</span>
    </h3>
  );
}

function Quote({
  initials,
  name,
  role,
  tone,
  children,
}: {
  initials: string;
  name: string;
  role: string;
  tone: "accent" | "warm";
  children: React.ReactNode;
}) {
  return (
    <figure className="rounded-2xl border border-line bg-surface p-7 sm:p-8">
      <blockquote className="text-[17.5px] leading-[1.6] tracking-[-.2px] sm:text-[19px]">
        &ldquo;{children}&rdquo;
      </blockquote>
      <figcaption className="mt-5.5 flex items-center gap-2.5">
        <span
          aria-hidden
          className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-helper font-bold ${
            tone === "accent" ? "bg-accent-tint text-accent" : "bg-[#f4e7dc] text-[#a1552d]"
          }`}
        >
          {initials}
        </span>
        <span>
          <span className="block text-sub font-semibold">{name}</span>
          <span className="block text-mid text-muted">{role}</span>
        </span>
      </figcaption>
    </figure>
  );
}
