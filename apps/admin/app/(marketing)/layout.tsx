/**
 * Marketing route-group layout.
 *
 * The app is light-only — there is no dark palette and no theme toggle — so
 * this no longer has to pin anything; it used to force `data-theme="light"`
 * with a pre-paint script because the dashboard could be in dark mode.
 *
 * What remains is `brand-coat`, the coral accent retune keyed to the logo,
 * which the public surfaces wear and the dashboard does not. See the block
 * comment on `.brand-coat` in globals.css for why the accent is the artboard's
 * deeper #b93f20 rather than the mark's own #e8542e.
 *
 * Route groups don't affect URLs: `/`, `/pricing`, `/docs` are unchanged. This
 * is a server component and ships no client JS; marketing's only client module
 * is components/landing/motion.tsx.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  // A plain wrapper: each marketing page brings its own min-h-screen root, so
  // this adds no layout of its own — only the scope the tokens are overridden in.
  return <div className="brand-coat">{children}</div>;
}
