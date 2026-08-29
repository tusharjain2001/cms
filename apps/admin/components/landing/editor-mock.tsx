"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A self-playing replica of the real page editor, built in markup rather
 * than shipped as a video: it stays sharp on every display, weighs nothing,
 * and cannot silently go out of date the way a recording does.
 *
 * It loops through a "someone is using the CMS" beat — select a section,
 * type a headline, select the next section, publish — using nothing but
 * CSS transitions/keyframes driven by a small timer-based state machine.
 * There is no real editor behind it: no store, no API, no network call.
 *
 * It is decorative — nothing here is interactive, and none of it is
 * announced to a screen reader, which is why the whole block is
 * `aria-hidden`. The surrounding page copy carries the meaning.
 *
 * `prefers-reduced-motion: reduce` freezes the component on its first
 * frame — the same frame the server renders before any script runs — so a
 * motion-sensitive visitor (and any crawler that never executes the timer
 * effect) only ever sees one calm, complete view of the Hero form.
 */

const GRIP = "⠿";

const HEADLINE_FULL = "Fresh sourdough, baked every morning before you wake up";
const CHAR_MS = 45;
const HERO_SETTLE_MS = 1600;
const SECTION_DWELL_MS = 3400;
const PUBLISH_HOLD_MS = 2800;
const RESET_MS = 700;
const CROSSFADE_OUT_MS = 220;

const FEATURES = [
  {
    title: "Slow fermented",
    description: "Every loaf rests for eighteen hours before it ever sees the oven.",
  },
  {
    title: "Stone milled flour",
    description: "Milled twenty minutes from our ovens, never bleached.",
  },
  {
    title: "Baked before dawn",
    description: "Doors open at seven and the first loaves are already cooling.",
  },
];

const PRODUCTS = [
  {
    name: "Country Sourdough",
    description: "Naturally leavened, twenty-four hour rise.",
    price: "£5.50 / loaf",
  },
  {
    name: "Seeded Rye",
    description: "Rye, linseed, sunflower and oat.",
    price: "£5.00 / loaf",
  },
  {
    name: "Morning Bun",
    description: "Laminated, orange zest, demerara crust.",
    price: "£3.20 / each",
  },
];

type FormKind = "hero" | "features" | "productGrid";
type Phase = "hero-settled" | "features" | "products" | "publish" | "reset" | "typing";

function SectionCard({
  cardRef,
  icon,
  name,
  type,
  preview,
  selected = false,
  hidden = false,
}: {
  cardRef?: (el: HTMLDivElement | null) => void;
  icon: string;
  name: string;
  type: string;
  preview?: string;
  selected?: boolean;
  hidden?: boolean;
}) {
  const shell = hidden ? "border-line bg-sunken opacity-[.72]" : "border-line bg-surface";

  return (
    <div ref={cardRef} className={`flex items-start gap-2.5 rounded-[10px] border p-[11px] ${shell}`}>
      <span className="pt-[3px] text-[13px] tracking-[-1px] text-grip">{GRIP}</span>
      <span
        className={`grid h-[27px] w-[27px] shrink-0 place-items-center rounded-md text-[13px] transition-colors duration-300 ${
          selected ? "bg-accent-soft text-accent" : "bg-chip-hover text-quiet"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-label font-semibold ${hidden ? "text-[#9a9ca3]" : ""}`}>
          {name}
        </span>
        <span className="block text-tiny text-muted">{type}</span>
        {preview && <span className="mt-[5px] block truncate text-micro text-quiet">{preview}</span>}
      </span>
      <span className="flex flex-col gap-1 text-tiny text-muted">
        <span>{hidden ? "◌" : "◉"}</span>
        <span className="text-faint">🗑</span>
      </span>
    </div>
  );
}

function Field({ label, counter, children }: { label: string; counter?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-[7px] flex items-baseline justify-between">
        <span className="text-mid font-semibold">{label}</span>
        {counter && <span className="font-mono text-tiny text-muted">{counter}</span>}
      </div>
      {children}
    </div>
  );
}

function FormHeader({ name, type }: { name: string; type: string }) {
  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[19px] font-bold tracking-[-.3px]">{name}</span>
        <span className="text-mid text-muted">{type}</span>
      </div>
      <p className="mt-[3px] mb-4.5 text-mid text-quiet">
        Fill in the parts below. Everything saves as you type.
      </p>
    </>
  );
}

