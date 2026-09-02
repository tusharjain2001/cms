"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { ContentPreview } from "@/components/editor/content-preview";
import { FieldView } from "@/components/editor/field-renderer";
import { SectionList } from "@/components/editor/section-list";
import { SeoPanel } from "@/components/editor/seo-panel";
import { Button, Input, cx } from "@/components/ui";

/** Keep in sync with the inline read below — this is the only place the key lives. */
const PREVIEW_STORAGE_KEY = "pc-content-preview";

export default function EditorScreen() {
  const s = useStore();
  const params = useParams<{ projectId: string; pageId: string }>();
  const [tab, setTab] = useState<"sections" | "content" | "preview">("sections");
  const base = `/projects/${params.projectId}/pages`;

  // Defaults on: initialise false (SSR-safe, matches server output) then read
  // the client's real choice once mounted — absent means "on" for a new client.
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
      setShowPreview(stored === null ? true : stored === "1");
    } catch {
      setShowPreview(true);
    }
  }, []);
  const togglePreview = () => {
    setShowPreview((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(PREVIEW_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Private mode / disabled storage — the choice still applies this session.
      }
      return next;
    });
  };

  useEffect(() => {
    if (params.pageId) return s.openPage(params.pageId);
  }, [params.pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // App-level undo/redo shortcuts. Skipped while focus is on an editable
  // element so the browser's native, character-level undo keeps working
  // while a client is typing in a field — the buttons remain the primary
  // affordance there. Doesn't touch the separate ⌘K listener.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;
      if (editable) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        s.redo();
      } else if (key === "z") {
        e.preventDefault();
        s.undo();
      } else if (key === "y") {
        e.preventDefault();
        s.redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [s.undo, s.redo]);

  const section = s.selectedSection;
  const def = s.selectedDef;

  /** Publish errors are reported per field, keyed `<sectionId>.<fieldPath>`. */
  const errorFor = (key: string) =>
    section
      ? s.publishIssues.find((i) => i.path === `${section.id}.${key}`)?.message
      : undefined;

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col lg:h-screen">
      <header className="sticky top-0 z-5 flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-rail px-4 py-2.5 lg:h-[62px] lg:flex-nowrap lg:gap-[18px] lg:px-[22px] lg:py-0">
        <Link
          href={base}
          className="shrink-0 rounded-[7px] border border-line bg-surface px-2.5 py-1.5 text-mid font-medium text-slate transition-colors hover:border-[#cfccc4]"
        >
          ← Pages
        </Link>

        <div className="min-w-0">
          <p className="truncate text-[15.5px] font-semibold">{s.page?.title ?? "…"}</p>
          <p className="truncate font-mono text-micro text-muted">
            {s.project?.domain || "your website"}/{s.page?.slug ?? ""}
          </p>
        </div>

        <div className="ml-2 flex items-center gap-2 text-mid font-medium text-quiet">
          {s.saving === "saving" && (
            <span className="h-[11px] w-[11px] animate-spin-fast rounded-full border-2 border-[#cfd4de] border-t-accent" />
          )}
          {s.publishedNow && s.saving === "saved" && <span className="text-published">◉</span>}
          <span
            key={s.saving}
            className={cx("hidden sm:inline", s.saving === "saved" && "animate-settle")}
          >
            {s.saving === "saving"
              ? "Saving…"
              : s.saving === "error"
                ? "Not saved"
                : "All changes saved"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {s.dirty && (
            <Button variant="quiet" className="hidden sm:block" onClick={() => void s.discard()}>
              Discard changes
            </Button>
          )}
          <button
            type="button"
            aria-pressed={showPreview}
            onClick={togglePreview}
            title="Show or hide the content preview pane"
            className={cx(
              "hidden shrink-0 items-center gap-1.5 rounded-[7px] border px-[15px] py-[9px] text-label font-semibold transition-colors lg:flex",
              showPreview
                ? "border-accent-line bg-accent-soft text-accent"
                : "border-btn bg-surface text-ink hover:border-btn-hover"
            )}
          >
            <span aria-hidden="true">◨</span>
            <span>Content preview</span>
          </button>
          <Button
            disabled={!s.canUndo}
            onClick={() => s.undo()}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">↶</span>
              <span className="hidden lg:inline">Undo</span>
            </span>
          </Button>
          <Button
            disabled={!s.canRedo}
            onClick={() => s.redo()}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">↷</span>
              <span className="hidden lg:inline">Redo</span>
            </span>
          </Button>
          <Button onClick={() => void s.preview()}>Preview</Button>
          <button
            key={s.publishedNow ? "celebrate" : "idle"}
            type="button"
            data-tour="publish"
            disabled={!s.dirty}
            onClick={() => void s.publish()}
            className={cx(
              "rounded-[7px] px-[18px] py-[9px] text-label font-semibold transition-[filter] active:scale-[.97]",
              s.dirty
                ? "cursor-pointer bg-accent text-white hover:brightness-[.96]"
                : "cursor-default border border-[#cfe0d5] bg-published-bg text-published",
              s.publishedNow && "animate-celebrate"
            )}
          >
            {s.dirty ? "Publish" : "Published"}
          </button>
        </div>
      </header>

      {s.publishedNow && (
        <div className="flex shrink-0 animate-fade flex-wrap items-center gap-2.5 border-b border-published-line bg-published-bg px-[22px] py-[11px] text-label font-medium text-published-ink">
          <span className="text-published">◉</span>
          <span>
            This page is live. Everything you see here matches{" "}
            {s.project?.domain || "your website"}.
          </span>
        </div>
      )}

      {s.publishIssues.length > 0 && (
        <div className="shrink-0 animate-fade border-b border-destructive-line bg-destructive-bg px-[22px] py-3 text-label text-destructive">
          <p className="font-semibold">This page is not ready to go live yet.</p>
          <ul className="mt-1 list-disc pl-5">
            {s.publishIssues.slice(0, 4).map((issue) => (
              <li key={issue.path}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex shrink-0 gap-1.5 border-b border-line bg-surface px-3.5 py-2.5 lg:hidden">
        {(["sections", "content", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cx(
              "flex-1 cursor-pointer rounded-[7px] p-2.5 text-mid font-semibold capitalize transition-colors",
              tab === t ? "bg-accent-soft text-accent" : "bg-transparent text-quiet"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          className={cx(
            "w-full shrink-0 overflow-y-auto border-r border-line bg-rail px-4 pt-5 pb-7 lg:block lg:w-[372px] lg:px-[18px]",
            tab === "sections" ? "block" : "hidden"
          )}
        >
          {s.loadingPage ? <SectionSkeleton /> : <SectionList />}
        </div>

        <div
          className={cx(
            "min-w-0 flex-1 overflow-y-auto bg-canvas lg:block",
            tab === "content" ? "block" : "hidden"
          )}
        >
          {s.pane === "seo" ? (
            <SeoPanel />
          ) : section && def ? (
            <div className="max-w-[660px] px-5 pt-6 pb-16 lg:px-[30px]">
              <div className="mb-1 flex flex-wrap items-baseline gap-2.5">
                <h1 className="text-panel font-bold">{section.name || def.name}</h1>
                <span className="text-label text-muted">{def.name}</span>
              </div>
              <p className="mb-6 text-label text-quiet">
                Fill in the parts below. Everything saves as you type.
              </p>

              <div className="flex flex-col gap-[22px]">
                {/* Universal on every section: the client's own nickname for it. */}
                <div className="rounded-[10px] border border-line bg-surface p-4">
                  <label className="mb-2 block text-label font-semibold">
                    Section name (for your reference)
                  </label>
                  <Input
                    value={section.name ?? ""}
                    onChange={(e) => s.renameSection(section.id, e.target.value)}
                  />
                  <p className="mt-2 text-helper text-muted">
                    Just a nickname so you can find it in the list. It is never shown on your
                    website.
                  </p>
                </div>

                {def.fields.map((field, i) => (
                  // The tour spotlights the first field rather than the whole
                  // panel: a ring around a full-height column is no help to
                  // anyone. Which field that is comes from the registry, so
                  // nothing here knows one section type from another.
                  <div key={field.key} data-tour={i === 0 ? "content-panel" : undefined}>
                    <FieldView
                      def={field}
                      value={s.draftContent[field.key]}
                      error={errorFor(field.key)}
                      onChange={(value) => s.setFieldValue(field.key, value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center p-14">
              <div className="max-w-[340px] text-center">
                <p className="mb-1.5 text-base font-semibold">Nothing selected</p>
                <p className="text-sub text-quiet">
                  Add a section on the left, then fill in its words and photos here.
                </p>
              </div>
            </div>
          )}
        </div>

        <div
          className={cx(
            "w-full shrink-0 overflow-y-auto border-l border-line bg-rail lg:w-[380px] xl:w-[460px]",
            tab === "preview" ? "block" : "hidden",
            showPreview ? "lg:block" : "lg:hidden"
          )}
        >
          <ContentPreview />
        </div>
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex animate-pulse-soft gap-2.5 rounded-[10px] border border-line-mid p-3"
        >
          <div className="h-[30px] w-[30px] rounded-[7px] bg-line-soft" />
          <div className="flex-1">
            <div className="h-3 w-[120px] rounded bg-line-mid" />
            <div className="mt-1.5 h-2.5 w-[60px] rounded bg-line-soft" />
            <div className="mt-2.5 h-2.5 w-full rounded bg-line-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}
