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

interface Auth {
  status: Status;
  user: UserDTO | null;
  /** True for the developer, false for a client who only edits their own site. */
  isDev: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<UserDTO | null>(null);

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
      setStatus("signedOut");
      router.push("/");
    });
    return () => setSessionLostHandler(null);
  }, [router]);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: UserDTO; accessToken: string }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus("signedIn");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Signing out locally matters more than the server acknowledging it.
    }
    setAccessToken(null);
    setUser(null);
    setStatus("signedOut");
    router.push("/");
  }, [router]);

  const value = useMemo<Auth>(
    () => ({ status, user, isDev: user?.role === "admin", signIn, signOut }),
    [status, user, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