function HeroForm({ typedLen, typing }: { typedLen: number; typing: boolean }) {
  return (
    <>
      <FormHeader name="Main Banner" type="Hero" />
      <div className="flex flex-col gap-4.5">
        <div className="rounded-[10px] border border-line bg-surface p-3.5">
          <p className="mb-1.5 text-mid font-semibold">Section name (for your reference)</p>
          <div className="rounded-[7px] border border-field px-2.5 py-2 text-sub">Main Banner</div>
          <p className="mt-1.5 text-micro text-muted">
            Just a nickname so you can find it in the list. It is never shown on your website.
          </p>
        </div>

        <Field label="Headline" counter={`${typedLen} / 140`}>
          <div className="flex items-center rounded-[7px] border border-accent bg-surface px-2.5 py-2 text-sub shadow-[0_0_0_3px_var(--color-accent-soft)]">
            <span>{HEADLINE_FULL.slice(0, typedLen)}</span>
            {typing && (
              <span className="ml-[1px] inline-block h-[15px] w-[1.5px] shrink-0 animate-pulse-soft bg-accent" />
            )}
          </div>
        </Field>

        <Field label="Banner photo">
          <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-3 sm:flex-row">
            <div className="pc-hairline grid h-[72px] w-[118px] shrink-0 place-items-center rounded-[7px] border border-line-mid font-mono text-[10px] text-muted">
              photo
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-mid font-medium">rosewater-counter-morning.jpg</p>
              <p className="mt-0.5 font-mono text-tiny text-muted">2400 × 1350</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <span className="rounded-md border border-btn px-2.5 py-1.5 text-micro font-semibold">
                  Replace
                </span>
                <span className="rounded-md border border-btn px-2.5 py-1.5 text-micro font-semibold">
                  Choose from library
                </span>
                <span className="px-2 py-1.5 text-micro font-semibold text-destructive">Remove</span>
              </div>
            </div>
          </div>
        </Field>

        <Field label="Buttons" counter="3 of 3">
          <div className="flex flex-col gap-[7px]">
            {["Order for pickup", "See our breads"].map((label) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2.5"
              >
                <span className="text-[13px] tracking-[-1px] text-grip">{GRIP}</span>
                <span className="flex-1 truncate text-mid font-medium">{label}</span>
                <span className="text-[10px] text-muted">▶</span>
                <span className="text-[10px] text-faint">🗑</span>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-field bg-sunken p-2.5 text-center text-helper font-semibold text-faint">
              + Add button
            </div>
            <p className="rounded-md bg-draft-bg px-2.5 py-1.5 text-micro font-medium text-draft-ink">
              Maximum 3 buttons reached. Delete one to add another.
            </p>
          </div>
        </Field>
      </div>
    </>
  );
}

function FeaturesForm() {
  return (
    <>
      <FormHeader name="Why Choose Us" type="Features" />
      <div className="flex flex-col gap-4.5">
        <Field label="Heading above the features">
          <div className="rounded-[7px] border border-line bg-surface px-2.5 py-2 text-sub">
            Why choose Rosewater
          </div>
        </Field>

        <Field label="Features" counter="3 of 6">
          <div className="flex flex-col gap-[9px]">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-[10px] border border-line bg-surface p-3">
                <div className="flex items-start gap-2.5">
                  <span className="pt-[3px] text-[13px] tracking-[-1px] text-grip">{GRIP}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sub font-semibold">{f.title}</p>
                    <p className="mt-1 text-mid leading-[1.5] text-quiet">{f.description}</p>
                    <p className="mt-2 text-micro text-muted">Bullet points · optional, up to 4</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Field>
      </div>
    </>
  );
}

function ProductGridForm() {
  return (
    <>
      <FormHeader name="Our Breads" type="Product Grid" />
      <div className="flex flex-col gap-4.5">
        <Field label="Heading">
          <div className="rounded-[7px] border border-line bg-surface px-2.5 py-2 text-sub">
            Today&rsquo;s bakes
          </div>
        </Field>

        <Field label="Tabs">
          <div className="flex flex-wrap gap-1.5">
            {["Sourdough", "Pastries"].map((tab) => (
              <span
                key={tab}
                className="rounded-full border border-line bg-chip-hover px-2.5 py-1 text-micro font-medium text-slate"
              >
                {tab}
              </span>
            ))}
          </div>
        </Field>

        <Field label="Products" counter="6 of 24">
          <div className="flex flex-col gap-[9px]">
            {PRODUCTS.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface p-2.5"
              >
                <span className="text-[13px] tracking-[-1px] text-grip">{GRIP}</span>
                <div className="pc-hairline grid h-[46px] w-[54px] shrink-0 place-items-center rounded-[6px] border border-line-mid font-mono text-[9px] text-muted">
                  photo
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-mid font-semibold">{p.name}</p>
                  <p className="truncate text-micro text-quiet">{p.description}</p>
                </div>
                <span className="shrink-0 font-mono text-tiny text-muted">{p.price}</span>
              </div>
            ))}
          </div>
        </Field>
      </div>
    </>
  );
}

