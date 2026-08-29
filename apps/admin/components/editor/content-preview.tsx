"use client";

import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { thumb } from "@/lib/media";
import type {
  FieldDef,
  ImageValue,
  ListDef,
  SectionContent,
  SectionDTO,
  SectionTypeDef,
} from "@/lib/dto";
import { Chip, cx } from "@/components/ui";

/**
 * The content preview pane — a neutral, in-CMS view of a page's words and
 * photos, live as the client types.
 *
 * THE BOUNDARY: Pagecraft is headless. It never controls how the visitor's
 * site actually looks — the developer's own React does. This pane previews
 * CONTENT ONLY, in the same abstract, editorial language as the wireframe
 * thumbnails in components/wire.tsx, just filled with real values instead of
 * placeholder bars. It must never read as "your website."
 *
 * Nothing here is hard-wired to a section TYPE — only to its `wire`
 * archetype and the shape of its field definitions, the same way
 * field-renderer.tsx builds a form from field defs rather than knowing what
 * a Hero is. A section type the dashboard has never heard of still renders,
 * as a plain heading-and-paragraphs fallback.
 */

const DISCLAIMER =
  "A neutral view of your words and photos — your website's real design comes from your developer's code.";

export function ContentPreview() {
  const s = useStore();
  const sections = s.page?.draftSections ?? [];

  return (
    <div role="region" aria-label="Content preview">
      <div className="border-b border-line px-4 py-3.5 lg:px-5">
        <p className="text-helper font-semibold tracking-[.08em] text-muted uppercase">
          Content preview
        </p>
        <p className="mt-1.5 text-micro leading-[1.45] text-quiet">{DISCLAIMER}</p>
      </div>

      {sections.length === 0 ? (
        <div className="grid place-items-center px-6 py-16 text-center">
          <p className="max-w-[220px] text-sub text-quiet">
            Add a section to see your content preview.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {sections.map((section) => (
            <SectionPreview key={section.id} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionPreview({ section }: { section: SectionDTO }) {
  const s = useStore();
  const def = s.typeFor(section.type);
  // The selected section's content is live, ahead of the debounced save;
  // every other section shows what was last saved.
  const content = section.id === s.selected ? s.draftContent : section.content;
  const hidden = section.visible === false;

  return (
    <section className={cx("border-b border-line-mid px-5 py-6 last:border-b-0 lg:px-6", hidden && "opacity-[.72]")}>
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-tiny font-medium tracking-[.08em] text-faint uppercase">
          {def?.name ?? section.type}
        </span>
        {hidden && <Chip className="px-[7px] py-0.5 text-[10.5px] text-muted">Hidden</Chip>}
      </div>
      {def ? <WireBody def={def} content={content} /> : <FallbackBody content={content} />}
    </section>
  );
}

/* ------------------------------------------------------------- dispatch */

function WireBody({ def, content }: { def: SectionTypeDef; content: SectionContent }) {
  switch (def.wire) {
    case "hero":
      return <HeroBlock def={def} content={content} />;
    case "cols":
      return <ColsBlock def={def} content={content} />;
    case "grid":
      return <GridBlock def={def} content={content} />;
    case "quote":
      return <QuoteBlock def={def} content={content} />;
    case "rows":
      return <RowsBlock def={def} content={content} />;
    case "band":
      return <BandBlock def={def} content={content} />;
    case "split":
      return <SplitBlock def={def} content={content} />;
    default:
      return <FallbackBody def={def} content={content} />;
  }
}

/* ------------------------------------------------------------- archetypes */

function HeroBlock({ def, content }: { def: SectionTypeDef; content: SectionContent }) {
  const hDef = headingField(def);
  const subDef = fieldByKey(def.fields, "subheading");
  const imgDef = firstOfKind(def.fields, "image");
  const buttonsDef = listFieldByKey(def.fields, "buttons");
  const buttonLabelKey = buttonsDef?.of.find((f) => f.kind === "text")?.key;
  const buttons = buttonsDef ? asList(get(content, buttonsDef.key)) : [];
  const img = imgDef ? ((get(content, imgDef.key) as ImageValue | null) ?? null) : null;
  const showHours = get(content, "showHours") === true;

  return (
    <div className={cx("relative overflow-hidden rounded-[10px] border border-line-mid", img && "h-[190px]")}>
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb(img.url, 700)}
          alt={img.alt ?? ""}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div
        className={cx(
          "relative flex flex-col items-start gap-2",
          img ? "h-full justify-end px-5 py-5" : "items-center bg-sunken px-5 py-10 text-center"
        )}
        style={
          img
            ? {
                background:
                  "linear-gradient(to top, rgba(10,10,8,.78), rgba(10,10,8,.08) 65%, transparent)",
              }
            : undefined
        }
      >
        <h2 className={cx("text-panel font-bold", img ? "text-white" : "text-ink")}>
          {textOrPlaceholder(get(content, hDef?.key), hDef?.label ?? "Headline")}
        </h2>
        {subDef && (
          <p className={cx("max-w-[38ch] text-sub", img ? "text-white/85" : "text-quiet")}>
            {textOrPlaceholder(get(content, subDef.key), subDef.label)}
          </p>
        )}
        {buttons.length > 0 && (
          <div className={cx("mt-1 flex flex-wrap gap-2", img ? "justify-start" : "justify-center")}>
            {buttons.map((b, i) => {
              const label = get(b, buttonLabelKey);
              return (
                <span
                  key={i}
                  className={cx(
                    "rounded-full px-3.5 py-1.5 text-helper font-semibold",
                    img ? "border border-white/40 bg-white/10 text-white" : "border border-line bg-surface text-ink"
                  )}
                >
                  {typeof label === "string" && label.trim() ? label : "Button"}
                </span>
              );
            })}
          </div>
        )}
        {showHours && (
          <span
            className={cx(
              "mt-1 rounded-full px-3 py-1 text-micro font-medium",
              img ? "bg-white/15 text-white/85" : "bg-chip text-slate"
            )}
          >
            Opening hours shown here
          </span>
        )}
      </div>
    </div>
  );
}

function ColsBlock({ def, content }: { def: SectionTypeDef; content: SectionContent }) {
  const hDef = headingField(def);
  const itemsDef = def.fields.find((f): f is ListDef => f.kind === "list");
  const items = itemsDef ? asList(get(content, itemsDef.key)) : [];
  const titleKey = itemsDef?.of.find((f) => f.kind === "text")?.key;
  const descKey = itemsDef?.of.find((f) => f.kind === "para")?.key;
  const bulletsDef = itemsDef?.of.find((f): f is ListDef => f.kind === "list");
  const bulletTextKey = bulletsDef?.of.find((f) => f.kind === "text")?.key;

  return (
    <div>
      {hDef && (
        <h2 className="mb-4 text-panel font-bold">
          {textOrPlaceholder(get(content, hDef.key), hDef.label)}
        </h2>
      )}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, i) => {
            const bullets = bulletsDef ? asList(get(item, bulletsDef.key)) : [];
            const filledBullets = bulletTextKey
              ? bullets.filter((b) => {
                  const v = get(b, bulletTextKey);
                  return typeof v === "string" && v.trim() !== "";
                })
              : [];
            return (
              <div key={i} className="rounded-[9px] border border-line bg-surface p-3.5">
                {titleKey && (
                  <p className="text-label font-semibold">
                    {textOrPlaceholder(get(item, titleKey), "Title")}
                  </p>
                )}
                {descKey && (
                  <p className="mt-1 text-mid text-quiet">
                    {textOrPlaceholder(get(item, descKey), "Description")}
                  </p>
                )}
                {filledBullets.length > 0 && bulletTextKey && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {filledBullets.map((b, bi) => (
                      <li key={bi} className="flex items-start gap-1.5 text-micro text-slate">
                        <span className="mt-[5px] text-[5px] text-faint">●</span>
                        <span>{get(b, bulletTextKey) as string}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyItems noun={itemsDef?.itemNoun} />
      )}
    </div>
  );
}

function GridBlock({ def, content }: { def: SectionTypeDef; content: SectionContent }) {
  const hDef = headingField(def);
  const itemsDef = def.fields.find(
    (f): f is ListDef => f.kind === "list" && f.of.some((c) => c.kind === "image")
  );
  const items = itemsDef ? asList(get(content, itemsDef.key)) : [];
  const photoKey = itemsDef?.of.find((f) => f.kind === "image")?.key;
  const nameKey = itemsDef?.of.find((f) => f.kind === "text")?.key;
  const descKey = itemsDef?.of.find((f) => f.kind === "para")?.key;
  const specsDef = itemsDef?.of.find((f): f is ListDef => f.kind === "list");
  const specValueKey = specsDef?.of.find((f) => f.key === "value")?.key;
  const specLabelKey = specsDef?.of.find((f) => f.key === "label")?.key;

  return (
    <div>
      {hDef && (
        <h2 className="mb-4 text-panel font-bold">
          {textOrPlaceholder(get(content, hDef.key), hDef.label)}
        </h2>
      )}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item, i) => {
            const img = photoKey ? ((get(item, photoKey) as ImageValue | null) ?? null) : null;
            const specs = specsDef ? asList(get(item, specsDef.key)) : [];
            const name = nameKey ? get(item, nameKey) : undefined;
            const desc = descKey ? get(item, descKey) : undefined;
            return (
              <div key={i} className="overflow-hidden rounded-[9px] border border-line bg-surface">
                <div className="aspect-[4/3] bg-sunken">
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb(img.url, 300)}
                      alt={img.alt ?? ""}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="p-2.5">
                  {nameKey && (
                    <p className="truncate text-mid font-semibold">
                      {textOrPlaceholder(name, "Name")}
                    </p>
                  )}
                  {typeof desc === "string" && desc.trim() !== "" && (
                    <p className="mt-0.5 line-clamp-2 text-micro text-quiet">{desc}</p>
                  )}
                  {specs.length > 0 && specValueKey && specLabelKey && (
                    <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                      {specs.slice(0, 2).map((sp, si) => {
                        const v = get(sp, specValueKey);
                        const l = get(sp, specLabelKey);
                        if (typeof v !== "string" || v.trim() === "") return null;
                        return (
                          <span key={si} className="text-tiny text-muted">
                            <span className="font-semibold text-slate">{v}</span>{" "}
                            {typeof l === "string" ? l : ""}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyItems noun={itemsDef?.itemNoun} />
      )}
    </div>
  );
}

function QuoteBlock({ def, content }: { def: SectionTypeDef; content: SectionContent }) {
  const hDef = headingField(def);
  const itemsDef = def.fields.find((f): f is ListDef => f.kind === "list");
  const items = itemsDef ? asList(get(content, itemsDef.key)) : [];
  const quoteDef = itemsDef?.of.find((f) => f.kind === "para");
  const textKeys = itemsDef?.of.filter((f) => f.kind === "text").map((f) => f.key) ?? [];
  const authorKey = textKeys[0];
  const roleKey = textKeys[1];
  const avatarKey = itemsDef?.of.find((f) => f.kind === "image")?.key;

  return (
    <div>
      {hDef && (
        <h2 className="mb-4 text-panel font-bold">
          {textOrPlaceholder(get(content, hDef.key), hDef.label)}
        </h2>
      )}
      {items.length > 0 ? (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => {
            const avatar = avatarKey ? ((get(item, avatarKey) as ImageValue | null) ?? null) : null;
            const role = roleKey ? get(item, roleKey) : undefined;
            return (
              <div key={i} className="rounded-[9px] border border-line bg-surface p-4">
                <p className="text-card leading-[1.5] text-ink">
                  “{quoteDef ? textOrPlaceholder(get(item, quoteDef.key), quoteDef.label) : ""}”
                </p>
                <div className="mt-3 flex items-center gap-2.5">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb(avatar.url, 64)}
                      alt={avatar.alt ?? ""}
                      className="h-7 w-7 shrink-0 rounded-full border border-line-mid object-cover"
                    />
                  ) : (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-chip text-tiny text-faint">
                      ◐
                    </span>
                  )}
                  <p className="text-micro text-quiet">
                    <span className="font-semibold text-slate">
                      {authorKey ? textOrPlaceholder(get(item, authorKey), "Who said it") : ""}
                    </span>
                    {typeof role === "string" && role.trim() !== "" && <span> · {role}</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyItems noun={itemsDef?.itemNoun} />
      )}
    </div>
  );
}

function RowsBlock({ def, content }: { def: SectionTypeDef; content: SectionContent }) {
  const hDef = headingField(def);
  const listDef = def.fields.find((f): f is ListDef => f.kind === "list");
  const items = listDef ? asList(get(content, listDef.key)) : [];
  const paraDef = listDef?.of.find((f) => f.kind === "para");
  const textDef = listDef?.of.find((f) => f.kind === "text");
  const isQA = !!textDef && !!paraDef && (listDef?.of.length ?? 0) > 1;

  return (
    <div>
      {hDef && (
        <h2 className="mb-4 text-panel font-bold">
          {textOrPlaceholder(get(content, hDef.key), hDef.label)}
        </h2>
      )}
      {items.length > 0 ? (
        <div className="flex flex-col gap-4">
          {isQA
            ? items.map((item, i) => (
                <div key={i} className="border-b border-line-soft pb-3.5 last:border-b-0">
                  <p className="text-sub font-semibold text-ink">
                    {textOrPlaceholder(get(item, textDef!.key), textDef!.label)}
                  </p>
                  <p className="mt-1.5 text-mid text-quiet">
                    {textOrPlaceholder(get(item, paraDef!.key), paraDef!.label)}
                  </p>
                </div>
              ))
            : items.map((item, i) => {
                const bodyDef = paraDef ?? textDef;
                return (
                  <p key={i} className="text-body leading-[1.6] text-ink">
                    {bodyDef ? textOrPlaceholder(get(item, bodyDef.key), bodyDef.label) : ""}
                  </p>
                );
              })}
        </div>
      ) : (
        <p className="text-mid text-faint italic">Nothing written yet.</p>
      )}
    </div>
  );
}

function BandBlock({ def, content }: { def: SectionTypeDef; content: SectionContent }) {
  const hDef = headingField(def);
  const subDef = fieldByKey(def.fields, "subheading");
  const buttonsDef = listFieldByKey(def.fields, "buttons");
  const buttonLabelKey = buttonsDef?.of.find((f) => f.kind === "text")?.key;
  const buttons = buttonsDef ? asList(get(content, buttonsDef.key)) : [];

  return (
    <div className="rounded-[10px] bg-accent-tint px-6 py-8 text-center">
      {hDef && (
        <h2 className="text-panel font-bold text-ink">
          {textOrPlaceholder(get(content, hDef.key), hDef.label)}
        </h2>
      )}
      {subDef && (
        <p className="mx-auto mt-1.5 max-w-[36ch] text-sub text-quiet">
          {textOrPlaceholder(get(content, subDef.key), subDef.label)}
        </p>
      )}
      {buttons.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {buttons.map((b, i) => {
            const label = get(b, buttonLabelKey);
            return (
              <span
                key={i}
                className="rounded-full border border-accent-line bg-surface px-4 py-1.5 text-helper font-semibold text-accent"
              >
                {typeof label === "string" && label.trim() ? label : "Button"}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SplitBlock({ def, content }: { def: SectionTypeDef; content: SectionContent }) {
  const hDef = headingField(def);
  const introDef = fieldByKey(def.fields, "intro");
  const addressDef = fieldByKey(def.fields, "address");
  const phoneDef = fieldByKey(def.fields, "phone");
  const emailDef = fieldByKey(def.fields, "email");
  const hoursDef = listFieldByKey(def.fields, "hours");
  const daysKey = hoursDef?.of.find((f) => f.key === "days")?.key;
  const timeKey = hoursDef?.of.find((f) => f.key === "time")?.key;
  const showFormDef = fieldByKey(def.fields, "showForm");
  const hours = hoursDef ? asList(get(content, hoursDef.key)) : [];
  const showForm = showFormDef ? get(content, showFormDef.key) === true : false;

  return (
    <div>
      {hDef && (
        <h2 className="mb-1.5 text-panel font-bold">
          {textOrPlaceholder(get(content, hDef.key), hDef.label)}
        </h2>
      )}
      {introDef && (
        <p className="mb-4 text-mid text-quiet">
          {textOrPlaceholder(get(content, introDef.key), introDef.label)}
        </p>
      )}
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-2 rounded-[9px] border border-line bg-surface p-4">
          {addressDef && <DetailRow label="Address" value={get(content, addressDef.key)} placeholder={addressDef.label} />}
          {phoneDef && <DetailRow label="Phone" value={get(content, phoneDef.key)} placeholder={phoneDef.label} />}
          {emailDef && <DetailRow label="Email" value={get(content, emailDef.key)} placeholder={emailDef.label} />}
          {hours.length > 0 && daysKey && timeKey && (
            <div className="mt-1 flex flex-col gap-1 border-t border-line-soft pt-2.5">
              {hours.map((row, i) => (
                <div key={i} className="flex justify-between gap-3 text-micro text-quiet">
                  <span>{textOrPlaceholder(get(row, daysKey), "Days")}</span>
                  <span>{textOrPlaceholder(get(row, timeKey), "Hours")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {showForm && (
          <div className="flex flex-col gap-2 rounded-[9px] border border-dashed border-field bg-sunken p-4">
            <p className="text-micro font-semibold tracking-[.06em] text-faint uppercase">
              Message form
            </p>
            <div className="h-7 rounded-md border border-line-mid bg-surface" />
            <div className="h-7 rounded-md border border-line-mid bg-surface" />
            <div className="h-14 rounded-md border border-line-mid bg-surface" />
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: unknown;
  placeholder: string;
}) {
  return (
    <p className="text-mid">
      <span className="text-faint">{label}: </span>
      <span className="text-ink">{textOrPlaceholder(value, placeholder)}</span>
    </p>
  );
}

/** Any wire kind the dashboard does not (yet) know, or a section type not in
 *  the registry at all — a plain heading-and-paragraphs reading of whatever
 *  string fields exist, so a preview never just goes blank. */
function FallbackBody({ content, def }: { content: SectionContent; def?: SectionTypeDef }) {
  if (!def) {
    const strings = Object.values(content).filter(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    );
    return strings.length > 0 ? (
      <div className="flex flex-col gap-2">
        {strings.map((v, i) => (
          <p key={i} className="text-mid text-quiet">
            {v}
          </p>
        ))}
      </div>
    ) : (
      <p className="text-mid text-faint italic">Nothing filled in yet.</p>
    );
  }
  const hDef = headingField(def);
  const stringFields = def.fields.filter((f) => f.kind === "text" || f.kind === "para");
  return (
    <div className="flex flex-col gap-2">
      {hDef && (
        <h2 className="text-panel font-bold">{textOrPlaceholder(get(content, hDef.key), hDef.label)}</h2>
      )}
      {stringFields
        .filter((f) => f.key !== hDef?.key)
        .map((f) => (
          <p key={f.key} className="text-mid text-quiet">
            {textOrPlaceholder(get(content, f.key), f.label)}
          </p>
        ))}
    </div>
  );
}

function EmptyItems({ noun }: { noun?: string }) {
  return <p className="text-mid text-faint italic">No {noun ?? "item"}s yet.</p>;
}

/* ------------------------------------------------------------------ shape helpers
   Small, generic readers over field definitions — never the section TYPE, only
   what kind of field is present. A future section type reusing an existing
   wire archetype renders correctly without any change here. */

function asList(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v : [];
}

function get(obj: Record<string, unknown>, key: string | undefined): unknown {
  return key ? obj[key] : undefined;
}

function fieldByKey(fields: FieldDef[], key: string): FieldDef | undefined {
  return fields.find((f) => f.key === key);
}

function listFieldByKey(fields: FieldDef[], key: string): ListDef | undefined {
  const f = fields.find((x) => x.key === key);
  return f && f.kind === "list" ? f : undefined;
}

function firstOfKind(fields: FieldDef[], kind: FieldDef["kind"]): FieldDef | undefined {
  return fields.find((f) => f.kind === kind);
}

function headingField(def: SectionTypeDef): FieldDef | undefined {
  return fieldByKey(def.fields, "heading") ?? firstOfKind(def.fields, "text");
}

/** A filled value renders as itself; an empty one renders as a faint, italic
 *  ghost of the field's own label, so the skeleton still reads while a
 *  client is mid-type. */
function textOrPlaceholder(value: unknown, label?: string): ReactNode {
  const str = typeof value === "string" ? value.trim() : "";
  if (str) return value as string;
  if (!label) return null;
  return <span className="text-faint italic">{label}</span>;
}
