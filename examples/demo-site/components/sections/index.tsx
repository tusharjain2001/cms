import type { SectionComponents } from "@pagecraft/sdk/react";
import { cmsImageUrl, cmsSrcSet, type FileValue, type ImageValue } from "@pagecraft/sdk";

/**
 * THE DEVELOPER'S HALF OF THE CMS.
 *
 * One component per section type. Every bit of design — layout, colour,
 * spacing, type — lives here, in code, under version control. The CMS only
 * ever supplies the words and the photos.
 *
 * A client can add a Hero, reorder it, write a different headline and swap the
 * photo. They cannot change a single thing about how a Hero looks.
 */

interface Button {
  label: string;
  href: string;
  variant?: string;
}

function Buttons({ items }: { items?: Button[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {items.map((b, i) => (
        <a
          key={i}
          href={b.href || "#"}
          className={
            b.variant === "Outline"
              ? "rounded-full border border-stone-300 px-6 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-800"
              : "rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-700"
          }
        >
          {b.label}
        </a>
      ))}
    </div>
  );
}

function Img({
  image,
  className,
  width,
}: {
  image?: ImageValue | null;
  className?: string;
  width?: number;
}) {
  if (!image?.url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cmsImageUrl(image.url, { width })}
      srcSet={cmsSrcSet(image.url)}
      alt={image.alt ?? ""}
      width={image.width}
      height={image.height}
      className={className}
    />
  );
}

const Section = ({
  children,
  tight,
}: {
  children: React.ReactNode;
  tight?: boolean;
}) => (
  <section className={tight ? "px-6 py-14" : "px-6 py-24"}>
    <div className="mx-auto max-w-5xl">{children}</div>
  </section>
);

/* ------------------------------------------------------------------ types */

function Hero({ content }: { content: any }) {
  return (
    <section className="border-b border-stone-200 bg-stone-50 px-6 py-24">
      <div className="mx-auto grid max-w-5xl items-center gap-12 md:grid-cols-2">
        <div>
          <h1 className="text-4xl leading-tight font-bold tracking-tight text-stone-900 md:text-5xl">
            {content.heading}
          </h1>
          {content.subheading && (
            <p className="mt-5 text-lg leading-relaxed text-stone-600">{content.subheading}</p>
          )}
          <Buttons items={content.buttons} />
          {content.showHours && (
            <p className="mt-8 border-t border-stone-200 pt-4 text-sm text-stone-500">
              Open today · 7am until we sell out
            </p>
          )}
        </div>
        <Img
          image={content.backgroundImage}
          width={900}
          className="w-full rounded-2xl object-cover shadow-sm"
        />
      </div>
    </section>
  );
}

function TextBlock({ content }: { content: any }) {
  return (
    <Section>
      {content.heading && (
        <h2 className="text-3xl font-bold tracking-tight text-stone-900">{content.heading}</h2>
      )}
      <div className="mt-6 space-y-4 text-lg leading-relaxed text-stone-600">
        {(content.paragraphs ?? []).map((p: { body: string }, i: number) => (
          <p key={i}>{p.body}</p>
        ))}
      </div>
    </Section>
  );
}

