import type { MetadataRoute } from "next";
import { SITE_URL, abs } from "@/lib/site-meta";

/**
 * `/robots.txt`.
 *
 * The `Sitemap:` line is the reason this file exists at all — a crawler finds
 * a sitemap either here or through a manual Search Console submission, and
 * only one of those happens on its own.
 *
 * The disallow list is everything behind the sign-in plus the screens that
 * carry a one-shot token in the URL. Those pages are already `noindex`
 * (see the `(app)` and `(auth)` layouts), and this is the belt to that
 * braces: `noindex` needs the page to be fetched and read before it counts,
 * whereas a `Disallow` stops the request. A password-reset link should never
 * be requested by a crawler in the first place.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/projects", "/projects/", "/billing", "/verify-email", "/reset-password"],
      },
    ],
    sitemap: abs("/sitemap.xml"),
    host: SITE_URL,
  };
}
