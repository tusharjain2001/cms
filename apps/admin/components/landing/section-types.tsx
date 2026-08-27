import type { ReactNode } from "react";

/**
 * The nine section types, each with a little wireframe of the shape it makes on
 * a page. The thumbnails are abstract on purpose — they suggest a layout
 * without pretending to be one particular design, which is the whole point of
 * the product: the shape is yours, not ours.
 *
 * These nine mirror `SECTION_REGISTRY` in `packages/shared/src/registry.ts`.
 * If a type is added there, add it here too.
 */

const bar = (w: string, tone: "line" | "fill" | "accent" = "line") => (
  <span
    className={`block h-1 rounded-[2px] ${
      tone === "accent" ? "bg-accent" : tone === "fill" ? "bg-[#e2e6ee]" : "bg-[#cfd4de]"
    }`}
    style={{ width: w }}
  />
);

const block = <span className="flex-1 rounded-[3px] bg-[#e2e6ee]" />;

function Thumb({ children, grid }: { children: ReactNode; grid?: boolean }) {
  return (
    <span
      className={`h-[68px] w-[92px] shrink-0 rounded-[7px] border border-line-mid bg-sunken p-[7px] ${
        grid ? "grid" : "flex flex-col"
      } gap-1`}
    >
      {children}
    </span>
  );
}

const TYPES = [
  {
    name: "Hero",
    blurb: "Headline, photo and up to three buttons.",
    thumb: (
      <Thumb>
        {block}
        {bar("70%")}
        {bar("40%", "accent")}
      </Thumb>
    ),
  },
  {
    name: "Features",
    blurb: "Short reasons to choose them, with bullets.",
    thumb: (
      <Thumb>
        {bar("50%")}
        <span className="flex flex-1 gap-1">
          {block}
          {block}
          {block}
        </span>
      </Thumb>
    ),
  },
  {
    name: "Product Grid",
    blurb: "Products or services with photos and prices.",
    thumb: (
      <Thumb>
        {bar("45%")}
        <span className="grid flex-1 grid-cols-3 grid-rows-2 gap-[3px]">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="rounded-[2px] bg-[#e2e6ee]" />
          ))}
        </span>
      </Thumb>
    ),
  },
  {
    name: "Gallery",
    blurb: "Photos with captions and alt text.",
    thumb: (
      <Thumb grid>
        <span className="grid grid-cols-2 grid-rows-2 gap-[3px]">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="rounded-[2px] bg-[#e2e6ee]" />
          ))}
        </span>
      </Thumb>
    ),
  },
  {
    name: "Testimonials",
    blurb: "Quotes, names and roles.",
    thumb: (
      <Thumb>
        <span className="flex flex-1 flex-col justify-center gap-1">
          {bar("88%")}
          {bar("72%")}
          <span className="mt-1">{bar("34%", "accent")}</span>
        </span>
      </Thumb>
    ),
  },
  {
    name: "FAQ",
    blurb: "Questions and answers that open on click.",
    thumb: (
      <Thumb>
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="h-[9px] rounded-[2px] bg-[#e2e6ee]" />
        ))}
      </Thumb>
    ),
  },
  {
    name: "Call to Action",
    blurb: "A short band with one clear button.",
    thumb: (
      <Thumb>
        <span className="flex h-full flex-col items-center justify-center gap-1.5 rounded bg-accent-tint">
          {bar("60%")}
          <span className="block h-1.5 w-[30%] rounded-[2px] bg-accent" />
        </span>
      </Thumb>
    ),
  },
  {
    name: "Contact",
    blurb: "Address, hours, map and a message form.",
    thumb: (
      <Thumb>
        <span className="flex flex-1 gap-1">
          <span className="flex flex-1 flex-col gap-[3px]">
            {bar("80%")}
            {bar("60%")}
            {bar("70%")}
          </span>
          {block}
        </span>
      </Thumb>
    ),
  },
  {
    name: "Text Block",
    blurb: "Paragraphs for an About or Policy page.",
    thumb: (
      <Thumb>
        <span className="flex flex-1 flex-col justify-center gap-1">
          {bar("55%")}
          {bar("92%", "fill")}
          {bar("88%", "fill")}
          {bar("76%", "fill")}
        </span>
      </Thumb>
    ),
  },
];

export function SectionTypeGrid() {
  return (
    <ul className="mt-8 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {TYPES.map((t) => (
        <li
          key={t.name}
          className="flex gap-3.5 rounded-[11px] border border-line bg-surface p-4"
        >
          <span aria-hidden>{t.thumb}</span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">{t.name}</span>
            <span className="mt-1 block text-mid leading-[1.45] text-quiet">{t.blurb}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
