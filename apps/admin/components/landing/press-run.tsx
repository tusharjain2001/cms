import type { ReactNode } from "react";
import { StickySteps } from "@/components/landing/motion";

/**
 * "How it works" as the press run — the one pinned moment on the site
 * (direction.md §5.3 / M4). Three steps, and only the middle one belongs to
 * the client: you register the sections, they fill in the words, the live site
 * regenerates itself.
 *
 * All the mechanics — the sticky visual panel, cross-fading to the active
 * step's card, the stacked-card fallback under 768px and reduced motion — live
 * in `<StickySteps>` (motion.tsx). This file is a server component that only
 * supplies the content: a real, ordered sequence, which is what earns the
 * `01 / 02 / 03` numbering.
 */

const STEPS = [
  {
    index: "01",
    title: "You build the sections",
    body:
      "One React component per section type, in your own Next.js project. Tailwind, CSS modules, whatever you already reach for. Nothing about layout or colour ever comes from the CMS.",
    visual: <BuildVisual />,
  },
  {
    index: "02",
    title: "Your client fills them in",
    body:
      "Add, remove, reorder, hide, type. Plain-English labels, character counts, one clear Publish button. No colour pickers, no fonts, no drag-and-drop canvas to break.",
    visual: <FillVisual />,
  },
  {
    index: "03",
    title: "The live site updates itself",
    body:
      "Publish copies the draft over the live content and calls your revalidate webhook. Static-speed pages that stay current — and pages added after your last deploy still work.",
    visual: <PublishVisual />,
  },
];

export function PressRun() {
  return <StickySteps steps={STEPS} />;
}

/* ---------------------------------------------------------------- visuals */
/* One shared card frame so the sticky panel reads as a single surface whose
   contents change from step to step, not three unrelated boxes. */

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-[0_24px_50px_-40px_rgba(30,35,45,.35)]">
      <p className="mb-3 font-mono text-[11px] tracking-[0.06em] text-muted uppercase">{label}</p>
      {children}
    </div>
  );
}

function BuildVisual() {
  const files = ["Hero.tsx", "Features.tsx", "ProductGrid.tsx"];
  return (
    <Panel label="components/sections/">
      <div className="flex flex-col gap-[7px] rounded-[9px] border border-line-mid bg-sunken p-3">
        {files.map((f) => (
          <span key={f} className="flex items-center gap-2">
            <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-[1px] bg-accent" />
            <span className="font-mono text-[12px] text-slate">{f}</span>
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-[1px] bg-field" />
          <span className="font-mono text-[12px] text-faint">…six more</span>
        </span>
      </div>
    </Panel>
  );
}

function FillVisual() {
  const names = ["Main Banner", "Why Choose Us", "Our Breads"];
  return (
    <Panel label="Sections on this page">
      <div className="flex flex-col gap-[7px]">
        {names.map((name, i) => (
          <span
            key={name}
            className={`flex items-center gap-2 rounded-[8px] border bg-surface px-2.5 py-2 ${
              i === 0
                ? "border-accent shadow-[0_0_0_2px_var(--color-accent-soft)]"
                : "border-line"
            }`}
          >
            <span aria-hidden className="text-[12px] tracking-[-1px] text-grip">
              ⠿
            </span>
            <span className="truncate text-[12.5px] font-semibold">{name}</span>
            <span aria-hidden className="ml-auto text-[10px] text-muted">
              ◉
            </span>
          </span>
        ))}
      </div>
    </Panel>
  );
}

function PublishVisual() {
  return (
    <Panel label="Publish → live">
      <div className="flex flex-col gap-3 rounded-[9px] border border-line-mid bg-sunken p-3.5">
        <span className="flex items-center gap-2.5">
          <span className="rounded-md bg-accent px-3 py-1 text-[11px] font-semibold text-white">
            Publish
          </span>
          <span aria-hidden className="h-px flex-1 bg-field" />
          <span className="font-mono text-[10.5px] text-muted">POST /revalidate</span>
        </span>
        <span className="flex items-center gap-2 rounded-[8px] border border-published-line bg-published-bg px-3 py-2">
          <span aria-hidden className="text-[11px] text-published">
            ◉
          </span>
          <span className="truncate text-[11.5px] font-medium text-published-ink">
            rosewaterbakehouse.com regenerated
          </span>
        </span>
      </div>
    </Panel>
  );
}
