import type { CmsPage, CmsPageSummary } from "./client.js";
import type { FieldValue, SectionContent, SectionDTO } from "./content-types.js";

/**
 * Everything a website needs to turn CMS content into correct search-engine
 * and social output: title and description tags, canonicals, a sitemap, a
 * robots.txt, and JSON-LD structured data derived from the sections the owner
 * actually filled in.
 *
 * TWO IDEAS RUN THROUGH THIS FILE.
 *
 * 1. **Nothing here requires the owner to have done anything.** A client who
 *    never opens the SEO panel still gets a sensible <title>, a description
 *    written from their own words, a canonical URL and a sitemap entry. The
 *    panel improves on those defaults; it is never a precondition for them.
 *    That matters because the person editing a bakery's website will not read
 *    an article about meta descriptions, and their site still has to rank.
 *
 * 2. **Structured data is derived, never asked for.** A `contact` section
 *    already holds an address, a phone number and opening hours; an `faq`
 *    section already holds questions and answers; a `productGrid` already
 *    holds products. Those are exactly the shapes Google wants as JSON-LD, so
 *    the CMS emits them from content that exists rather than adding a second
 *    set of fields nobody would fill in twice.
 *
 * It is framework-agnostic and dependency-free. Next.js sites hand
 * `pageMetadata()` straight back from `generateMetadata`; every other site
 * uses `metaTags()` / `renderMetaTags()` and injects the strings itself.
 */

/* ------------------------------------------------------------------ options */

export interface SeoSiteOptions {
  /**
   * The live website's origin — "https://acme.com". Required, and required to
   * be absolute: a canonical or a sitemap URL that is relative is silently
   * ignored by every crawler, which is worse than one that is missing.
   */
  siteUrl: string;
  /** The site's name, for `og:site_name` and structured data. */
  siteName?: string;
  /**
   * Sharing image used when a page sets none. Absolute, or a path resolved
   * against `siteUrl`.
   */
  defaultImage?: string;
  /**
   * How to build the full title: "%s · Acme". Next.js sites normally leave
   * this out and use `title.template` in their root layout instead, so the
   * suffix is not applied twice.
   */
  titleTemplate?: string;
  /** `og:locale`. Defaults to "en_US". */
  locale?: string;
  /** The site's Twitter/X handle, including the @. */
  twitterSite?: string;
}

/** Normalised origin, never with a trailing slash. */
function origin(opts: SeoSiteOptions): string {
  const url = (opts.siteUrl || "").trim().replace(/\/+$/, "");
  if (!url) throw new Error("pagecraft/seo: siteUrl is required.");
  return url;
}

/** Resolves a possibly-relative URL against the site origin. */
export function absoluteUrl(url: string | undefined, opts: SeoSiteOptions): string | undefined {
  if (!url) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return url;
  return `${origin(opts)}/${url.replace(/^\/+/, "")}`;
}

/**
 * The page's own address on the live site.
 *
 * The home page's slug is the empty string, and its URL is the bare origin
 * with a trailing slash — `https://acme.com/`, not `https://acme.com`. The two
 * are the same page to a browser and two URLs to a crawler, so being
 * consistent here is the whole point of emitting a canonical at all.
 */
export function pageUrl(page: { slug: string } | string, opts: SeoSiteOptions): string {
  const slug = typeof page === "string" ? page : page.slug;
  const clean = (slug === "index" ? "" : slug).replace(/^\/+|\/+$/g, "");
  return clean ? `${origin(opts)}/${clean}` : `${origin(opts)}/`;
}

/* ------------------------------------------------- reading a page's content */

const str = (v: FieldValue | undefined): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const rows = (v: FieldValue | undefined): Record<string, FieldValue>[] =>
  Array.isArray(v) ? v : [];

/** `{ url, alt }` out of an image field, tolerating the older bare-string form. */
function imageUrl(v: FieldValue | undefined): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (v && typeof v === "object" && !Array.isArray(v) && "url" in v) {
    const url = (v as { url?: unknown }).url;
    return typeof url === "string" && url.trim() ? url.trim() : undefined;
  }
  return undefined;
}

