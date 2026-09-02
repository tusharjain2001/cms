import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { SITE_NAME, SITE_TAGLINE, SITE_URL, abs } from "@/lib/site-meta";
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

/**
 * Site-wide metadata. Every public route narrows it with `pageMeta()`.
 *
 * `metadataBase` is the piece that has to be here rather than per page: it is
 * what turns every relative `alternates.canonical` and `og:image` in the app
 * into an absolute URL. Without it Next emits relative social URLs, which
 * Facebook, WhatsApp and X all ignore — the cards simply come out blank, with
 * nothing in the markup to suggest why.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description:
    "Build client websites in React and let the owner edit the words and photos. A headless CMS where design stays in your code.",
  applicationName: SITE_NAME,
  // Deliberately NO default canonical here. Every public page sets its own via
  // `pageMeta()`; a site-wide default would be inherited by the dashboard
  // screens, telling a crawler that `/projects` is really the home page. A
  // missing canonical is neutral, a wrong one is not.
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_GB", url: abs("/") },
  twitter: { card: "summary_large_image" },
  // Phone numbers on the contact page are deliberate links; Safari turning
  // every number-shaped string in the legal pages into a tel: link is not.
  formatDetection: { telephone: false, address: false, email: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

/**
 * The app is light-only (see globals.css), so `themeColor` is a single value
 * rather than a media-query pair. It paints the address bar on Android and the
 * title bar of an installed window.
 */
export const viewport: Viewport = {
  themeColor: "#f6f5f2",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      <head>
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
