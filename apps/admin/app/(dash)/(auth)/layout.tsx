import { SiteNav } from "@/components/landing/site-nav";

/**
 * The signed-out screens — sign in, sign up, confirm your email, and the two
 * password-reset steps.
 *
 * They sit in their own route group so the two things they share can live in
 * one place. Route groups don't affect URLs: `/login`, `/signup` and the rest
 * are unchanged.
 *
 * 1. The marketing nav. Someone who lands on /login from an ad has no way back
 *    to the pitch without it, and it makes signing in feel like part of the
 *    site rather than a door in a blank wall. It renders HERE rather than
 *    inside `auth-shell.tsx` on purpose: auth-shell is a client component, so
 *    importing SiteNav there would drag the whole nav — and its six links —
 *    into the login bundle. From this server layout it stays server-rendered
 *    and costs these pages no JavaScript at all.
 *
 * 2. `brand-coat`, so the accent matches the landing page a visitor just came
 *    from. Crossing into the dashboard after signing in drops it and Press
 *    Blue returns, which is the intended handoff, not a bug.
 *
 * These screens also used to pin `data-theme="light"`, because they inherited
 * the dashboard's saved theme and their card sits on a hardcoded light
 * gradient. The app is light-only now, so there is nothing left to pin.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="brand-coat flex min-h-screen flex-col bg-canvas">
      <SiteNav showAuthCtas={false} />
      {children}
    </div>
  );
}