/**
 * Rich-text paragraphs are stored as small HTML fragments, and a meta
 * description containing `<p>` is a meta description that reads as broken.
 * Tags out, entities back to characters, whitespace collapsed.
 */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cuts at a word boundary and adds an ellipsis, never mid-word. */
export function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

const sectionsOf = (page: Pick<CmsPage, "sections">): SectionDTO[] =>
  (page.sections ?? []).filter((s) => s.visible !== false);

const firstSection = (page: Pick<CmsPage, "sections">, type: string): SectionContent | undefined =>
  sectionsOf(page).find((s) => s.type === type)?.content;

/**
 * Keys that hold prose rather than a label, in the order a human would read
 * them. A description wants a sentence, so a heading — however prominent — is
 * the wrong thing to lift.
 */
const PROSE_KEYS = ["subheading", "intro", "body", "description", "answer", "quote"];

/**
 * A description for the page, written from the page's own content when the
 * owner has not supplied one.
 *
 * Google rewrites a poor description anyway, but it rewrites a *missing* one
 * by lifting whatever text is nearest the top of the page — which is often a
 * button label or a nav item. Choosing the first real sentence ourselves is
 * strictly better than letting that happen, and it costs the client nothing.
 */
export function pageDescription(page: Pick<CmsPage, "sections" | "seo">, max = 155): string | undefined {
  const explicit = page.seo?.metaDescription?.trim();
  if (explicit) return explicit;

  const candidates: string[] = [];
  const visit = (content: SectionContent) => {
    for (const key of PROSE_KEYS) {
      const direct = str(content[key]);
      if (direct) candidates.push(plainText(direct));
    }
    for (const value of Object.values(content)) {
      for (const row of rows(value)) visit(row as SectionContent);
    }
  };
  for (const section of sectionsOf(page)) visit(section.content ?? {});

  // A three-word fragment is not a description. Below this it reads as a
  // truncated label and Google will replace it, so we prefer to send nothing.
  const best = candidates.find((c) => c.length >= 50) ?? candidates.find((c) => c.length >= 25);
  return best ? truncate(best, max) : undefined;
}

/** The <title>, with the site's template applied if it has one. */
export function pageTitle(page: Pick<CmsPage, "title" | "seo">, opts: SeoSiteOptions): string {
  const base = page.seo?.metaTitle?.trim() || page.title;
  if (!opts.titleTemplate) return base;
  return opts.titleTemplate.includes("%s")
    ? opts.titleTemplate.replace("%s", base)
    : `${base} ${opts.titleTemplate}`;
}

/** The sharing image: the page's own, then the first photo on it, then the site default. */
export function pageImage(
  page: Pick<CmsPage, "sections" | "seo">,
  opts: SeoSiteOptions
): string | undefined {
  const explicit = page.seo?.ogImage?.trim();
  if (explicit) return absoluteUrl(explicit, opts);

  for (const section of sectionsOf(page)) {
    const found = findImage(section.content ?? {});
    if (found) return absoluteUrl(found, opts);
  }
  return absoluteUrl(opts.defaultImage, opts);
}

