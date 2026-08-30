import { EditorMock } from "@/components/landing/editor-mock";
import { FlyingPapers } from "@/components/landing/flying-papers";
import { ButtonLink, Eyebrow, Lede } from "@/components/landing/bits";
import { FrameDraw, Print } from "@/components/landing/motion";
import { links } from "@/lib/links";

/**
 * The hero — the thesis, staged as a poster.
 *
 * A left-aligned display headline holds the thesis; the open right and top of
 * the frame fill with a drift of flying papers — miniature published pages, the
 * sites your clients edit, caught mid-flight the instant Publish is pressed. The
 * papers are the one loud element and are scoped to the upper block, so they
 * never crowd the type or the live editor demo, which lands in its own clean
 * band below.
 *
 * Server component. Every moving part is either the CSS paper drift
 * (`flying-papers.tsx`) or a `Print` primitive from `motion.tsx` given a
 * `delay`, so the press-start sequence is declarative and the hero ships no
 * client JavaScript of its own. With JS off or under reduced motion the papers
 * hold their scatter, each `Print` renders settled, the swash is struck and the
 * frame drawn — a finished poster, never a half-printed one.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pt-[70px] pb-16 sm:px-8 sm:pt-[84px] sm:pb-20">
      <DeskGrid />

      <div className="relative mx-auto max-w-[1160px]">
        {/* Upper hero: the thesis, left-weighted, with the papers drifting
            through the open right and top. The paper layer is scoped to this
            block so it never reaches the demo below. */}
        <div className="relative pb-6 sm:pb-10">
          <HeadlineGlow />
          <FlyingPapers />

          <div className="relative z-10 max-w-[740px]">
            <Print delay={0} className="inline-block">
              <Eyebrow>For the developer who builds it and the owner who runs it</Eyebrow>
            </Print>

            <h1 className="mt-6 font-display text-[clamp(3rem,8.2vw,6.5rem)] leading-[0.86] font-extrabold tracking-[-0.035em] text-ink">
              <Print as="span" delay={150} className="block">
                Your code.
              </Print>
              <span className="mt-[0.02em] block">
                <Print as="span" delay={330} className="inline">
                  Their{" "}
                </Print>
                <span className="relative inline-block align-baseline">
                  <Print
                    as="span"
                    delay={700}
                    className="absolute inset-x-[-0.09em] top-[0.44em] bottom-[0.16em] z-0 block -rotate-[1.4deg] rounded-[2px] bg-sun"
                  >
                    {null}
                  </Print>
                  <Print as="span" delay={330} className="relative z-10 inline">
                    words.
                  </Print>
                </span>
              </span>
            </h1>

            <Print delay={600} className="block">
              <Lede className="mt-7 max-w-[480px]">
                A developer builds the site in React. The owner changes the words and photos
                from their phone and presses one button. The design stays exactly as it was
                shipped, and nobody has to email anybody.
              </Lede>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <ButtonLink href={links.signUp} className="w-full text-center sm:w-auto">
                  Create a free account
                </ButtonLink>
                <ButtonLink href="#owners" tone="outline" className="w-full text-center sm:w-auto">
                  I run a website
                </ButtonLink>
                <ButtonLink href="#code" tone="outline" className="w-full text-center sm:w-auto">
                  I build websites
                </ButtonLink>
              </div>
            </Print>
          </div>
        </div>

        {/* The product, shown — its own clean band. The frame is the site's one
            drawn-border moment; everything above has landed and holds still, so
            the demo, which animates inside, has the stage to itself. */}
        <Print delay={820} className="block">
          <div id="demo" className="mt-14 scroll-mt-24 sm:mt-16">
            <FrameDraw className="rounded-2xl border border-line bg-surface p-2.5 shadow-[0_44px_90px_-52px_rgba(27,30,36,0.5)] sm:p-3.5">
              <EditorMock />
            </FrameDraw>
          </div>
        </Print>
      </div>
    </section>
  );
}

/**
 * A soft warm bloom behind the left-aligned headline. It lifts the type off the
 * drifting papers so the thesis always reads first, without a hard box. Purely
 * atmospheric, so it is hidden from assistive tech.
 */
function HeadlineGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(44% 46% at 26% 40%, rgba(255,255,255,0.92) 0%, rgba(246,245,242,0.3) 46%, rgba(246,245,242,0) 72%)",
      }}
    />
  );
}

/**
 * The desk under the papers: a faint 26px dot grid at 3.5% ink, a static SVG
 * tile that reads as a cutting mat the sheets are scattered on. Decorative, so
 * it is hidden from assistive tech and sits beneath everything.
 */
function DeskGrid() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full text-ink"
      style={{ opacity: 0.035 }}
    >
      <defs>
        <pattern id="pc-hero-dots" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pc-hero-dots)" />
    </svg>
  );
}
