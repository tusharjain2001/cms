"use client";

import {
  Children,
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ElementType, ReactNode, RefObject } from "react";

/**
 * The ONE marketing client-motion module (cms-redesign/direction.md §2, §A.5).
 *
 * Every marketing page is a server component; all animation lives here, behind
 * IntersectionObserver + CSS keyframes/transitions + a single rAF loop (the
 * plate watermark). The nine primitives below are a frozen API — workstreams B
 * and C code against these exact signatures.
 *
 * The contract every primitive keeps:
 *  - Content is fully visible pre-hydration (server HTML) and under
 *    `prefers-reduced-motion: reduce` — no `opacity:0` orphans gated on JS.
 *  - Reveals fire once, at ~20% visibility, and never re-trigger.
 *  - Only transform / opacity / clip-path animate.
 *  - Never imported from app/(dash) — the dashboard stays calm.
 */

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** paper/sky/butter/lilac/mint/plate → the CSS variable the wrapper paints. */
const STAGE_VAR: Record<string, string> = {
  paper: "var(--color-canvas)",
  sky: "var(--color-wash-sky)",
  butter: "var(--color-wash-butter)",
  lilac: "var(--color-wash-lilac)",
  mint: "var(--color-wash-mint)",
  plate: "var(--color-plate)",
};

/* ------------------------------------------------------------------ M1 */

/**
 * Page-level stage light. Wrap the whole landing (or a pricing subset). It
 * observes every `[data-stage]` band at the 50% viewport line and cross-fades
 * the wrapper's background-color (700ms). While live it zeroes the bands' own
 * backgrounds so the wrapper wash shows through; under reduced motion it does
 * nothing and the bands keep the static washes `<Band stage>` painted.
 */
export function StageController({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || prefersReducedMotion()) return;

    const bands = Array.from(wrap.querySelectorAll<HTMLElement>("[data-stage]"));
    if (!bands.length) return;

    const firstStage = bands[0].dataset.stage ?? "paper";
    wrap.style.transition = "background-color 700ms ease";
    wrap.style.backgroundColor = STAGE_VAR[firstStage] ?? STAGE_VAR.paper;

    // Light-wash bands become transparent windows onto the wrapper wash. The
    // plate band stays opaque: its text is paper-coloured and would vanish on a
    // light wrapper while scrolling in/out before the wrapper reaches plate.
    const prevBg = bands.map((b) => b.style.backgroundColor);
    bands.forEach((b) => {
      if (b.dataset.stage !== "plate") b.style.backgroundColor = "transparent";
    });

    let current = firstStage;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const stage = (e.target as HTMLElement).dataset.stage;
          if (stage && stage !== current) {
            current = stage;
            wrap.style.backgroundColor = STAGE_VAR[stage] ?? STAGE_VAR.paper;
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    bands.forEach((b) => io.observe(b));

    return () => {
      io.disconnect();
      wrap.style.transition = "";
      wrap.style.backgroundColor = "";
      bands.forEach((b, i) => (b.style.backgroundColor = prevBg[i]));
    };
  }, []);

  return <div ref={wrapRef}>{children}</div>;
}

/* ------------------------------------------------------------------ M2/M7 */

/**
 * Print-wipe on first reveal; optional rotation settle (sticker).
 *
 * Visibility is NEVER gated on JS. The print-wipe is an entrance for content
 * that scrolls IN from below, so content already on screen at mount is left
 * exactly as the server rendered it — visible. Hiding what's already visible is
 * what flashed/kept the whole page blank after hydration. Below-fold content is
 * hidden and revealed when it scrolls in (a plain intersection, so it works for
 * bands taller than the viewport), and a fail-open timer guarantees nothing can
 * stay hidden even if the observer never fires.
 */
