"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AuthError,
  AuthField,
  AuthNote,
  AuthShell,
  SubmitButton,
  authLink,
} from "@/components/auth-shell";

export function SignupForm() {
  const { signUp, resendVerification } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [sentTo, setSentTo] = useState("");
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setIssues({});
    try {
      const address = email.trim();
      await signUp(name.trim(), address, pw);
      setSentTo(address);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      } else {
        setError("Could not create your account. Please check your connection.");
      }
    }
    setBusy(false);
  }

  /**
   * The confirmation step, shown in place of the form.
   *
   * Note what it does NOT say: whether that address already had an account.
   * The API answers a taken address exactly as it answers a new one, and this
   * screen has to keep that promise — otherwise signing up becomes a way of
   * asking who else uses this CMS.
   */
  if (sentTo) {
    return (
      <AuthShell
        title="Check your email"
        sub={
          <>
            We have sent a confirmation link to <strong className="text-ink">{sentTo}</strong>.
            Click it and your account is ready.
          </>
        }
        footer={
          <>
            Already confirmed?{" "}
            <Link href="/login" className={authLink}>
              Sign in
            </Link>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sub leading-relaxed text-quiet">
            It usually arrives within a minute. If it does not, check your spam folder — a brand
            new sender often lands there the first time.
          </p>

          {resent ? (
            <AuthNote>Sent again. Give it a minute before asking a third time.</AuthNote>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void resendVerification(sentTo)
                  .then(() => setResent(true))
                  .catch(() => setError("Could not send that email."))
                  .finally(() => setBusy(false));
              }}
              className={`self-start text-helper ${authLink}`}
            >
              Send it again
            </button>
          )}

          {error && <AuthError>{error}</AuthError>}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      sub="Build a website in React, and let whoever owns it edit the words."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={authLink}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <AuthField
          id="name"
          label="Your name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          invalid={Boolean(issues.name)}
          hint={issues.name}
        />
        <AuthField
          id="email"
          label="Email address"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(issues.email)}
          hint={issues.email}
        />
        <AuthField
          id="pw"
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          invalid={Boolean(issues.password)}
          hint={issues.password || "At least 8 characters."}
        />

        {error && <AuthError>{error}</AuthError>}

        <SubmitButton busy={busy}>{busy ? "Creating your account…" : "Create account"}</SubmitButton>
      </form>
    </AuthShell>
  );
}
