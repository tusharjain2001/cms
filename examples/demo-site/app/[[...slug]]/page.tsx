import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SectionRenderer } from "@pagecraft/sdk/react";
import { CmsError } from "@pagecraft/sdk";
import { cms } from "@/lib/cms";
import { sectionComponents } from "@/components/sections";

/**
 * One catch-all route renders every CMS page, so the client can add pages
 * without a developer. Hand-built routes can live alongside it — Next gives a
 * specific route priority over this catch-all.
 *
 * `force-static` + on-demand revalidation is the whole performance story:
 * visitors get pre-rendered HTML from the CDN, and a Publish in the CMS
 * regenerates just the affected page.
 */
export const dynamic = "force-static";
export const revalidate = false;

type Props = { params: Promise<{ slug?: string[] }> };

export async function generateStaticParams() {
  try {
    const pages = await cms.getPages();
    return pages.map((p) => ({ slug: p.slug ? p.slug.split("/") : [] }));
  } catch {
    // Pages the CMS could not list are still generated on first request.
    return [{ slug: [] }];
  }
}

type Loaded =
  | { kind: "page"; page: Awaited<ReturnType<typeof cms.getPage>> }
  | { kind: "missing" }
  | { kind: "unreachable" };

async function load(slug?: string[]): Promise<Loaded> {
  try {
    return { kind: "page", page: await cms.getPage(slug?.join("/") ?? "") };
  } catch (err) {
    if (err instanceof CmsError && err.status === 404) return { kind: "missing" };

    /**
     * The CMS being briefly unreachable must not fail a deploy.
     *
     * Status 0 means the network call itself failed. We warn loudly in the
     * build log and render a holding page; the next publish regenerates this
     * route properly. Any other error (a bad API key, a 500) is a real
     * misconfiguration and should stop the build.
     */
    if (err instanceof CmsError && err.status === 0) {
      console.warn(`\n[pagecraft] CMS unreachable while rendering "/${slug?.join("/") ?? ""}".`);
      console.warn("[pagecraft] Serving a holding page; it will regenerate on the next publish.\n");
      return { kind: "unreachable" };
    }
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await load((await params).slug);
  if (result.kind !== "page") return {};
  return {
    title: result.page.seo.metaTitle || result.page.title,
    description: result.page.seo.metaDescription,
  };
}

export default async function CmsPage({ params }: Props) {
  const result = await load((await params).slug);

  if (result.kind === "missing") notFound();

  if (result.kind === "unreachable") {
    return (
      <section className="px-6 py-32 text-center">
        <p className="text-stone-500">This page is being updated. Please check back shortly.</p>
      </section>
    );
  }

  return (
    <SectionRenderer
      sections={result.page.sections}
      components={sectionComponents}
      // A section type the client enabled but you have not built yet simply
      // does not render, rather than crashing their live website.
      fallback={() => null}
    />
  );
}
