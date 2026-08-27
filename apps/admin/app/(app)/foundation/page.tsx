"use client";

import { Button, Card, CardTitle, Chip, Input, Toggle, cx } from "@/components/ui";
import { useState } from "react";

const COLOURS = [
  { name: "Canvas", hex: "#f6f5f2", ring: true },
  { name: "Surface", hex: "#ffffff", ring: true },
  { name: "Line", hex: "#e5e3dd" },
  { name: "Ink", hex: "#22252b" },
  { name: "Quiet text", hex: "#6f737d" },
  { name: "Accent", hex: "#2b4f9e" },
  { name: "Published", hex: "#2f7d5b" },
  { name: "Draft", hex: "#c68a2b" },
  { name: "Destructive", hex: "#b0402f" },
];

const TYPE = [
  { sample: "Screen title", cls: "text-screen font-bold", spec: "700 · 26 / 32" },
  { sample: "Panel title", cls: "text-panel font-bold", spec: "700 · 20 / 26" },
  { sample: "Card heading", cls: "text-card font-semibold", spec: "600 · 15.5 / 22" },
  {
    sample: "Body copy, the size most words are set in.",
    cls: "text-body",
    spec: "400 · 14 / 21",
  },
  { sample: "Field label", cls: "text-label font-semibold", spec: "600 · 13 / 18" },
  {
    sample: "Helper text, always one line if possible.",
    cls: "text-helper text-muted",
    spec: "400 · 12 / 17",
  },
  { sample: "/products · pk_live_9f2b", cls: "font-mono text-label", spec: "Mono · 13 / 18" },
];

const SPACING = [
  { w: 4, note: "4 — inside a chip" },
  { w: 8, note: "8 — between cards" },
  { w: 12, note: "12 — card padding" },
  { w: 22, note: "22 — between fields" },
  { w: 44, note: "44 — page gutter" },
];

