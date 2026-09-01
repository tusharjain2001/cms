"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { FREE_PAGES_PER_WEBSITE, ONE_MONTH } from "@/lib/pricing";
import { useDragList } from "@/lib/use-drag-list";
import { Button, Chip, DropLine, EmptyState, Grip, PageHeader } from "@/components/ui";

export default function PagesScreen() {
  const s = useStore();
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const drag = useDragList((from, to) => void s.movePage(from, to));
  const base = `/projects/${params.projectId}/pages`;

  // Deep links and refreshes must land on the right website.
  useEffect(() => {
    if (params.projectId && params.projectId !== s.projectId) {
      s.setProjectId(params.projectId);
    }
  }, [params.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPage = (id: string) => router.push(`${base}/${id}`);

  /**
   * The free website holds one page, so the button that would add a second is
   * an upgrade prompt instead of a request the API is about to refuse.
   *
   * Gated on being the **owner** as well as on the plan, for two reasons: the
   * cap belongs to whoever owns the website (they pay, not the viewer), and an
   * editor invited to someone else's site cannot buy anything, so offering
   * them a plan would be a dead end. An editor keeps the plain button and, if
   * the site really is full, the API's own explanation.
   */
  const owns = s.project?.role === "owner";
  const atFreePageLimit =
    owns && user?.plan === "free" && s.pages.length >= FREE_PAGES_PER_WEBSITE;
  const upgradeHref = `/billing?want=${Math.max(1, s.projects.filter((p) => p.role === "owner").length)}`;

  return (
    <div className="max-w-[960px] px-6 py-10 lg:px-11">
      <PageHeader
        title={s.project?.name ?? "Pages"}
        sub="Drag the pages to change the order of your website menu."
        action={
          atFreePageLimit ? (
            <Link href={upgradeHref}>
              <Button variant="primary" data-tour="add-page">
                Choose a plan to add pages
              </Button>
            </Link>
          ) : (
            <Button variant="primary" data-tour="add-page" onClick={() => s.openModal("addpage")}>
              + Add page
            </Button>
          )
        }
      />

      {s.loadingPages ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex animate-pulse-soft items-center gap-4 border-b border-line-soft px-5 py-[18px] last:border-b-0"
            >
              <div className="h-3.5 w-3.5 rounded bg-line-mid" />
              <div className="h-[13px] w-[120px] rounded bg-line-mid" />
              <div className="h-[11px] w-[76px] rounded bg-line-soft" />
              <div className="ml-auto h-5 w-24 rounded-full bg-line-soft" />
            </div>
          ))}
        </div>
      ) : s.pages.length === 0 ? (
        <EmptyState
          icon="▤"
          title="Your website has no pages yet"
          body="Start from a template so the first page isn't empty, or build one from scratch. You can add more later and drag them into the order you want."
          action={
            <Button variant="primary" onClick={() => s.openModal("addpage")}>
              + Add your first page
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {s.pages.map((p, i) => (
              <div
                key={p.id}
                {...drag.rowProps(i)}
                className="border-b border-line-soft last:border-b-0"
              >
                <DropLine active={drag.overIndex === i} />
                <div className="flex items-center gap-3.5 px-4 py-[15px] transition-colors hover:bg-rail">
                  <Grip />
                  <button
                    type="button"
                    onClick={() => openPage(p.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-3 text-left"
                  >
                    <span className="truncate text-[14.5px] font-semibold">{p.title}</span>
                    <span className="hidden font-mono text-mid text-muted sm:block">
                      /{p.slug}
                    </span>
                  </button>

                  {p.hasDraftChanges ? (
                    <Chip tone="draft">Draft changes</Chip>
                  ) : p.status === "published" ? (
                    <Chip tone="published">Published</Chip>
                  ) : (
                    <Chip>Not published</Chip>
                  )}

                  <span className="hidden w-[150px] text-right text-mid text-muted xl:block">
                    {new Date(p.updatedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="small"
                      // The tour points at the first row, because that is the
                      // one it just talked someone through creating.
                      data-tour={i === 0 ? "page-row" : undefined}
                      onClick={() => openPage(p.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="icon"
                      title="Make a copy"
                      onClick={() => void s.duplicatePage(p.id)}
                    >
                      ⧉
                    </Button>
                    <Button
                      variant="icon"
                      title="Delete page"
                      className="text-destructive hover:border-destructive-line hover:bg-destructive-bg"
                      onClick={() => s.askDelete({ kind: "page", id: p.id, name: p.title })}
                    >
                      🗑
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-mid text-muted">
            {atFreePageLimit ? (
              <>
                Your free website holds one page. {ONE_MONTH} a month lifts that — add as many
                pages as your website needs, and keep everything you have already built.{" "}
                <Link href={upgradeHref} className="font-semibold text-accent hover:underline">
                  See plans
                </Link>
              </>
            ) : (
              "Changes to a page are only visible to you until you press Publish."
            )}
          </p>
        </>
      )}
    </div>
  );
}
