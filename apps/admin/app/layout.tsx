import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

/**
 * Bricolage Grotesque — the marketing display face (headlines >=32px only;
 * never dashboard, never body). Self-hosted by next/font (no layout shift, no
 * render-blocking Google request) and exposed as the `--font-bricolage` CSS
 * variable, which globals.css `--font-display` consumes. Karla + IBM Plex Mono
 * stay on the Google stylesheet <link> below, unchanged.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-bricolage",
  fallback: ["Karla", "Helvetica", "Arial", "sans-serif"],
});

/**
 * The root layout is deliberately bare.
 *
 * One Next app serves both the public landing page at `/` and the signed-in
 * dashboard, and the two have nothing in common but the design tokens. The
 * session, store and media providers live in `app/(dash)/layout.tsx` instead,
 * so a stranger loading the landing page does not download the dashboard's
 * state management or fire an auth refresh they have no session for.
 */

export const metadata: Metadata = {
  title: { default: "Pagecraft", template: "%s · Pagecraft" },
  description: "A content-only CMS for websites built in React and Next.js.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      <head>
        {/* Applies a saved explicit theme choice before first paint, so
            there is no flash of the wrong theme while React hydrates.
            "system" (or nothing stored) is left alone — the OS media query
            in globals.css handles that case with no attribute needed. Keep
            the storage key ("pc-theme") in sync with lib/theme.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("pc-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();',
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Karla:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
