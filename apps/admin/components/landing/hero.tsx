import { EditorMock } from "@/components/landing/editor-mock";
import { ButtonLink, Eyebrow, Lede } from "@/components/landing/bits";
import { FrameDraw, Print } from "@/components/landing/motion";
import { links } from "@/lib/links";

/**
 * The hero — the thesis. Paper stage; a poster-scale headline in the display
 * face, a Sun swash struck behind "client's words", the CTA pair, and the real
 * editor demo (T27, frozen) handed the spotlight inside a drawn Press-Blue
 * frame.
 *
 * This is a server component. Every moving part is a primitive from
 * `motion.tsx` (the one client module on the marketing site) given a `delay`,
 * so the whole ≤1.4s press-start sequence (direction.md §5.1 / M3) is expressed
 * declaratively and the page itself ships no client JavaScript of its own.
 * Order of the load: eyebrow (0) → line 1 (150) → line 2 (330) → swash (700) →
 * lede + CTAs (600) → demo settles + frame draws (800).
 *
 * With JS off or under reduced motion each `Print` renders its content settled
 * and visible, the swash is already struck and the frame already drawn — the
 * hero reads as a finished poster, never a half-printed one.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pt-[76px] pb-14 sm:px-8 sm:pt-[92px] sm:pb-16">
      <DotGrid />

      <div className="relative mx-auto max-w-[1160px]">
        <div className="mx-auto max-w-[860px] text-center">
          <Print delay={0} className="inline-block">
            <Eyebrow live>Content-only CMS — live in ~3 seconds</Eyebrow>
          </Print>

          <h1 className="mt-6 font-display text-[clamp(3.25rem,9vw,9rem)] leading-[0.92] font-extrabold tracking-[-0.025em] text-ink">
            <Print as="span" delay={150} className="block">
              Your React code.
            </Print>
            <span className="mt-[0.06em] block">
              <Print as="span" delay={330} className="inline">
                Your{" "}
              </Print>
              <span className="relative inline-block align-baseline">
                <Print
                  as="span"
                  delay={700}
                  aria-hidden
                  className="absolute inset-x-[-0.08em] top-[0.16em] bottom-[0.14em] z-0 block -rotate-1 bg-sun"
                />
                <Print as="span" delay={330} className="relative z-10 inline">
                  client&rsquo;s words.
                </Print>
              </span>
            </span>
          </h1>

          <Print delay={600} className="block">
            <Lede className="mx-auto mt-6 max-w-[600px]">
              Pagecraft is a headless CMS for the websites you build by hand. Clients edit
              text and photos in a dashboard a bakery owner can use — they never touch a
              colour, a font or a layout.
            </Lede>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href={links.signUp}>Create a free account</ButtonLink>
              <ButtonLink href="#demo" tone="outline">
                See it in action
              </ButtonLink>
            </div>

            <p className="mt-5 font-mono text-[12px] tracking-[0.08em] text-quiet uppercase">
              Fourteen days free · No card to start · Bring your own Next.js sites
            </p>
          </Print>
        </div>

        {/* The product, shown. The frame is the site's one drawn-border moment;
            everything else in the hero holds still once it lands so the demo,
            which animates inside, has the stage to itself. */}
        <Print delay={800} className="block">
          <div id="demo" className="mt-14 scroll-mt-24 sm:mt-16">
            <FrameDraw className="rounded-2xl border border-line bg-surface p-2.5 sm:p-3.5">
              <EditorMock />
            </FrameDraw>
          </div>
        </Print>
      </div>
    </section>
  );
}

/**
 * The hero's only texture: a faint 24px dot grid at 4% ink, drawn as a static
 * SVG tile (not a CSS gradient — the site is flat ink, no gradients anywhere).
 * Decorative, so it is hidden from assistive tech and the reader.
 */
function DotGrid() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full text-ink"
      style={{ opacity: 0.04 }}
    >
      <defs>
        <pattern id="pc-hero-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pc-hero-dots)" />
    </svg>
  );
}
