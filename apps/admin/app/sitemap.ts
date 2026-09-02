import type { MetadataRoute } from "next";
import { abs } from "@/lib/site-meta";

/**
 * `/sitemap.xml` — every public page of this site, and nothing else.
 *
 * It is written by hand rather than crawled from the route tree on purpose:
 * `app/` also holds the dashboard and the token-bearing auth screens, and a
 * sitemap that listed a `noindex` page would be reported in Search Console as
 * an error against the whole file. Adding a public page means adding a line
 * here, which is the smallest possible price for never listing a private one.
 *
 * `lastModified` is the deploy time. These are hand-written pages that change
 * when the code does, so the build is genuinely when they last changed —
 * a fixed date would go stale, and a per-page date would need maintaining by
 * the same person who forgets to update it.
 */
const built = new Date();

const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
  { path: "/docs", priority: 0.9, changeFrequency: "weekly" },
  { path: "/signup", priority: 0.7, changeFrequency: "monthly" },
  { path: "/login", priority: 0.4, changeFrequency: "yearly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/refunds", priority: 0.3, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({
    url: abs(page.path),
    lastModified: built,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
