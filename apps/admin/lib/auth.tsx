"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setAccessToken, setSessionLostHandler, tryRefresh } from "./api";
import type { UserDTO } from "./dto";

type Status = "loading" | "signedIn" | "signedOut";

type Session = { user: UserDTO; accessToken: string };

interface Auth {
  status: Status;
  user: UserDTO | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Anyone can create an account. Nothing comes back but a promise that an
   * email is on its way — no session, because the address is not confirmed yet.
   */
  signUp: (name: string, email: string, password: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  /** Clicking the emailed link both confirms the address and signs them in. */
  verifyEmail: (token: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  /**
   * Marks the first-sign-in tour finished (or asks for it again). Stored on the
   * account, so it does not replay on another device. The local flag is moved
   * first: the tour must disappear the moment it is skipped, even if the
   * request is slow or fails.
   */
  setOnboardingComplete: (complete: boolean) => Promise<void>;
  /**
   * Re-reads the account.
   *
   * The one thing that changes underneath the dashboard is `websiteAllowance`:
   * paying for another website raises it, and the "New website" button has to
   * unlock without a page reload. Everything else on the account is edited
   * from here, so this is billing's hook back into the session.
   */
  refreshUser: () => Promise<void>;
  /**
   * Where a signed-out visitor belongs, which is not one answer.
   *
   * Pressing **Sign out** is someone saying "I am done" — they go to the
   * landing page. A session that *ended* on them (expired token, password
   * changed elsewhere, or arriving at a dashboard URL with no session at all)
   * is someone who wants back in, so they go to `/login`.
   *
   * It has to live on the context because the `(app)` layout guards on
   * `status` and would otherwise race the sign-out: flipping to `signedOut`
   * fires its redirect while that shell is still mounted, and a hard-coded
   * `/login` there would overrule the landing page every time.
   */
  signedOutTo: string;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<UserDTO | null>(null);
  // Defaults to /login: every way of becoming signed out *except* pressing the
  // button is someone who has lost a session and wants it back.
  const [signedOutTo, setSignedOutTo] = useState("/login");

  // On a page refresh the access token is gone, but the httpOnly refresh
  // cookie is not — so we can restore the session without a sign-in screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await tryRefresh();
      if (cancelled) return;
      if (!restored) {
        setStatus("signedOut");
        return;
      }
      try {
        const { user: me } = await api<{ user: UserDTO }>("/api/auth/me");
        if (cancelled) return;
        setUser(me);
        setStatus("signedIn");
      } catch {
        if (!cancelled) setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSessionLostHandler(() => {
      setAccessToken(null);
      setUser(null);
      setSignedOutTo("/login");
      setStatus("signedOut");
      router.replace("/login");
    });
    return () => setSessionLostHandler(null);
  }, [router]);

  /** Everything that hands back a session lands here, so it is stored one way. */
  const adopt = useCallback((data: Session) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus("signedIn");
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      adopt(
        await api<Session>("/api/auth/login", { method: "POST", body: { email, password } })
      );
    },
    [adopt]
  );

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    await api("/api/auth/signup", { method: "POST", body: { name, email, password } });
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    await api("/api/auth/resend-verification", { method: "POST", body: { email } });
  }, []);

  const verifyEmail = useCallback(
    async (token: string) => {
      adopt(await api<Session>("/api/auth/verify-email", { method: "POST", body: { token } }));
    },
    [adopt]
  );

  const forgotPassword = useCallback(async (email: string) => {
    await api("/api/auth/forgot-password", { method: "POST", body: { email } });
  }, []);

  const resetPassword = useCallback(
    async (token: string, password: string) => {
      adopt(
        await api<Session>("/api/auth/reset-password", {
          method: "POST",
          body: { token, password },
        })
      );
    },
    [adopt]
  );

  const setOnboardingComplete = useCallback(async (complete: boolean) => {
    setUser((current) => (current ? { ...current, onboardingComplete: complete } : current));
    try {
      const { user: me } = await api<{ user: UserDTO }>("/api/auth/me", {
        method: "PATCH",
        body: { onboardingComplete: complete },
      });
      setUser(me);
    } catch {
      // The tour is not worth interrupting anyone over. It stays dismissed for
      // this session and the next sign-in will offer it again.
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: me } = await api<{ user: UserDTO }>("/api/auth/me");
      setUser(me);
    } catch {
      // A stale allowance is a mildly wrong button, not worth an error. The
      // API refuses over-quota creation anyway, so nothing can slip through.
    }
  }, []);

  /**
   * Signing out deliberately lands on the landing page, not on `/login`.
   *
   * `replace`, not `push`: Back must not walk into the dashboard shell they
   * just left. The destination is published on the context first so the
   * `(app)` layout's guard — which fires the moment `status` flips — agrees
   * about where they are going instead of racing to `/login`.
   *
   * Leaving for `/` also empties the dashboard: the landing page lives in the
   * `(marketing)` route group, so the whole `(dash)` provider tree unmounts and
   * the previous account's websites go with it.
   */
  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    setAccessToken(null);
    setUser(null);
    setSignedOutTo("/");
    setStatus("signedOut");
    router.replace("/");
  }, [router]);

  const value = useMemo<Auth>(
    () => ({
      status,
      user,
      signIn,
      signOut,
      signUp,
      resendVerification,
      verifyEmail,
      forgotPassword,
      resetPassword,
      setOnboardingComplete,
      refreshUser,
      signedOutTo,
    }),
    [
      status,
      user,
      signIn,
      signOut,
      signUp,
      resendVerification,
      verifyEmail,
      forgotPassword,
      resetPassword,
      setOnboardingComplete,
      refreshUser,
      signedOutTo,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
