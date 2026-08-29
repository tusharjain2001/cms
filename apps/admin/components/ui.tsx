"use client";

import { useEffect, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

/* ---------------------------------------------------------------- buttons */

type Variant = "primary" | "secondary" | "quiet" | "danger" | "small" | "icon" | "dashed";

const VARIANTS: Record<Variant, string> = {
  primary:
    "px-4 py-2.5 rounded-[7px] bg-accent text-white text-sub font-semibold hover:bg-accent-dark",
  secondary:
    "px-[15px] py-[9px] rounded-[7px] border border-btn bg-surface text-ink text-label font-semibold hover:border-btn-hover",
  quiet:
    "px-3 py-[9px] bg-transparent text-muted text-label font-medium hover:text-destructive",
  danger:
    "px-4 py-[9px] rounded-[7px] bg-destructive text-white text-label font-semibold hover:bg-destructive-dark",
  small:
    "px-[11px] py-1.5 rounded-md border border-line bg-surface text-ink text-helper font-semibold hover:border-btn-hover",
  icon: "w-[30px] h-[29px] grid place-items-center rounded-md border border-line bg-surface text-quiet hover:border-btn-hover",
  dashed:
    "w-full px-3 py-3 rounded-[9px] border border-dashed border-accent-line-soft bg-accent-wash text-accent text-sub font-semibold hover:bg-[#eef3fc] hover:border-[#94aad9]",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------- inputs */

export function Field({
  label,
  counter,
  counterTone = "muted",
  children,
  help,
  error,
}: {
  label?: string;
  counter?: string;
  counterTone?: "muted" | "warn";
  children: ReactNode;
  help?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {(label || counter) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && <label className="text-label font-semibold">{label}</label>}
          {counter && (
            <span
              className={cx(
                "font-mono text-micro",
                counterTone === "warn" ? "text-destructive" : "text-muted"
              )}
            >
              {counter}
            </span>
          )}
        </div>
      )}
      {children}
      {help && <p className="text-helper text-muted">{help}</p>}
      {error && (
        <p className="flex items-start gap-2 text-helper font-medium text-destructive">
          <span className="shrink-0">!</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export const inputBase =
  "w-full px-3 py-2.5 rounded-[7px] border bg-surface text-ink outline-none transition-shadow pc-focus";

export function Input({
  className,
  mono,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; invalid?: boolean }) {
  return (
    <input
      className={cx(
        inputBase,
        invalid
          ? "border-destructive shadow-[0_0_0_3px_var(--color-destructive-soft)]"
          : "border-field",
        mono ? "font-mono text-sub" : "text-body",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(inputBase, "border-field text-body leading-[1.55]", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cx(inputBase, "border-field text-body appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-tiny text-faint">
        ▼
      </span>
    </div>
  );
}

export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cx(
        "relative h-6 w-[42px] shrink-0 cursor-pointer rounded-full transition-colors",
        on ? "bg-accent" : "bg-[#d5d2ca]"
      )}
    >
      <span
        className={cx(
          "absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-[left]",
          on ? "left-[21px]" : "left-[3px]"
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ chips */

type ChipTone = "draft" | "published" | "neutral" | "accent";

const CHIP: Record<ChipTone, string> = {
  draft: "bg-draft-bg text-draft-ink",
  published: "bg-published-bg text-published",
  neutral: "bg-chip text-slate",
  accent: "bg-accent-soft text-accent",
};

export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "shrink-0 rounded-full px-[9px] py-1 text-micro font-semibold",
        CHIP[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ cards */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx("rounded-xl border border-line bg-surface p-[22px]", className)}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className={sub ? "mb-4" : "mb-4"}>
      <h2 className="text-card font-semibold">{children}</h2>
      {sub && <p className="mt-1 text-label text-quiet">{sub}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-6">
      <div>
        <h1 className="text-screen font-bold">{title}</h1>
        {sub && <p className="mt-[5px] text-body text-quiet">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-field bg-surface px-8 py-16 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-4 grid h-[46px] w-[46px] place-items-center rounded-xl bg-chip-hover text-xl text-faint"
      >
        {icon}
      </div>
      <h3 className="mb-1.5 text-[17px] font-semibold">{title}</h3>
      <p className="mx-auto mb-5 max-w-[400px] text-sub text-quiet">{body}</p>
      {action}
    </div>
  );
}

/** The drag handle used on every reorderable row. */
export function Grip({ className }: { className?: string }) {
  return (
    <span
      title="Drag to reorder"
      className={cx(
        "shrink-0 cursor-grab text-[15px] tracking-[-1px] text-grip select-none",
        className
      )}
    >
      ⠿
    </span>
  );
}

/** Thin accent line shown between rows while a drag is hovering. */
export function DropLine({ active }: { active: boolean }) {
  return (
    <div
      className={cx(
        "h-0.5 rounded-full transition-colors",
        active ? "bg-accent" : "bg-transparent"
      )}
    />
  );
}

/** Placeholder for a photo that has not been wired to real storage yet. */
export function PhotoTile({
  className,
  label = "photo",
  wide,
}: {
  className?: string;
  label?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cx(
        "grid place-items-center rounded-lg border border-line-mid",
        wide ? "pc-hairline-wide" : "pc-hairline",
        className
      )}
    >
      <span className="font-mono text-[10.5px] text-muted">{label}</span>
    </div>
  );
}

/* ----------------------------------------------------------------- modals */

/** Elements a Tab/Shift+Tab focus trap should cycle through. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  children,
  width = "428px",
  scroll,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  scroll?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Kept fresh every render but not a dep of the effect below, so the trap
  // isn't torn down and rebuilt (stealing focus back) whenever a parent
  // re-render hands Modal a new `onClose` closure (e.g. typing in a field).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null
          )
        : [];

    (focusable()[0] ?? dialog)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = focusable();
      if (nodes.length === 0) {
        e.preventDefault();
        dialog?.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 grid animate-fade place-items-center bg-[rgba(30,32,38,.34)] p-6 sm:p-10"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Dialog"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: width }}
        className={cx(
          "w-full animate-rise-fast rounded-[14px] bg-surface shadow-[0_30px_70px_-30px_rgba(20,24,32,.5)]",
          scroll && "max-h-[84vh] overflow-y-auto"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}