export default function FoundationScreen() {
  const [toggleOn, setToggleOn] = useState(true);

  return (
    <div className="max-w-[1180px] px-6 py-10 pb-20 lg:px-11">
      <h1 className="text-screen font-bold">Style foundation &amp; states</h1>
      <p className="mt-[5px] mb-8 text-body text-quiet">
        The palette, type and parts every screen is built from, plus the states that only
        appear briefly.
      </p>

      <div className="flex flex-col gap-4">
        {/* ------------------------------------------------------- colour */}
        <Card>
          <CardTitle>Colour</CardTitle>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
            {COLOURS.map((c) => (
              <div key={c.name}>
                <div
                  className={cx("h-14 rounded-lg", c.ring && "border border-line")}
                  style={{ background: c.hex }}
                />
                <p className="mt-2 text-helper font-semibold">{c.name}</p>
                <p className="font-mono text-tiny text-muted">{c.hex}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* -------------------------------------------- type and spacing */}
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Card>
            <CardTitle>Type — Karla, with IBM Plex Mono for paths and keys</CardTitle>
            <div className="flex flex-col gap-3.5">
              {TYPE.map((t) => (
                <div key={t.spec}>
                  <p className={t.cls}>{t.sample}</p>
                  <p className="mt-0.5 font-mono text-tiny text-muted">{t.spec}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Spacing &amp; shape</CardTitle>
            <div className="mb-6 flex flex-col gap-2.5">
              {SPACING.map((sp) => (
                <div key={sp.w} className="flex items-center gap-3">
                  <div className="h-3.5 bg-accent" style={{ width: sp.w }} />
                  <span className="font-mono text-mid text-quiet">{sp.note}</span>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-3">
              {[6, 7, 10, 12, 14].map((r) => (
                <div key={r} className="text-center">
                  <div
                    className="h-12 w-12 border border-line bg-canvas"
                    style={{ borderRadius: r }}
                  />
                  <p className="mt-1.5 font-mono text-tiny text-muted">{r}px</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* --------------------------------------------------- components */}
        <Card>
          <CardTitle>Parts</CardTitle>
          <div className="flex flex-wrap gap-8">
            <div className="flex min-w-[230px] flex-col gap-2.5">
              <p className="text-helper font-semibold tracking-[.08em] text-muted uppercase">
                Buttons
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary">Publish</Button>
                <Button>Preview</Button>
                <Button variant="quiet">Discard changes</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="small">Edit</Button>
                <Button variant="icon">⧉</Button>
                <Button variant="danger">Delete page</Button>
              </div>
              <div className="mt-2 flex items-center gap-3 rounded-[10px] border border-line bg-surface p-3">
                <span className="flex-1 text-label font-semibold">Toggle</span>
                <Toggle on={toggleOn} onClick={() => setToggleOn((v) => !v)} />
              </div>
            </div>

            <div className="flex min-w-[200px] flex-col gap-2.5">
              <p className="text-helper font-semibold tracking-[.08em] text-muted uppercase">
                Chips
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip tone="published">Published</Chip>
                <Chip tone="draft">Draft changes</Chip>
                <Chip>Hidden</Chip>
                <Chip tone="accent">Developer</Chip>
              </div>
            </div>

            <div className="flex min-w-[260px] flex-col gap-2.5">
              <p className="text-helper font-semibold tracking-[.08em] text-muted uppercase">
                Input, focus, error
              </p>
              <Input defaultValue="Fresh sourdough" />
              <input
                readOnly
                value="Fresh sourdough"
                className="w-full rounded-[7px] border border-accent bg-surface px-3 py-2.5 text-body shadow-[0_0_0_3px_var(--color-accent-soft)] outline-none"
              />
              <Input invalid defaultValue="tel 0117" />
              <p className="text-helper font-medium text-destructive">
                ! That does not look like a web address.
              </p>
            </div>

            <div className="flex min-w-[230px] flex-col gap-2.5">
              <p className="text-helper font-semibold tracking-[.08em] text-muted uppercase">
                Drag row &amp; toast
              </p>
              <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-[11px]">
                <span className="text-[14px] tracking-[-1px] text-grip">⠿</span>
                <span className="flex-1 text-sub font-medium">Order for pickup</span>
                <span className="text-tiny text-muted">▶</span>
                <span className="text-tiny text-faint">🗑</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-[9px] bg-ink px-3.5 py-3 text-white">
                <span className="text-[#7fc0a1]">✓</span>
                <span className="text-label font-medium">
                  Home is live on rosewaterbakehouse.com
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ---------------------------------------------------- skeletons */}
        <Card>
          <CardTitle sub="Shown for under a second while a website loads. Never a spinner on a whole screen.">
            Loading skeletons
          </CardTitle>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="overflow-hidden rounded-[10px] border border-line-mid">
              {[110, 88, 120].map((w, i) => (
                <div
                  key={i}
                  className="flex animate-pulse-soft items-center gap-3.5 border-b border-line-soft px-4 py-[15px] last:border-b-0"
                >
                  <div className="h-3.5 w-3.5 rounded bg-line-mid" />
                  <div className="h-[13px] rounded bg-line-mid" style={{ width: w }} />
                  <div className="h-[11px] w-16 rounded bg-line-soft" />
                  <div className="ml-auto h-5 w-[88px] rounded-full bg-line-soft" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {[100, 80].map((w, i) => (
                <div
                  key={i}
                  className="flex animate-pulse-soft gap-2.5 rounded-[10px] border border-line-mid p-3"
                >
                  <div className="h-[30px] w-[30px] rounded-[7px] bg-line-soft" />
                  <div className="flex-1">
                    <div className="h-3 w-[120px] rounded bg-line-mid" />
                    <div className="mt-1.5 h-2.5 w-[60px] rounded bg-line-soft" />
                    <div
                      className="mt-2.5 h-2.5 rounded bg-line-soft"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* -------------------------------------------------------- phone */}
        <Card>
          <CardTitle sub="The two-panel editor stacks: the section list is the first screen, tapping a section opens its content. One column, one job at a time.">
            On a phone
          </CardTitle>
          <div className="flex flex-wrap gap-7">
            <PhoneFrame caption="Pages list · 375pt">
              <div className="border-b border-line-soft px-3.5 pt-3.5 pb-2">
                <p className="text-[17px] font-bold">Rosewater Bakehouse</p>
                <p className="mt-0.5 text-helper text-muted">4 pages</p>
              </div>
              {[
                { name: "Home", path: "/", tone: "draft" as const, label: "Draft" },
                { name: "About", path: "/about", tone: "published" as const, label: "Live" },
                { name: "Products", path: "/products", tone: "published" as const, label: "Live" },
                { name: "Contact", path: "/contact", tone: "published" as const, label: "Live" },
              ].map((p) => (
                <div
                  key={p.name}
                  className="flex items-center gap-3 border-b border-line-soft px-3.5 py-3 last:border-b-0"
                >
                  <span className="text-[14px] tracking-[-1px] text-grip">⠿</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold">{p.name}</span>
                    <span className="block font-mono text-micro text-muted">{p.path}</span>
                  </span>
                  <Chip tone={p.tone} className="px-2 py-[3px] text-[10.5px]">
                    {p.label}
                  </Chip>
                  <span className="text-grip">›</span>
                </div>
              ))}
              <div className="border-t border-line-soft p-3.5">
                <Button variant="primary" className="w-full py-3">
                  + Add page
                </Button>
              </div>
            </PhoneFrame>

            <PhoneFrame caption="Page editor, stacked · tap the tabs">
              <div className="flex items-center gap-2.5 border-b border-line-soft px-3.5 py-3">
                <span className="text-muted">‹</span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">Home</span>
                  <span className="block text-tiny text-published">All changes saved</span>
                </span>
                <Button variant="primary" className="px-3.5 py-2 text-mid">
                  Publish
                </Button>
              </div>
              <div className="flex gap-1.5 px-3.5 pt-2.5">
                <span className="flex-1 rounded-[7px] bg-accent-soft p-2.5 text-center text-mid font-semibold text-accent">
                  Sections
                </span>
                <span className="flex-1 p-2.5 text-center text-mid font-semibold text-quiet">
                  Content
                </span>
              </div>
              <div className="flex flex-col gap-2 p-3.5">
                {[
                  { icon: "▭", name: "Main Banner", type: "Hero", sel: true },
                  { icon: "◫", name: "Why Choose Us", type: "Features" },
                  { icon: "❞", name: "What Customers Say", type: "Testimonials · Hidden", dim: true },
                ].map((sec) => (
                  <div
                    key={sec.name}
                    className={cx(
                      "flex items-start gap-2.5 rounded-[10px] border p-[11px]",
                      sec.sel
                        ? "border-accent shadow-[0_0_0_3px_#eaeff9]"
                        : sec.dim
                          ? "border-line bg-sunken opacity-[.72]"
                          : "border-line"
                    )}
                  >
                    <span className="pt-[3px] text-[13px] tracking-[-1px] text-grip">⠿</span>
                    <span
                      className={cx(
                        "grid h-[26px] w-[26px] place-items-center rounded-md text-[13px]",
                        sec.sel ? "bg-accent-soft text-accent" : "bg-chip-hover text-quiet"
                      )}
                    >
                      {sec.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sub font-semibold">{sec.name}</span>
                      <span className="block text-tiny text-muted">{sec.type}</span>
                    </span>
                    <span className="text-tiny text-muted">{sec.dim ? "◌" : "◉"}</span>
                  </div>
                ))}
                <button
                  type="button"
                  className="w-full rounded-[9px] border border-dashed border-accent-line-soft bg-accent-wash p-3 text-label font-semibold text-accent"
                >
                  + Add section
                </button>
              </div>
            </PhoneFrame>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PhoneFrame({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption: string;
}) {
  return (
    <div className="w-[334px] shrink-0">
      <div className="overflow-hidden rounded-[22px] border border-field bg-surface shadow-[0_12px_30px_-20px_rgba(30,35,45,.35)]">
        <div className="flex h-[26px] items-center justify-between border-b border-line-soft bg-rail px-3.5 font-mono text-[10px] font-medium text-muted">
          <span>9:41</span>
          <span>▮▮▮</span>
        </div>
        {children}
      </div>
      <p className="mt-2.5 text-center text-helper text-muted">{caption}</p>
    </div>
  );
}
