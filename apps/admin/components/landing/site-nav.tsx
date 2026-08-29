import Link from "next/link";
import { links } from "@/lib/links";
import { Logo } from "./bits";

const NAV = [
  { label: "How it works", href: links.how, key: "how" },
  { label: "Section types", href: links.sections, key: "sections" },
  { label: "For developers", href: links.developers, key: "developers" },
  { label: "Docs", href: links.docs, key: "docs" },
  { label: "Pricing", href: links.pricing, key: "pricing" },
] as const;

type NavKey = (typeof NAV)[number]["key"];

/**
 * The marketing nav (direction.md §5.10). Shared by the landing, pricing and
 * docs pages. `active` is passed in rather than read from the router so this
 * stays a server component — the whole marketing site ships no navigation JS.
 *
 * Two behaviours that would normally reach for JavaScript are done natively:
 *   - the hairline bottom border fades in after 16px of scroll via a CSS
 *     scroll-timeline (falls back to a permanent border where unsupported);
 *   - the mobile menu is a native <details> disclosure, so it opens, closes
 *     and takes keyboard focus with zero client code. The sheet items
 *     print-wipe in on open via the shared `pcPrint` animation.
 *
 * No theme toggle here: marketing is single light mode (direction.md §3.1).
 */
export function SiteNav({ active }: { active?: NavKey }) {
  return (
    <header className="mkt-nav sticky top-0 z-30 border-b bg-canvas/[.92] backdrop-blur-[8px]">
      {/* Scoped, self-contained: keeps site-nav a server component and avoids
          touching globals.css (A's file). */}
      <style>{NAV_CSS}</style>

      <nav className="mx-auto flex h-16 max-w-[1160px] items-center gap-7 px-5 sm:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 text-ink"
          aria-label="Pagecraft home"
        >
          <Logo />
          <span className="font-display text-[18px] font-bold tracking-[-0.02em]">Pagecraft</span>
        </Link>

        <div className="ml-3.5 hidden items-center gap-[26px] md:flex">
          {NAV.map((item) => (
            <NavLink key={item.key} href={item.href} active={active === item.key}>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-2.5 md:flex">
          <SignIn />
          <CreateAccount />
        </div>

        {/* Mobile: native disclosure. Summary is the button; the panel is a
            sheet that prints its rows in on open. */}
        <details className="mkt-sheet relative ml-auto md:hidden">
          <summary
            className="grid size-9 cursor-pointer place-items-center rounded-[7px] text-ink"
            aria-label="Menu"
          >
            <svg
              className="mkt-burger"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
            >
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <svg
              className="mkt-close"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
            >
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </summary>

          <div className="absolute right-0 top-[calc(100%+8px)] w-[min(78vw,320px)] rounded-[12px] border border-line bg-canvas p-2 shadow-[0_18px_40px_-24px_rgba(34,37,43,0.45)]">
            <div className="flex flex-col">
              {NAV.map((item, i) => (
                <Link
                  key={item.key}
                  href={item.href}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={`animate-print rounded-[8px] px-3 py-2.5 text-[15px] ${
                    active === item.key ? "font-semibold text-ink" : "font-medium text-slate"
                  } hover:bg-sunken hover:text-ink`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div
              className="animate-print mt-2 flex flex-col gap-2 border-t border-line-soft pt-3"
              style={{ animationDelay: `${NAV.length * 40}ms` }}
            >
              <SignIn block />
              <CreateAccount block />
            </div>
          </div>
        </details>
      </nav>
    </header>
  );
}

/**
 * A nav link with the Sun highlighter swash (M8): a flat sun band grows in
 * behind the text from the left on hover/focus, and sits permanently behind
 * the active link. The text is always ink — AA never rides on the swash
 * (ink-on-sun is 10.98:1; ink-on-paper is 14.09:1).
 */
function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="group relative isolate inline-flex items-center text-[14px] font-medium text-ink"
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-[-3px] bottom-[1px] -z-10 h-[8px] origin-left rounded-[1px] bg-sun transition-transform duration-150 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100 ${
          active ? "scale-x-100" : "scale-x-0"
        }`}
      />
      {children}
    </Link>
  );
}

/** Ghost button: ink border, ink fill wipes in from the left, text inverts (M8). */
function SignIn({ block = false }: { block?: boolean }) {
  return (
    <Link
      href={links.signIn}
      className={`group relative isolate overflow-hidden rounded-[7px] border border-btn px-3.5 py-1.5 text-center text-[13px] font-semibold text-ink ${
        block ? "block" : "inline-block"
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-0 -z-10 origin-left scale-x-0 bg-ink transition-transform duration-150 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100"
      />
      <span className="transition-colors duration-150 group-hover:text-canvas group-focus-visible:text-canvas">
        Sign in
      </span>
    </Link>
  );
}

/** Filled Press-Blue button: darkens + 1px press on interaction (M8). */
function CreateAccount({ block = false }: { block?: boolean }) {
  return (
    <Link
      href={links.signUp}
      className={`rounded-[7px] bg-accent px-4 py-2 text-center text-[13px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-accent-dark active:translate-y-px ${
        block ? "block" : "inline-block"
      }`}
    >
      Create an account
    </Link>
  );
}

/* Border-on-scroll and the burger/close icon swap. Scoped by .mkt-* classes so
   nothing here can leak into another component (frontend-design specificity
   caution). Reduced motion is irrelevant to a scroll-position-driven hairline —
   it does not move on its own. */
const NAV_CSS = `
.mkt-nav { border-bottom-color: transparent; }
@supports (animation-timeline: scroll()) {
  .mkt-nav {
    animation: mktNavBorder linear both;
    animation-timeline: scroll();
    animation-range: 0 16px;
  }
  @keyframes mktNavBorder { to { border-bottom-color: var(--color-line); } }
}
@supports not (animation-timeline: scroll()) {
  .mkt-nav { border-bottom-color: var(--color-line); }
}
.mkt-sheet > summary { list-style: none; }
.mkt-sheet > summary::-webkit-details-marker { display: none; }
.mkt-sheet .mkt-close { display: none; }
.mkt-sheet[open] .mkt-burger { display: none; }
.mkt-sheet[open] .mkt-close { display: block; }
`;
