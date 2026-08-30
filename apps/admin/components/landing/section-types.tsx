import type { ReactNode } from "react";
import { Stagger } from "@/components/landing/motion";

/**
 * The nine section types, each drawn as a coloured mini-page — the same sheets
 * the hero throws into the air (`flying-papers.tsx`), here landed in a grid.
 * Every tile is a tinted paper holding a white page with that type's wireframe
 * drawn in the tint's ink, tilted a degree or two like a sticker that was
 * pressed on by hand; it straightens and lifts when pointed at. The shape is
 * still line art, never a filled mock: the design is the developer's, we only
 * hand over the fields.
 *
 * These nine mirror `SECTION_REGISTRY` in `packages/shared/src/registry.ts`.
 * If a type is added there, add it here too.
 *
 * Server component: the tiles arrive with `<Stagger sticker>`; every hover is
 * CSS. Nothing here needs a client boundary.
 */

type Tone = "blue" | "sun" | "mint" | "sky" | "lilac";

/** Paper (tile) · ink (bars, filled blocks) · wash (photo blocks) per tone. */
const TONE: Record<Tone, { paper: string; ink: string; wash: string; text: string }> = {
  blue:  { paper: "bg-accent-soft",  ink: "bg-accent",     wash: "bg-accent-tint",   text: "text-accent" },
  sun:   { paper: "bg-wash-butter",  ink: "bg-[#e6b91c]",  wash: "bg-[#fbe9a6]",     text: "text-sun-ink" },
  mint:  { paper: "bg-wash-mint",    ink: "bg-[#3fbd85]",  wash: "bg-[#cdebd9]",     text: "text-published-ink" },
  sky:   { paper: "bg-wash-sky",     ink: "bg-[#6fa9e6]",  wash: "bg-[#cfe2f7]",     text: "text-accent-dark" },
  lilac: { paper: "bg-wash-lilac",   ink: "bg-[#9d8bd4]",  wash: "bg-[#ddd5f0]",     text: "text-[#5b4a99]" },
};

/** A line of copy in the wireframe. */
function Rule({ w, strong = false }: { w: string; strong?: boolean }) {
  return (
    <span
      className={`block h-[3px] rounded-full ${strong ? "bg-ink/35" : "bg-ink/12"}`}
      style={{ width: w }}
    />
  );
}

/** A photo or media block, in the tone's wash. */
function Photo({
  wash,
  className = "",
  children,
}: {
  wash: string;
  className?: string;
  children?: ReactNode;
}) {
  return <span className={`block rounded-[3px] ${wash} ${className}`}>{children}</span>;
}

/** A button, in the tone's ink. */
function Btn({ ink, w = "30%" }: { ink: string; w?: string }) {
  return <span className={`block h-[7px] rounded-full ${ink}`} style={{ width: w }} />;
}

type SectionType = {
  name: string;
  blurb: string;
  tone: Tone;
  rot: number;
  page: (t: (typeof TONE)[Tone]) => ReactNode;
};

