"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { status, isDev, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A returning client with a live refresh cookie skips this screen entirely.
  useEffect(() => {
    if (status === "signedIn") router.replace("/projects");
  }, [status, isDev, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email.trim(), pw);
      router.replace("/projects");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not sign in. Please check your connection."
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(120%_90%_at_50%_0%,#fbfaf8_0%,#f2f1ed_60%,#eeece7_100%)] px-6 py-12">
      <div className="w-full max-w-[392px] animate-rise">
        <div className="mb-[26px] flex items-center justify-center gap-2.5">
          <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-accent text-[15px] font-bold text-white">
            P
          </div>
          <div className="text-[19px] font-bold tracking-[-.2px]">Pagecraft</div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[14px] border border-line bg-surface p-7 shadow-[0_1px_2px_rgba(30,35,45,.04),0_12px_32px_-18px_rgba(30,35,45,.18)]"
        >
          <h1 className="mb-1 text-[17px] font-semibold">Sign in to your website</h1>
          <p className="mb-[22px] text-sub text-quiet">
            Use the email address your web designer set up for you.
          </p>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-label font-semibold" htmlFor="email">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-label font-semibold" htmlFor="pw">
                Password
              </label>
              <Input
                id="pw"
                type="password"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="rounded-md bg-destructive-bg px-3 py-2 text-helper font-medium text-destructive">
                {error}
              </p>
            )}

            <Button
              variant="primary"
              className="w-full py-[11px]"
              onClick={() => {}}
              disabled={busy || status === "loading"}
              {...{ type: "submit" as const }}
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        <p className="mt-[18px] text-center text-[12.5px] text-muted">
          Websites built and looked after by your web developer.
        </p>
      </div>
    </main>
  );
}
