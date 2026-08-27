import type { ReactNode } from "react";

/**
 * A still of the real page editor, built in markup rather than shipped as a
 * screenshot: it stays sharp on every display, weighs nothing, and cannot
 * silently go out of date the way a PNG does.
 *
 * It is decorative — nothing here is interactive, and none of it is announced
 * to a screen reader, which is why the whole block is `aria-hidden`. The
 * surrounding copy carries the meaning.
 */

const GRIP = "⠿";

function SectionCard({
  icon,
  name,
  type,
  preview,
  state = "idle",
}: {
  icon: string;
  name: string;
  type: string;
  preview?: string;
  state?: "idle" | "selected" | "hidden";
}) {
  const shell =
    state === "selected"
      ? "border-accent bg-surface shadow-[0_0_0_3px_var(--color-accent-soft)]"
      : state === "hidden"
        ? "border-line bg-sunken opacity-[.72]"
        : "border-line bg-surface";

  return (
    <div className={`flex items-start gap-2.5 rounded-[10px] border p-[11px] ${shell}`}>
      <span className="pt-[3px] text-[13px] tracking-[-1px] text-grip">{GRIP}</span>
      <span
        className={`grid h-[27px] w-[27px] shrink-0 place-items-center rounded-md text-[13px] ${
          state === "selected" ? "bg-accent-soft text-accent" : "bg-chip-hover text-quiet"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-label font-semibold ${state === "hidden" ? "text-[#9a9ca3]" : ""}`}
        >
          {name}
        </span>
        <span className="block text-tiny text-muted">{type}</span>
        {preview && <span className="mt-[5px] block truncate text-micro text-quiet">{preview}</span>}
      </span>
      <span className="flex flex-col gap-1 text-tiny text-muted">
        <span>{state === "hidden" ? "◌" : "◉"}</span>
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

export function EditorMock() {
  return (
    <div aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-field bg-surface shadow-[0_40px_80px_-50px_rgba(30,35,45,.5),0_2px_4px_rgba(30,35,45,.04)]">
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
            <span className="rounded-[7px] bg-accent px-4 py-2 text-mid font-semibold text-white">
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
              <SectionCard
                state="selected"
                icon="▭"
                name="Main Banner"
                type="Hero"
                preview="Fresh sourdough, baked every morning"
              />
              <SectionCard
                icon="◫"
                name="Why Choose Us"
                type="Features"
                preview="3 features · Slow fermented, always"
              />
              <SectionCard
                icon="▦"
                name="Our Breads"
                type="Product Grid"
                preview="Everything currently in stock"
              />
              <SectionCard
                state="hidden"
                icon="❞"
                name="What Customers Say"
                type="Testimonials · Hidden"
              />
              <div className="rounded-[9px] border border-dashed border-accent-line-soft bg-accent-wash p-[11px] text-center text-mid font-semibold text-accent">
                + Add section
              </div>
            </div>
          </div>

          {/* right: the form the registry generated */}
          <div className="min-w-0 flex-1 bg-canvas px-5 py-5.5 sm:px-6.5">
            <div className="flex items-baseline gap-2.5">
              <span className="text-[19px] font-bold tracking-[-.3px]">Main Banner</span>
              <span className="text-mid text-muted">Hero</span>
            </div>
            <p className="mt-[3px] mb-4.5 text-mid text-quiet">
              Fill in the parts below. Everything saves as you type.
            </p>

            <div className="flex flex-col gap-4.5">
              <div className="rounded-[10px] border border-line bg-surface p-3.5">
                <p className="mb-1.5 text-mid font-semibold">Section name (for your reference)</p>
                <div className="rounded-[7px] border border-field px-2.5 py-2 text-sub">
                  Main Banner
                </div>
                <p className="mt-1.5 text-micro text-muted">
                  Just a nickname so you can find it in the list. It is never shown on your website.
                </p>
              </div>

              <Field label="Headline" counter="57 / 140">
                <div className="rounded-[7px] border border-accent bg-surface px-2.5 py-2 text-sub shadow-[0_0_0_3px_var(--color-accent-soft)]">
                  Fresh sourdough, baked every morning before you wake up
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
                      <span className="px-2 py-1.5 text-micro font-semibold text-destructive">
                        Remove
                      </span>
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
          </div>
        </div>
      </div>

      <p className="mt-3.5 text-center text-mid text-muted">
        The page editor. Demo website: Rosewater Bakehouse.
      </p>
    </div>
  );
}
