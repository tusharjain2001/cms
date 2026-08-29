/**
 * Flying Papers — the hero's signature.
 *
 * A drift of miniature published pages floating behind the headline. Pagecraft
 * publishes pages, so the atmosphere behind the thesis IS pages: little site
 * cards (a coloured header bar, a photo block, a few lines of copy) and flat
 * colour swatches, tilted and scattered, each drifting on its own slow loop.
 * The decoration means something — these are the sites your clients edit,
 * caught mid-flight the instant Publish is pressed.
 *
 * Server component, zero client JavaScript: the drift is a pure CSS keyframe
 * (`.pc-paper` / `pcPaperDrift` in globals.css) that animates transform only,
 * so it is GPU-cheap and needs no client boundary. Every sheet keeps its tilt
 * as an inline `transform`, so under `prefers-reduced-motion` the animation
 * simply stops and the composition holds as a finished, scattered poster.
 *
 * Entirely decorative: the whole layer is aria-hidden and pointer-events-none,
 * and it never carries copy the reader needs.
 */

type Tone = "blue" | "sun" | "mint" | "sky" | "lilac" | "butter";

const BAR: Record<Tone, string> = {
  blue: "bg-accent",
  sun: "bg-sun",
  mint: "bg-mint-pop",
  sky: "bg-[#8fc0f4]",
  lilac: "bg-[#b7a9e0]",
  butter: "bg-[#f2c85a]",
};

const SWATCH: Record<Tone, string> = {
  blue: "bg-accent-soft",
  sun: "bg-wash-butter",
  mint: "bg-wash-mint",
  sky: "bg-wash-sky",
  lilac: "bg-wash-lilac",
  butter: "bg-wash-butter",
};

type Paper = {
  /** width in px; height follows from the kind */
  w: number;
  kind: "page" | "photo" | "swatch";
  tone: Tone;
  /** absolute placement, any subset — percentages read as % of the hero box */
  pos: { top?: string; bottom?: string; left?: string; right?: string };
  /** resting tilt, kept even under reduced motion */
  rot: number;
  /** drift half-travel + rotation delta at the midpoint of the loop */
  dx: number;
  dy: number;
  dr: number;
  dur: number;
  delay: number;
  /** which breakpoint the sheet appears at (gutters vanish on small screens) */
  show: "" | "sm:hidden" | "hidden sm:block" | "hidden lg:block";
};

/**
 * Hand-placed so the sheets crowd the gutters and top band and only peek behind
 * the centred column, never landing on the glyphs. Positions are % of the whole
 * hero box (which runs down through the demo), so the drift covers the page top
 * to bottom. Tuned against screenshots.
 *
 * The gutter sheets (`hidden sm:block` / `lg`) vanish on phones, where the
 * column is full-bleed and they would land on the type; a small dedicated
 * `sm:hidden` set keeps the motif alive on mobile in the safe top and demo
 * corners.
 */
