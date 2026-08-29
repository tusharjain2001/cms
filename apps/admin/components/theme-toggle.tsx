"use client";

import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui";

/** Light/dark switch, styled like the app's other icon buttons (see the
 *  "icon" variant in ui.tsx). Mounted wherever the app chrome wants it. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <Button
      variant="icon"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={className}
    >
      <span aria-hidden className="text-[14px] leading-none">
        {resolved === "dark" ? "☀" : "☾"}
      </span>
    </Button>
  );
}
