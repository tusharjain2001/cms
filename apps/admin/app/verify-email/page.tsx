"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthError, AuthField, AuthShell, authLink } from "@/components/auth-shell";
import { Button } from "@/components/ui";

/**
 * Where the emailed confirmation link lands.
 *
 * Confirming signs the person straight in — making someone prove they can read
 * their inbox and then immediately demand their password again is friction for
 * nothing. From here they go to their (empty) list of websites.
 */
function VerifyEmail() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { verifyEmail, resendVerification } = useAuth();

  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);
  // React runs effects twice in development; a one-shot token would be spent by
  // the first run and report failure on the second.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState("failed");
      setError("That link is missing its confirmation code. Try opening it from your email again.");
      return;
    }

    verifyEmail(token)
      .then(() => {
        setState("done");
        router.replace("/projects");
      })
      .catch((err) => {
        setState("failed");
        setError(
          err instanceof ApiError ? err.message : "Could not confirm your email address."
        );
      });
  }, [token, verifyEmail, router]);

  if (state === "working") {
    return <AuthShell title="Confirming your email…" sub="This will only take a moment." />;
  }

  if (state === "done") {
    return (
      <AuthShell title="You are all set" sub="Taking you to your websites…">
        <Button variant="primary" className="w-full py-[11px]" onClick={() => router.replace("/projects")}>
          Continue
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="That link did not work"
      sub="Confirmation links expire after 24 hours, and each one can only be used once."
      footer={
        <Link href="/" className={authLink}>
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <AuthError>{error}</AuthError>

        {resent ? (
          <p className="text-sub leading-relaxed text-quiet">
            A fresh link is on its way. Open the newest email — older links stop working as soon as
            a new one is sent.
          </p>
        ) : (
          <>
            <p className="text-sub leading-relaxed text-quiet">
              Enter your email address and we will send a new one.
            </p>
            <AuthField
              id="email"
              label="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              variant="primary"
              className="w-full py-[11px]"
              disabled={!email.trim()}
              onClick={() => {
                void resendVerification(email.trim())
                  .then(() => setResent(true))
                  .catch((err) =>
                    setError(err instanceof ApiError ? err.message : "Could not send that email.")
                  );
              }}
            >
              Send a new link
            </Button>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams needs a Suspense boundary to keep this route static.
  return (
    <Suspense fallback={<AuthShell title="Confirming your email…" />}>
      <VerifyEmail />
    </Suspense>
  );
}
