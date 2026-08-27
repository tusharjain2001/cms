"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

/**
 * The signed-in shell: a fixed sidebar on desktop, a slide-over drawer on
 * phones. Screens supply their own padding so the page editor can run
 * edge-to-edge at full height.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (status === "signedOut") router.replace("/");
  }, [status, router]);

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
          <span className="grid h-[22px] w-[22px] place-items-center rounded-md bg-accent text-tiny font-bold text-white">
            P
          </span>
          <span className="text-label font-bold">Pagecraft</span>
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
