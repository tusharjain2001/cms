import type { Metadata } from "next";
import { pageMeta } from "@/lib/site-meta";
import { ForgotPasswordForm } from "./forgot-password-form";

/**
 * A server wrapper, for the same reason as `/login` — and for one more.
 *
 * This screen is `noindex`. It is reached with a one-shot token in the query
 * string, so an indexed copy would be a listing for a link that is already
 * spent, and Search Console would report it as a soft 404 for ever. The
 * matching `Disallow` in `app/robots.ts` stops the fetch as well.
 */
export const metadata: Metadata = pageMeta({
  title: "Forgotten password",
  description: "Send yourself a link to choose a new Pagecraft password.",
  path: "/forgot-password",
  noIndex: true,
});

export default function Page() {
  return <ForgotPasswordForm />;
}
