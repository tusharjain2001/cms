import type { SectionContent, SectionDTO } from "@pagecraft/shared";

/**
 * The tiny client a website installs to read its own published content.
 *
 * It is deliberately framework-agnostic: `fetchOptions` passes straight through
 * to `fetch`, so a Next.js site can hand it `{ cache: 'force-cache' }` or
 * `{ next: { tags } }` and a Vite site can hand it nothing at all.
 */

export interface CmsPageSummary {
  slug: string;
  title: string;
  order: number;
  seo: { metaTitle?: string; metaDescription?: string };
}

export interface CmsPage {
  slug: string;
  title: string;
  order: number;
  seo: { metaTitle?: string; metaDescription?: string; ogImage?: string };
  sections: SectionDTO[];
  publishedAt?: string;
  preview: boolean;
}

export interface CmsClientOptions {
  /** The project's public key, from the CMS settings screen. */
  apiKey: string;
  /** Base URL of the CMS API, e.g. https://api.yourdomain.com */
  baseUrl: string;
  /** Passed to every fetch. Use it to opt into your framework's caching. */
  fetchOptions?: RequestInit;
}

export class CmsError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "CmsError";
  }
}

export interface CmsClient {
  /** Every published page, in menu order. Ideal for building navigation. */
  getPages(init?: RequestInit): Promise<CmsPageSummary[]>;
  /** One published page. Pass "" or "index" for the home page. */
  getPage(slug: string, init?: RequestInit): Promise<CmsPage>;
  /** Convenience for the root page. */
  getHome(init?: RequestInit): Promise<CmsPage>;
  /**
   * The unpublished draft, for a preview link. Never cache this — the SDK
   * already sends `no-store`.
   */
  getPreview(slug: string, token: string, init?: RequestInit): Promise<CmsPage>;
}

export function createCmsClient({
  apiKey,
  baseUrl,
  fetchOptions,
}: CmsClientOptions): CmsClient {
  if (!apiKey) throw new Error("createCmsClient: apiKey is required.");
  if (!baseUrl) throw new Error("createCmsClient: baseUrl is required.");
  const root = baseUrl.replace(/\/$/, "");

  async function get<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${root}/api/content${path}`, {
        ...fetchOptions,
        ...init,
        headers: {
          "x-api-key": apiKey,
          ...(fetchOptions?.headers ?? {}),
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      throw new CmsError(0, `Could not reach the CMS at ${root}: ${String(err)}`);
    }

    const payload = (await res.json().catch(() => null)) as
      | { success: true; data: T }
      | { success: false; error: string }
      | null;

    if (!payload) throw new CmsError(res.status, "The CMS sent back something unexpected.");
    if (!payload.success) throw new CmsError(res.status, payload.error);
    return payload.data;
  }

  const normalise = (slug: string) => {
    const clean = slug.replace(/^\/+|\/+$/g, "");
    return clean === "" ? "index" : clean;
  };

  return {
    getPages: (init) => get<CmsPageSummary[]>("/pages", init),
    getPage: (slug, init) => get<CmsPage>(`/pages/${normalise(slug)}`, init),
    getHome: (init) => get<CmsPage>("/home", init),
    getPreview: (slug, token, init) =>
      get<CmsPage>(`/pages/${normalise(slug)}?preview=${encodeURIComponent(token)}`, {
        cache: "no-store",
        ...init,
      }),
  };
}

/**
 * Reads one section's content with the right type.
 *
 * ```ts
 * const { heading, buttons } = content<HeroContent>(section);
 * ```
 */
export function content<T = SectionContent>(section: SectionDTO): T {
  return section.content as T;
}