const PAPERS: Paper[] = [
  // desktop drift — weighted into the open right and top, balancing the
  // left-aligned thesis. Every sheet is a real mini-page; positions are % of the
  // upper hero block (which stops above the demo), so the drift never reaches it.
  { w: 196, kind: "photo",  tone: "blue",   pos: { top: "16%", right: "1%"   }, rot: 5,   dx: -10, dy: 18,  dr: 2,  dur: 27, delay: -3,  show: "hidden sm:block" },
  { w: 128, kind: "page",   tone: "sun",    pos: { top: "-6%", right: "20%"  }, rot: -8,  dx: 8,   dy: -16, dr: -3, dur: 23, delay: -9,  show: "hidden sm:block" },
  { w: 104, kind: "page",   tone: "mint",   pos: { top: "1%",  right: "4%"   }, rot: 10,  dx: -7,  dy: -12, dr: 3,  dur: 20, delay: -6,  show: "hidden lg:block" },
  { w: 96,  kind: "page",   tone: "lilac",  pos: { top: "54%", right: "-3%"  }, rot: 8,   dx: -6,  dy: 14,  dr: -2, dur: 25, delay: -12, show: "hidden lg:block" },
  { w: 156, kind: "page",   tone: "blue",   pos: { bottom: "-8%", right: "16%" }, rot: -6, dx: -8, dy: 16,  dr: -2, dur: 28, delay: -2,  show: "hidden sm:block" },
  { w: 88,  kind: "photo",  tone: "sun",    pos: { top: "40%", right: "30%"  }, rot: 4,   dx: 7,   dy: -12, dr: 2,  dur: 21, delay: -14, show: "hidden lg:block" },
  { w: 84,  kind: "page",   tone: "sky",    pos: { top: "3%",  left: "52%"   }, rot: 12,  dx: 6,   dy: -10, dr: 4,  dur: 19, delay: -7,  show: "hidden lg:block" },
  { w: 108, kind: "page",   tone: "mint",   pos: { bottom: "2%", right: "38%" }, rot: 7,   dx: 5,   dy: 12,  dr: 3,  dur: 24, delay: -10, show: "hidden lg:block" },
  // mobile — small mini-pages in the safe top corners, px-anchored (the block
  // is full-bleed on phones) and clipped by the top edge so they read as sheets
  // flying into frame; one more peeks from the right just above the demo.
  { w: 64,  kind: "page",   tone: "blue",   pos: { top: "22px", left: "1%"  }, rot: -12, dx: 6,   dy: -12, dr: 3,  dur: 21, delay: -5,  show: "sm:hidden" },
  { w: 56,  kind: "page",   tone: "sun",    pos: { top: "14px", right: "2%" }, rot: 12,  dx: -5,  dy: -10, dr: -3, dur: 19, delay: -9,  show: "sm:hidden" },
  { w: 56,  kind: "photo",  tone: "mint",   pos: { bottom: "3%", right: "-5%" }, rot: -9, dx: -5,  dy: 12,  dr: -2, dur: 23, delay: -3,  show: "sm:hidden" },
];

function Lines({ n, tint }: { n: number; tint: string }) {
  const widths = ["92%", "78%", "64%", "84%", "56%"];
  return (
    <div className="mt-[9%] flex flex-col gap-[6%]">
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className={`block h-[3px] rounded-full ${tint}`}
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

function Sheet({ p }: { p: Paper }) {
  const ratio = p.kind === "swatch" ? 0.74 : 1.26; // swatches squarer, pages portrait
  return (
    <div
      className={`pc-paper absolute ${p.show}`}
      style={{
        ...p.pos,
        width: p.w,
        height: Math.round(p.w * ratio),
        // resting transform — kept when the drift is switched off
        transform: `rotate(${p.rot}deg)`,
        ["--rot" as string]: `${p.rot}deg`,
        ["--dx" as string]: `${p.dx}px`,
        ["--dy" as string]: `${p.dy}px`,
        ["--dr" as string]: `${p.dr}deg`,
        ["--dur" as string]: `${p.dur}s`,
        ["--delay" as string]: `${p.delay}s`,
      }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[7px] border border-ink/12 bg-white p-[10%] shadow-[0_10px_30px_-14px_rgba(27,30,36,0.45)]">
        {p.kind === "swatch" ? (
          <div className={`h-full w-full rounded-[3px] ${SWATCH[p.tone]}`} />
        ) : (
          <>
            <span className={`block h-[10%] w-[46%] rounded-full ${BAR[p.tone]}`} />
            {p.kind === "photo" && (
              <div className={`mt-[9%] h-[40%] w-full rounded-[3px] ${SWATCH[p.tone]}`} />
            )}
            <Lines n={p.kind === "photo" ? 2 : 3} tint="bg-ink/10" />
          </>
        )}
      </div>
    </div>
  );
}

export function FlyingPapers() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PAPERS.map((p, i) => (
        <Sheet key={i} p={p} />
      ))}
    </div>
  );
}