function findImage(content: SectionContent): string | undefined {
  for (const value of Object.values(content)) {
    const direct = imageUrl(value);
    if (direct) return direct;
  }
  for (const value of Object.values(content)) {
    for (const row of rows(value)) {
      const nested = findImage(row as SectionContent);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** The address this page should be credited as — its own, unless it says otherwise. */
export function canonicalFor(page: Pick<CmsPage, "slug" | "seo">, opts: SeoSiteOptions): string {
  return page.seo?.canonicalUrl?.trim() || pageUrl(page, opts);
}

/* ------------------------------------------------------------ Next.js metadata */

/**
 * Structurally what Next.js's `Metadata` wants, declared here rather than
 * imported so this SDK never depends on Next. A Vite or Astro site uses
 * `metaTags()` instead and this type never comes up.
 */
export interface PageMetadata {
  title: string;
  description?: string;
  alternates: { canonical: string };
  robots: { index: boolean; follow: boolean; googleBot?: { index: boolean; follow: boolean } };
  openGraph: {
    type: "website" | "article";
    url: string;
    title: string;
    description?: string;
    siteName?: string;
    locale?: string;
    images?: { url: string; width?: number; height?: number; alt?: string }[];
    modifiedTime?: string;
  };
  twitter: {
    card: "summary" | "summary_large_image";
    title: string;
    description?: string;
    site?: string;
    images?: string[];
  };
}

/**
 * Everything a Next.js page's `generateMetadata` should return.
 *
 * ```ts
 * export async function generateMetadata({ params }) {
 *   const page = await cms.getPage((await params).slug ?? "");
 *   return pageMetadata(page, seo);
 * }
 * ```
 *
 * `noIndex` becomes `index: false, follow: true`, not `nofollow`: the owner
 * asked to keep the page out of results, not to strand every link on it.
 */
export function pageMetadata(page: CmsPage, opts: SeoSiteOptions): PageMetadata {
  const title = pageTitle(page, opts);
  const description = pageDescription(page);
  const url = canonicalFor(page, opts);
  const image = pageImage(page, opts);
  // A preview is a draft shown through a signed link. It must never be
  // indexed even if the published page it stands in for is indexable.
  const index = !(page.seo?.noIndex === true || page.preview === true);

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index, follow: true, googleBot: { index, follow: true } },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: opts.siteName,
      locale: opts.locale ?? "en_US",
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined,
      modifiedTime: page.updatedAt,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      site: opts.twitterSite,
      images: image ? [image] : undefined,
    },
  };
}

/* ---------------------------------------------------- plain <head> tags */

export interface HeadTag {
  tag: "meta" | "link" | "title";
  attrs: Record<string, string>;
  /** Only on `title`. */
  text?: string;
}

/**
 * The same tags as `pageMetadata`, as data any framework can render — for
 * Vite, Astro, Remix, Express, or a `<Helmet>`.
 */
export function metaTags(page: CmsPage, opts: SeoSiteOptions): HeadTag[] {
  const m = pageMetadata(page, opts);
  const tags: HeadTag[] = [
    { tag: "title", attrs: {}, text: m.title },
    { tag: "link", attrs: { rel: "canonical", href: m.alternates.canonical } },
    {
      tag: "meta",
      attrs: {
        name: "robots",
        content: m.robots.index ? "index,follow,max-image-preview:large" : "noindex,follow",
      },
    },
    { tag: "meta", attrs: { property: "og:type", content: m.openGraph.type } },
    { tag: "meta", attrs: { property: "og:url", content: m.openGraph.url } },
    { tag: "meta", attrs: { property: "og:title", content: m.openGraph.title } },
    { tag: "meta", attrs: { name: "twitter:card", content: m.twitter.card } },
    { tag: "meta", attrs: { name: "twitter:title", content: m.twitter.title } },
  ];
  if (m.description) {
    tags.push({ tag: "meta", attrs: { name: "description", content: m.description } });
    tags.push({ tag: "meta", attrs: { property: "og:description", content: m.description } });
    tags.push({ tag: "meta", attrs: { name: "twitter:description", content: m.description } });
  }
  if (m.openGraph.siteName)
    tags.push({ tag: "meta", attrs: { property: "og:site_name", content: m.openGraph.siteName } });
  if (m.openGraph.locale)
    tags.push({ tag: "meta", attrs: { property: "og:locale", content: m.openGraph.locale } });
  const image = m.openGraph.images?.[0]?.url;
  if (image) {
    tags.push({ tag: "meta", attrs: { property: "og:image", content: image } });
    tags.push({ tag: "meta", attrs: { property: "og:image:alt", content: m.openGraph.title } });
    tags.push({ tag: "meta", attrs: { name: "twitter:image", content: image } });
  }
  if (m.twitter.site) tags.push({ tag: "meta", attrs: { name: "twitter:site", content: m.twitter.site } });
  if (m.openGraph.modifiedTime)
    tags.push({
      tag: "meta",
      attrs: { property: "article:modified_time", content: m.openGraph.modifiedTime },
    });
  return tags;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `metaTags()` rendered as HTML, for a server that assembles its own `<head>`. */
export function renderMetaTags(tags: HeadTag[]): string {
  return tags
    .map((t) => {
      if (t.tag === "title") return `<title>${escapeAttr(t.text ?? "")}</title>`;
      const attrs = Object.entries(t.attrs)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(" ");
      return `<${t.tag} ${attrs} />`;
    })
    .join("\n");
}

/* ------------------------------------------------------------------ sitemap */

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

/**
 * A sitemap from the page list — which is one request, because
 * `GET /api/content/pages` already carries `updatedAt` and each page's
 * `noIndex` flag.
 *
 * Pages the owner asked to keep out of search are left out entirely. Listing a
 * `noindex` URL in a sitemap is a direct contradiction: it asks a crawler to
 * come and read a page that tells it to leave, and Search Console reports it
 * as an error against the whole sitemap.
 *
 * The home page gets priority 1.0 and everything else 0.8 — Google ignores
 * both fields, but Bing still reads them and a wrong value is worse than a
 * plain one.
 */
export function sitemapEntries(
  pages: CmsPageSummary[],
  opts: SeoSiteOptions & { changeFrequency?: SitemapEntry["changeFrequency"] }
): SitemapEntry[] {
  return pages
    .filter((p) => p.seo?.noIndex !== true)
    .map((p) => ({
      url: p.seo?.canonicalUrl?.trim() || pageUrl(p, opts),
      lastModified: p.updatedAt ?? p.publishedAt,
      changeFrequency: opts.changeFrequency ?? "weekly",
      priority: p.slug === "" || p.slug === "index" ? 1 : 0.8,
    }));
}

/** `sitemapEntries()` as XML, for a site that serves the file itself. */
export function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${escapeAttr(e.url)}</loc>`];
      if (e.lastModified) parts.push(`    <lastmod>${escapeAttr(e.lastModified)}</lastmod>`);
      if (e.changeFrequency) parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`);
      if (e.priority !== undefined) parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * A robots.txt that points at the sitemap.
 *
 * The sitemap line is the whole reason to have the file: crawlers find a
 * sitemap either from robots.txt or from a manual submission, and only one of
 * those happens automatically.
 */
