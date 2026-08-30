import type { Metadata } from "next";
import Link from "next/link";
import { SECTION_REGISTRY, type FieldDef } from "@pagecraft/shared";
import { Band, ButtonLink, Eyebrow } from "@/components/landing/bits";
import { Print } from "@/components/landing/motion";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { links } from "@/lib/links";
import { ONE_MONTH } from "@/lib/pricing";

/**
 * The public developer documentation — the quietest page on the site
 * (direction.md §5.12): Paper only, no bands, no marquee, no plate, no stage
 * light. Content prints in once on reveal (<Print>) and then holds perfectly
 * still; there is zero idle motion here. It reads fully with JavaScript
 * disabled — the reveals are visible pre-hydration and the section reference is
 * server-rendered.
 *
 * It exists because developers read docs BEFORE creating an account, and until
 * this page there was nothing to read — the only integration guide lived
 * behind the login, which is the wrong way round for a product a developer has
 * to say yes to.
 *
 * A server component, and deliberately so: it imports `SECTION_REGISTRY`
 * directly, so the section reference below can never drift from what the API
 * actually validates. That is a server-only import — this page is prerendered
 * to static HTML, so nothing from `@pagecraft/shared` (Zod included) reaches
 * the browser. Keep it that way: no "use client" in this file.
 *
 * Everything here is deliberately framework-plain `fetch` — no dependency to
 * install, so it runs anywhere as-is. `@mypagecraft/sdk` is on npm for anyone
 * who wants a typed client, but the docs stay copy-paste-runnable without it.
 */

const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "https://api.mypagecraft.com";

const description =
  "Connect any React or Next.js site to Pagecraft. Four read-only endpoints, one API key, and your client edits the words while you keep the design.";

export const metadata: Metadata = {
  title: "Developer docs",
  description,
  openGraph: {
    type: "website",
    siteName: "Pagecraft",
    title: "Developer docs · Pagecraft",
    description,
  },
};

const TOC: [string, string][] = [
  ["idea", "How it fits together"],
  ["start", "Quick start"],
  ["api", "The API"],
  ["sections", "Section types"],
  ["notes", "Worth knowing"],
];

/* ------------------------------------------------------------------ pieces */

/** A code block. The code sits on `--color-sunken` — quieter than a surface
 *  card, the docs page's one nod to the press palette (direction.md §5.12). */
