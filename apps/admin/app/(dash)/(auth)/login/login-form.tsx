"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui";
import {
  AuthError,
  AuthField,
  AuthNote,
  AuthShell,
  SubmitButton,
  authLink,
} from "@/components/auth-shell";

export function LoginForm() {
  const router = useRouter();
  const { status, signIn, resendVerification } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /**
   * Signing in with an unconfirmed address is the one failure almost everyone
   * will hit — the email went to spam, or they signed up on another day. A
   * sentence is not enough; they need the button that fixes it.
   */
  const [needsConfirming, setNeedsConfirming] = useState(false);
  const [resent, setResent] = useState("");

  // A returning user with a live refresh cookie skips this screen entirely.
  useEffect(() => {
    if (status === "signedIn") router.replace("/projects");
  }, [status, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNeedsConfirming(false);
    setResent("");
    try {
      await signIn(email.trim(), pw);
      router.replace("/projects");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setNeedsConfirming(err.code === "email_not_verified");
      } else {
        setError("Could not sign in. Please check your connection.");
      }
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      await resendVerification(email.trim());
      setResent("A new confirmation link is on its way. It can take a minute to arrive.");
      setError("");
      setNeedsConfirming(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that email.");
    }
    setBusy(false);
  }

  return (
    <AuthShell
      title="Sign in"
      sub="Welcome back."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className={authLink}>
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <AuthField
          id="email"
          label="Email address"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label className="text-label font-semibold" htmlFor="pw">
              Password
            </label>
            <Link href="/forgot-password" className="text-helper font-medium text-quiet hover:text-accent">
              Forgot it?
            </Link>
          </div>
          <Input
            id="pw"
            type="password"
            required
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>

        {error && <AuthError>{error}</AuthError>}
        {resent && <AuthNote>{resent}</AuthNote>}

        {needsConfirming && (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={busy}
            className={`self-start text-helper ${authLink}`}
          >
            Send me a new confirmation link
          </button>
        )}

        <SubmitButton busy={busy || status === "loading"}>
          {busy ? "Signing in…" : "Sign in"}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
