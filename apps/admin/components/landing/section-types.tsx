import type { ReactNode } from "react";
import { Stagger } from "@/components/landing/motion";

/**
 * The nine section types, each drawn as a line wireframe of the shape it makes
 * on a page. The glyphs are deliberately abstract and monochrome — line art in
 * `currentColor`, never a filled mock — because the shape is the developer's,
 * not ours: we hand over the fields, they own the design.
 *
 * These nine mirror `SECTION_REGISTRY` in `packages/shared/src/registry.ts`.
 * If a type is added there, add it here too.
 *
 * The tiles arrive as stickers being pressed on (a staggered print-wipe with a
 * rotation settle, from `<Stagger sticker>`), press into the paper on hover,
 * and carry a voltage dot that switches to the publish green when you point at
 * them — the tactile layer from direction.md §5.6 / M7 / M8. Server component:
 * every bit of that motion is `<Stagger>` from motion.tsx, nothing here.
 */

/** A thin ink rule — a line of text in the wireframe. */
function Rule({ w }: { w: string }) {
  return <span className="block h-[2px] rounded-full bg-current opacity-40" style={{ width: w }} />;
}

/** An outlined block — a photo, card or media slot in the wireframe. */
function Box({ className = "" }: { className?: string }) {
  return <span className={`block rounded-[2px] border border-current opacity-30 ${className}`} />;
}

function Thumb({ children }: { children: ReactNode }) {
  return (
    <span className="mb-4 flex h-[74px] w-full flex-col gap-[6px] rounded-[8px] border border-line-mid bg-sunken p-2.5 text-slate transition-colors duration-200 group-hover:border-accent-line group-hover:bg-accent-soft group-hover:text-accent">
      {children}
    </span>
  );
}

const TYPES: { name: string; blurb: string; glyph: ReactNode }[] = [
  {
    name: "Hero",
    blurb: "Headline, photo and up to three buttons.",
    glyph: (
      <Thumb>
        <Box className="h-[26px] w-full" />
        <Rule w="70%" />
        <Rule w="40%" />
      </Thumb>
    ),
  },
  {
    name: "Features",
    blurb: "Short reasons to choose them, with bullets.",
    glyph: (
      <Thumb>
        <Rule w="50%" />
        <span className="flex flex-1 gap-[6px]">
          <Box className="flex-1" />
          <Box className="flex-1" />
          <Box className="flex-1" />
        </span>
      </Thumb>
    ),
  },
  {
    name: "Product Grid",
    blurb: "Products or services with photos and prices.",
    glyph: (
      <Thumb>
        <Rule w="45%" />
        <span className="grid flex-1 grid-cols-3 grid-rows-2 gap-[4px]">
          {Array.from({ length: 6 }, (_, i) => (
            <Box key={i} className="h-full w-full" />
          ))}
        </span>
      </Thumb>
    ),
  },
  {
    name: "Gallery",
    blurb: "Photos with captions and alt text.",
    glyph: (
      <Thumb>
        <span className="grid flex-1 grid-cols-2 grid-rows-2 gap-[4px]">
          {Array.from({ length: 4 }, (_, i) => (
            <Box key={i} className="h-full w-full" />
          ))}
        </span>
      </Thumb>
    ),
  },
  {
    name: "Testimonials",
    blurb: "Quotes, names and roles.",
    glyph: (
      <Thumb>
        <span className="flex flex-1 flex-col justify-center gap-[6px]">
          <Rule w="88%" />
          <Rule w="72%" />
          <span className="mt-[3px]">
            <Rule w="34%" />
          </span>
        </span>
      </Thumb>
    ),
  },
  {
    name: "FAQ",
    blurb: "Questions and answers that open on click.",
    glyph: (
      <Thumb>
        <span className="flex flex-1 flex-col justify-center gap-[7px]">
          {Array.from({ length: 4 }, (_, i) => (
            <Rule key={i} w={i % 2 === 0 ? "92%" : "64%"} />
          ))}
        </span>
      </Thumb>
    ),
  },
  {
    name: "Call to Action",
    blurb: "A short band with one clear button.",
    glyph: (
      <Thumb>
        <span className="flex flex-1 flex-col items-center justify-center gap-[8px]">
          <Rule w="56%" />
          <Box className="h-[12px] w-[34%]" />
        </span>
      </Thumb>
    ),
  },
  {
    name: "Contact",
    blurb: "Address, hours, map and a message form.",
    glyph: (
      <Thumb>
        <span className="flex flex-1 gap-[8px]">
          <span className="flex flex-1 flex-col justify-center gap-[6px]">
            <Rule w="80%" />
            <Rule w="60%" />
            <Rule w="72%" />
          </span>
          <Box className="w-[38%]" />
        </span>
      </Thumb>
    ),
  },
  {
    name: "Text Block",
    blurb: "Paragraphs for an About or Policy page.",
    glyph: (
      <Thumb>
        <span className="flex flex-1 flex-col justify-center gap-[6px]">
          <Rule w="52%" />
          <Rule w="92%" />
          <Rule w="86%" />
          <Rule w="74%" />
        </span>
      </Thumb>
    ),
  },
];

export function SectionTypeGrid() {
  // A plain <div> grid, not <ul>/<li>: <Stagger> wraps each child in its own
  // <div> for the reveal, so <ul> would nest <div> directly inside it (invalid).
  // These are a decorative capability showcase, so list semantics aren't needed.
  return (
    <div className="mt-9 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <Stagger sticker>
        {TYPES.map((t) => (
          <div
            key={t.name}
            className="group pc-lift relative h-full rounded-[12px] border border-line bg-surface p-4 hover:border-accent-line"
          >
            {/* voltage dot — line colour at rest, publish green when pointed at */}
            <span
              aria-hidden
              className="absolute top-3.5 right-3.5 h-[7px] w-[7px] rounded-full bg-grip transition-colors duration-150 group-hover:bg-published"
            />
            <span aria-hidden>{t.glyph}</span>
            <span className="block font-mono text-[12px] font-medium tracking-[0.06em] text-ink uppercase">
              {t.name}
            </span>
            <span className="mt-1.5 block text-mid leading-[1.5] text-quiet">{t.blurb}</span>
          </div>
        ))}
      </Stagger>
    </div>
  );
}
