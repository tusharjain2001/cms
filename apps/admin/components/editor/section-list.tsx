"use client";

import { useStore } from "@/lib/store";
import { useDragList } from "@/lib/use-drag-list";
import { Chip, Grip, cx } from "@/components/ui";

/** The left rail of the page editor: this page's sections, in page order. */
export function SectionList() {
  const s = useStore();
  const drag = useDragList((from, to) => void s.moveSection(from, to));
  const sections = s.page?.draftSections ?? [];

  return (
    <div className="flex flex-col">
      <p className="mb-1 text-helper font-semibold tracking-[.08em] text-muted uppercase">
        Sections on this page
      </p>
      <p className="mb-3.5 text-mid text-muted">
        Top to bottom, the same order as your website.
      </p>

      {sections.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-field bg-surface px-4 py-8 text-center">
          <p className="mb-1 text-[14.5px] font-semibold">This page is empty</p>
          <p className="text-mid text-quiet">
            Add your first section to start building the page.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sections.map((sec, i) => {
            const def = s.typeFor(sec.type);
            const selected = sec.id === s.selected;
            const hidden = !sec.visible;
            const dragging = drag.draggingIndex === i;
            return (
              <div key={sec.id} {...drag.rowProps(i)}>
                {drag.overIndex === i && <div className="mb-1 h-0.5 rounded-full bg-accent" />}
                <div
                  onClick={() => s.selectSection(sec.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && s.selectSection(sec.id)}
                  style={{
                    transition: "box-shadow 150ms ease, transform 0.35s var(--ease-spring)",
                    ...(dragging && {
                      transform: "scale(1.02)",
                      boxShadow: "0 8px 18px rgba(30,35,45,.16)",
                    }),
                  }}
                  className={cx(
                    "flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-3",
                    selected
                      ? "border-accent bg-surface shadow-[0_0_0_3px_#eaeff9]"
                      : hidden
                        ? "border-line bg-sunken opacity-[.72]"
                        : "border-line bg-surface"
                  )}
                >
                  <Grip className="pt-1" />
                  <span
                    className={cx(
                      "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] text-[15px]",
                      selected ? "bg-accent-soft text-accent" : "bg-chip-hover text-quiet"
                    )}
                  >
                    {def?.icon ?? "▭"}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cx(
                          "truncate text-body font-semibold",
                          hidden ? "text-[#9a9ca3]" : "text-ink"
                        )}
                      >
                        {sec.name || def?.name || sec.type}
                      </span>
                      {hidden && (
                        <Chip className="px-[7px] py-0.5 text-[10.5px] text-muted">Hidden</Chip>
                      )}
                    </span>
                    <span className="mt-px block text-micro text-muted">
                      {def?.name ?? sec.type}
                    </span>
                    <span className="mt-1.5 block truncate text-mid text-quiet">
                      {s.previewFor(sec)}
                    </span>
                  </span>

                  <span className="flex shrink-0 flex-col gap-[3px]">
                    <button
                      type="button"
                      title={hidden ? "Show on the website" : "Hide from the website"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void s.toggleHidden(sec.id);
                      }}
                      className="grid h-6 w-[26px] cursor-pointer place-items-center rounded-[5px] text-helper text-muted transition-colors hover:bg-chip hover:text-slate active:scale-[.9]"
                    >
                      {hidden ? "◌" : "◉"}
                    </button>
                    <button
                      type="button"
                      title="Delete section"
                      onClick={(e) => {
                        e.stopPropagation();
                        s.askDelete({
                          kind: "section",
                          id: sec.id,
                          name: sec.name || def?.name || sec.type,
                        });
                      }}
                      className="grid h-6 w-[26px] cursor-pointer place-items-center rounded-[5px] text-helper text-faint transition-colors hover:bg-destructive-bg hover:text-destructive active:scale-[.9]"
                    >
                      🗑
                    </button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        data-tour="add-section"
        onClick={() => s.openModal("picker")}
        className="mt-3 w-full cursor-pointer rounded-[9px] border border-dashed border-accent-line-soft bg-accent-wash p-3 text-sub font-semibold text-accent transition-colors hover:border-[#94aad9] hover:bg-[#eef3fc] active:scale-[.98]"
      >
        + Add section
      </button>
    </div>
  );
}
