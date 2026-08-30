"use client";

import { Fragment, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Eyebrow, H2, Lede } from "@/components/landing/bits";
import { LiveDot, Print } from "@/components/landing/motion";
import { SheetFace } from "@/components/landing/flying-papers";

/**
 * "How it works" as a publish pipeline — the flying-paper motif made literal.
 *
 * Three linked stage cards flow left to right (stacked on mobile): you build the
 * section components in React, your client edits only the words and photos, and
 * Publish regenerates the live page. Between the cards, connectors draw in on
 * scroll and a little paper token glides stage 1 -> 2 -> 3 on a loop, so the
 * page you publish is literally the paper flying down the pipe. Stage 3 is a
 * real mini published page (the hero's `SheetFace`) that pops live with a green
 * heartbeat.
 *
 * Content-visibility contract (this repo's P0 rule): every card, its heading and
 * copy are plain server-rendered markup, fully readable before hydration and
 * under `prefers-reduced-motion`. The cards reveal via `<Print>` (which never
 * hides what is already on screen and always fails open). All the pipeline
 * motion — connector draw, token flow, caret, publish pop — is decorative,
 * transform/opacity only, layered on top, and switched off under reduced motion.
 * The `is-live` class is added by IntersectionObserver purely to trigger the
 * one-shot entrance; nothing depends on it to be visible.
 */

type Tone = "dev" | "client" | "live";

const TAG_CLASS: Record<Tone, string> = {
  dev: "text-accent",
  client: "text-slate",
  live: "text-published",
};

interface Stage {
  tone: Tone;
  tag: string;
  live?: boolean;
  title: string;
  body: string;
  visual: ReactNode;
}

const STAGES: Stage[] = [
  {
    tone: "dev",
    tag: "You",
    title: "The developer builds it once",
    body: "Section components in your own React project. Layout, colour and type live in your code.",
    visual: <CodeVisual />,
  },
  {
    tone: "client",
    tag: "Your client",
    title: "The owner edits the words",
    body: "A dashboard you can use on your phone. Plain fields for text and photos, nothing that can break the design.",
    visual: <EditorVisual />,
  },
  {
    tone: "live",
    tag: "Live",
    live: true,
    title: "The site updates itself",
    body: "One tap on Publish regenerates the live page in seconds, exactly as it was built.",
    visual: <PublishedVisual />,
  },
];

