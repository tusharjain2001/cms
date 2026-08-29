"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

/** Keep this in sync with the inline no-flash script in app/layout.tsx. */
const STORAGE_KEY = "pc-theme";

function readStored(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Private mode / disabled storage — fall back to "system" silently.
  }
  return "system";
}

/** Mirrors globals.css: "system" removes the attribute and leaves the OS
 *  media query in charge; an explicit choice sets it. */
function applyAttribute(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
}

/**
 * The app's light/dark/system preference. Persists to `localStorage`
 * (`pc-theme`), drives `data-theme` on `<html>`, and follows OS changes live
 * while set to "system". See the inline script in app/layout.tsx for how the
 * very first paint avoids a flash before this hook mounts.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  // Pick up the real stored choice once mounted (SSR has no localStorage/DOM).
  useEffect(() => {
    setThemeState(readStored());
  }, []);

  useEffect(() => {
    applyAttribute(theme);
    if (theme !== "system") {
      setResolved(theme);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(mq.matches ? "dark" : "light");
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Choice still applies for this session via state even if it can't persist.
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return { theme, resolved, setTheme, toggle };
}