export function robotsTxt(opts: SeoSiteOptions & { disallow?: string[] }): string {
  const lines = ["User-agent: *"];
  for (const path of opts.disallow ?? []) lines.push(`Disallow: ${path}`);
  lines.push("Allow: /", "", `Sitemap: ${origin(opts)}/sitemap.xml`);
  return `${lines.join("\n")}\n`;
}

/* -------------------------------------------------------- structured data */

export type JsonLd = Record<string, unknown>;

/**
 * JSON-LD, safe to put inside a `<script type="application/ld+json">`.
 *
 * `<` is escaped because a `</script>` sequence inside a string value — an
 * owner writing about HTML in an FAQ answer, say — would otherwise close the
 * tag early and inject the rest of the JSON into the page as markup.
 */
export function jsonLdScript(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The website itself. Emit once, in the root layout. */
export function websiteJsonLd(opts: SeoSiteOptions): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: `${origin(opts)}/`,
    name: opts.siteName,
  };
}

export interface OrganizationDetails {
  name?: string;
  logo?: string;
  sameAs?: string[];
}

/** The organisation behind the site, for the knowledge panel and sitelinks. */
export function organizationJsonLd(opts: SeoSiteOptions, details: OrganizationDetails = {}): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: details.name ?? opts.siteName,
    url: `${origin(opts)}/`,
  };
  const logo = absoluteUrl(details.logo ?? opts.defaultImage, opts);
  if (logo) node.logo = logo;
  if (details.sameAs?.length) node.sameAs = details.sameAs;
  return node;
}

/**
 * Breadcrumbs from the page's own path, so a result shows
 * "acme.com › Services › Roofing" instead of a bare URL.
 *
 * `titles` maps a slug to its real title — pass the page list and a
 * three-level path reads properly instead of showing slugs.
 */