function useReveal(
  ref: RefObject<HTMLElement | null>,
  opts: { delay?: number; rotate?: number } = {},
) {
  const { delay = 0, rotate = 0 } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    // Already in (or above) the viewport at mount? Leave it visible — no hide,
    // no animation. This is the whole fix for the hero/first-band blank.
    const vh = window.innerHeight || 0;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < vh) return;

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      el.style.transition =
        "clip-path 550ms var(--ease-press), opacity 150ms linear, transform 550ms var(--ease-press)";
      el.style.clipPath = "inset(0 0 0 0)";
      el.style.opacity = "1";
      el.style.transform = "translateY(0) rotate(0deg)";
      const done = () => {
        el.style.willChange = "";
        el.removeEventListener("transitionend", done);
      };
      el.addEventListener("transitionend", done);
    };

    el.style.clipPath = "inset(0 100% 0 0)";
    el.style.opacity = "0";
    el.style.transform = `translateY(16px)${rotate ? ` rotate(${rotate}deg)` : ""}`;
    el.style.willChange = "clip-path, opacity, transform";

    const io = new IntersectionObserver(
      (entries, obs) => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        window.setTimeout(reveal, delay);
      },
      // Any intersection triggers it (a % threshold can never be met by a band
      // taller than the viewport); the small bottom margin gives a lead-in.
      { rootMargin: "0px 0px -12% 0px", threshold: 0 },
    );
    io.observe(el);

    // Fail open: content is never left hidden. If the observer somehow never
    // fires, reveal anyway shortly after it would have scrolled into play.
    const failsafe = window.setTimeout(reveal, 2500 + delay);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [ref, delay, rotate]);
}