export function EditorMock() {
  // Every value below defaults to the exact static frame the file used to
  // render unconditionally: Main Banner selected, Hero form, headline typed
  // out in full. That is what the server sends, what a no-JS/crawler visit
  // sees forever, and what a reduced-motion visitor sees forever — the loop
  // below is a client-only enhancement layered on top of it.
  const [phase, setPhase] = useState<Phase>("hero-settled");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [formKind, setFormKind] = useState<FormKind>("hero");
  const [formOpacity, setFormOpacity] = useState(1);
  const [typedLen, setTypedLen] = useState(HEADLINE_FULL.length);
  const [publishActive, setPublishActive] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  // The moving selection ring: measured from the real card elements so it
  // tracks their true size/position instead of guessing pixel offsets.
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [ringHeight, setRingHeight] = useState(70);
  const [offsets, setOffsets] = useState([0, 0, 0]);

  useLayoutEffect(() => {
    function measure() {
      const els = cardRefs.current;
      if (els[0]) setRingHeight(els[0].offsetHeight);
      setOffsets(els.map((el) => el?.offsetTop ?? 0));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const timeouts: number[] = [];
    const after = (ms: number, fn: () => void) => {
      timeouts.push(
        window.setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };

    // Fades the form panel out, swaps its content, fades it back in — a
    // cross-fade that never shows two differently-sized forms at once.
    const crossfadeTo = (next: () => void) => {
      setFormOpacity(0);
      after(CROSSFADE_OUT_MS, () => {
        next();
        setFormOpacity(1);
      });
    };

    function toFeatures() {
      setPhase("features");
      setSelectedIndex(1);
      crossfadeTo(() => setFormKind("features"));
      after(SECTION_DWELL_MS, toProducts);
    }
    function toProducts() {
      setPhase("products");
      setSelectedIndex(2);
      crossfadeTo(() => setFormKind("productGrid"));
      after(SECTION_DWELL_MS, toPublish);
    }
    function toPublish() {
      setPhase("publish");
      setPublishActive(true);
      setToastVisible(true);
      after(PUBLISH_HOLD_MS, toReset);
    }
    function toReset() {
      setPhase("reset");
      setPublishActive(false);
      setToastVisible(false);
      setSelectedIndex(0);
      crossfadeTo(() => {
        setFormKind("hero");
        setTypedLen(0);
      });
      after(RESET_MS, toType);
    }
    function toType() {
      setPhase("typing");
      const step = (i: number) => {
        if (cancelled) return;
        setTypedLen(i);
        if (i < HEADLINE_FULL.length) {
          after(CHAR_MS, () => step(i + 1));
        } else {
          after(0, toHeroSettled);
        }
      };
      after(CHAR_MS, () => step(1));
    }
    function toHeroSettled() {
      setPhase("hero-settled");
      after(HERO_SETTLE_MS, toFeatures);
    }

    // The visible state on mount already IS "hero-settled" — just hold it,
    // then start the loop.
    after(HERO_SETTLE_MS, toFeatures);

    return () => {
      cancelled = true;
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const typing = phase === "typing";

  return (
    <div aria-hidden>
      <div className="relative overflow-hidden rounded-2xl border border-field bg-surface shadow-[0_40px_80px_-50px_rgba(30,35,45,.5),0_2px_4px_rgba(30,35,45,.04)]">
        {/* browser chrome */}
        <div className="flex h-[38px] items-center gap-2.5 border-b border-line bg-chip-hover px-3.5">
          <div className="flex gap-1.5">
            <span className="h-[9px] w-[9px] rounded-full bg-field" />
            <span className="h-[9px] w-[9px] rounded-full bg-field" />
            <span className="h-[9px] w-[9px] rounded-full bg-field" />
          </div>
          <div className="mx-auto hidden max-w-[340px] flex-1 rounded-md border border-line bg-surface px-3 py-1 text-center font-mono text-[11px] text-muted sm:block">
            admin.pagecraft.dev/rosewater/home
          </div>
          <div className="w-[60px]" />
        </div>

        {/* editor top bar */}
        <div className="flex h-14 items-center gap-4 border-b border-line bg-rail px-4.5">
          <span className="hidden rounded-md border border-line bg-surface px-2.5 py-1.5 text-micro font-medium text-slate sm:inline">
            ← Pages
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold">Home</span>
            <span className="block truncate font-mono text-tiny text-muted">
              rosewaterbakehouse.com/
            </span>
          </span>
          <span className="ml-1.5 hidden items-center gap-1.5 text-helper font-medium text-published lg:flex">
            <span>◉</span>All changes saved
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="hidden text-mid font-medium text-muted lg:inline">Discard changes</span>
            <span className="hidden rounded-[7px] border border-btn bg-surface px-3.5 py-2 text-mid font-semibold sm:inline">
              Preview
            </span>
            <span
              className={`rounded-[7px] bg-accent px-4 py-2 text-mid font-semibold text-white ${
                publishActive ? "animate-celebrate" : ""
              }`}
            >
              Publish
            </span>
          </span>
        </div>

        <div className="flex min-h-[430px] flex-col md:flex-row">
          {/* left rail: the sections on this page */}
          <div className="shrink-0 border-b border-line bg-rail px-3.5 py-4 md:w-[318px] md:border-r md:border-b-0">
            <p className="mb-[3px] text-tiny font-semibold tracking-[0.08em] uppercase text-muted">
              Sections on this page
            </p>
            <p className="mb-3 text-micro text-muted">Top to bottom, the same order as the website.</p>
            <div className="flex flex-col gap-[7px]">
              <div className="relative flex flex-col gap-[7px]">
                <span
                  className="pointer-events-none absolute inset-x-0 top-0 rounded-[10px] border border-accent"
                  style={{
                    height: ringHeight,
                    transform: `translateY(${offsets[selectedIndex] ?? 0}px)`,
                    boxShadow: "0 0 0 3px var(--color-accent-soft)",
                    transition: "transform 650ms var(--ease-spring)",
                  }}
                />
                <SectionCard
                  cardRef={(el) => {
                    cardRefs.current[0] = el;
                  }}
                  selected={selectedIndex === 0}
                  icon="▭"
                  name="Main Banner"
                  type="Hero"
                  preview="Fresh sourdough, baked every morning"
                />
                <SectionCard
                  cardRef={(el) => {
                    cardRefs.current[1] = el;
                  }}
                  selected={selectedIndex === 1}
                  icon="◫"
                  name="Why Choose Us"
                  type="Features"
                  preview="3 features · Slow fermented, always"
                />
                <SectionCard
                  cardRef={(el) => {
                    cardRefs.current[2] = el;
                  }}
                  selected={selectedIndex === 2}
                  icon="▦"
                  name="Our Breads"
                  type="Product Grid"
                  preview="Everything currently in stock"
                />
              </div>
              <SectionCard hidden icon="❞" name="What Customers Say" type="Testimonials · Hidden" />
              <div className="rounded-[9px] border border-dashed border-accent-line-soft bg-accent-wash p-[11px] text-center text-mid font-semibold text-accent">
                + Add section
              </div>
            </div>
          </div>

          {/* right: the form the registry generated */}
          <div className="min-w-0 flex-1 bg-canvas px-5 py-5.5 sm:px-6.5">
            <div
              className="transition-opacity duration-300 ease-out"
              style={{ opacity: formOpacity }}
            >
              {formKind === "hero" && <HeroForm typedLen={typedLen} typing={typing} />}
              {formKind === "features" && <FeaturesForm />}
              {formKind === "productGrid" && <ProductGridForm />}
            </div>
          </div>
        </div>

        {toastVisible && (
          <div className="animate-rise absolute right-4 bottom-4 z-20 flex items-center gap-2 rounded-lg border border-published-line bg-published-bg px-3.5 py-2.5 text-mid font-medium text-published-ink shadow-[0_12px_24px_-12px_rgba(30,35,45,.25)]">
            <span className="text-published">◉</span>
            Published · rosewaterbakehouse.com regenerated
          </div>
        )}
      </div>

      <p className="mt-3.5 text-center text-mid text-muted">
        The page editor. Demo website: Rosewater Bakehouse.
      </p>
    </div>
  );
}