export function breadcrumbJsonLd(
  page: Pick<CmsPage, "slug" | "title">,
  opts: SeoSiteOptions,
  titles: CmsPageSummary[] = []
): JsonLd | null {
  const segments = page.slug.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const bySlug = new Map(titles.map((p) => [p.slug, p.title]));
  const items = [{ name: opts.siteName ?? "Home", item: `${origin(opts)}/` }];
  let path = "";
  segments.forEach((segment, i) => {
    path = path ? `${path}/${segment}` : segment;
    const last = i === segments.length - 1;
    items.push({
      name: bySlug.get(path) ?? (last ? page.title : humanise(segment)),
      item: `${origin(opts)}/${path}`,
    });
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

const humanise = (slug: string) =>
  slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * `FAQPage` from the page's own `faq` sections.
 *
 * This is the single highest-value thing in this file: an FAQ block that the
 * owner typed for their visitors becomes an expandable answer directly in the
 * search result, which takes up more of the page than the result above it.
 */
export function faqJsonLd(page: Pick<CmsPage, "sections">): JsonLd | null {
  const entries: { question: string; answer: string }[] = [];
  for (const section of sectionsOf(page)) {
    if (section.type !== "faq") continue;
    for (const row of rows(section.content?.items)) {
      const question = str(row.question);
      const answer = str(row.answer);
      if (question && answer) entries.push({ question, answer: plainText(answer) });
    }
  }
  if (entries.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.answer },
    })),
  };
}

/** `ItemList` of `Product` from a `productGrid` section. */
export function productListJsonLd(page: Pick<CmsPage, "sections">, opts: SeoSiteOptions): JsonLd | null {
  const products: JsonLd[] = [];
  for (const section of sectionsOf(page)) {
    if (section.type !== "productGrid") continue;
    for (const row of rows(section.content?.products)) {
      const name = str(row.name);
      if (!name) continue;
      const node: JsonLd = { "@type": "Product", name };
      const description = str(row.description);
      if (description) node.description = plainText(description);
      const photo = absoluteUrl(imageUrl(row.photo), opts);
      if (photo) node.image = photo;
      const details = str(row.detailsUrl);
      if (details) node.url = absoluteUrl(details, opts);
      products.push(node);
    }
  }
  if (products.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item,
    })),
  };
}

/**
 * Days and times, mapped to the `Mo-Fr 09:00-17:00` form schema.org expects.
 *
 * Owners type opening hours in whatever way reads well on their page —
 * "Mon–Fri", "Weekdays", "9am – 5.30pm". Anything this cannot parse with
 * confidence is **dropped**, not guessed: a wrong opening time in a search
 * result sends someone to a closed shop, which is materially worse for that
 * business than showing no hours at all.
 */
const DAYS: Record<string, string> = {
  mon: "Mo", monday: "Mo", tue: "Tu", tues: "Tu", tuesday: "Tu",
  wed: "We", weds: "We", wednesday: "We", thu: "Th", thur: "Th", thurs: "Th", thursday: "Th",
  fri: "Fr", friday: "Fr", sat: "Sa", saturday: "Sa", sun: "Su", sunday: "Su",
};

function parseDays(input: string): string | null {
  const text = input.toLowerCase().replace(/[–—]/g, "-");
  if (/every ?day|daily|all week|7 days/.test(text)) return "Mo-Su";
  if (/^weekdays?$/.test(text.trim())) return "Mo-Fr";
  if (/^weekends?$/.test(text.trim())) return "Sa-Su";

  const range = text.match(/([a-z]+)\s*-\s*([a-z]+)/);
  if (range) {
    const from = DAYS[range[1]];
    const to = DAYS[range[2]];
    return from && to ? `${from}-${to}` : null;
  }
  const single = text.match(/[a-z]+/g)?.map((d) => DAYS[d]).filter(Boolean) as string[] | undefined;
  return single && single.length > 0 ? single.join(",") : null;
}

