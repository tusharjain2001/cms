import { OG_CARDS, ogCard, type OgCardName } from "@/lib/og";

/**
 * The sharing cards, at predictable URLs: `/og/default`, `/og/pricing`, …
 *
 * WHY NOT `opengraph-image.tsx`. Next's file convention would be the obvious
 * route, and it was tried: it applies **only to the exact segment the file
 * sits in, not to child segments**. A copy at the app root gave `/` a card and
 * left `/contact`, `/login`, `/signup` and the three policy pages with none —
 * a blank grey box everywhere the link was pasted, and nothing in the markup
 * to say why. Getting them all covered meant one file per route, each
 * generating a URL with a build hash in it that nothing else could reference.
 *
 * One static route with a stable name fixes both halves: `pageMeta()` names
 * the card it wants, no page can silently miss one, and the URL is stable
 * across deploys — which matters, because Facebook and LinkedIn cache a card
 * against its URL and a hash that changes every build defeats that cache.
 *
 * `generateStaticParams` + `force-static` means these are PNGs on disk after
 * the build, not a render on every crawl.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(OG_CARDS).map((card) => ({ card }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ card: string }> }) {
  const { card } = await params;
  const spec = OG_CARDS[card as OgCardName] ?? OG_CARDS.default;
  return ogCard(spec);
}
