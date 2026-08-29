/**
 * Flying Papers — the hero's signature, and a motif that recurs down the page.
 *
 * A drift of miniature published pages: little site cards (a coloured header
 * bar, a photo block, a few lines of copy). Pagecraft publishes pages, so the
 * atmosphere behind the thesis IS pages — the sites your clients edit, caught
 * mid-flight the instant Publish is pressed. The decoration means something.
 *
 * Two layers, one look, both server components with zero client JavaScript:
 *  - `<FlyingPapers>` (hero): sheets drift on a slow CSS keyframe loop
 *    (`.pc-paper` / `pcPaperDrift`), transform only.
 *  - `<SectionPapers>` (down the page): the same sheets, quieter, riding the
 *    scroll on a CSS scroll timeline (`.pc-parallax`) so bands feel alive as
 *    you pass them.
 *
 * Both keep each sheet's tilt as an inline transform, so under
 * `prefers-reduced-motion` (or a browser without scroll timelines) the motion
 * stops and the composition holds as a finished, scattered poster. Every layer
 * is aria-hidden + pointer-events-none and never carries copy the reader needs.
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

type Kind = "page" | "photo" | "swatch";

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

/** The card itself — a mini published page. Shared by both layers. */
function SheetFace({ kind, tone }: { kind: Kind; tone: Tone }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[7px] border border-ink/12 bg-white p-[10%] shadow-[0_10px_30px_-14px_rgba(27,30,36,0.45)]">
      {kind === "swatch" ? (
        <div className={`h-full w-full rounded-[3px] ${SWATCH[tone]}`} />
      ) : (
        <>
          <span className={`block h-[10%] w-[46%] rounded-full ${BAR[tone]}`} />
          {kind === "photo" && (
            <div className={`mt-[9%] h-[38%] w-full rounded-[3px] ${SWATCH[tone]}`} />
          )}
          <Lines n={kind === "photo" ? 1 : 3} tint="bg-ink/10" />
          {kind === "photo" && (
            <span className="mt-[8%] block h-[7%] w-[38%] rounded-full bg-accent" />
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- hero drift */

type Paper = {
  w: number;
  kind: Kind;
  tone: Tone;
  pos: { top?: string; bottom?: string; left?: string; right?: string };
  rot: number;
  dx: number;
  dy: number;
  dr: number;
  dur: number;
  delay: number;
  show: "" | "sm:hidden" | "hidden sm:block" | "hidden lg:block";
};

/**
 * Hand-placed so the sheets crowd the open right and top, balancing the
 * left-aligned thesis. Every sheet is a real mini-page; positions are % of the
 * upper hero block (which stops above the demo), so the drift never reaches it.
 */
const PAPERS: Paper[] = [
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
  // flying into frame; one more peeks off the right edge just above the demo.
  { w: 64,  kind: "page",   tone: "blue",   pos: { top: "22px", left: "1%"  }, rot: -12, dx: 6,   dy: -12, dr: 3,  dur: 21, delay: -5,  show: "sm:hidden" },
  { w: 56,  kind: "page",   tone: "sun",    pos: { top: "14px", right: "2%" }, rot: 12,  dx: -5,  dy: -10, dr: -3, dur: 19, delay: -9,  show: "sm:hidden" },
  { w: 56,  kind: "photo",  tone: "mint",   pos: { bottom: "3%", right: "-5%" }, rot: -9, dx: -5, dy: 12,  dr: -2, dur: 23, delay: -3,  show: "sm:hidden" },
];

function Sheet({ p, i }: { p: Paper; i: number }) {
  const ratio = p.kind === "swatch" ? 0.74 : 1.26;
  // Fly-in: from off the sheet's own side (right sheets sweep in from the
  // right, left from the left), rising, over-rotated then unwinding, staggered.
  const ix = p.pos.right !== undefined ? 74 : p.pos.left !== undefined ? -60 : 20;
  const irot = p.rot >= 0 ? 14 : -14;
  const inDelay = Math.min(720, 110 + i * 55);
  return (
    <div
      className={`pc-paper-in absolute ${p.show}`}
      style={{
        ...p.pos,
        ["--ix" as string]: `${ix}px`,
        ["--irot" as string]: `${irot}deg`,
        ["--in-delay" as string]: `${inDelay}ms`,
      }}
    >
      <div
        className="pc-paper"
        style={{
          width: p.w,
          height: Math.round(p.w * ratio),
          transform: `rotate(${p.rot}deg)`,
          ["--rot" as string]: `${p.rot}deg`,
          ["--dx" as string]: `${p.dx}px`,
          ["--dy" as string]: `${p.dy}px`,
          ["--dr" as string]: `${p.dr}deg`,
          ["--dur" as string]: `${p.dur}s`,
          ["--delay" as string]: `${p.delay}s`,
        }}
      >
        <SheetFace kind={p.kind} tone={p.tone} />
      </div>
    </div>
  );
}

export function FlyingPapers() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PAPERS.map((p, i) => (
        <Sheet key={i} p={p} i={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- section drift */

type SectionPaper = {
  w: number;
  kind: Kind;
  tone: Tone;
  pos: { top?: string; bottom?: string; left?: string; right?: string };
  rot: number;
  /** parallax travel in px (bigger = further/faster as it scrolls past) */
  par: number;
  show?: "" | "hidden sm:block" | "hidden lg:block";
};

/**
 * A quieter set of the same sheets for a band background, riding the scroll on
 * a CSS scroll timeline. The parallax lives on the outer wrapper; the sheet
 * keeps its tilt, so reduced motion / no scroll-timeline support degrades to a
 * still, tilted scatter. Presets keep each band distinct (no two identical).
 */
const SECTION_PRESETS: Record<string, SectionPaper[]> = {
  how: [
    { w: 132, kind: "photo", tone: "blue",  pos: { top: "6%",  right: "2%"  }, rot: 6,  par: 56, show: "hidden sm:block" },
    { w: 92,  kind: "page",  tone: "sun",   pos: { top: "-6%", right: "22%" }, rot: -8, par: 34, show: "hidden lg:block" },
    { w: 104, kind: "page",  tone: "mint",  pos: { bottom: "2%", right: "13%" }, rot: 9, par: 68, show: "hidden lg:block" },
  ],
  types: [
    { w: 120, kind: "page",  tone: "lilac", pos: { top: "-4%", left: "-2%"  }, rot: -7, par: 44, show: "hidden lg:block" },
    { w: 88,  kind: "photo", tone: "sun",   pos: { bottom: "0%", left: "6%" }, rot: 7,  par: 60, show: "hidden lg:block" },
  ],
  cta: [
    // Weighted left into an asymmetric cluster (echoing the hero), not centred.
    { w: 112, kind: "photo", tone: "blue",  pos: { top: "4%",  left: "4%"   }, rot: -11, par: 52, show: "hidden sm:block" },
    { w: 82,  kind: "page",  tone: "sun",   pos: { top: "24%", left: "17%"  }, rot: 7,   par: 38, show: "hidden lg:block" },
    { w: 124, kind: "page",  tone: "mint",  pos: { bottom: "-8%", left: "9%" }, rot: 6,  par: 70, show: "hidden sm:block" },
    { w: 74,  kind: "page",  tone: "lilac", pos: { bottom: "8%", right: "8%" }, rot: -6, par: 32, show: "hidden lg:block" },
  ],
  lilac: [
    { w: 96,  kind: "page",  tone: "sky",   pos: { top: "-5%", right: "2%"  }, rot: 8,  par: 44, show: "hidden lg:block" },
    { w: 80,  kind: "page",  tone: "sun",   pos: { bottom: "1%", left: "-2%" }, rot: -7, par: 58, show: "hidden lg:block" },
  ],
  stats: [
    { w: 92,  kind: "page",  tone: "sun",   pos: { top: "3%",  right: "1%"  }, rot: 8,  par: 46, show: "hidden lg:block" },
    { w: 76,  kind: "page",  tone: "mint",  pos: { top: "15%", right: "12%" }, rot: -6, par: 34, show: "hidden lg:block" },
  ],
  faq: [
    { w: 122, kind: "photo", tone: "blue",  pos: { bottom: "7%", left: "2%"  }, rot: -8, par: 58, show: "hidden sm:block" },
    { w: 80,  kind: "page",  tone: "mint",  pos: { bottom: "12%", right: "3%" }, rot: 7, par: 42, show: "hidden lg:block" },
  ],
};

function SectionSheet({ p }: { p: SectionPaper }) {
  const ratio = 1.26;
  return (
    <div
      className={`pc-parallax absolute ${p.show ?? ""}`}
      style={{ ...p.pos, ["--pc-par" as string]: `${p.par}px` }}
    >
      <div
        style={{ width: p.w, height: Math.round(p.w * ratio), transform: `rotate(${p.rot}deg)` }}
      >
        <SheetFace kind={p.kind} tone={p.tone} />
      </div>
    </div>
  );
}

export function SectionPapers({ preset }: { preset: keyof typeof SECTION_PRESETS }) {
  const papers = SECTION_PRESETS[preset] ?? [];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {papers.map((p, i) => (
        <SectionSheet key={i} p={p} />
      ))}
    </div>
  );
}