/** Print-wipe reveal. Renders `as` (default div); visible before hydration. */
export function Print({
  children,
  delay = 0,
  as = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useReveal(ref, { delay });
  return createElement(as, { ref, className }, children);
}

/** Incremental print delays (capped at 6); `sticker` adds the ±1.2° settle. */
export function Stagger({
  children,
  step = 70,
  sticker = false,
}: {
  children: ReactNode;
  step?: number;
  sticker?: boolean;
}) {
  const items = Children.toArray(children);
  return (
    <>
      {items.map((child, i) => (
        <StaggerItem
          key={i}
          delay={Math.min(i, 6) * step}
          rotate={sticker ? (i % 2 === 0 ? -1.2 : 1.2) : 0}
        >
          {child}
        </StaggerItem>
      ))}
    </>
  );
}

function StaggerItem({
  children,
  delay,
  rotate,
}: {
  children: ReactNode;
  delay: number;
  rotate: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref, { delay, rotate });
  return <div ref={ref}>{children}</div>;
}

/* ------------------------------------------------------------------ M6 */

/**
 * Continuous horizontal marquee: a duplicated (`aria-hidden`) track scrolling
 * over `speed` seconds, paused on hover/focus. Under reduced motion it becomes
 * a static wrapped row of the same content (CSS `motion-reduce:` variants — no
 * JS, no hydration branch).
 */
export function Marquee({
  children,
  speed = 38,
  className = "",
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden motion-reduce:overflow-visible ${className}`}>
      <div
        className="flex w-max animate-marquee hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-x-6 motion-reduce:gap-y-2"
        style={{ animationDuration: `${speed}s` }}
      >
        <div className="flex shrink-0 items-center motion-reduce:flex-wrap motion-reduce:justify-center">
          {children}
        </div>
        <div
          aria-hidden
          className="flex shrink-0 items-center motion-reduce:hidden"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ M10 */

/** Live-green heartbeat dot + optional mono label. Static under reduced motion. */
export function LiveDot({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-published animate-heartbeat"
      />
      {label && (
        <span className="font-mono text-[12px] font-normal uppercase tracking-[0.08em] text-quiet">
          {label}
        </span>
      )}
    </span>
  );
}

/** Count a figure up once on reveal (~400ms). Static value under reduced motion. */
export function CountUp({
  value,
  duration = 400,
  className = "",
}: {
  value: number | string;
  duration?: number;
  className?: string;
}) {
  const str = String(value);
  const parts = str.match(/^(\D*)([\d.]+)(\D*)$/);
  const [display, setDisplay] = useState(str);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!parts || prefersReducedMotion()) {
      setDisplay(str);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const pre = parts[1];
    const numStr = parts[2];
    const post = parts[3];
    const target = parseFloat(numStr);
    const decimals = numStr.includes(".") ? numStr.split(".")[1].length : 0;
    setDisplay(`${pre}${(0).toFixed(decimals)}${post}`);

    let started = false;
    const io = new IntersectionObserver(
      (entries, obs) => {
        if (!entries[0].isIntersecting || started) return;
        started = true;
        obs.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          if (p < 1) {
            setDisplay(`${pre}${(target * eased).toFixed(decimals)}${post}`);
            requestAnimationFrame(tick);
          } else {
            setDisplay(str);
          }
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [str, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}

/* ------------------------------------------------------------------ M9 */

/**
 * Wraps a block (the editor demo) and draws a 2px Press-Blue border around it
 * via SVG stroke-dashoffset, once, on first reveal. Pre-drawn under reduced
 * motion. The frame is measured so the corner radius is exact.
 */
export function FrameDraw({
  children,
  radius = 16,
  className = "",
}: {
  children: ReactNode;
  radius?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [drawn, setDrawn] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDrawn(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries, obs) => {
        if (entries[0].isIntersecting) {
          obs.disconnect();
          setDrawn(true);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {children}
      {box.w > 0 && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={box.w}
          height={box.h}
        >
          <rect
            x="1"
            y="1"
            width={Math.max(0, box.w - 2)}
            height={Math.max(0, box.h - 2)}
            rx={radius}
            ry={radius}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: drawn ? 0 : 1,
              transition: "stroke-dashoffset 700ms var(--ease-press)",
            }}
          />
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ M5 */

/** Parallax-lite for the plate watermark — one rAF loop, drift clamped ±60px. */
export function GhostDrift({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const center = rect.top + rect.height / 2;
      const prog = (center - vh / 2) / vh; // ~ +0.5 (below) .. -0.5 (above)
      const y = Math.max(-60, Math.min(60, prog * -100));
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ M4 */

export interface Step {
  /** Mono index, e.g. "01". */
  index: string;
  title: ReactNode;
  body: ReactNode;
  /** The visual shown in the sticky panel (and inline in the stacked fallback). */
  visual: ReactNode;
}

/**
 * The press run: a sticky visual panel that cross-fades between step visuals as
 * the reader scrolls the step text, with the active mono index lit in Press
 * Blue. Under 768px or reduced motion it renders as stacked cards (no pinning),
 * which is also the server / no-JS output — the enhancement is added on mount.
 */
export function StickySteps({
  steps,
  intro,
  className = "",
}: {
  steps: Step[];
  /** Heading block rendered above the sticky visual (left col) / cards (mobile),
   * so the section fills from its first frame instead of a bare scroll runway. */
  intro?: ReactNode;
  className?: string;
}) {
  const [enhanced, setEnhanced] = useState(false);
  const [active, setActive] = useState(0);
  const blockRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const check = () => setEnhanced(window.innerWidth >= 768 && !prefersReducedMotion());
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!enhanced) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = blockRefs.current.indexOf(e.target as HTMLDivElement);
          if (i >= 0) setActive(i);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    blockRefs.current.forEach((b) => b && io.observe(b));
    return () => io.disconnect();
  }, [enhanced, steps.length]);

  if (!enhanced) {
    return (
      <div className={className}>
        {intro && <div className="mb-8">{intro}</div>}
        <div className="flex flex-col gap-6">
          {steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <div className="mb-3 font-mono text-[12px] font-semibold tracking-[0.08em] text-accent">
              {s.index}
            </div>
            <h3 className="mb-2 text-[19px] font-semibold">{s.title}</h3>
            <div className="mb-4 text-quiet">{s.body}</div>
            <div>{s.visual}</div>
          </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-[1fr_1.1fr] gap-10 ${className}`}>
      <div>
        {intro && <div className="mb-10">{intro}</div>}
        <div className="sticky top-24 h-[52vh]">
          {steps.map((s, i) => (
            <div
              key={i}
              className="absolute inset-0 flex items-start transition-opacity duration-[450ms] ease-out"
              style={{ opacity: active === i ? 1 : 0 }}
              aria-hidden={active !== i}
            >
              <div className="w-full">{s.visual}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        {steps.map((s, i) => (
          <div
            key={i}
            ref={(el) => {
              blockRefs.current[i] = el;
            }}
            className="flex min-h-[52vh] flex-col justify-start pt-1 first:pt-0"
          >
            <div
              className={`mb-3 font-mono text-[13px] font-semibold tracking-[0.08em] transition-colors duration-300 ${
                active === i ? "text-accent" : "text-muted"
              }`}
            >
              {s.index}
            </div>
            <h3 className="mb-3 text-[24px] font-semibold">{s.title}</h3>
            <div className="text-quiet">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
