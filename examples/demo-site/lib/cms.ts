import { createCmsClient } from "@pagecraft/sdk";

/**
 * One CMS client for the whole site.
 *
 * `cache: "force-cache"` is what makes this a STATIC site: Next fetches the
 * content once at build time (or on the first request), bakes it into HTML,
 * and serves that from the CDN. Visitors never wait on the CMS.
 *
 * When the client presses Publish, the CMS calls /api/revalidate, which throws
 * the cached page away and lets the next request rebuild it with new content —
 * usually within a second or two, with nobody involved.
 */
export const cms = createCmsClient({
  apiKey: process.env.PAGECRAFT_API_KEY ?? "",
  baseUrl: process.env.PAGECRAFT_API_URL ?? "http://localhost:4000",
  fetchOptions: { cache: "force-cache" },
});