function Features({ content }: { content: any }) {
  return (
    <Section>
      {content.heading && (
        <h2 className="mb-12 text-3xl font-bold tracking-tight text-stone-900">
          {content.heading}
        </h2>
      )}
      <div className="grid gap-10 md:grid-cols-3">
        {(content.items ?? []).map((item: any, i: number) => (
          <div key={i}>
            <h3 className="text-lg font-semibold text-stone-900">{item.title}</h3>
            {item.description && (
              <p className="mt-2 leading-relaxed text-stone-600">{item.description}</p>
            )}
            {item.bullets?.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-sm text-stone-500">
                {item.bullets.map((b: { text: string }, j: number) => (
                  <li key={j}>· {b.text}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

function ProductGrid({ content }: { content: any }) {
  const products = content.products ?? [];
  return (
    <Section>
      {content.heading && (
        <h2 className="mb-10 text-3xl font-bold tracking-tight text-stone-900">
          {content.heading}
        </h2>
      )}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p: any, i: number) => (
          <article
            key={i}
            className="flex flex-col rounded-xl border border-stone-200 bg-white p-5"
          >
            <Img image={p.photo} width={500} className="mb-4 h-40 w-full rounded-lg object-cover" />
            <h3 className="text-lg font-semibold text-stone-900">{p.name}</h3>
            {p.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{p.description}</p>
            )}
            {p.specs?.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4">
                {p.specs.map((s: any, j: number) => (
                  <div key={j}>
                    <dt className="text-base font-semibold text-stone-900">{s.value}</dt>
                    <dd className="text-xs text-stone-500">{s.label}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {p.detailsUrl && (
                <a
                  href={p.detailsUrl}
                  className="rounded-lg bg-stone-900 py-2 text-center text-sm font-semibold text-white"
                >
                  View details
                </a>
              )}
              {(p.specSheet as FileValue | null)?.url && (
                <a
                  href={(p.specSheet as FileValue).url}
                  className="rounded-lg border border-stone-300 py-2 text-center text-sm font-semibold text-stone-800"
                >
                  Download spec sheet
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function Gallery({ content }: { content: any }) {
  return (
    <Section>
      {content.heading && (
        <h2 className="mb-10 text-3xl font-bold tracking-tight text-stone-900">
          {content.heading}
        </h2>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(content.images ?? []).map((item: any, i: number) => (
          <figure key={i}>
            <Img image={item.photo} width={600} className="w-full rounded-xl object-cover" />
            {item.caption && (
              <figcaption className="mt-2 text-sm text-stone-500">{item.caption}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </Section>
  );
}

function Testimonials({ content }: { content: any }) {
  return (
    <section className="border-y border-stone-200 bg-stone-50 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        {content.heading && (
          <h2 className="mb-12 text-3xl font-bold tracking-tight text-stone-900">
            {content.heading}
          </h2>
        )}
        <div className="grid gap-10 md:grid-cols-2">
          {(content.items ?? []).map((t: any, i: number) => (
            <blockquote key={i}>
              <p className="text-lg leading-relaxed text-stone-700">“{t.quote}”</p>
              <footer className="mt-4 text-sm text-stone-500">
                {t.author}
                {t.role ? `, ${t.role}` : ""}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq({ content }: { content: any }) {
  return (
    <Section>
      {content.heading && (
        <h2 className="mb-8 text-3xl font-bold tracking-tight text-stone-900">
          {content.heading}
        </h2>
      )}
      <div className="divide-y divide-stone-200 border-y border-stone-200">
        {(content.items ?? []).map((item: any, i: number) => (
          <details key={i} className="py-5">
            <summary className="cursor-pointer text-lg font-semibold text-stone-900">
              {item.question}
            </summary>
            <p className="mt-3 leading-relaxed text-stone-600">{item.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Cta({ content }: { content: any }) {
  return (
    <section className="bg-stone-900 px-6 py-20 text-center">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight text-white">{content.heading}</h2>
        {content.subheading && <p className="mt-3 text-stone-300">{content.subheading}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {(content.buttons ?? []).map((b: Button, i: number) => (
            <a
              key={i}
              href={b.href || "#"}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-stone-900"
            >
              {b.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact({ content }: { content: any }) {
  return (
    <Section>
      <div className="grid gap-12 md:grid-cols-2">
        <div>
          {content.heading && (
            <h2 className="text-3xl font-bold tracking-tight text-stone-900">{content.heading}</h2>
          )}
          {content.intro && <p className="mt-4 leading-relaxed text-stone-600">{content.intro}</p>}
          <dl className="mt-8 space-y-2 text-stone-700">
            {content.address && <dd>{content.address}</dd>}
            {content.phone && <dd>{content.phone}</dd>}
            {content.email && <dd>{content.email}</dd>}
          </dl>
          {content.hours?.length > 0 && (
            <table className="mt-8 text-sm text-stone-600">
              <tbody>
                {content.hours.map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="pr-8 py-1 font-medium text-stone-900">{h.days}</td>
                    <td className="py-1">{h.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {content.showForm && (
          <form className="space-y-3">
            <input placeholder="Your name" className="w-full rounded-lg border border-stone-300 px-4 py-3" />
            <input placeholder="Your email" className="w-full rounded-lg border border-stone-300 px-4 py-3" />
            <textarea rows={5} placeholder="Message" className="w-full rounded-lg border border-stone-300 px-4 py-3" />
            <button className="rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white">
              Send
            </button>
          </form>
        )}
      </div>
    </Section>
  );
}

/** The map handed to <SectionRenderer>. Keys must match registry `type` ids. */
export const sectionComponents: SectionComponents = {
  hero: Hero,
  textBlock: TextBlock,
  features: Features,
  productGrid: ProductGrid,
  gallery: Gallery,
  testimonials: Testimonials,
  faq: Faq,
  cta: Cta,
  contact: Contact,
};
