import type { Metadata } from "next";
import { pageMeta } from "@/lib/site-meta";
import { LoginForm } from "./login-form";

/**
 * A server wrapper so this screen can carry its own title, description and
 * canonical: the form itself is a client component, and a "use client" module
 * cannot export `metadata`. It costs no extra JavaScript — the wrapper renders
 * on the server and the form is the same bundle it always was.
 */
export const metadata: Metadata = pageMeta({
  title: "Sign in",
  description: "Sign in to Pagecraft to edit your website's words and photos and publish the changes.",
  path: "/login",
});

export default function Page() {
  return <LoginForm />;
}
