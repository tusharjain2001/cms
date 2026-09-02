"use client";

import { useMemo } from "react";
import { thumb, useMedia } from "@/lib/media";
import { useStore } from "@/lib/store";
import {
  DESCRIPTION_LIMITS,
  TITLE_LIMITS,
  analysePage,
  previewDescription,
  previewTitle,
  previewUrl,
  scoreBand,
  type CheckStatus,
} from "@/lib/seo";
import { Button, Field, Input, Textarea, Toggle, cx } from "@/components/ui";

/**
 * The page's search settings — the middle column of the editor when the client
 * picks "Search & sharing" instead of a section.
 *
 * It is built around ONE idea: **show them the result, not the fields.** A
 * meta description is an abstraction nobody outside this industry has heard
 * of; a Google result is something everybody has looked at. So the search
 * preview sits at the top and updates as they type, and the two inputs read as
 * "what it says in Google" rather than as tags.
 *
 * The checklist below is advisory and can never block a publish. A page with a
 * score of 30 still goes live — the alternative is a CMS that refuses to
 * publish a shop's opening hours because its description is 60 characters, and
 * that is a CMS people work around rather than with.
 */
export function SeoPanel() {
  const s = useStore();
  const media = useMedia();

  const page = s.page;
  const sections = page?.draftSections ?? [];

  // Analysis runs against the live `seoDraft`, not the saved page, so the
  // score moves as they type rather than 600ms after they stop.
  const report = useMemo(() => {
    if (!page) return null;
    return analysePage({
      page: { ...page, seo: s.seoDraft },
      sections,
      siblings: s.pages,
    });
  }, [page, s.seoDraft, sections, s.pages]);

  if (!page || !report) return null;

  const title = s.seoDraft.metaTitle ?? "";
  const description = s.seoDraft.metaDescription ?? "";
  const ogImage = s.seoDraft.ogImage ?? "";
  const preview = { ...page, seo: s.seoDraft };
  const snippet = previewDescription(preview, sections);

  return (
    <div className="max-w-[660px] px-5 pt-6 pb-16 lg:px-[30px]">
      <div className="mb-1 flex flex-wrap items-baseline gap-2.5">
        <h1 className="text-panel font-bold">Search &amp; sharing</h1>
        <span className="text-label text-muted">This page</span>
      </div>
      <p className="mb-6 text-label text-quiet">
        How this page looks when someone finds it on Google, or pastes the link into WhatsApp.
        Everything saves as you type and goes live when you publish.
      </p>

      {report.hidden && (
        <div className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-draft/30 bg-draft-bg px-3.5 py-3 text-label text-draft-ink">
          <span aria-hidden>◌</span>
          <p>
            This page is hidden from search results. It still works and anyone with the link can
            read it — Google simply will not list it.
          </p>
        </div>
      )}

      {/* ---------------------------------------------- the result itself */}
      <section className="mb-7">
        <p className="mb-2.5 text-helper font-semibold tracking-[.08em] text-muted uppercase">
          How it will look on Google
        </p>
        <div className="rounded-[10px] border border-line bg-surface p-4">
          <p className="truncate text-mid text-quiet">
            {previewUrl(s.project?.domain ?? "", page.slug)}
          </p>
          <p className="mt-1 text-[19px] leading-[1.3] font-medium text-[#1a0dab]">
            {previewTitle(preview)}
          </p>
          {snippet.text ? (
            <p className="mt-1 text-sub leading-[1.55] text-slate">
              {snippet.text}
              {snippet.borrowed && (
                <span className="ml-1.5 rounded-[4px] bg-chip px-1.5 py-px text-micro font-medium text-muted">
                  Google picked this
                </span>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sub leading-[1.55] text-faint italic">
              Nothing for Google to show yet — write a description below, or fill in the page.
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-[22px]">
        {/* ------------------------------------------------------- title */}
        <div className="rounded-[10px] border border-line bg-surface p-4">
          <Field
            label="Title in search results"
            counter={`${title.length} / ${TITLE_LIMITS.max}`}
            counterTone={title.length > TITLE_LIMITS.max ? "warn" : "muted"}
            help={`Leave it blank to use the page's own name, “${page.title}”. Around ${TITLE_LIMITS.min}–${TITLE_LIMITS.max} characters shows in full — put what you do and where you are.`}
          >
            <Input
              value={title}
              placeholder={page.title}
              invalid={title.length > TITLE_LIMITS.max}
              onChange={(e) => s.setSeoField("metaTitle", e.target.value)}
            />
            <LengthBar value={title.length} limits={TITLE_LIMITS} />
          </Field>
        </div>

        {/* ------------------------------------------------- description */}
        <div className="rounded-[10px] border border-line bg-surface p-4">
          <Field
            label="Description in search results"
            counter={`${description.length} / ${DESCRIPTION_LIMITS.max}`}
            counterTone={description.length > DESCRIPTION_LIMITS.max ? "warn" : "muted"}
            help="Two sentences that make someone click. It does not change your ranking — it changes how many people choose you over the result above."
          >
            <Textarea
              rows={3}
              value={description}
              placeholder="Family bakery on Kirkgate. Sourdough, sausage rolls and birthday cakes, baked every morning since 1994."
              onChange={(e) => s.setSeoField("metaDescription", e.target.value)}
            />
            <LengthBar value={description.length} limits={DESCRIPTION_LIMITS} />
          </Field>
        </div>

        {/* ---------------------------------------------- sharing picture */}
        <div className="rounded-[10px] border border-line bg-surface p-4">
          <p className="mb-2 text-label font-semibold">Picture when the link is shared</p>
          <div className="flex flex-wrap items-start gap-3.5">
            {ogImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb(ogImage, 320)}
                alt=""
                className="h-[86px] w-[164px] shrink-0 rounded-lg border border-line-mid bg-sunken object-cover"
              />
            ) : (
              <div className="grid h-[86px] w-[164px] shrink-0 place-items-center rounded-lg border border-dashed border-field bg-sunken text-tiny text-faint">
                No picture
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-helper text-muted">
                Shown on WhatsApp, Facebook, LinkedIn and X. A landscape photo about twice as wide
                as it is tall works best. Without one, most apps show a plain grey box.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="small"
                  onClick={async () => {
                    const picked = await media.pick("image");
                    if (picked) s.setSeoField("ogImage", picked.url);
                  }}
                >
                  {ogImage ? "Replace" : "Choose a picture"}
                </Button>
                {ogImage && (
                  <Button
                    variant="quiet"
                    className="px-3 py-1.5 text-helper text-destructive hover:text-destructive-dark"
                    onClick={() => s.setSeoField("ogImage", "")}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------ checks */}
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="text-helper font-semibold tracking-[.08em] text-muted uppercase">
              What is still missing
            </p>
            <ScoreDial score={report.score} />
          </div>
          <ul className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-line bg-line-soft">
            {report.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3 bg-surface px-3.5 py-3">
                <StatusDot status={check.status} />
                <div className="min-w-0">
                  <p className="text-label font-medium">{check.label}</p>
                  <p className="mt-0.5 text-helper text-quiet">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------- advanced */}
        <details className="rounded-[10px] border border-line bg-surface [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 text-label font-semibold select-none">
            <span>Advanced</span>
            <span aria-hidden className="text-mid text-muted">
              Rarely needed
            </span>
          </summary>

          <div className="flex flex-col gap-[18px] border-t border-line-mid p-4">
            <Field
              label="Hide this page from search engines"
              help="For a thank-you page, a private price list, or a page you have not finished. It stays published and anyone with the link can still read it."
            >
              <div className="flex items-center gap-3.5 rounded-[10px] border border-line bg-rail p-3.5">
                <span className="flex-1 text-mid text-quiet">
                  {s.seoDraft.noIndex
                    ? "Hidden — Google will not list this page."
                    : "Visible — Google may list this page."}
                </span>
                <Toggle
                  on={s.seoDraft.noIndex === true}
                  onClick={() => s.setSeoField("noIndex", !s.seoDraft.noIndex)}
                />
              </div>
            </Field>

            <Field
              label="Preferred web address"
              help="Only for when the same content lives at more than one address and you want Google to credit a particular one. Leave it blank and this page's own address is used, which is almost always right."
            >
              <Input
                mono
                value={s.seoDraft.canonicalUrl ?? ""}
                placeholder={`https://${(s.project?.domain || "your-website.com").replace(/^https?:\/\//, "")}/${page.slug}`}
                onChange={(e) => s.setSeoField("canonicalUrl", e.target.value)}
              />
            </Field>
          </div>
        </details>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- bits */

const TONE: Record<CheckStatus, { dot: string; ring: string; text: string }> = {
  good: { dot: "bg-published", ring: "stroke-published", text: "text-published" },
  warn: { dot: "bg-draft", ring: "stroke-draft", text: "text-draft-ink" },
  bad: { dot: "bg-destructive", ring: "stroke-destructive", text: "text-destructive" },
};

function StatusDot({ status }: { status: CheckStatus }) {
  const label = status === "good" ? "Done" : status === "warn" ? "Could be better" : "Missing";
  return (
    <span
      title={label}
      aria-label={label}
      className={cx("mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full", TONE[status].dot)}
    />
  );
}

/**
 * A quiet meter under a length-limited box.
 *
 * It shows the *ideal* band rather than just the maximum, because "you have
 * 113 characters left" tells someone nothing about whether to keep typing.
 */
function LengthBar({ value, limits }: { value: number; limits: { min: number; max: number } }) {
  const pct = Math.min(100, (value / limits.max) * 100);
  const tone: CheckStatus =
    value === 0 ? "bad" : value > limits.max ? "warn" : value < limits.min ? "warn" : "good";
  return (
    <div className="relative h-1 overflow-hidden rounded-full bg-line-soft">
      <div
        className={cx("h-full rounded-full transition-[width] duration-200", TONE[tone].dot)}
        style={{ width: `${pct}%` }}
      />
      {/* Where the ideal band starts — the point past which it stops being thin. */}
      <span
        aria-hidden
        className="absolute top-0 h-full w-px bg-line"
        style={{ left: `${(limits.min / limits.max) * 100}%` }}
      />
    </div>
  );
}

function ScoreDial({ score }: { score: number }) {
  const band = scoreBand(score);
  const circumference = 2 * Math.PI * 13;
  return (
    <span className="flex items-center gap-2">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="-rotate-90">
        <circle cx="16" cy="16" r="13" fill="none" strokeWidth="3.5" className="stroke-line-soft" />
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className={cx(TONE[band].ring, "transition-[stroke-dashoffset] duration-500")}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <span className={cx("text-label font-semibold tabular-nums", TONE[band].text)}>
        {score}
        <span className="text-micro font-normal text-muted"> / 100</span>
      </span>
    </span>
  );
}
