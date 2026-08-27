"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AuthError,
  AuthField,
  AuthShell,
  SubmitButton,
  authLink,
} from "@/components/auth-shell";

function ResetPassword() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { resetPassword } = useAuth();

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issue, setIssue] = useState("");

  const mismatch = confirm.length > 0 && pw !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError("");
    setIssue("");
    try {
      // Succeeding signs them in, so there is nowhere to go but the dashboard.
      await resetPassword(token, pw);
      router.replace("/projects");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setIssue(err.issues.find((i) => i.path === "password")?.message ?? "");
      } else {
        setError("Could not change your password. Please check your connection.");
      }
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="That link is incomplete"
        sub="Open the link straight from your email, or ask for a new one."
        footer={
          <Link href="/forgot-password" className={authLink}>
            Email me a new link
          </Link>
        }
      />
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      sub="Everywhere you are currently signed in will be signed out."
      footer={
        <Link href="/" className={authLink}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <AuthField
          id="pw"
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          invalid={Boolean(issue)}
          hint={issue || "At least 8 characters."}
        />
        <AuthField
          id="confirm"
          label="Type it again"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          invalid={mismatch}
          hint={mismatch ? "These two do not match." : undefined}
        />

        {error && <AuthError>{error}</AuthError>}

        <SubmitButton busy={busy || mismatch || !pw}>
          {busy ? "Saving…" : "Save new password"}
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Choose a new password" />}>
      <ResetPassword />
    </Suspense>
  );
}
