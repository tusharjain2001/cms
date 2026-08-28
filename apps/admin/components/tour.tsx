"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useMedia } from "@/lib/media";
import { useStore } from "@/lib/store";
import { TOUR_STEPS, firstUndoneIndex, hasContent, type TourState } from "@/lib/tour";
import { cx } from "./ui";

/**
 * The first-sign-in tour: a card that follows you around the dashboard,
 * pointing at the one control that matters next.
 *
 * Three things worth knowing before changing it:
 *
 *  - **It reads product state, not a counter.** Which step is current comes
 *    from `lib/tour.ts` asking real questions — is there a website, a page, a
 *    section with words in it, a published page. Reload mid-way and it resumes.
 *  - **The spotlight never blocks anything.** It is a `pointer-events-none`
 *    ring drawn over the real control, so the control is still clickable —
 *    which is the whole point, since pressing it is what completes the step.
 *  - **It gets out of the way of modals.** While the section picker, the media
 *    picker or any confirm dialog is open the card hides itself rather than
 *    fighting them for z-index; it comes back when they close.
 */

const CARD_W = 330;
const GAP = 14;

/** Which way the card's little pointer faces, or null when it is parked. */
type Arrow = "up" | "down" | null;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1);

export function Tour() {
  const s = useStore();
  const m = useMedia();
  const { user, setOnboardingComplete } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [minimised, setMinimised] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(196);
  const cardRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------- what has actually been done */

  const state: TourState = useMemo(() => {
    const sections = s.page?.draftSections ?? [];
    return {
      pathname,
      projectId: s.projectId,
      projectCount: s.projects.length,
      pageCount: s.pages.length,
      editorPageId: s.page?.id || s.pages[0]?.id || "",
      sectionCount: sections.length,
      inEditor: /^\/projects\/[^/]+\/pages\/[^/]+$/.test(pathname),
      // The live editing buffer counts too, so the step ticks over as someone
      // types rather than 600ms later when the save lands.
      contentFilled: sections.some((sec) =>
        hasContent(sec.id === s.selected ? { ...sec.content, ...s.draftContent } : sec.content)
      ),
      mediaCount: m.items.length,
      uploadsEnabled: m.uploadsEnabled,
      anyPagePublished: s.pages.some((p) => p.status === "published"),
    };
  }, [
    pathname,
    s.projectId,
    s.projects.length,
    s.pages,
    s.page,
    s.selected,
    s.draftContent,
    m.items.length,
    m.uploadsEnabled,
  ]);

  /**
   * The step on screen. It starts wherever the account left off and only ever
   * moves forward on its own — being bounced backwards because you navigated
   * away from a screen would be maddening. Back and Next move it by hand.
   */
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const undone = firstUndoneIndex(state, skippedIds);
  const finished = undone >= TOUR_STEPS.length;
  const [index, setIndex] = useState(undone);

  useEffect(() => {
    setIndex((current) => (undone > current ? Math.min(undone, TOUR_STEPS.length - 1) : current));
  }, [undone]);

  /**
   * How far this browser got, so a reload does not shuffle the card backwards.
   *
   * Whether a step is *done* is still worked out from real product state — this
   * only remembers where someone had got to, because several of those questions
   * ("does that page have a section on it?") cannot be answered from the media
   * screen, where no page is loaded. Completion itself lives on the account,
   * not here, which is why the tour does not replay on a second device.
   */
  const floorKey = user ? `pc-tour-step:${user.id}` : "";
  const restored = useRef(false);
  useEffect(() => {
    if (!floorKey || restored.current) return;
    restored.current = true;
    const saved = Number(window.localStorage.getItem(floorKey));
    if (Number.isFinite(saved) && saved > 0) {
      setIndex((i) => Math.max(i, Math.min(saved, TOUR_STEPS.length - 1)));
    }
  }, [floorKey]);

  useEffect(() => {
    if (!floorKey) return;
    if (index > Number(window.localStorage.getItem(floorKey) ?? 0)) {
      window.localStorage.setItem(floorKey, String(index));
    }
  }, [floorKey, index]);

  const step = TOUR_STEPS[Math.min(index, TOUR_STEPS.length - 1)];
  const unavailable = step.unavailable?.(state) ?? null;
  const stepDone = step.done(state) || skippedIds.includes(step.id);

  /* ------------------------------------------------------------ when to show up */

  const inDashboard = pathname === "/projects" || pathname.startsWith("/projects/");
  const wanted = user?.onboardingComplete === false && inDashboard;

  /**
   * Not every dialog goes through the store — "New website" is local state on
   * the projects screen — so the DOM is the honest source here: any open modal
   * carries `aria-modal`, and this card deliberately does not.
   */
  const [dialogOpen, setDialogOpen] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    const tick = () =>
      setDialogOpen(Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));
    tick();
    const timer = setInterval(tick, 150);
    return () => clearInterval(timer);
  }, [wanted]);

  const showTour = wanted && !(s.modal !== null || m.pickerOpen || dialogOpen);

  /* ------------------------------------------------- following the real control */

  useEffect(() => {
    if (!showTour || minimised) {
      setBox(null);
      return;
    }

    const find = (): HTMLElement | null => {
      for (const selector of step.anchors) {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
      }
      return null;
    };

    const measure = () => {
      const el = find();
      if (!el) {
        setBox((current) => (current === null ? current : null));
        return;
      }
      const r = el.getBoundingClientRect();
      const next: Box = { top: r.top, left: r.left, width: r.width, height: r.height };
      setBox((current) => (sameBox(current, next) ? current : next));
    };

    measure();
    // Cheap polling beats a MutationObserver here: the anchor can move because
    // of a route change, a list re-render, a drag, or a panel opening, and one
    // timer covers all of them without watching the whole document.
    const timer = setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [showTour, minimised, step, pathname]);

  // Bring the control into view once per step, but never yank the page around
  // when it is already visible.
  const scrolledFor = useRef("");
  useEffect(() => {
    if (!showTour || minimised || scrolledFor.current === step.id + pathname) return;
    for (const selector of step.anchors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top < 8 || r.bottom > window.innerHeight - 8) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      scrolledFor.current = step.id + pathname;
      return;
    }
  }, [showTour, minimised, step, pathname]);

  useEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  /* ---------------------------------------------------------------- placement */

  const place = useMemo(() => {
    if (typeof window === "undefined" || !box) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_W, vw - 24);
    const centre = box.left + box.width / 2;
    const left = Math.max(12, Math.min(centre - width / 2, vw - width - 12));

    const below = box.top + box.height + GAP;
    const above = box.top - GAP - cardH;
    let top: number;
    let arrow: Arrow;
    if (below + cardH <= vh - 12) {
      top = below;
      arrow = "up";
    } else if (above >= 12) {
      top = above;
      arrow = "down";
    } else {
      // Nowhere sensible next to it — sit out of the way and keep the ring.
      const parked: Arrow = null;
      return { left: vw - width - 16, top: vh - cardH - 16, width, arrow: parked, centre };
    }
    return { left, top, width, arrow, centre };
  }, [box, cardH]);

  const corner = useMemo(() => {
    if (typeof window === "undefined") return { left: 16, top: 16, width: CARD_W };
    const width = Math.min(CARD_W, window.innerWidth - 24);
    return {
      left: window.innerWidth - width - 16,
      top: Math.max(16, window.innerHeight - cardH - 16),
      width,
    };
  }, [cardH]);

  /* ------------------------------------------------------------------ actions */

  const finish = useCallback(() => {
    // Asking for the tour again should start it from the beginning.
    if (floorKey) window.localStorage.removeItem(floorKey);
    void setOnboardingComplete(true);
  }, [floorKey, setOnboardingComplete]);

  const goToStep = useCallback(() => {
    const href = step.href(state);
    if (href && href !== pathname) router.push(href);
  }, [step, state, pathname, router]);

  if (!showTour) return null;

  const total = TOUR_STEPS.length;
  const doneCount = TOUR_STEPS.filter((t) => t.done(state) || skippedIds.includes(t.id)).length;

  if (minimised) {
    return (
      <button
        type="button"
        data-tour-ui="pill"
        onClick={() => setMinimised(false)}
        className="fixed bottom-5 left-1/2 z-[55] flex -translate-x-1/2 cursor-pointer items-center gap-2.5 rounded-full border border-accent-line bg-surface py-2 pr-4 pl-3 shadow-[0_14px_34px_-18px_rgba(20,24,32,.55)] lg:left-auto lg:right-5 lg:translate-x-0"
      >
        <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-accent text-tiny font-bold text-white">
          {doneCount}
        </span>
        <span className="text-label font-semibold text-ink">Getting started</span>
        <span className="text-mid text-muted">
          {doneCount} of {total}
        </span>
      </button>
    );
  }

  /* ---------------------------------------------------------------- finished */

  if (finished) {
    return (
      <div
        ref={cardRef}
        data-tour-ui="card"
        style={{ left: corner.left, top: corner.top, width: corner.width }}
        className="fixed z-[55] animate-rise rounded-[13px] border border-published-line bg-surface p-[18px] shadow-[0_22px_54px_-24px_rgba(20,24,32,.5)]"
      >
        <p className="mb-1.5 flex items-center gap-2 text-modal font-bold">
          <span className="text-published">◉</span> That is the whole thing
        </p>
        <p className="text-sub leading-[1.55] text-quiet">
          You have built a page and put it live. Everything from here is more of the same —
          add sections, fill them in, press Publish.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={finish}
            className="cursor-pointer rounded-[7px] bg-accent px-4 py-2.5 text-sub font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- normal step */

  const anchored = Boolean(box && place);
  const pos = anchored && place ? place : corner;
  const arrow = anchored && place ? place.arrow : null;
  const arrowLeft =
    anchored && place ? Math.max(18, Math.min(place.centre - place.left, place.width - 30)) : 0;

  const onRightScreen = !step.href(state) || step.href(state) === pathname;

  return (
    <>
      {box && (
        <div
          aria-hidden
          data-tour-ui="spotlight"
          // pointer-events-none is load-bearing: the control underneath has to
          // stay clickable, because clicking it is what finishes the step.
          className="pointer-events-none fixed z-[55] rounded-[10px] transition-[top,left,width,height] duration-150"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: "0 0 0 3px var(--color-accent), 0 0 0 9px var(--color-accent-soft)",
          }}
        />
      )}

      <div
        ref={cardRef}
        // Deliberately not role="dialog": it never traps focus, and the modal
        // check above keys off `aria-modal` to tell real dialogs from this.
        role="region"
        aria-label="Getting started"
        data-tour-ui="card"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
        className="fixed z-[55] animate-fade rounded-[13px] border border-line bg-surface shadow-[0_22px_54px_-24px_rgba(20,24,32,.5)]"
      >
        {arrow && (
          <span
            aria-hidden
            style={
              arrow === "up" ? { left: arrowLeft, top: -7 } : { left: arrowLeft, bottom: -7 }
            }
            className={cx(
              "absolute h-3 w-3 rotate-45 border bg-surface",
              arrow === "up" ? "border-r-0 border-b-0 border-line" : "border-t-0 border-l-0 border-line"
            )}
          />
        )}

        <div className="flex items-start justify-between gap-3 px-[18px] pt-[15px]">
          <p className="text-helper font-semibold tracking-[.08em] text-accent uppercase">
            Step {index + 1} of {total}
          </p>
          <button
            type="button"
            aria-label="Hide the getting started guide"
            title="Hide for now"
            onClick={() => setMinimised(true)}
            className="-mt-1 -mr-1 grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[6px] text-quiet hover:bg-chip-hover"
          >
            –
          </button>
        </div>

        <div className="px-[18px] pt-1.5 pb-[15px]">
          <h2 className="text-[16px] leading-[22px] font-bold tracking-[-.2px]">{step.title}</h2>
          <p className="mt-1.5 text-sub leading-[1.55] text-quiet">{step.body}</p>

          {unavailable && (
            <p className="mt-3 rounded-[8px] border border-draft bg-draft-bg px-3 py-2.5 text-mid leading-[1.5] text-draft-ink">
              {unavailable}
            </p>
          )}

          {!unavailable && !onRightScreen && (
            <button
              type="button"
              onClick={goToStep}
              className="mt-3.5 w-full cursor-pointer rounded-[8px] border border-dashed border-accent-line-soft bg-accent-wash px-3 py-2.5 text-sub font-semibold text-accent transition-colors hover:bg-[#eef3fc]"
            >
              {step.hereLabel} →
            </button>
          )}

          {!unavailable && onRightScreen && !anchored && (
            <p className="mt-3 rounded-[8px] border border-line-soft bg-sunken px-3 py-2.5 text-mid leading-[1.5] text-quiet">
              Looking for that button — it may be under the ☰ menu on a small screen.
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={finish}
              className="cursor-pointer text-mid font-medium text-muted hover:text-slate"
            >
              Skip the tour
            </button>

            <div className="ml-auto flex items-center gap-1.5">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  className="cursor-pointer rounded-[7px] border border-btn bg-surface px-3 py-2 text-mid font-semibold text-ink transition-colors hover:border-btn-hover"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (unavailable && !stepDone) setSkippedIds((ids) => [...ids, step.id]);
                  if (index + 1 >= total) finish();
                  else setIndex((i) => i + 1);
                }}
                className={cx(
                  "cursor-pointer rounded-[7px] px-3.5 py-2 text-mid font-semibold transition-colors",
                  stepDone || unavailable
                    ? "bg-accent text-white hover:bg-accent-dark"
                    : "border border-btn bg-surface text-slate hover:border-btn-hover"
                )}
              >
                {unavailable && !stepDone
                  ? "Skip this step"
                  : index + 1 >= total
                    ? "Finish"
                    : stepDone
                      ? "Next"
                      : "Skip ahead"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-1 px-[18px] pb-3.5">
          {TOUR_STEPS.map((t, i) => (
            <span
              key={t.id}
              title={t.label}
              className={cx(
                "h-1 flex-1 rounded-full",
                t.done(state) || skippedIds.includes(t.id)
                  ? "bg-published"
                  : i === index
                    ? "bg-accent"
                    : // Passed, but not provable from this screen — the media
                      // library cannot see what is on a page. Shown as been-here
                      // rather than green, so nothing is claimed that is not true.
                      i < index
                      ? "bg-accent-line"
                      : "bg-line-mid"
              )}
            />
          ))}
        </div>
      </div>
    </>
  );
}
