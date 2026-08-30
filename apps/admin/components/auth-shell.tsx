"use client";

import type { ReactNode } from "react";
import { Button, Input } from "@/components/ui";

/**
 * The frame every signed-out screen sits in — sign in, sign up, confirm your
 * email, reset a password.
 *
 * These are the only pages a stranger ever sees, so they get one consistent
 * card rather than four near-identical layouts drifting apart over time.
 *
 * The shell is just the card: the marketing nav above it (and with it the
 * logo, and the way back to `/`) comes from `app/(dash)/(auth)/layout.tsx`,
 * which is also where the coral accent and the light pin are applied. `flex-1`
 * rather than `min-h-screen` because that layout is the flex column now — the
 * card centres in whatever height is left under the nav.
 */
export function AuthShell({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub?: ReactNode;
  /** Optional: a purely informational screen is just a title and a sentence. */
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid flex-1 place-items-center bg-[radial-gradient(120%_90%_at_50%_0%,#fbfaf8_0%,#f2f1ed_60%,#eeece7_100%)] px-6 py-12">
      <div className="w-full max-w-[392px] animate-rise">
        <div className="rounded-[14px] border border-line bg-surface p-7 shadow-[0_1px_2px_rgba(30,35,45,.04),0_12px_32px_-18px_rgba(30,35,45,.18)]">
          <h1 className="mb-1 text-[17px] font-semibold">{title}</h1>
          {sub && <div className="mb-[22px] text-sub text-quiet">{sub}</div>}
          {children}
        </div>

        {footer && <div className="mt-[18px] text-center text-[12.5px] text-muted">{footer}</div>}
      </div>
    </main>
  );
}

export function AuthField({
  id,
  label,
  hint,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  /** Doubles as the per-field error message when `invalid` is set. */
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-label font-semibold" htmlFor={id}>
        {label}
      </label>
      <Input id={id} invalid={invalid} {...props} />
      {hint && (
        <p className={`text-helper ${invalid ? "font-medium text-destructive" : "text-muted"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-destructive-bg px-3 py-2 text-helper font-medium text-destructive">
      {children}
    </p>
  );
}

export function AuthNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-accent-tint px-3 py-2 text-helper font-medium text-accent">
      {children}
    </p>
  );
}

/** `Button` renders `type="button"` by default, which would not submit a form. */
export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <Button variant="primary" className="w-full py-[11px]" disabled={busy} type="submit">
      {children}
    </Button>
  );
}

export const authLink = "font-semibold text-accent hover:underline";
