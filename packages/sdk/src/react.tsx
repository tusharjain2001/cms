import { Fragment, createElement, type ComponentType, type ReactNode } from "react";
import type { SectionDTO } from "./content-types.js";
import { jsonLdScript, type JsonLd as JsonLdInput } from "./seo.js";

/**
 * Maps section types to YOUR React components.
 *
 * This is the line the whole CMS is built around: the client controls which
 * sections exist and what words are in them; you control what every one of
 * them looks like. Nothing about design ever travels over the wire.
 */
export type SectionComponents = Record<string, ComponentType<any>>;

/** Props every section component receives. */
export interface SectionProps<T = Record<string, unknown>> {
  content: T;
  section: SectionDTO;
  index: number;
}

export interface SectionRendererProps {
  sections: SectionDTO[];
  components: SectionComponents;
  /**
   * Rendered in place of a section whose type has no component yet. Defaults
   * to nothing — a section type you have not built yet can never break a live
   * page, it simply does not appear.
   */
  fallback?: (section: SectionDTO) => ReactNode;
}

export function SectionRenderer({
  sections,
  components,
  fallback,
}: SectionRendererProps): ReactNode {
  return createElement(
    Fragment,
    null,
    ...sections.map((section, index) => {
      const Component = components[section.type];

      if (!Component) {
        const node = fallback?.(section) ?? null;
        return node ? createElement(Fragment, { key: section.id }, node) : null;
      }

      return createElement(Component, {
        key: section.id,
        content: section.content,
        section,
        index,
      });
    })
  );
}

/**
 * A `<script type="application/ld+json">` for one or more structured-data
 * nodes — normally whatever `pageJsonLd(page, seo)` returned.
 *
 * ```tsx
 * <JsonLd data={pageJsonLd(page, seo)} />
 * ```
 *
 * It renders inside the body rather than the head on purpose: Google reads
 * JSON-LD from either, and a script in the body needs no framework-specific
 * head API, so this one component works in Next, Remix, Vite and Astro alike.
 */
export function JsonLd({ data }: { data: JsonLdInput | JsonLdInput[] }): ReactNode {
  return createElement("script", {
    type: "application/ld+json",
    // Pre-escaped by jsonLdScript: a `</script>` inside an FAQ answer would
    // otherwise close this tag early and spill JSON into the page as markup.
    dangerouslySetInnerHTML: { __html: jsonLdScript(data) },
  });
}
