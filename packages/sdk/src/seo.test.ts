import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CmsPage, CmsPageSummary } from "./client.js";
import type { SectionDTO } from "./content-types.js";
import {
  breadcrumbJsonLd,
  canonicalFor,
  faqJsonLd,
  jsonLdScript,
  localBusinessJsonLd,
  metaTags,
  pageDescription,
  pageImage,
  pageJsonLd,
  pageMetadata,
  pageTitle,
  pageUrl,
  productListJsonLd,
  renderSitemap,
  robotsTxt,
  sitemapEntries,
  truncate,
} from "./seo.js";

const seo = { siteUrl: "https://acme.com", siteName: "Acme" };

let nextId = 0;
const section = (type: string, content: Record<string, unknown>, visible = true): SectionDTO => ({
  id: `s${nextId++}`,
  type,
  order: 0,
  visible,
  content: content as SectionDTO["content"],
});

const page = (over: Partial<CmsPage> = {}): CmsPage => ({
  slug: "about",
  title: "About us",
  order: 1,
  seo: {},
  sections: [],
  preview: false,
  ...over,
});

/* ------------------------------------------------------------------- urls */

test("pageUrl gives the home page a trailing slash and nothing else one", () => {
  assert.equal(pageUrl({ slug: "" }, seo), "https://acme.com/");
  assert.equal(pageUrl({ slug: "index" }, seo), "https://acme.com/");
  assert.equal(pageUrl({ slug: "about" }, seo), "https://acme.com/about");
  assert.equal(pageUrl({ slug: "/about/" }, seo), "https://acme.com/about");
});

test("pageUrl tolerates a trailing slash on siteUrl", () => {
  assert.equal(pageUrl({ slug: "about" }, { siteUrl: "https://acme.com/" }), "https://acme.com/about");
});

test("a page's canonical is its own address unless it names another", () => {
  assert.equal(canonicalFor(page(), seo), "https://acme.com/about");
  assert.equal(
    canonicalFor(page({ seo: { canonicalUrl: "https://acme.com/company" } }), seo),
    "https://acme.com/company"
  );
});

/* ------------------------------------------------------------ title & text */

test("the meta title wins over the page title, and the template applies to both", () => {
  assert.equal(pageTitle(page(), seo), "About us");
  assert.equal(pageTitle(page({ seo: { metaTitle: "About Acme Bakery" } }), seo), "About Acme Bakery");
  assert.equal(
    pageTitle(page(), { ...seo, titleTemplate: "%s · Acme" }),
    "About us · Acme"
  );
});

test("truncate cuts on a word boundary and never mid-word", () => {
  const cut = truncate("the quick brown fox jumps over the lazy dog", 20);
  assert.ok(cut.length <= 20, cut);
  assert.ok(cut.endsWith("…"));
  assert.ok(!cut.includes("jum…"));
  assert.equal(truncate("short", 20), "short");
});

test("a missing description is written from the page's own prose, tags stripped", () => {
  const p = page({
    sections: [
      section("hero", {
        heading: "Fresh bread",
        subheading: "<p>We bake <strong>sourdough</strong> every morning in a stone oven on the high street.</p>",
      }),
    ],
  });
  const description = pageDescription(p);
  assert.equal(
    description,
    "We bake sourdough every morning in a stone oven on the high street."
  );
});

test("an explicit description is used verbatim", () => {
  const p = page({
    seo: { metaDescription: "Hand-written." },
    sections: [section("hero", { subheading: "Something much longer that would otherwise be picked." })],
  });
  assert.equal(pageDescription(p), "Hand-written.");
});

test("a headline is never lifted as the description", () => {
  const p = page({ sections: [section("hero", { heading: "A heading long enough to pass the length floor" })] });
  assert.equal(pageDescription(p), undefined);
});

test("hidden sections contribute nothing", () => {
  const p = page({
    sections: [section("hero", { subheading: "This section is hidden from the live website entirely." }, false)],
  });
  assert.equal(pageDescription(p), undefined);
});

test("nested list rows are searched for prose", () => {
  const p = page({
    sections: [
      section("textBlock", {
        heading: "Our story",
        paragraphs: [{ body: "We opened in 1994 and have baked the same sourdough loaf ever since." }],
      }),
    ],
  });
  assert.match(pageDescription(p)!, /^We opened in 1994/);
});

/* ---------------------------------------------------------------- images */

test("the sharing image falls back to the first photo on the page", () => {
  const p = page({
    sections: [section("hero", { backgroundImage: { url: "/img/loaf.jpg", publicId: "a", width: 1, height: 1 } })],
  });
  assert.equal(pageImage(p, seo), "https://acme.com/img/loaf.jpg");
});

