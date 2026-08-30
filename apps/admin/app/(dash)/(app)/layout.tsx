"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Tour } from "@/components/tour";
import { McpWidget } from "@/components/mcp-widget";
import { PagecraftMark, PagecraftWordmark } from "@/components/logo";

/**
 * The signed-in shell: a fixed sidebar on desktop, a slide-over drawer on
 * phones. Screens supply their own padding so the page editor can run
 * edge-to-edge at full height.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, signedOutTo } = useAuth();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  /**
   * Sends away anyone without a session — but not always to the same place.
   *
   * `signedOutTo` is `/login` for someone who arrived at a dashboard URL with
   * no session, or whose session expired underneath them: they want back in.
   * It is `/` when they pressed Sign out, because that is someone leaving.
   *
   * Hard-coding `/login` here is what made an earlier attempt at this fail:
   * this shell is still mounted when `status` flips, so its redirect fires
   * *after* the sign-out has already navigated, and quietly overrules it.
   */
  useEffect(() => {
    if (status === "signedOut") router.replace(signedOutTo);
  }, [status, signedOutTo, router]);

  if (status !== "signedIn") {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="animate-pulse-soft text-label text-muted">Loading your website…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen lg:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="presentation"
          onClick={() => setDrawer(false)}
        >
          <div className="absolute inset-0 bg-[rgba(30,32,38,.34)]" />
          <div className="relative h-full animate-fade" onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-rail px-4 py-2.5 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawer(true)}
            className="cursor-pointer rounded-md border border-line bg-surface px-2.5 py-1.5 text-label text-slate"
          >
            ☰
          </button>
          <PagecraftMark height={19} className="shrink-0" />
          <PagecraftWordmark size={14} />
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/*
        Mounted here rather than in `(dash)/layout.tsx` so it can never appear
        on the landing page or any of the signed-out screens — this shell only
        renders once there is a session.
      */}
      <Tour />
      <McpWidget />
    </div>
  );
}
