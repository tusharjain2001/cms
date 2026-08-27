import Link from "next/link";
import { links } from "@/lib/links";
import { Logo } from "./bits";

const NAV = [
  { label: "How it works", href: links.how, key: "how" },
  { label: "Section types", href: links.sections, key: "sections" },
  { label: "For developers", href: links.developers, key: "developers" },
  { label: "Pricing", href: links.pricing, key: "pricing" },
] as const;

/**
 * Shared by the landing and pricing pages.
 *
 * `active` is passed in rather than read from the router, so this stays a
 * server component and neither public page ships JavaScript for its own
 * navigation.
 */
export function SiteNav({ active }: { active?: (typeof NAV)[number]["key"] }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/[.88] backdrop-blur-[10px]">
      <nav className="mx-auto flex h-16 max-w-[1160px] items-center gap-7 px-5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 text-ink">
          <Logo />
          <span className="text-[16px] font-bold tracking-[-.2px]">Pagecraft</span>
        </Link>

        {/* Dropped rather than hidden behind a menu button on a phone: these are
            mostly on-page anchors, and a toggle would make an otherwise
            script-free page interactive for very little. */}
        <div className="ml-3.5 hidden items-center gap-[22px] md:flex">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`text-[13.5px] hover:text-accent ${
                active === item.key ? "font-semibold text-accent" : "font-medium text-slate"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href={links.signIn}
            className="rounded-[7px] px-3 py-2 text-[13px] font-semibold text-slate hover:text-accent"
          >
            Sign in
          </Link>
          <Link
            href={links.signUp}
            className="rounded-[7px] bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            Create an account
          </Link>
        </div>
      </nav>
    </header>
  );
}