test("an explicit sharing image beats the page's photos, and absolute URLs pass through", () => {
  const p = page({
    seo: { ogImage: "https://cdn.acme.com/card.png" },
    sections: [section("hero", { backgroundImage: { url: "/img/loaf.jpg", publicId: "a", width: 1, height: 1 } })],
  });
  assert.equal(pageImage(p, seo), "https://cdn.acme.com/card.png");
});

test("with no photo anywhere, the site default is used", () => {
  assert.equal(pageImage(page(), { ...seo, defaultImage: "/og.png" }), "https://acme.com/og.png");
  assert.equal(pageImage(page(), seo), undefined);
});

/* -------------------------------------------------------------- metadata */

test("pageMetadata carries canonical, robots, og and twitter together", () => {
  const p = page({
    seo: { metaTitle: "About Acme", metaDescription: "Who we are." },
    sections: [section("hero", { backgroundImage: { url: "/a.jpg", publicId: "a", width: 1, height: 1 } })],
    updatedAt: "2026-09-01T10:00:00.000Z",
  });
  const m = pageMetadata(p, seo);

  assert.equal(m.title, "About Acme");
  assert.equal(m.description, "Who we are.");
  assert.equal(m.alternates.canonical, "https://acme.com/about");
  assert.equal(m.robots.index, true);
  assert.equal(m.openGraph.url, "https://acme.com/about");
  assert.equal(m.openGraph.siteName, "Acme");
  assert.equal(m.openGraph.images?.[0].url, "https://acme.com/a.jpg");
  assert.equal(m.openGraph.modifiedTime, "2026-09-01T10:00:00.000Z");
  assert.equal(m.twitter.card, "summary_large_image");
});

test("no image means a small twitter card, not a broken large one", () => {
  assert.equal(pageMetadata(page(), seo).twitter.card, "summary");
});

test("noIndex stops indexing but keeps links followed", () => {
  const m = pageMetadata(page({ seo: { noIndex: true } }), seo);
  assert.equal(m.robots.index, false);
  assert.equal(m.robots.follow, true);
  assert.equal(m.robots.googleBot?.index, false);
});

test("a preview is never indexable, whatever the page says", () => {
  assert.equal(pageMetadata(page({ preview: true }), seo).robots.index, false);
});

test("metaTags renders the same facts as tags", () => {
  const tags = metaTags(page({ seo: { metaDescription: "Who we are." } }), seo);
  const find = (attr: string, value: string) => tags.find((t) => t.attrs[attr] === value);

  assert.equal(find("rel", "canonical")?.attrs.href, "https://acme.com/about");
  assert.equal(find("name", "robots")?.attrs.content, "index,follow,max-image-preview:large");
  assert.equal(find("property", "og:title")?.attrs.content, "About us");
  assert.equal(find("name", "description")?.attrs.content, "Who we are.");
  assert.equal(tags.find((t) => t.tag === "title")?.text, "About us");
});

test("a noindex page says so in its robots tag", () => {
  const tags = metaTags(page({ seo: { noIndex: true } }), seo);
  assert.equal(tags.find((t) => t.attrs.name === "robots")?.attrs.content, "noindex,follow");
});

/* --------------------------------------------------------------- sitemap */

const summary = (over: Partial<CmsPageSummary> = {}): CmsPageSummary => ({
  slug: "about",
  title: "About",
  order: 1,
  seo: {},
  ...over,
});

test("the sitemap leaves out pages the owner hid from search", () => {
  const entries = sitemapEntries(
    [summary({ slug: "" }), summary(), summary({ slug: "thanks", seo: { noIndex: true } })],
    seo
  );
  assert.deepEqual(
    entries.map((e) => e.url),
    ["https://acme.com/", "https://acme.com/about"]
  );
});

test("the home page outranks the rest and lastmod comes from the page", () => {
  const [home, about] = sitemapEntries(
    [
      summary({ slug: "", updatedAt: "2026-08-01T00:00:00.000Z" }),
      summary({ publishedAt: "2026-07-01T00:00:00.000Z" }),
    ],
    seo
  );
  assert.equal(home.priority, 1);
  assert.equal(home.lastModified, "2026-08-01T00:00:00.000Z");
  assert.equal(about.priority, 0.8);
  // Falls back to publish time when the CMS is older than this SDK.
  assert.equal(about.lastModified, "2026-07-01T00:00:00.000Z");
});

test("renderSitemap produces valid, escaped XML", () => {
  const xml = renderSitemap(sitemapEntries([summary({ slug: "a&b" })], seo));
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.ok(xml.includes("<loc>https://acme.com/a&amp;b</loc>"));
  assert.ok(xml.includes("</urlset>"));
});

