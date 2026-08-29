/**
 * Marketing route-group layout — the single-light-mode pin.
 *
 * The public marketing site commits to one LIGHT look (direction.md §3.1): the
 * stage-light choreography is an authored, light-only sequence, and the
 * paper-and-press identity reads best on paper. So these routes pin
 * `data-theme="light"` regardless of the visitor's OS setting or their saved
 * dashboard preference. The dashboard keeps its full light/dark/system toggle,
 * restored by lib/theme.ts on its own (dash) layouts.
 *
 * The pin is a pre-paint inline script so a dark-preference visitor never sees
 * a flash of dark. The root layout's own theme script (in <head>) may set
 * data-theme from `pc-theme` first; this script runs next, during body parse
 * and still before first paint, and forces light. globals.css guards its dark
 * blocks with `:root:not([data-theme="light"])`, so an explicit light pin
 * always wins over both the OS media query and an explicit dark choice.
 *
 * Cross-boundary navigation (marketing <-> dashboard) is full-page <a>
 * navigation, so on the way back to the dash the root script re-runs and
 * restores the user's preference — there is nothing to undo here.
 *
 * Route groups don't affect URLs: `/`, `/pricing`, `/docs` are unchanged. This
 * is a server component and ships no client JS; marketing's only client module
 * is components/landing/motion.tsx.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        // Keep the storage key ("pc-theme") in sync with lib/theme.ts and the
        // root layout script. Reading it is only so a return trip to a light
        // dash doesn't thrash; the pin itself is unconditional.
        dangerouslySetInnerHTML={{
          __html: 'document.documentElement.setAttribute("data-theme","light");',
        }}
      />
      {children}
    </>
  );
}
