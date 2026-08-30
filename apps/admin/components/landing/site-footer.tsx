import { links } from "@/lib/links";
import { MaybeLink } from "./bits";
import { LiveDot } from "./motion";

const COLUMNS = [
  {
    heading: "Product",
    items: [
      { label: "How it works", href: links.how },
      { label: "Section types", href: links.sections },
      { label: "Pricing", href: links.pricing },
      { label: "Open the dashboard", href: links.signIn },
    ],
  },
  {
    heading: "Developers",
    items: [
      { label: "For owners", href: links.owners },
      { label: "For developers", href: links.developers },
      { label: "Documentation", href: links.docs },
      { label: "SDK reference", href: links.sdkReference },
      { label: "Self-hosting guide", href: links.selfHosting },
    ],
  },
  {
    heading: "Company",
    items: [
      { label: "Contact us", href: links.contact },
      { label: "Status", href: links.status },
    ],
  },
  /**
   * The policy pages get their own column rather than being tucked into the
   * meta line. A payment provider's reviewer has to find all four from the
   * footer of any page, and so does a customer looking for the refund terms
   * at the moment they want their money back.
   */
  {
    heading: "Legal",
    items: [
      { label: "Terms", href: links.terms },
      { label: "Privacy", href: links.privacy },
      { label: "Refunds", href: links.refunds },
    ],
  },
];

/**
 * The marketing footer (direction.md §5.13): rail background, a large Bricolage
 * wordmark as the closing statement, Karla link columns, and a mono meta line
 * whose Live-green heartbeat (`<LiveDot>`, the site's one footer idle motion)
 * echoes the "goes live in ~3 seconds" promise.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-rail">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        <div className="flex flex-col gap-12 py-12 lg:flex-row lg:items-start lg:justify-between lg:py-14">
          <div className="max-w-[380px]">
            <div className="font-display text-[clamp(2.75rem,9vw,4.5rem)] font-bold leading-[0.9] tracking-[-0.03em] text-ink">
              Pagecraft
            </div>
            <p className="mt-4 text-mid leading-[1.6] text-muted">
              A content-only CMS: developers keep the design in code, owners change the words themselves.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-9 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.heading} className="flex flex-col gap-2.5">
                <h2 className="text-helper font-semibold tracking-[0.08em] uppercase text-muted">
                  {col.heading}
                </h2>
                {col.items.map((item) => (
                  <MaybeLink key={item.label} href={item.href} className="text-label font-medium">
                    {item.label}
                  </MaybeLink>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line-soft py-6 sm:flex-row sm:items-center sm:justify-between">
          <LiveDot label="ALL SYSTEMS PUBLISHING" />
          <p className="text-helper text-faint">
            © {new Date().getFullYear()} Pagecraft. Rosewater Bakehouse is a demo website, not a
            real customer.
          </p>
        </div>
      </div>
    </footer>
  );
}