test("robots.txt always points at the sitemap", () => {
  const text = robotsTxt({ ...seo, disallow: ["/preview"] });
  assert.ok(text.includes("Sitemap: https://acme.com/sitemap.xml"));
  assert.ok(text.includes("Disallow: /preview"));
});

/* ------------------------------------------------------- structured data */

test("an faq section becomes a FAQPage", () => {
  const p = page({
    sections: [
      section("faq", {
        items: [
          { question: "Do you deliver?", answer: "<p>Yes, within five miles.</p>" },
          { question: "Incomplete", answer: "" },
        ],
      }),
    ],
  });
  const node = faqJsonLd(p) as any;
  assert.equal(node["@type"], "FAQPage");
  assert.equal(node.mainEntity.length, 1);
  assert.equal(node.mainEntity[0].name, "Do you deliver?");
  assert.equal(node.mainEntity[0].acceptedAnswer.text, "Yes, within five miles.");
});

test("a page with no faq gets no FAQPage", () => {
  assert.equal(faqJsonLd(page()), null);
});

test("a product grid becomes an ItemList of Products", () => {
  const p = page({
    sections: [
      section("productGrid", {
        products: [
          { name: "Sourdough", description: "Baked daily.", photo: { url: "/l.jpg", publicId: "a", width: 1, height: 1 } },
          { description: "No name, skipped." },
        ],
      }),
    ],
  });
  const node = productListJsonLd(p, seo) as any;
  assert.equal(node.itemListElement.length, 1);
  assert.equal(node.itemListElement[0].item.name, "Sourdough");
  assert.equal(node.itemListElement[0].item.image, "https://acme.com/l.jpg");
});

test("a contact section becomes a LocalBusiness with parsed opening hours", () => {
  const p = page({
    sections: [
      section("contact", {
        address: "12 High Street, Leeds LS1 4AB",
        phone: "+44 113 496 0000",
        email: "hi@acme.com",
        hours: [
          { days: "Mon – Fri", time: "9am – 5.30pm" },
          { days: "Saturday", time: "10:00 - 14:00" },
          { days: "Sunday", time: "Closed" },
          { days: "By arrangement", time: "whenever" },
        ],
      }),
    ],
  });
  const node = localBusinessJsonLd(p, seo) as any;
  assert.equal(node["@type"], "LocalBusiness");
  assert.equal(node.address.streetAddress, "12 High Street, Leeds LS1 4AB");
  assert.equal(node.telephone, "+44 113 496 0000");
  // "Closed" and unparseable rows are dropped rather than guessed at.
  assert.deepEqual(node.openingHours, ["Mo-Fr 09:00-17:30", "Sa 10:00-14:00"]);
});

test("a contact section with no address or phone is not a LocalBusiness", () => {
  const p = page({ sections: [section("contact", { heading: "Say hello", showForm: true })] });
  assert.equal(localBusinessJsonLd(p, seo), null);
});

test("breadcrumbs come from the path, with real titles where known", () => {
  const p = page({ slug: "services/roofing", title: "Roofing" });
  const node = breadcrumbJsonLd(p, seo, [summary({ slug: "services", title: "What we do" })]) as any;
  assert.deepEqual(
    node.itemListElement.map((i: any) => [i.position, i.name, i.item]),
    [
      [1, "Acme", "https://acme.com/"],
      [2, "What we do", "https://acme.com/services"],
      [3, "Roofing", "https://acme.com/services/roofing"],
    ]
  );
});

test("the home page has no breadcrumb trail", () => {
  assert.equal(breadcrumbJsonLd(page({ slug: "" }), seo), null);
});

test("pageJsonLd grows with the content and always has a WebPage", () => {
  assert.deepEqual(
    pageJsonLd(page({ slug: "" }), seo).map((n) => n["@type"]),
    ["WebPage"]
  );

  const rich = page({
    slug: "help",
    sections: [
      section("faq", { items: [{ question: "Q?", answer: "A." }] }),
      section("contact", { address: "12 High Street", phone: "0113" }),
    ],
  });
  assert.deepEqual(
    pageJsonLd(rich, seo).map((n) => n["@type"]),
    ["WebPage", "BreadcrumbList", "FAQPage", "LocalBusiness"]
  );
});

test("jsonLdScript escapes a closing tag hidden inside content", () => {
  const script = jsonLdScript({ text: "</script><img onerror=alert(1)>" });
  assert.ok(!script.includes("</script>"));
  assert.ok(script.includes("\\u003c/script"));
  assert.deepEqual(JSON.parse(script.replace(/\\u003c/g, "<")), {
    text: "</script><img onerror=alert(1)>",
  });
});
