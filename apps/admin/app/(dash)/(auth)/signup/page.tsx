import type { Metadata } from "next";
import { pageMeta } from "@/lib/site-meta";
import { SignupForm } from "./signup-form";

/**
 * A server wrapper so this screen can carry its own title, description and
 * canonical: the form itself is a client component, and a "use client" module
 * cannot export `metadata`. It costs no extra JavaScript — the wrapper renders
 * on the server and the form is the same bundle it always was.
 */
export const metadata: Metadata = pageMeta({
  title: "Create an account",
  description: "Create a free Pagecraft account. One website with one page, free forever — no card, nothing to expire.",
  path: "/signup",
  card: "signup",
});

export default function Page() {
  return <SignupForm />;
}
