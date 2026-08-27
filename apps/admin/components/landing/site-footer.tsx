import { links } from "@/lib/links";
import { Logo, MaybeLink } from "./bits";

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
      { label: "For developers", href: links.developers },
      { label: "Documentation", href: links.docs },
      { label: "SDK reference", href: links.sdkReference },
      { label: "Self-hosting guide", href: links.selfHosting },
    ],
  },
  {
    heading: "Company",
    items: [
      { label: "Contact", href: links.contact },
      { label: "Status", href: links.status },
      { label: "Privacy", href: links.privacy },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-rail">
      <div className="mx-auto flex max-w-[1160px] flex-wrap items-start gap-10 px-5 py-9 sm:px-8">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="text-[15px] font-bold tracking-[-.2px]">Pagecraft</span>
          </div>
          <p className="mt-2.5 max-w-[280px] text-mid leading-[1.6] text-muted">
            A content-only CMS for developers who would rather not build another admin panel.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.heading} className="flex flex-col gap-2">
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

      <div className="mx-auto max-w-[1160px] px-5 pb-8 text-helper text-faint sm:px-8">
        © {new Date().getFullYear()} Pagecraft. Rosewater Bakehouse is a demo website, not a real
        customer.
      </div>
    </footer>
  );
}
