"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button, cx, inputBase } from "@/components/ui";

/**
 * A markdown-aware textarea for `para` fields, with a compact formatting
 * toolbar above it: bold, italic, link, bulleted list, numbered list.
 *
 * THE BOUNDARY: this never touches HTML. It reads and writes the same plain
 * string a `para` field always stored — light markdown (`**bold**`, `*italic*`,
 * `[text](url)`, `- ` / `1. ` lines) — so existing plain-text values keep
 * working unchanged and the stored value stays content, never design.
 *
 * All actions operate on the textarea's own selection, then hand the whole
 * string to `onChange` and restore a sensible selection so typing continues
 * without a hiccup.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  rows?: number;
  className?: string;
}

const BOLD = "**";
const ITALIC = "*";
const BULLET_RE = /^-\s+/;
const NUMBER_RE = /^\d+\.\s+/;

export function RichTextArea({
  value,
  onChange,
  placeholder,
  invalid,
  rows = 4,
  className,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Selection can only be restored once React has flushed the new `value`
  // into the DOM — setting it inline would land on the stale text and get
  // clobbered by the re-render that follows onChange.
  const pendingSelection = useRef<[number, number] | null>(null);

  useEffect(() => {
    const sel = pendingSelection.current;
    const el = ref.current;
    if (!sel || !el) return;
    pendingSelection.current = null;
    el.focus();
    el.setSelectionRange(sel[0], sel[1]);
  }, [value]);

  function replace(next: string, selStart: number, selEnd: number) {
    pendingSelection.current = [selStart, selEnd];
    onChange(next);
  }

  function selection() {
    const el = ref.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    return { start, end, text: value.slice(start, end) };
  }

  function wrapToggle(marker: string, placeholderWord: string) {
    if (!ref.current) return;
    const { start, end, text: selected } = selection();
    const m = marker.length;

    // Selection already includes the markers (e.g. "**bold**" fully selected).
    if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= m * 2) {
      const inner = selected.slice(m, selected.length - m);
      replace(value.slice(0, start) + inner + value.slice(end), start, start + inner.length);
      return;
    }
    // Selection sits just inside the markers (e.g. "bold" selected within "**bold**").
    const before = value.slice(Math.max(0, start - m), start);
    const after = value.slice(end, end + m);
    if (selected && before === marker && after === marker) {
      replace(
        value.slice(0, start - m) + selected + value.slice(end + m),
        start - m,
        start - m + selected.length
      );
      return;
    }
    if (selected) {
      replace(
        value.slice(0, start) + marker + selected + marker + value.slice(end),
        start + m,
        start + m + selected.length
      );
      return;
    }
    replace(
      value.slice(0, start) + marker + placeholderWord + marker + value.slice(end),
      start + m,
      start + m + placeholderWord.length
    );
  }

  function insertLink() {
    if (!ref.current) return;
    const { start, end, text: selected } = selection();
    const hasSelection = selected.length > 0;
    const text = hasSelection ? selected : "text";
    const insert = `[${text}](url)`;
    const next = value.slice(0, start) + insert + value.slice(end);
    if (hasSelection) {
      const urlStart = start + text.length + 3; // "[" + text + "]("
      replace(next, urlStart, urlStart + 3); // select "url"
    } else {
      const textStart = start + 1; // after "["
      replace(next, textStart, textStart + text.length); // select "text"
    }
  }

  function toggleList(kind: "bullet" | "number") {
    if (!ref.current) return;
    const { start, end } = selection();
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.length ? block.split("\n") : [""];

    const re = kind === "bullet" ? BULLET_RE : NUMBER_RE;
    const strip = (l: string) => l.replace(BULLET_RE, "").replace(NUMBER_RE, "");
    const alreadyOn = lines.every((l) => re.test(l));

    const newLines = alreadyOn
      ? lines.map(strip)
      : lines.map((l, i) => (kind === "bullet" ? `- ${strip(l)}` : `${i + 1}. ${strip(l)}`));
    const newBlock = newLines.join("\n");
    replace(value.slice(0, lineStart) + newBlock + value.slice(lineEnd), lineStart, lineStart + newBlock.length);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      wrapToggle(BOLD, "bold");
    } else if (key === "i") {
      e.preventDefault();
      wrapToggle(ITALIC, "italic");
    } else if (key === "k") {
      e.preventDefault();
      insertLink();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <ToolbarButton label="Bold" shortcut="Ctrl+B" onClick={() => wrapToggle(BOLD, "bold")}>
          <span aria-hidden className="text-[13px] font-bold leading-none">
            B
          </span>
        </ToolbarButton>
        <ToolbarButton label="Italic" shortcut="Ctrl+I" onClick={() => wrapToggle(ITALIC, "italic")}>
          <span aria-hidden className="text-[13px] italic leading-none">
            I
          </span>
        </ToolbarButton>
        <ToolbarButton label="Link" shortcut="Ctrl+K" onClick={insertLink}>
          <span aria-hidden className="text-[13px] leading-none">
            🔗
          </span>
        </ToolbarButton>
        <ToolbarButton label="Bulleted list" onClick={() => toggleList("bullet")}>
          <span aria-hidden className="text-[15px] leading-none">
            •
          </span>
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onClick={() => toggleList("number")}>
          <span aria-hidden className="text-[11px] font-semibold leading-none">
            1.
          </span>
        </ToolbarButton>
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={cx(
          inputBase,
          invalid ? "border-destructive shadow-[0_0_0_3px_var(--color-destructive-soft)]" : "border-field",
          "text-body leading-[1.55]",
          className
        )}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="icon"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
