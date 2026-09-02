import type { PageDTO, PageSummaryDTO, SectionContent, SectionDTO } from "./dto";

/**
 * What the SEO panel knows.
 *
 * Two jobs, and the split matters. **Truncation** answers "what will Google
 * actually print?", which is what the search preview draws. **Analysis**
 * answers "what is missing?", which is the checklist beside it.
 *
 * Both run entirely in the browser on the draft the client is editing, so the
 * preview updates as they type and nothing is saved to find out. And both are
 * deliberately advisory: nothing here can block a publish. A page with a
 * score of 20 still goes live, because the alternative — a CMS that refuses to
 * publish a shop's opening hours until its meta description is long enough —
 * is a CMS people stop using.
 *
 * The one non-obvious design rule: **every check has to be actionable by the
 * person reading it.** The client editing a bakery's website cannot fix
 * "improve topical authority"; they can fix "this page has no description" and
 * "two pages have the same title". So the list is short, concrete, and written
 * in the same voice as the rest of the dashboard.
 */

/**
 * The lengths Google actually shows.
 *
 * Google truncates by pixel width, not characters, so these are the widely
 * used character approximations — right for ordinary prose and a little
 * pessimistic for text full of capitals. Being approximate is fine here: the
 * point is to stop someone writing 200 characters that get cut mid-word, not
 * to promise a pixel-exact preview.
 */
export const TITLE_LIMITS = { min: 30, ideal: 55, max: 60 };
export const DESCRIPTION_LIMITS = { min: 70, ideal: 150, max: 160 };

export type CheckStatus = "good" | "warn" | "bad";

export interface SeoCheck {
  id: string;
  /** What is being checked, as a statement of the good state. */
  label: string;
  status: CheckStatus;
  /** One line of plain English: what is wrong, or why this passes. */
  detail: string;
  /** Share of the 100-point score. */
  weight: number;
}

export interface SeoReport {
  /** 0–100. `warn` scores half its weight; `bad` scores none. */
  score: number;
  checks: SeoCheck[];
  /** Words of real copy on the page — what a crawler has to work with. */
  words: number;
  /** True when the client has asked to keep this page out of search. */
  hidden: boolean;
}

/* ------------------------------------------------------- reading the draft */

const TAGS = /<[^>]*>/g;

/** Rich text is stored as small HTML fragments; a word count must not count `<p>`. */
export function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(TAGS, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every string a visitor would read, in page order. Skips URLs and settings. */
function proseOf(sections: SectionDTO[]): string[] {
  const out: string[] = [];
  const visit = (content: SectionContent) => {
    for (const [key, value] of Object.entries(content ?? {})) {
      if (typeof value === "string") {
        // A link's destination and a select's option are not copy.
        if (/^https?:|^\/|^mailto:|^tel:/i.test(value.trim())) continue;
        if (key === "href" || key === "detailsUrl" || key === "variant") continue;
        const text = plainText(value);
        if (text) out.push(text);
      } else if (Array.isArray(value)) {
        for (const row of value) {
          if (row && typeof row === "object") visit(row as SectionContent);
        }
      }
    }
  };
  for (const section of sections) {
    if (section.visible === false) continue;
    visit(section.content ?? {});
  }
  return out;
}

export function wordCount(sections: SectionDTO[]): number {
  return proseOf(sections).join(" ").split(/\s+/).filter(Boolean).length;
}

interface ImageRef {
  url: string;
  alt: string;
}

/** Every image on the page, with whatever alt text it carries. */
function imagesOf(sections: SectionDTO[]): ImageRef[] {
  const out: ImageRef[] = [];
  const visit = (content: SectionContent) => {
    for (const value of Object.values(content ?? {})) {
      if (Array.isArray(value)) {
        for (const row of value) if (row && typeof row === "object") visit(row as SectionContent);
      } else if (value && typeof value === "object" && "url" in value && "publicId" in value) {
        const image = value as { url?: unknown; alt?: unknown };
        if (typeof image.url === "string" && image.url) {
          out.push({ url: image.url, alt: typeof image.alt === "string" ? image.alt : "" });
        }
      }
    }
  };
  for (const section of sections) {
    if (section.visible === false) continue;
    visit(section.content ?? {});
  }
  return out;
}

/** The first heading a visitor sees — the page's real `<h1>`, whatever it is called. */
function headingOf(sections: SectionDTO[]): string {
  for (const section of sections) {
    if (section.visible === false) continue;
    const heading = section.content?.heading;
    if (typeof heading === "string" && heading.trim()) return heading.trim();
  }
  return "";
}

/* ----------------------------------------------------------- the preview */

/** What the result's title will read as, cut where Google cuts it. */
export function previewTitle(page: { title: string; seo?: { metaTitle?: string } }): string {
  const title = page.seo?.metaTitle?.trim() || page.title || "Untitled page";
  return title.length > TITLE_LIMITS.max ? `${title.slice(0, TITLE_LIMITS.max - 1).trimEnd()}…` : title;
}

/**
 * What the snippet will read as.
 *
 * With no description written, Google composes one from the page — so the
 * preview shows the page's own opening line rather than an empty box, which is
 * both honest about what will happen and a nudge to write something better.
 */
export function previewDescription(
  page: { seo?: { metaDescription?: string } },
  sections: SectionDTO[]
): { text: string; borrowed: boolean } {
  const written = page.seo?.metaDescription?.trim();
  if (written) {
    return {
      text:
        written.length > DESCRIPTION_LIMITS.max
          ? `${written.slice(0, DESCRIPTION_LIMITS.max - 1).trimEnd()}…`
          : written,
      borrowed: false,
    };
  }
  const prose = proseOf(sections).find((p) => p.length >= 50) ?? proseOf(sections)[0] ?? "";
  if (!prose) return { text: "", borrowed: true };
  return {
    text:
      prose.length > DESCRIPTION_LIMITS.max
        ? `${prose.slice(0, DESCRIPTION_LIMITS.max - 1).trimEnd()}…`
        : prose,
    borrowed: true,
  };
}

/** `example.com › our story` — the breadcrumb Google prints in place of the URL. */
export function previewUrl(domain: string, slug: string): string {
  const host = (domain || "your-website.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const trail = slug
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/-/g, " "));
  return [host, ...trail].join(" › ");
}

