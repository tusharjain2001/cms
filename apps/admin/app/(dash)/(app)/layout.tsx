import type { Metadata } from "next";
import { AppShell } from "./app-shell";

/**
 * A server layout wrapping the client shell, purely so the dashboard can
 * declare itself `noindex`.
 *
 * Every screen behind the sign-in is client-rendered and shows one account's
 * private content, so there is nothing here for a search engine — but a
 * crawler that follows a link into `/projects` still gets a page, and without
 * this it would index the empty shell that renders before the session
 * resolves. `app/robots.ts` disallows the same paths; this is the half that
 * still works if someone links straight to a screen.
 *
 * The title template also gives the dashboard sensible browser tabs instead of
 * the marketing headline the root layout would otherwise supply.
 */
export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Pagecraft" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
