"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { cx } from "./ui";

const navBase =
  "flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-left text-label font-medium cursor-pointer transition-colors";

/** Initials for a project badge, e.g. "Rosewater Bakehouse" → "RB". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

function NavLink({
  href,
  icon,
  children,
  active,
  onNavigate,
  tour,
}: {
  href: string;
  icon: string;
  children: React.ReactNode;
  active: boolean;
  onNavigate?: () => void;
  /** Anchor name for the getting-started tour, when it points at this link. */
  tour?: string;
}) {
  return (
    <Link
      href={href}
      data-tour={tour}
      onClick={onNavigate}
      className={cx(
        navBase,
        active ? "bg-accent-soft font-semibold text-accent" : "text-slate hover:bg-chip-hover"
      )}
    >
      <span className="w-4 text-center">{icon}</span>
      {children}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const s = useStore();
  const { user, signOut, setOnboardingComplete } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const base = `/projects/${s.projectId}`;
  /**
   * Until a website is chosen there is no per-website screen to point at, and
   * `/projects//pages` is a real 404 (Next redirects the double slash away and
   * then cannot match it). Hide those links rather than render dead ones.
   */
  const hasProject = Boolean(s.projectId);

  /**
   * Owning a website is per website, not per person: the same account can own
   * one and merely have been invited to edit another. Settings belong to the
   * owner alone, so this is recomputed from whichever website is open.
   */
  const isOwner = s.project?.role === "owner";

  return (
    <div className="flex h-full w-[236px] shrink-0 flex-col gap-[18px] border-r border-line bg-rail px-3.5 py-4">
      <Link href="/projects" className="flex items-center gap-2.5 px-1 py-0.5">
        <span className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-accent text-label font-bold text-white">
          P
        </span>
        <span className="text-[15.5px] font-bold tracking-[-.2px]">Pagecraft</span>
      </Link>

      {/* project switcher */}
      <div>
        <button
          type="button"
          onClick={() => setSwitcherOpen((v) => !v)}
          disabled={s.projects.length === 0}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border border-line bg-surface px-2.5 py-[9px] text-left transition-colors hover:border-[#cfccc4] disabled:cursor-default"
        >
          <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-accent-tint text-tiny font-bold text-accent">
            {initials(s.project?.name ?? "")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label font-semibold">
              {s.project?.name ?? "No website yet"}
            </span>
            <span className="block truncate font-mono text-micro text-muted">
              {s.project?.domain || "not connected yet"}
            </span>
          </span>
          {s.projects.length > 1 && <span className="shrink-0 text-tiny text-faint">▼</span>}
        </button>

        {switcherOpen && s.projects.length > 0 && (
          <div className="mt-1.5 animate-fade rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_12px_28px_-16px_rgba(30,35,45,.28)]">
            {s.projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  s.setProjectId(p.id);
                  setSwitcherOpen(false);
                  onNavigate?.();
                  router.push(`/projects/${p.id}/pages`);
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] p-2 text-left transition-colors hover:bg-chip-hover"
              >
                <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] bg-accent-tint text-[10px] font-bold text-accent">
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-mid font-medium">{p.name}</span>
              </button>
            ))}
            <div className="my-1.5 h-px bg-line-mid" />
            <Link
              href="/projects"
              onClick={() => {
                setSwitcherOpen(false);
                onNavigate?.();
              }}
              className="block rounded-[7px] p-2 text-mid font-semibold text-accent hover:bg-chip-hover"
            >
              All your websites
            </Link>
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-[3px]">
        <NavLink
          href="/projects"
          icon="◫"
          active={pathname === "/projects"}
          onNavigate={onNavigate}
        >
          Your websites
        </NavLink>
        {hasProject && (
          <NavLink
            href={`${base}/pages`}
            icon="▤"
            active={pathname.startsWith(`${base}/pages`)}
            onNavigate={onNavigate}
            tour="nav-pages"
          >
            Pages
          </NavLink>
        )}
        {hasProject && (
          <NavLink
            href={`${base}/media`}
            icon="▣"
            active={pathname === `${base}/media`}
            onNavigate={onNavigate}
            tour="nav-media"
          >
            Photos &amp; files
          </NavLink>
        )}
        {hasProject && isOwner && (
          <NavLink
            href={`${base}/settings`}
            icon="⚙"
            active={pathname === `${base}/settings`}
            onNavigate={onNavigate}
          >
            Website settings
          </NavLink>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5">
        {/* Skipping the tour must not be a one-way door. */}
        {user?.onboardingComplete && (
          <button
            type="button"
            onClick={() => {
              void setOnboardingComplete(false);
              onNavigate?.();
            }}
            className={cx(navBase, "text-slate hover:bg-chip-hover")}
          >
            <span className="w-4 text-center">◎</span>
            Getting started
          </button>
        )}
        <NavLink
          href="/foundation"
          icon="◐"
          active={pathname === "/foundation"}
          onNavigate={onNavigate}
        >
          Style &amp; states
        </NavLink>
        <div className="h-px bg-line-mid" />

        <div className="flex items-center gap-2.5 px-1 py-0.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-tint text-tiny font-bold text-accent">
            {initials(user?.name ?? "")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-mid font-semibold">{user?.name ?? ""}</span>
            <span className="block truncate text-micro text-muted">{user?.email ?? ""}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          className="p-1.5 text-left text-helper font-medium text-muted hover:text-slate"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
