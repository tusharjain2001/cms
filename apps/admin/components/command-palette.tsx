"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { Input, cx } from "./ui";

type Group = "Navigate" | "Actions";

interface Command {
  id: string;
  group: Group;
  icon: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

/**
 * Global ⌘K / Ctrl-K command palette, mounted once in AppChrome so it works
 * from any signed-in screen.
 *
 * Rolled as its own top-aligned overlay rather than reusing the centered
 * `Modal` from ui.tsx — a palette needs an input-plus-listbox ARIA pattern
 * a generic dialog doesn't give you — but the Esc-to-close and
 * focus-restore-on-close contract below mirrors Modal exactly so it behaves
 * like every other overlay in the app. Only the search input is a real tab
 * stop; options are reached with the arrow keys via aria-activedescendant,
 * same as the ARIA APG combobox-with-listbox pattern, so there's nothing to
 * Tab-trap.
 */
export function CommandPalette() {
  const { status } = useAuth();
  const s = useStore();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const previouslyFocused = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Opens (toggles) from anywhere while signed in. Not wired up on the
  // signed-out screens, so it never intercepts ⌘K on /login or the landing page.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (status !== "signedIn") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!open) previouslyFocused.current = document.activeElement as HTMLElement | null;
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, open]);

  // Reset search on every open; restore focus to whatever opened it on close.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);

    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const hasProject = Boolean(s.projectId);
  const isOwner = s.project?.role === "owner";
  const close = () => setOpen(false);

  const commands: Command[] = [];

  for (const p of s.projects) {
    commands.push({
      id: `project:${p.id}`,
      group: "Navigate",
      icon: "◫",
      label: p.name,
      hint: p.id === s.projectId ? "current" : p.domain || undefined,
      keywords: p.domain,
      run: () => {
        s.setProjectId(p.id);
        router.push(`/projects/${p.id}/pages`);
      },
    });
  }

  if (hasProject) {
    for (const p of s.pages) {
      commands.push({
        id: `page:${p.id}`,
        group: "Navigate",
        icon: "▤",
        label: p.title,
        hint: p.id === s.page?.id ? "current" : p.slug ? `/${p.slug}` : undefined,
        keywords: p.slug,
        run: () => router.push(`/projects/${s.projectId}/pages/${p.id}`),
      });
    }

    commands.push({
      id: "nav:media",
      group: "Navigate",
      icon: "▣",
      label: "Photos & files",
      run: () => router.push(`/projects/${s.projectId}/media`),
    });

    if (isOwner) {
      commands.push({
        id: "nav:integration",
        group: "Navigate",
        icon: "◇",
        label: "Integration",
        run: () => router.push(`/projects/${s.projectId}/integration`),
      });
      commands.push({
        id: "nav:settings",
        group: "Navigate",
        icon: "⚙",
        label: "Website settings",
        run: () => router.push(`/projects/${s.projectId}/settings`),
      });
    }

    commands.push({
      id: "action:new-page",
      group: "Actions",
      icon: "✎",
      label: "New page",
      run: () => s.openModal("addpage"),
    });
  }

  if (s.page) {
    commands.push({
      id: "action:add-section",
      group: "Actions",
      icon: "✚",
      label: "Add section",
      run: () => s.openModal("picker"),
    });
    commands.push({
      id: "action:seo",
      group: "Actions",
      icon: "⌕",
      label: "Search & sharing for this page",
      keywords: "seo google meta title description share social noindex",
      run: () => s.showSeo(),
    });
    commands.push({
      id: "action:publish",
      group: "Actions",
      icon: "◉",
      label: "Publish current page",
      keywords: "publish live go live",
      run: () => void s.publish(),
    });
  }

  if (hasProject && isOwner) {
    commands.push({
      id: "action:integration",
      group: "Actions",
      icon: "◇",
      label: "Open Integration",
      keywords: "api key webhook",
      run: () => router.push(`/projects/${s.projectId}/integration`),
    });
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter((c) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q))
    : commands;

  // Keep the highlighted row in range as filtering shrinks the list.
  useEffect(() => {
    setActive((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (cmd: Command) => {
    cmd.run();
    close();
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[active];
      if (cmd) run(cmd);
    }
  };

  if (!open) return null;

  const activeId = filtered[active] ? `cmdk-option-${filtered[active].id}` : undefined;
  let groupSeen: Group | null = null;

  return (
    <div
      className="fixed inset-0 z-[70] flex animate-fade justify-center bg-[rgba(30,32,38,.34)] px-4 pt-[12vh]"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="h-fit w-full max-w-[560px] animate-rise-fast overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_30px_70px_-30px_rgba(20,24,32,.5)]"
      >
        <div className="border-b border-line-soft p-3">
          <Input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages, websites, actions…"
          />
        </div>

        <div
          id="cmdk-listbox"
          role="listbox"
          aria-label="Commands"
          className="max-h-[360px] overflow-y-auto p-2"
        >
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-label text-quiet">
              No commands match “{query}”.
            </p>
          )}
          {filtered.map((c, i) => {
            const showHeader = c.group !== groupSeen;
            groupSeen = c.group;
            return (
              <div key={c.id}>
                {showHeader && (
                  <p
                    className={cx(
                      "px-3 pb-1 text-helper font-semibold tracking-[.08em] text-muted uppercase",
                      i === 0 ? "pt-1" : "pt-3"
                    )}
                  >
                    {c.group}
                  </p>
                )}
                <div
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  id={`cmdk-option-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-[7px] px-3 py-2 text-label",
                    i === active ? "bg-accent-soft font-semibold text-accent" : "text-ink"
                  )}
                >
                  <span aria-hidden="true" className="w-4 shrink-0 text-center text-quiet">
                    {c.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && (
                    <span className="shrink-0 truncate font-mono text-micro text-muted">
                      {c.hint}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
