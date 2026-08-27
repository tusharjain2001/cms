import type { Metadata } from "next";
import Link from "next/link";
import { cms } from "@/lib/cms";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo site",
  description: "A website whose content is managed in Pagecraft.",
};

/**
 * The navigation is built from the CMS too — so when the client adds a page
 * and publishes it, it appears in the menu without a developer touching this.
 * Routing itself still lives in code, exactly as intended.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let pages: { slug: string; title: string }[] = [];
  try {
    pages = await cms.getPages();
  } catch {
    // A site should still render its shell if the CMS is briefly unreachable.
  }

  return (
    <html lang="en">
      <body className="bg-white text-stone-900 antialiased">
        <header className="border-b border-stone-200">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-6 py-5">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Demo
            </Link>
            <div className="flex flex-wrap gap-5 text-sm text-stone-600">
              {pages.map((p) => (
                <Link key={p.slug} href={`/${p.slug}`} className="hover:text-stone-900">
                  {p.title}
                </Link>
              ))}
            </div>
          </nav>
        </header>

        <main>{children}</main>

        <footer className="border-t border-stone-200 px-6 py-10 text-center text-sm text-stone-500">
          Content managed in Pagecraft · design and code by your developer
        </footer>
      </body>
    </html>
  );
}
