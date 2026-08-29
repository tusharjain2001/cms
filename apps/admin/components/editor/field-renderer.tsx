"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { thumb, toFileValue, toImageValue, useMedia } from "@/lib/media";
import { blankListItem, listItemLabel } from "@/lib/dto";
import type { FieldDef, FileValue, ImageValue, ListDef } from "@/lib/dto";
import { useDragList } from "@/lib/use-drag-list";
import { RichTextArea } from "@/components/editor/rich-text-area";
import {
  Button,
  Field as FieldShell,
  Grip,
  Input,
  PhotoTile,
  Select,
  Toggle,
  cx,
} from "@/components/ui";

/**
 * Renders one field from its REGISTRY DEFINITION.
 *
 * Nothing here knows what a Hero or a Product grid is. The API sends field
 * definitions, this walks them, and the right controls appear. That is the
 * whole premise of the CMS: a new section type is a server-side edit, and its
 * editing form builds itself.
 */

interface Props {
  def: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Nesting depth — deeper fields render slightly smaller. */
  depth?: number;
  error?: string;
}

export function FieldView({ def, value, onChange, depth = 0, error }: Props) {
  const s = useStore();
  const media = useMedia();
  const small = depth > 0;
  const compact = small ? "px-[11px] py-[9px] text-sub" : undefined;

  switch (def.kind) {
    case "text": {
      const text = typeof value === "string" ? value : "";
      const over = def.max !== undefined && text.length > def.max;
      return (
        <FieldShell
          label={def.label}
          counter={def.max ? `${text.length} / ${def.max}` : undefined}
          counterTone={over ? "warn" : "muted"}
          help={def.help}
          error={error}
        >
          <Input
            value={text}
            placeholder={def.placeholder}
            invalid={over || !!error}
            className={compact}
            onChange={(e) => onChange(e.target.value)}
          />
        </FieldShell>
      );
    }

    case "para": {
      const text = typeof value === "string" ? value : "";
      const over = def.max !== undefined && text.length > def.max;
      return (
        <FieldShell
          label={def.label}
          counter={def.max ? `${text.length} / ${def.max}` : undefined}
          counterTone={over ? "warn" : "muted"}
          help={def.help ?? "Select text to format — bold, italic, links and lists are saved as simple markdown."}
          error={error}
        >
          <RichTextArea
            rows={small ? 3 : 4}
            value={text}
            placeholder={def.placeholder}
            invalid={over || !!error}
            className={compact}
            onChange={onChange}
          />
        </FieldShell>
      );
    }

    case "link": {
      const text = typeof value === "string" ? value : "";
      return (
        <FieldShell label={def.label} help={def.help} error={error}>
          <Input
            mono
            invalid={!!error}
            value={text}
            placeholder={def.placeholder ?? "https:// or /page or tel:"}
            className={compact}
            onChange={(e) => onChange(e.target.value)}
          />
        </FieldShell>
      );
    }

    case "select": {
      const current = typeof value === "string" ? value : def.options[0] ?? "";
      return (
        <FieldShell label={def.label} help={def.help} error={error}>
          <Select value={current} onChange={(e) => onChange(e.target.value)}>
            {def.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </FieldShell>
      );
    }

    case "toggle": {
      const on = value === true;
      return (
        <div className="flex items-center gap-3.5 rounded-[10px] border border-line bg-surface p-3.5">
          <div className="flex-1">
            <p className="text-label font-semibold">{def.label}</p>
            {def.help && <p className="mt-1 text-helper text-muted">{def.help}</p>}
          </div>
          <span className="text-mid font-medium text-quiet">{on ? "On" : "Off"}</span>
          <Toggle on={on} onClick={() => onChange(!on)} />
        </div>
      );
    }

    case "image": {
      const img = (value ?? null) as ImageValue | null;
      return (
        <FieldShell label={def.label} help={def.help} error={error}>
          <div className="flex flex-wrap items-start gap-3.5 rounded-[10px] border border-line bg-surface p-3.5">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb(img.url, 300)}
                alt={img.alt ?? ""}
                className="h-20 w-[132px] shrink-0 rounded-lg border border-line-mid bg-sunken object-cover"
              />
            ) : (
              <PhotoTile className="h-20 w-[132px] shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              {img ? (
                <>
                  <p className="truncate text-label font-medium">{img.alt || "Photo"}</p>
                  <p className="mt-0.5 font-mono text-micro text-muted">
                    {img.width} × {img.height}
                  </p>
                </>
              ) : (
                <p className="text-label text-muted">No photo chosen yet.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="small"
                  onClick={async () => {
                    const picked = await media.pick("image");
                    if (picked) onChange(toImageValue(picked));
                  }}
                >
                  {img ? "Replace" : "Choose a photo"}
                </Button>
                {img && (
                  <Button
                    variant="quiet"
                    className="px-3 py-1.5 text-helper text-destructive hover:text-destructive-dark"
                    onClick={() => onChange(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </FieldShell>
      );
    }

    case "file": {
      const doc = (value ?? null) as FileValue | null;
      return (
        <FieldShell label={def.label} help={def.help} error={error}>
          <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-[13px]">
            <span className="grid h-10 w-[34px] shrink-0 place-items-center rounded-[5px] border border-line-mid bg-chip-hover font-mono text-[9.5px] font-semibold text-quiet">
              PDF
            </span>
            <div className="min-w-0 flex-1">
              {doc ? (
                <>
                  <p className="truncate text-label font-medium">{doc.name}</p>
                  <p className="mt-0.5 text-micro text-muted">
                    {Math.round(doc.bytes / 1024)} KB
                  </p>
                </>
              ) : (
                <p className="text-label text-muted">No file chosen yet.</p>
              )}
            </div>
            <Button
              variant="small"
              onClick={async () => {
                const picked = await media.pick("raw");
                if (picked) onChange(toFileValue(picked));
              }}
            >
              {doc ? "Replace" : "Choose a file"}
            </Button>
            {doc && (
              <Button
                variant="quiet"
                className="px-2.5 py-1.5 text-helper text-destructive hover:text-destructive-dark"
                onClick={() => onChange(null)}
              >
                Remove
              </Button>
            )}
          </div>
        </FieldShell>
      );
    }

    case "list":
      return <ListView def={def} value={value} onChange={onChange} depth={depth} />;
  }
}

/* ------------------------------------------------------------- repeatable */

function ListView({
  def,
  value,
  onChange,
  depth,
}: {
  def: ListDef;
  value: unknown;
  onChange: (value: unknown) => void;
  depth: number;
}) {
  const items = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const atMax = def.max !== undefined && items.length >= def.max;

  const drag = useDragList((from, to) => {
    const next = items.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  });

  const setItem = (index: number, key: string, v: unknown) =>
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: v } : item)));

  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const add = () => {
    if (atMax) return;
    onChange([...items, blankListItem(def.of)]);
    setOpen((o) => ({ ...o, [items.length]: true }));
  };

  /* A list nested inside a list stays as flat rows — the design never opens a
     third level of accordion, and a client would lose their place if it did. */
  if (depth > 0) {
    return (
      <div className="mt-0.5 border-l-2 border-line pl-[13px]">
        <div className="mb-2 flex items-baseline justify-between">
          <label className="text-mid font-semibold">{def.label}</label>
          {def.max && (
            <span className="text-tiny text-muted">
              {items.length} of {def.max}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {items.map((item, i) => {
            const first = def.of[0];
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-[7px] border border-line bg-surface px-2.5 py-2"
              >
                <Grip className="text-[13px]" />
                {first && (first.kind === "text" || first.kind === "para") ? (
                  <input
                    value={typeof item[first.key] === "string" ? (item[first.key] as string) : ""}
                    placeholder={`New ${def.itemNoun}`}
                    onChange={(e) => setItem(i, first.key, e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-mid outline-none"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-mid">
                    {listItemLabel(def, item)}
                  </span>
                )}
                <TrashButton onClick={() => remove(i)} />
              </div>
            );
          })}
          <AddButton def={def} atMax={atMax} onClick={add} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-label font-semibold">{def.label}</label>
        {def.max && (
          <span className="text-micro text-muted">
            {items.length} of {def.max}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item, i) => {
          const isOpen = !!open[i];
          return (
            <div key={i} {...drag.rowProps(i)}>
              {drag.overIndex === i && <div className="mb-1 h-0.5 rounded-full bg-accent" />}
              <div
                className={cx(
                  "rounded-lg bg-surface transition-shadow",
                  isOpen
                    ? "border border-accent-line shadow-[0_1px_2px_rgba(30,35,45,.05)]"
                    : "border border-line"
                )}
              >
                <div className="flex items-center gap-2.5 px-3 py-[11px]">
                  <Grip className="text-[14px]" />
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left text-sub font-medium"
                  >
                    {listItemLabel(def, item)}
                  </button>
                  <button
                    type="button"
                    title={isOpen ? "Close" : "Open"}
                    onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                    className={cx(
                      "grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-tiny text-muted transition-transform hover:bg-chip-hover",
                      isOpen && "rotate-90"
                    )}
                  >
                    ▶
                  </button>
                  <TrashButton onClick={() => remove(i)} />
                </div>

                {/* Grid 0fr/1fr accordion: the row stays mounted (so a field
                    mid-edit never loses its place) and only its allotted
                    track height animates, per the accordion tokens in
                    globals.css. */}
                <div
                  className={cx("grid", isOpen ? "animate-accordion-down" : "animate-accordion-up")}
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                  aria-hidden={!isOpen}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-[18px] border-t border-line-mid bg-[#fdfdfc] p-4">
                      {def.of.map((child) => (
                        <FieldView
                          key={child.key}
                          def={child}
                          value={item[child.key]}
                          onChange={(v) => setItem(i, child.key, v)}
                          depth={depth + 1}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <AddButton def={def} atMax={atMax} onClick={add} />

        {atMax && (
          <p className="rounded-md bg-draft-bg px-2.5 py-2 text-helper font-medium text-draft-ink">
            Maximum {def.max} {def.itemNoun}s reached. Delete one to add another.
          </p>
        )}
      </div>
    </div>
  );
}

function AddButton({
  def,
  atMax,
  onClick,
}: {
  def: ListDef;
  atMax: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={atMax}
      onClick={onClick}
      className={cx(
        "w-full rounded-lg border border-dashed p-2.5 text-label font-semibold transition-colors",
        atMax
          ? "cursor-not-allowed border-field bg-sunken text-faint"
          : "cursor-pointer border-accent-line-soft bg-accent-wash text-accent hover:bg-[#eef3fc] active:scale-[.98]"
      )}
    >
      + Add {def.itemNoun}
    </button>
  );
}

function TrashButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Delete"
      onClick={onClick}
      className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[5px] text-tiny text-faint transition-colors hover:bg-destructive-bg hover:text-destructive active:scale-[.9]"
    >
      🗑
    </button>
  );
}