export function PressRun() {
  const ref = useRef<HTMLDivElement>(null);

  // Trigger the one-shot entrance (connectors draw, page pops). Skipped entirely
  // under reduced motion; the cards are visible regardless, so nothing here can
  // leave content blank.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries, obs) => {
        if (!entries[0].isIntersecting) return;
        el.classList.add("is-live");
        obs.disconnect();
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div>
      <div className="mb-10 max-w-[640px] sm:mb-14">
        <Print>
          <Eyebrow>How it works</Eyebrow>
        </Print>
        <Print delay={70}>
          <H2 className="mt-3">Your code in. Their words out.</H2>
        </Print>
        <Print delay={140}>
          <Lede className="mt-4">
            Build the sections once. Your client edits only the text and photos, then presses
            Publish. The live site updates itself, and the design, layout and colour never change.
          </Lede>
        </Print>
      </div>

      <div
        ref={ref}
        className="pc-pipe grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-stretch lg:gap-0"
      >
        {STAGES.map((s, i) => (
          <Fragment key={s.title}>
            {i > 0 && <Connector n={i as 1 | 2} />}
            <Print delay={i * 120} className="h-full">
              <StageCard stage={s} />
            </Print>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- stage card */

function StageCard({ stage }: { stage: Stage }) {
  return (
    <div className="pc-lift flex h-full flex-col rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_50px_-40px_rgba(30,35,45,.35)]">
      <div className="mb-4 flex h-5 items-center justify-between">
        {stage.live ? (
          <LiveDot label="Live" />
        ) : (
          <span
            className={`font-mono text-[11px] font-medium tracking-[0.1em] uppercase ${TAG_CLASS[stage.tone]}`}
          >
            {stage.tag}
          </span>
        )}
        <span aria-hidden className="font-mono text-[11px] text-faint">
          {stage.tone === "dev" ? ".tsx" : stage.tone === "client" ? "dashboard" : "yoursite.com"}
        </span>
      </div>

      <div className="mb-5">{stage.visual}</div>

      <h3 className="font-display text-[20px] font-bold tracking-[-0.01em] text-ink">
        {stage.title}
      </h3>
      <p className="mt-2 text-[14px] leading-[1.5] text-quiet">{stage.body}</p>
    </div>
  );
}

/* --------------------------------------------------------------- connectors */

/**
 * The link between two stages. On desktop it is a horizontal line that draws in
 * (accent overlay, scaleX) with a paper token gliding across it on a loop; the
 * second connector is phase-offset so the token reads as one packet flowing
 * 1 -> 2 -> 3. On mobile it collapses to a short vertical cue with a bobbing
 * arrow. Entirely decorative (aria-hidden); the base hairline is always painted
 * so the pipeline reads as connected even with no motion.
 */
function Connector({ n }: { n: 1 | 2 }) {
  return (
    <div
      aria-hidden
      className={`pc-conn pc-conn-${n} relative flex items-center justify-center py-1 lg:w-[72px] lg:py-0`}
    >
      {/* mobile: vertical flow cue */}
      <span className="flex flex-col items-center gap-1 lg:hidden">
        <span className="h-3.5 w-px bg-accent-line" />
        <span className="animate-bob-down text-[13px] leading-none text-accent">&darr;</span>
        <span className="h-3.5 w-px bg-accent-line" />
      </span>

      {/* desktop: drawing line + flowing paper token */}
      <span className="relative hidden h-px w-full items-center lg:flex">
        <span className="absolute inset-0 rounded-full bg-accent-line/70" />
        <span className="pc-conn-draw absolute inset-0 rounded-full bg-accent" />
        <span className="pc-flow absolute top-1/2 left-0 block">
          <span className="block h-[14px] w-[11px] rounded-[2px] border border-accent-line bg-white shadow-[0_3px_7px_-2px_rgba(13,99,192,.55)]">
            <span className="mt-[3px] ml-[2px] block h-[2px] w-[6px] rounded-full bg-accent" />
            <span className="mt-[2px] ml-[2px] block h-[2px] w-[4px] rounded-full bg-ink/15" />
          </span>
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ visuals */

/** Stage 1 — a small dark code chip: your section components, in your code.
 *  Dark (plate) so the sun/mint-pop syntax inks stay text-safe and it reads
 *  unmistakably as "the developer's side". */
function CodeVisual() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/15 bg-plate p-3.5">
      <div className="mb-2.5 flex gap-1.5">
        <span className="h-2 w-2 rounded-full bg-canvas/25" />
        <span className="h-2 w-2 rounded-full bg-canvas/25" />
        <span className="h-2 w-2 rounded-full bg-canvas/25" />
      </div>
      <pre className="overflow-hidden font-mono text-[11.5px] leading-[1.7] text-canvas/90">
        <code>
          <span className="text-canvas/45">{"// your React components"}</span>
          {"\n"}
          <span className="text-sun">const</span>
          {" sections = {\n  hero:    "}
          <span className="text-mint-pop">Hero</span>
          {",\n  gallery: "}
          <span className="text-mint-pop">Gallery</span>
          {",\n}"}
        </code>
      </pre>
    </div>
  );
}

/** Stage 2 — a friendly editor field being typed into (blinking caret), plus a
 *  photo row. Built fresh; the frozen editor-mock stays in the hero. */
function EditorVisual() {
  return (
    <div className="rounded-xl border border-line bg-sunken p-3.5">
      <p className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-muted uppercase">Headline</p>
      <div className="flex items-center rounded-lg border border-accent-line bg-surface px-3 py-2 text-[13px] font-medium text-ink shadow-[0_0_0_2px_var(--color-accent-soft)]">
        <span>Fresh sourdough, daily</span>
        <span aria-hidden className="pc-caret ml-0.5 inline-block h-[15px] w-[1.5px] bg-accent" />
      </div>
      <div className="mt-2.5 flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
        <span aria-hidden className="pc-hairline h-7 w-9 shrink-0 rounded-[4px]" />
        <span className="text-[12px] text-quiet">Photo</span>
        <span className="ml-auto text-[11.5px] font-semibold text-accent">Change</span>
      </div>
    </div>
  );
}

/** Stage 3 — the live published page: the hero's paper card, popping live. */
function PublishedVisual() {
  return (
    <div className="flex items-center justify-center rounded-xl border border-line bg-sunken p-4">
      <div className="pc-pop w-[112px]" style={{ aspectRatio: "1 / 1.26" }}>
        <SheetFace kind="photo" tone="blue" />
      </div>
    </div>
  );
}
