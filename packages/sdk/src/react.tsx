import { Fragment, createElement, type ComponentType, type ReactNode } from "react";
import type { SectionDTO } from "./content-types.js";

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
