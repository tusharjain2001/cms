"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AuthError,
  AuthField,
  AuthShell,
  SubmitButton,
  authLink,
} from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send that email.");
    }
    setBusy(false);
  }

  /**
   * Shown whether or not that address has an account — the API deliberately
   * answers both cases identically, and this screen must not give the game away
   * by looking different.
   */
  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        sub={
          <>
            If there is an account for <strong className="text-ink">{email.trim()}</strong>, a link
            to choose a new password is on its way. It expires in an hour.
          </>
        }
        footer={
          <Link href="/login" className={authLink}>
            Back to sign in
          </Link>
        }
      />
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      sub="Enter the address you signed up with and we will email you a link."
      footer={
        <Link href="/login" className={authLink}>
          Back to sign in
        </Link>
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
        {error && <AuthError>{error}</AuthError>}
        <SubmitButton busy={busy}>{busy ? "Sending…" : "Email me a link"}</SubmitButton>
      </form>
    </AuthShell>
  );
}