const TYPES: SectionType[] = [
  {
    name: "Hero",
    blurb: "Headline, photo and up to three buttons.",
    tone: "blue",
    rot: -1.6,
    page: (t) => (
      <>
        <Photo wash={t.wash} className="h-[40%] w-full" />
        <Rule w="70%" strong />
        <Rule w="46%" />
        <span className="mt-[2%] flex gap-[5%]">
          <Btn ink={t.ink} w="26%" />
          <span className="block h-[7px] w-[26%] rounded-full border border-ink/25" />
        </span>
      </>
    ),
  },
  {
    name: "Features",
    blurb: "Short reasons to choose them, with bullets.",
    tone: "sun",
    rot: 1.2,
    page: (t) => (
      <>
        <Rule w="44%" strong />
        <span className="mt-[3%] grid flex-1 grid-cols-3 gap-[5%]">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="flex flex-col gap-[6px]">
              <span className={`block h-[10px] w-[10px] rounded-full ${t.ink}`} />
              <Rule w="90%" />
              <Rule w="70%" />
            </span>
          ))}
        </span>
      </>
    ),
  },
  {
    name: "Product Grid",
    blurb: "Products or services with photos and prices.",
    tone: "mint",
    rot: -0.8,
    page: (t) => (
      <>
        <Rule w="40%" strong />
        <span className="mt-[3%] grid flex-1 grid-cols-3 gap-[5%]">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="flex flex-col gap-[5px]">
              <Photo wash={t.wash} className="h-[26px] w-full" />
              <Rule w="80%" />
              <Rule w="40%" strong />
            </span>
          ))}
        </span>
      </>
    ),
  },
  {
    name: "Gallery",
    blurb: "Photos with captions and alt text.",
    tone: "lilac",
    rot: 1.5,
    page: (t) => (
      <span className="grid flex-1 grid-cols-3 grid-rows-2 gap-[5%]">
        {Array.from({ length: 6 }, (_, i) => (
          <Photo key={i} wash={i % 2 ? t.wash : t.ink + " opacity-70"} className="h-full w-full" />
        ))}
      </span>
    ),
  },
  {
    name: "Testimonials",
    blurb: "Quotes, names and roles.",
    tone: "sky",
    rot: -1.2,
    page: (t) => (
      <span className="flex flex-1 flex-col justify-center gap-[6px]">
        <span className={`font-display text-[22px] leading-none ${t.text}`}>&ldquo;</span>
        <Rule w="92%" />
        <Rule w="76%" />
        <span className="mt-[4%] flex items-center gap-[6px]">
          <span className={`block h-[12px] w-[12px] rounded-full ${t.ink}`} />
          <Rule w="34%" strong />
        </span>
      </span>
    ),
  },
  {
    name: "FAQ",
    blurb: "Questions and answers that open on click.",
    tone: "sun",
    rot: 0.9,
    page: (t) => (
      <span className="flex flex-1 flex-col justify-center gap-[8px]">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="flex items-center gap-[6px] border-b border-ink/10 pb-[6px]">
            <Rule w={i === 1 ? "58%" : "72%"} strong />
            <span className={`ml-auto block h-[8px] w-[8px] rounded-[2px] ${t.ink}`} />
          </span>
        ))}
      </span>
    ),
  },
  {
    name: "Call to Action",
    blurb: "A short band with one clear button.",
    tone: "blue",
    rot: -1.4,
    page: (t) => (
      <span className={`flex flex-1 flex-col items-center justify-center gap-[8px] rounded-[4px] ${t.wash} p-[8%]`}>
        <Rule w="60%" strong />
        <Rule w="44%" />
        <span className="mt-[2%]">
          <Btn ink={t.ink} w="42px" />
        </span>
      </span>
    ),
  },
  {
    name: "Contact",
    blurb: "Address, hours, map and a message form.",
    tone: "mint",
    rot: 1.3,
    page: (t) => (
      <span className="flex flex-1 gap-[7%]">
        <span className="flex flex-1 flex-col justify-center gap-[6px]">
          <Rule w="70%" strong />
          <Rule w="86%" />
          <Rule w="60%" />
          <span className="mt-[4%]">
            <Btn ink={t.ink} w="52%" />
          </span>
        </span>
        <Photo wash={t.wash} className="relative w-[42%] overflow-hidden">
          <span className={`absolute top-1/2 left-1/2 block h-[10px] w-[10px] -translate-x-1/2 -translate-y-full rounded-full ${t.ink}`} />
        </Photo>
      </span>
    ),
  },
  {
    name: "Text Block",
    blurb: "Paragraphs for an About or Policy page.",
    tone: "lilac",
    rot: -0.9,
    page: () => (
      <span className="flex flex-1 flex-col justify-center gap-[6px]">
        <Rule w="48%" strong />
        <Rule w="96%" />
        <Rule w="88%" />
        <Rule w="92%" />
        <Rule w="64%" />
      </span>
    ),
  },
];

export function SectionTypeGrid() {
  // A plain <div> grid, not <ul>/<li>: <Stagger> wraps each child in its own
  // <div> for the reveal, so <ul> would nest <div> directly inside it (invalid).
  return (
    <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Stagger sticker>
        {TYPES.map((t, i) => {
          const tone = TONE[t.tone];
          return (
            <div
              key={t.name}
              className={`group relative h-full rounded-[14px] border border-ink/10 p-3 transition-[transform,box-shadow] duration-300 ease-out rotate-(--tilt) hover:-translate-y-1 hover:rotate-0 hover:shadow-[0_22px_40px_-22px_rgba(27,30,36,0.45)] ${tone.paper}`}
              style={{ ["--tilt" as string]: `${t.rot}deg` }}
            >
              {/* the mini page */}
              <div className="flex aspect-[1.55] flex-col gap-[6px] overflow-hidden rounded-[8px] border border-ink/10 bg-white p-[9%] shadow-[0_8px_22px_-14px_rgba(27,30,36,0.4)] transition-transform duration-300 group-hover:scale-[1.02]">
                <span className={`mb-[2%] block h-[5px] w-[34%] rounded-full ${tone.ink}`} />
                {t.page(tone)}
              </div>

              <div className="flex items-baseline justify-between gap-3 px-1.5 pt-3.5 pb-1">
                <span className="font-mono text-[12px] font-semibold tracking-[0.07em] text-ink uppercase">
                  {t.name}
                </span>
                <span className={`font-mono text-[11px] ${tone.text}`}>{String(i + 1).padStart(2, "0")}</span>
              </div>
              <p className="px-1.5 pb-1 text-mid leading-[1.5] text-slate">{t.blurb}</p>
            </div>
          );
        })}
      </Stagger>
    </div>
  );
}