/* ------------------------------------------------------------- the report */

export function analysePage(input: {
  page: PageDTO;
  sections: SectionDTO[];
  /** Every other page on this website, to catch two pages sharing a title. */
  siblings?: PageSummaryDTO[];
}): SeoReport {
  const { page, sections, siblings = [] } = input;
  const checks: SeoCheck[] = [];

  const title = page.seo?.metaTitle?.trim() ?? "";
  const description = page.seo?.metaDescription?.trim() ?? "";
  const words = wordCount(sections);
  const images = imagesOf(sections);
  const heading = headingOf(sections);

  /* -- title ------------------------------------------------------------- */
  if (!title) {
    checks.push({
      id: "title",
      label: "Search result title",
      status: "warn",
      weight: 20,
      detail: `Google is using the page name, “${page.title}”. A title written for search usually wins more clicks.`,
    });
  } else if (title.length > TITLE_LIMITS.max) {
    checks.push({
      id: "title",
      label: "Search result title",
      status: "warn",
      weight: 20,
      detail: `${title.length} characters — Google will cut it off around ${TITLE_LIMITS.max}.`,
    });
  } else if (title.length < TITLE_LIMITS.min) {
    checks.push({
      id: "title",
      label: "Search result title",
      status: "warn",
      weight: 20,
      detail: `Only ${title.length} characters. There is room for more — say what the page is and where you are.`,
    });
  } else {
    checks.push({
      id: "title",
      label: "Search result title",
      status: "good",
      weight: 20,
      detail: `${title.length} characters — it will show in full.`,
    });
  }

  /* -- description ------------------------------------------------------- */
  if (!description) {
    checks.push({
      id: "description",
      label: "Search result description",
      status: "bad",
      weight: 20,
      detail: "Nothing written, so Google will pick a sentence from the page itself. Two lines here is the single easiest win on this screen.",
    });
  } else if (description.length > DESCRIPTION_LIMITS.max) {
    checks.push({
      id: "description",
      label: "Search result description",
      status: "warn",
      weight: 20,
      detail: `${description.length} characters — everything past about ${DESCRIPTION_LIMITS.max} is cut off.`,
    });
  } else if (description.length < DESCRIPTION_LIMITS.min) {
    checks.push({
      id: "description",
      label: "Search result description",
      status: "warn",
      weight: 20,
      detail: `${description.length} characters. Aim for ${DESCRIPTION_LIMITS.min}–${DESCRIPTION_LIMITS.max} — a short one leaves space unused.`,
    });
  } else {
    checks.push({
      id: "description",
      label: "Search result description",
      status: "good",
      weight: 20,
      detail: `${description.length} characters — it will show in full.`,
    });
  }

  /* -- a title nobody else on this website is using ---------------------- */
  const mine = (title || page.title).toLowerCase();
  const clash = siblings.find(
    (p) => p.id !== page.id && (p.seo?.metaTitle?.trim() || p.title).toLowerCase() === mine
  );
  checks.push({
    id: "unique-title",
    label: "A title no other page uses",
    status: clash ? "bad" : "good",
    weight: 10,
    detail: clash
      ? `“${clash.title}” has the same title. Google has to choose between them, and it may show neither.`
      : "No other page on this website uses this title.",
  });

  /* -- the page's own address -------------------------------------------- */
  const isHome = page.slug === "";
  const slugOk = isHome || (page.slug.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug));
  checks.push({
    id: "slug",
    label: "A readable web address",
    status: slugOk ? "good" : "warn",
    weight: 5,
    detail: isHome
      ? "This is the home page, so it sits at the top of the website."
      : slugOk
        ? `/${page.slug} — short and readable.`
        : `/${page.slug} is long or has unusual characters. Words separated by hyphens read best.`,
  });

  /* -- a headline ---------------------------------------------------------*/
  checks.push({
    id: "heading",
    label: "A headline on the page",
    status: heading ? "good" : "bad",
    weight: 10,
    detail: heading
      ? `“${heading.length > 60 ? `${heading.slice(0, 60)}…` : heading}”`
      : "No section has a headline filled in. It is the first thing both a visitor and a search engine read.",
  });

  /* -- enough to read -----------------------------------------------------*/
  checks.push({
    id: "words",
    label: "Enough words to rank",
    status: words >= 250 ? "good" : words >= 100 ? "warn" : "bad",
    weight: 15,
    detail:
      words >= 250
        ? `About ${words} words.`
        : words >= 100
          ? `About ${words} words. A page tends to need 250 or so before it competes for anything.`
          : `Only about ${words} words. There is very little here for a search engine to understand the page from.`,
  });

  /* -- alt text -----------------------------------------------------------*/
  const missingAlt = images.filter((i) => !i.alt.trim()).length;
  checks.push({
    id: "alt",
    label: "Photos described for screen readers",
    status: images.length === 0 ? "warn" : missingAlt === 0 ? "good" : missingAlt > images.length / 2 ? "bad" : "warn",
    weight: 10,
    detail:
      images.length === 0
        ? "No photos on this page yet."
        : missingAlt === 0
          ? `All ${images.length} photo${images.length === 1 ? "" : "s"} described.`
          : `${missingAlt} of ${images.length} photo${images.length === 1 ? "" : "s"} has no description. Add one in the media library — it helps blind visitors and image search alike.`,
  });

  /* -- the sharing card ---------------------------------------------------*/
  const socialImage = page.seo?.ogImage?.trim() || images[0]?.url || "";
  checks.push({
    id: "social",
    label: "A picture when the page is shared",
    status: page.seo?.ogImage?.trim() ? "good" : socialImage ? "warn" : "bad",
    weight: 10,
    detail: page.seo?.ogImage?.trim()
      ? "Chosen for sharing."
      : socialImage
        ? "No sharing picture chosen, so WhatsApp and Facebook will guess from the page. Choosing one is more reliable."
        : "Links to this page will share as a bare grey box. Any photo is better than none.",
  });

  const earned = checks.reduce(
    (sum, c) => sum + (c.status === "good" ? c.weight : c.status === "warn" ? c.weight / 2 : 0),
    0
  );

  return {
    score: Math.round(earned),
    checks,
    words,
    hidden: page.seo?.noIndex === true,
  };
}

/** Green / amber / red, for the score dial and the chips. */
export const scoreBand = (score: number): CheckStatus =>
  score >= 80 ? "good" : score >= 50 ? "warn" : "bad";

/**
 * Whether a page's search listing is worth nagging about in the pages list.
 * Only the two fields a client can fix in ten seconds count here.
 */
export const needsSeoAttention = (page: PageSummaryDTO): boolean =>
  !page.seo?.noIndex && !page.seo?.metaDescription?.trim();
