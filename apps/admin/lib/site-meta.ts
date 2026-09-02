import type { Metadata } from "next";
import { business } from "./legal";
import { OG_CARDS, type OgCardName } from "./og";
import { links } from "./links";
import { ONE_MONTH, ONE_YEAR, PRICE_PER_WEBSITE } from "./pricing";

/**
 * Everything the public pages tell a search engine about themselves.
 *
 * ONE FILE, because the failure mode of per-page metadata is drift: a
 * canonical that points at the wrong host, an `og:image` on four pages out of
 * seven, a description rewritten in the copy but not in the tag. Every public
 * route calls `pageMeta()` and gets the same shape, so adding a page cannot
 * mean forgetting a tag.
 *
 * **`SITE_URL` is load-bearing.** Canonicals, `og:url`, the sitemap and every
 * JSON-LD `@id` are built from it, and a wrong value does not fail a build —
 * it quietly tells Google the real site lives at localhost. Set
 * `NEXT_PUBLIC_SITE_URL` on the deploy; the default below is the production
 * domain rather than a placeholder for exactly that reason.
 *
 * This is the *marketing* side. `lib/seo.ts` is the unrelated thing next to
 * it: the panel that helps a customer with their own website's search
 * listing.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://mypagecraft.com").replace(
  /\/+$/,
  ""
);

/**
 * The name in `og:site_name`, the title template and the schema.org
 * Organization.
 *
 * It stays "Pagecraft" while the wordmark reads `mypagecraft` — that gap is a
 * deliberate open product-naming decision (see CLAUDE.md), and structured data
 * is the wrong place to resolve it by accident. Change it here when it is
 * decided, and every tag on every page follows.
 */
export const SITE_NAME = "Pagecraft";

export const SITE_TAGLINE = "A content-only CMS for React and Next.js websites";

/**
 * Absolute URL from a path. Crawlers ignore a relative canonical entirely.
 *
 * The home page is the bare origin with **no** trailing slash, because that is
 * what Next emits for its canonical — and a sitemap or a JSON-LD `@id` that
 * spells the home page differently from its own canonical is exactly the
 * mismatch Search Console reports as "alternate page with proper canonical
 * tag". The two forms mean the same page to a browser and different strings to
 * a report, so everything here agrees on one of them.
 */
export const abs = (path = "/") =>
  path === "/" ? SITE_URL : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

interface PageMetaInput {
  title: string;
  description: string;
  /** The route this page lives at, e.g. "/pricing". Becomes the canonical. */
  path: string;
  /** Search terms this page is genuinely about. Omit rather than pad. */
  keywords?: string[];
  /** Set on the pages a search engine gains nothing from listing. */
  noIndex?: boolean;
  /**
   * Which sharing card to use, from `OG_CARDS`. Defaults to the generic one,
   * so a page can never end up with none — a blank grey box on WhatsApp is
   * the most-seen and least-noticed bug a marketing site has.
   */
  card?: OgCardName;
}

/**
 * A page's whole `metadata` export.
 *
 * The canonical is the point of it. This one Next app serves the landing page,
 * the docs and the dashboard from a single origin, so the same content is
 * reachable with and without a trailing slash, over both hosts if a `www`
 * record is ever added, and with whatever query string an ad platform staples
 * on. Declaring the canonical makes all of those one page instead of five.
 */
export function pageMeta({
  title,
  description,
  path,
  keywords,
  noIndex,
  card = "default",
}: PageMetaInput): Metadata {
  const url = abs(path);
  const image = {
    url: abs(`/og/${card}`),
    width: 1200,
    height: 630,
    alt: OG_CARDS[card].alt,
  };
  // The root layout's template appends " · Pagecraft"; the landing page opts
  // out with an absolute title. Social cards get no template applied to them,
  // so they are given the finished string here.
  const social = path === "/" ? title : `${title} · ${SITE_NAME}`;

  return {
    // The root layout appends " · Pagecraft" to every title. The landing page
    // already ends in the product name, so it opts out rather than reading
    // "Pagecraft — … · Pagecraft".
    title: path === "/" ? { absolute: title } : title,
    description,
    keywords,
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type: "website",
      url,
      siteName: SITE_NAME,
      title: social,
      description,
      locale: "en_GB",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description,
      images: [image.url],
    },
  };
}

/* ----------------------------------------------------------- structured data */

type JsonLd = Record<string, unknown>;

/**
 * JSON-LD, escaped for a `<script type="application/ld+json">`.
 *
 * `<` becomes `<` so a stray `</script>` inside any string — an FAQ answer
 * that mentions a tag, say — cannot close the element early and spill the rest
 * of the JSON into the page as markup.
 */
export const jsonLd = (data: JsonLd | JsonLd[]) => JSON.stringify(data).replace(/</g, "\\u003c");

/** `@id`s, so the graph's nodes can point at each other instead of repeating. */
const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

export const organizationSchema = (): JsonLd => ({
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE_NAME,
  url: abs("/"),
  logo: { "@type": "ImageObject", url: abs("/icon.svg") },
  email: business.supportEmail,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: business.supportEmail,
    url: abs(links.contact),
    availableLanguage: "English",
  },
});

export const websiteSchema = (): JsonLd => ({
  "@type": "WebSite",
  "@id": SITE_ID,
  url: abs("/"),
  name: SITE_NAME,
  description: SITE_TAGLINE,
  publisher: { "@id": ORG_ID },
  inLanguage: "en",
});

/**
 * The product itself, priced.
 *
 * `SoftwareApplication` with a real `offers` block is what lets a result carry
 * a price, and the price is read straight from `lib/pricing.ts` — the same two
 * numbers the pricing page quotes. Structured data that disagrees with the
 * page it sits on is a manual-action risk, so it must not be typed twice.
 */
export const productSchema = (): JsonLd => ({
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#product`,
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Content Management System",
  operatingSystem: "Web",
  url: abs("/"),
  description: SITE_TAGLINE,
  publisher: { "@id": ORG_ID },
  offers: [
    {
      "@type": "Offer",
      name: "One website, monthly",
      price: PRICE_PER_WEBSITE.monthly.toFixed(2),
      priceCurrency: "USD",
      url: abs(links.pricing),
      availability: "https://schema.org/InStock",
      description: `${ONE_MONTH} per website per month. Every website includes every feature.`,
    },
    {
      "@type": "Offer",
      name: "One website, yearly",
      price: PRICE_PER_WEBSITE.yearly.toFixed(2),
      priceCurrency: "USD",
      url: abs(links.pricing),
      availability: "https://schema.org/InStock",
      description: `${ONE_YEAR} per website per year — twelve months for the price of ten.`,
    },
  ],
});

export const faqSchema = (items: { q: string; a: string }[]): JsonLd => ({
  "@type": "FAQPage",
  mainEntity: items.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
});

/** "Home › Pricing", so a result shows the trail instead of a bare URL. */
export const breadcrumbSchema = (trail: { name: string; path: string }[]): JsonLd => ({
  "@type": "BreadcrumbList",
  itemListElement: [{ name: "Home", path: "/" }, ...trail].map((crumb, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: crumb.name,
    item: abs(crumb.path),
  })),
});

/**
 * Wraps nodes in the single `@graph` a page should emit.
 *
 * One script with a graph beats five separate scripts: the nodes can reference
 * each other by `@id` rather than each restating the publisher, and a parser
 * that chokes on one node does not silently drop the rest.
 */
export const graph = (...nodes: (JsonLd | null | undefined)[]) => ({
  "@context": "https://schema.org",
  "@graph": nodes.filter((n): n is JsonLd => !!n),
});