function parseTimes(input: string): string | null {
  const text = input.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, "");
  if (/closed/.test(text)) return null;
  const match = text.match(
    /(\d{1,2})[:.]?(\d{2})?(am|pm)?-(\d{1,2})[:.]?(\d{2})?(am|pm)?/
  );
  if (!match) return null;

  const to24 = (h: string, m: string | undefined, mer: string | undefined) => {
    let hour = Number(h);
    if (hour > 23) return null;
    if (mer === "pm" && hour < 12) hour += 12;
    if (mer === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${m ?? "00"}`;
  };
  // "9 - 5" with no meridiem on the first half: an unmarked closing hour that
  // is smaller than the opening hour is an afternoon, which is how everybody
  // writes a shop's hours and nobody means 5am.
  const openMer = match[3] ?? (match[6] === "pm" && Number(match[1]) < Number(match[4]) ? "am" : match[6]);
  const closeMer = match[6] ?? (Number(match[4]) < Number(match[1]) ? "pm" : undefined);
  const open = to24(match[1], match[2], openMer);
  const close = to24(match[4], match[5], closeMer);
  return open && close ? `${open}-${close}` : null;
}

/**
 * `LocalBusiness` from a `contact` section — the address, phone and opening
 * hours the owner already typed.
 *
 * For a shop, a restaurant or a tradesperson this is the structured data that
 * matters most, and it is the one they would never have added by hand.
 */
export function localBusinessJsonLd(
  page: Pick<CmsPage, "sections">,
  opts: SeoSiteOptions,
  details: OrganizationDetails & { type?: string } = {}
): JsonLd | null {
  const contact = firstSection(page, "contact");
  if (!contact) return null;

  const address = str(contact.address);
  const phone = str(contact.phone);
  const email = str(contact.email);
  if (!address && !phone) return null;

  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": details.type ?? "LocalBusiness",
    name: details.name ?? opts.siteName,
    url: `${origin(opts)}/`,
  };
  // A one-line address the owner typed. `streetAddress` is the honest place
  // for it: splitting "12 High St, Leeds LS1 4AB" into fields means guessing
  // which comma is the town, and a wrong postcode is worse than none.
  if (address) node.address = { "@type": "PostalAddress", streetAddress: address };
  if (phone) node.telephone = phone;
  if (email) node.email = email;
  const image = absoluteUrl(details.logo ?? opts.defaultImage, opts);
  if (image) node.image = image;

  const hours = rows(contact.hours)
    .map((row) => {
      const days = parseDays(str(row.days) ?? "");
      const time = parseTimes(str(row.time) ?? "");
      return days && time ? `${days} ${time}` : null;
    })
    .filter((h): h is string => h !== null);
  if (hours.length > 0) node.openingHours = hours;

  return node;
}

/** `WebPage` — the page itself, so everything else has something to hang off. */
export function webPageJsonLd(page: CmsPage, opts: SeoSiteOptions): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: pageTitle(page, { ...opts, titleTemplate: undefined }),
    url: canonicalFor(page, opts),
  };
  const description = pageDescription(page);
  if (description) node.description = description;
  const image = pageImage(page, opts);
  if (image) node.primaryImageOfPage = image;
  if (page.updatedAt) node.dateModified = page.updatedAt;
  if (page.publishedAt) node.datePublished = page.publishedAt;
  return node;
}

/**
 * Every piece of structured data this page's content supports, in one call.
 *
 * ```tsx
 * <script
 *   type="application/ld+json"
 *   dangerouslySetInnerHTML={{ __html: jsonLdScript(pageJsonLd(page, seo)) }}
 * />
 * ```
 *
 * A page with no FAQ, no products and no contact details simply gets the
 * `WebPage` node — the list is derived from what the owner filled in, so it
 * grows on its own as they build the page out.
 */
export function pageJsonLd(
  page: CmsPage,
  opts: SeoSiteOptions,
  extras: { pages?: CmsPageSummary[]; organization?: OrganizationDetails } = {}
): JsonLd[] {
  const nodes: (JsonLd | null)[] = [
    webPageJsonLd(page, opts),
    breadcrumbJsonLd(page, opts, extras.pages),
    faqJsonLd(page),
    productListJsonLd(page, opts),
    localBusinessJsonLd(page, opts, extras.organization),
  ];
  return nodes.filter((n): n is JsonLd => n !== null);
}