function Code({ children, file }: { children: string; file?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-sunken">
      {file && (
        <div className="border-b border-line bg-surface px-4 py-2 font-mono text-micro text-muted">
          {file}
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-mid leading-[1.7] text-slate">
        {children}
      </pre>
    </div>
  );
}

/**
 * A documentation section. Its heading is Karla, not the Bricolage display H2:
 * these titles sit well below 32px and the display face is never set that small
 * (direction.md §4). The whole section prints in once on reveal and then holds
 * still — the `id` lives on the outer element so the TOC anchors still work
 * with JS off.
 */
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 pt-16">
      <Print>
        <h2 className="text-[24px] font-bold tracking-[-0.5px] sm:text-[27px]">{title}</h2>
        <div className="mt-4 flex flex-col gap-4">{children}</div>
      </Print>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[68ch] text-[15px] leading-[1.7] text-quiet">{children}</p>;
}

/** What a field looks like in JSON — the half the registry's labels do not say. */
function shapeOf(field: FieldDef): string {
  switch (field.kind) {
    case "text":
    case "para":
      return field.max ? `string, up to ${field.max} chars` : "string";
    case "link":
      return "string";
    case "image":
      return "{ url, width, height, alt }";
    case "file":
      return "{ url, name, bytes }";
    case "select":
      return field.options.map((o) => `"${o}"`).join(" | ");
    case "toggle":
      return "boolean";
    case "list": {
      const limits = [field.min ? `min ${field.min}` : "", field.max ? `max ${field.max}` : ""]
        .filter(Boolean)
        .join(", ");
      return `array${limits ? `, ${limits}` : ""}`;
    }
  }
}

function flatten(fields: FieldDef[], depth = 0): { field: FieldDef; depth: number }[] {
  return fields.flatMap((field) =>
    field.kind === "list" ? [{ field, depth }, ...flatten(field.of, depth + 1)] : [{ field, depth }]
  );
}

/* -------------------------------------------------------------------- page */

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteNav active="docs" />

      <main className="mx-auto max-w-[1160px] px-5 pb-24 sm:px-8">
        <Band className="px-0! pt-14 sm:pt-17">
          <Print>
            <Eyebrow>Developer docs</Eyebrow>
            <h1 className="mt-3 max-w-[720px] text-[34px] leading-[1.08] font-bold tracking-[-1.1px] sm:text-[42px]">
              Your design. Their words. No deploy in between.
            </h1>
            <p className="mt-4.5 max-w-[620px] text-[16px] leading-[1.65] text-quiet sm:text-[17px]">
              Pagecraft serves content as plain JSON over four read-only endpoints. You write the
              React; your client writes the words and presses Publish; the live page regenerates in
              seconds. There is no template language, no theme system and nothing to learn beyond{" "}
              <code className="font-mono text-mid text-slate">fetch</code>.
            </p>
          </Print>
        </Band>

        <div className="grid gap-12 lg:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            {/* ------------------------------------------------------- idea */}
            <Section id="idea" title="How it fits together">
              <P>
                A <strong>page</strong> is a list of <strong>sections</strong>. Each section has a{" "}
                <code className="font-mono text-mid text-slate">type</code> and a{" "}
                <code className="font-mono text-mid text-slate">content</code> object. You write one
                React component per type and map them together — the CMS never sends layout,
                colours, spacing or class names, so a client can rewrite every headline on the site
                and never change how any of it looks.
              </P>
              <div className="flex flex-wrap items-center gap-2 text-label text-quiet">
                {["Client presses Publish", "CMS calls your webhook", "That page rebuilds"].map(
                  (step, i) => (
                    <span key={step} className="flex items-center gap-2">
                      {i > 0 && (
                        <span aria-hidden className="text-faint">
                          →
                        </span>
                      )}
                      <span className="rounded-md border border-line-mid bg-rail px-2.5 py-1.5 font-medium">
                        {step}
                      </span>
                    </span>
                  )
                )}
              </div>
            </Section>

            {/* ------------------------------------------------- quick start */}
            <Section id="start" title="Quick start">
              <P>
                Five files. Start from an ordinary{" "}
                <code className="font-mono text-mid text-slate">create-next-app</code>, then add
                these. Your API key is on the <strong>Integration</strong> screen of any website in
                your dashboard, already filled in.
              </P>

              <Code file=".env.local">{`PAGECRAFT_API_URL=${API}
PAGECRAFT_API_KEY=pk_live_your_key_here
PAGECRAFT_WEBHOOK_SECRET=any-long-random-string`}</Code>

              <P>
                The key is read-only, scoped to one website, and serves published content only. It
                is safe in a client bundle — there is nothing to protect.
              </P>

              <Code file="lib/cms.js">{`const API = process.env.PAGECRAFT_API_URL;
const KEY = process.env.PAGECRAFT_API_KEY;

export async function cms(path) {
  const res = await fetch(\`\${API}/api/content/\${path}\`, {
    headers: { "x-api-key": KEY },
    cache: "force-cache",
  });
  const json = await res.json();
  return json.success ? json.data : null;
}`}</Code>

              <Code file="components/sections/index.js">{`import { Hero } from "./hero";
import { Features } from "./features";
// …one per section type you support

export const components = { hero: Hero, features: Features };`}</Code>

              <Code file="app/[[...slug]]/page.jsx">{`import { cms } from "@/lib/cms";
import { components } from "@/components/sections";

export const dynamic = "force-static";

// Pages your client adds later still work: Next generates them on
// first request, with no redeploy.
export async function generateStaticParams() {
  const pages = await cms("pages");
  return pages.map((p) => ({ slug: p.slug ? p.slug.split("/") : [] }));
}

export default async function Page({ params }) {
  const { slug } = await params;
  const page = await cms(\`pages/\${slug?.join("/") || "index"}\`);
  if (!page) return <h1>Not found</h1>;

  return page.sections.map((section) => {
    const Component = components[section.type];
    // An unmapped type renders nothing rather than crashing a live page.
    return Component ? <Component key={section.id} content={section.content} /> : null;
  });
}`}</Code>

              <Code file="app/api/revalidate/route.js">{`import { revalidatePath } from "next/cache";

export async function POST(req) {
  const body = await req.json();
  if (body.secret !== process.env.PAGECRAFT_WEBHOOK_SECRET) {
    return Response.json({ ok: false }, { status: 401 });
  }
  for (const path of body.paths ?? []) revalidatePath(path);
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}`}</Code>

              <P>
                Put that route&apos;s public URL and the same secret into{" "}
                <strong>Website settings → Publish webhook</strong>. That is the last wire; from
                then on, Publish updates the live site on its own.
              </P>
            </Section>

            {/* ---------------------------------------------------- endpoints */}
            <Section id="api" title="The API">
              <P>
                Every request carries the key as an{" "}
                <code className="font-mono text-mid text-slate">x-api-key</code> header, or{" "}
                <code className="font-mono text-mid text-slate">?key=</code> in the query string.
                Responses are always{" "}
                <code className="font-mono text-mid text-slate">
                  {"{ success: true, data }"}
                </code>{" "}
                or{" "}
                <code className="font-mono text-mid text-slate">
                  {"{ success: false, error }"}
                </code>
                .
              </P>

              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <tbody>
                    {[
                      ["GET /api/content/pages", "Every published page: slug, title, order, seo"],
                      ["GET /api/content/pages/:slug", "One page with its ordered, visible sections"],
                      ["GET /api/content/home", "The home page (its slug is the empty string)"],
                      [
                        "GET /api/content/pages/:slug?preview=TOKEN",
                        "The draft instead of the published copy",
                      ],
                    ].map(([path, what]) => (
                      <tr key={path} className="border-b border-line-soft last:border-b-0">
                        <td className="w-[48%] px-4 py-3 font-mono text-mid break-all text-accent">
                          {path}
                        </td>
                        <td className="px-4 py-3 text-label text-quiet">{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <P>
                Use <code className="font-mono text-mid text-slate">index</code> as the slug for the
                home page. Sections arrive in order with hidden ones already removed, so you never
                sort or filter.
              </P>

              <Code file="GET /api/content/pages/index">{`{
  "success": true,
  "data": {
    "slug": "",
    "title": "Home",
    "seo": { "metaTitle": "…", "metaDescription": "…" },
    "sections": [
      {
        "id": "10134a79-b640-486f-8e2d-d1b05c924d59",
        "type": "hero",
        "order": 0,
        "visible": true,
        "content": {
          "heading": "Your words, your website",
          "backgroundImage": { "url": "…", "width": 1600, "height": 1000, "alt": "…" },
          "buttons": [{ "label": "Book a table", "href": "/contact", "variant": "Solid" }]
        }
      }
    ],
    "publishedAt": "2026-08-28T18:04:11.402Z"
  }
}`}</Code>

              <P>
                Published responses are cached{" "}
                <code className="font-mono text-mid text-slate">
                  s-maxage=60, stale-while-revalidate=600
                </code>
                ; preview responses are{" "}
                <code className="font-mono text-mid text-slate">no-store</code>. The whole content
                API is rate limited to <strong>120 requests per minute per IP</strong> — ample for
                a CDN-fronted site, and worth knowing if you statically build several hundred pages
                in one go.
              </P>
            </Section>

            {/* -------------------------------------------------- section ref */}
            <Section id="sections" title="Section types and their fields">
              <P>
                These are generated from the same registry the API validates against, so they
                cannot drift. <span className="text-destructive">*</span> marks a field the CMS
                refuses to publish without — your component can rely on it existing. A website only
                offers the types its owner has switched on.
              </P>

              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                {SECTION_REGISTRY.map((def) => (
                  <details key={def.type} className="group border-b border-line-soft last:border-b-0">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-rail">
                      <span
                        aria-hidden
                        className="w-3 text-tiny text-faint transition-transform group-open:rotate-90"
                      >
                        ▶
                      </span>
                      <span className="font-mono text-mid font-semibold text-accent">
                        {def.type}
                      </span>
                      <span className="text-label text-quiet">{def.description}</span>
                    </summary>
                    <div className="grid grid-cols-[auto_auto_1fr] gap-x-4 gap-y-1 border-t border-line-soft bg-sunken px-4 py-3">
                      {flatten(def.fields).map(({ field, depth }) => (
                        <div key={`${depth}-${field.key}`} className="contents">
                          <div
                            className="font-mono text-mid text-slate"
                            style={{ paddingLeft: `${depth * 14}px` }}
                          >
                            {depth > 0 && <span className="mr-1.5 text-faint">└</span>}
                            {field.key}
                            {field.required && <span className="text-destructive">{" *"}</span>}
                          </div>
                          <div className="font-mono text-micro text-muted">{field.kind}</div>
                          <div className="text-helper leading-normal text-quiet">
                            {shapeOf(field)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>

              <P>
                Need one that is not here? A bespoke section type is built to your design and
                appears in the client&apos;s dashboard like any other — see{" "}
                <Link href={links.pricing} className="font-medium text-accent hover:underline">
                  pricing
                </Link>
                .
              </P>
            </Section>

            {/* ------------------------------------------------------ gotchas */}
            <Section id="notes" title="Worth knowing">
              <div className="flex flex-col gap-3.5">
                {[
                  [
                    "An unmapped section type must render nothing",
                    "Never throw on one. A client can add a section the day before you ship its component, and a live page must not go down because of it.",
                  ],
                  [
                    "Survive a CMS outage at build time",
                    "Catch a network failure in the catch-all and render a holding page rather than failing the deploy. Do let a 401 or a 500 fail the build — that is a real misconfiguration you want to hear about.",
                  ],
                  [
                    "Images may have no dimensions",
                    "width and height are 0 when the library never measured the file — an SVG, say. Omit the attributes in that case; width={0} tells a browser to render nothing.",
                  ],
                  [
                    "Preview tokens last 30 minutes",
                    "They are scoped to one page and swap in that page's draft. Mint one from the dashboard's Preview button.",
                  ],
                  [
                    "Plain React works too",
                    "No Next.js required. Fetch at runtime from a Vite app and let the cache headers do the work; edits appear on the next page load instead of instantly.",
                  ],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-xl border border-line bg-surface p-5">
                    <h3 className="text-[14.5px] font-semibold">{title}</h3>
                    <p className="mt-1.5 text-label leading-[1.6] text-quiet">{body}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* ---------------------------------------------------------- cta */}
            <Print>
              {/* Flat Press-Blue-soft panel — no gradient (direction.md §1, §7). */}
              <div className="mt-16 rounded-2xl border border-accent-line bg-accent-soft px-8 py-11 text-center">
                <h2 className="text-[26px] font-bold tracking-[-.8px] sm:text-[30px]">
                  Get a key and try it
                </h2>
                <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-[1.6] text-slate">
                  Create a website, add a page, press Publish, and point your local dev server at it.
                  {ONE_MONTH} a month for one website, {ONE_MONTH} for each one after that.
                </p>
                <div className="mt-6 flex justify-center">
                  <ButtonLink href={links.signUp}>Create an account</ButtonLink>
                </div>
              </div>
            </Print>
          </div>

          {/* --------------------------------------------------------- on this page */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 border-l border-line pl-5">
              <p className="font-mono text-micro font-semibold tracking-[.08em] text-muted uppercase">
                On this page
              </p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {TOC.map(([id, label]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="group flex items-center gap-2.5 font-mono text-[12px] tracking-[0.04em] text-quiet uppercase transition-colors hover:text-ink focus-visible:text-ink"
                    >
                      {/* Hollow marker that fills Press Blue on hover/focus — the
                          "active dot" (direction.md §5.12). CSS-only: no scrollspy,
                          so the page stays motionless and works with JS off. */}
                      <span
                        aria-hidden
                        className="h-[7px] w-[7px] shrink-0 rounded-full border border-grip transition-colors group-hover:border-accent group-hover:bg-accent group-focus-visible:border-accent group-focus-visible:bg-accent"
                      />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
