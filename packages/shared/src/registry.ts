import {
  file,
  image,
  link,
  list,
  para,
  select,
  text,
  toggle,
  type FieldDef,
} from "./fields.js";

/**
 * THE SECTION REGISTRY — the single source of truth for the whole CMS.
 *
 * The API validates content against it, and the dashboard generates its
 * editing forms from it. To support a new section you designed in React, add
 * one entry here and tick it on for that project. Nothing else changes.
 *
 * When adding a type, keep two rules:
 *   1. Only describe CONTENT. Colours, spacing and layout live in React.
 *   2. Set `max` on every list to what the design can physically fit.
 */

/** Wireframe thumbnail shown in the dashboard's "Add a section" picker. */
export type WireKind = "hero" | "cols" | "grid" | "quote" | "rows" | "band" | "split";

export interface SectionTypeDef {
  /** Stable machine id stored on the section. Never rename after go-live. */
  type: string;
  /** What the client sees in the picker. */
  name: string;
  description: string;
  icon: string;
  wire: WireKind;
  fields: FieldDef[];
}

const buttons = (max: number) =>
  list("buttons", "Buttons", [
    text("label", "Button text", { max: 24, required: true }),
    link("href", "Where it goes", { placeholder: "https:// or /page or tel:", required: true }),
    select("variant", "Style", ["Solid", "Outline"]),
  ], { itemNoun: "button", max, labelKey: "label" });

export const SECTION_REGISTRY: SectionTypeDef[] = [
  {
    type: "hero",
    name: "Hero",
    description: "Big photo, headline and a button at the top of a page.",
    icon: "▭",
    wire: "hero",
    fields: [
      text("heading", "Headline", { max: 140, required: true }),
      para("subheading", "Short paragraph under the headline", { max: 260 }),
      image("backgroundImage", "Banner photo", {
        help: "Landscape photo works best. At least 1600 pixels wide.",
      }),
      buttons(3),
      toggle("showHours", "Show the opening hours strip", { default: false }),
    ],
  },
  {
    type: "textBlock",
    name: "Text block",
    description: "A heading and one or more paragraphs of writing.",
    icon: "▤",
    wire: "rows",
    fields: [
      text("heading", "Heading", { max: 80 }),
      list("paragraphs", "Paragraphs", [para("body", "Paragraph", { max: 600, required: true })], {
        itemNoun: "paragraph",
        max: 8,
        labelKey: "body",
      }),
    ],
  },
  {
    type: "features",
    name: "Features",
    description: "Three to six short reasons to choose you, with icons.",
    icon: "◫",
    wire: "cols",
    fields: [
      text("heading", "Heading above the features", { max: 80 }),
      list("items", "Features", [
        text("title", "Title", { max: 40, required: true }),
        para("description", "Description", { max: 240 }),
        list("bullets", "Bullet points", [text("text", "Bullet text", { max: 60, required: true })], {
          itemNoun: "bullet",
          max: 4,
          labelKey: "text",
        }),
      ], { itemNoun: "feature", min: 1, max: 6, labelKey: "title" }),
    ],
  },
  {
    type: "productGrid",
    name: "Product grid",
    description: "A grid of products or services with photos and specs.",
    icon: "▦",
    wire: "grid",
    fields: [
      text("heading", "Heading", { max: 80 }),
      list("categories", "Tabs", [text("name", "Tab name", { max: 30, required: true })], {
        itemNoun: "tab",
        max: 5,
        labelKey: "name",
      }),
      list("products", "Products", [
        image("photo", "Photo"),
        text("name", "Name", { max: 48, required: true }),
        para("description", "Short description", { max: 140 }),
        text("category", "Which tab it belongs to", { max: 30 }),
        // Two spec columns is exactly what the card design fits.
        list("specs", "Specs", [
          text("value", "Value", { max: 20, required: true }),
          text("label", "Label", { max: 30, required: true }),
        ], { itemNoun: "spec", max: 2, labelKey: "label" }),
        link("detailsUrl", "“View details” link"),
        file("specSheet", "Spec sheet", { accept: [".pdf"] }),
      ], { itemNoun: "product", max: 24, labelKey: "name" }),
      toggle("showPrices", "Show prices next to each product", { default: false }),
    ],
  },
  {
    type: "gallery",
    name: "Gallery",
    description: "A grid of photos.",
    icon: "▩",
    wire: "grid",
    fields: [
      text("heading", "Heading", { max: 80 }),
      list("images", "Photos", [
        image("photo", "Photo"),
        text("caption", "Caption", { max: 80 }),
      ], { itemNoun: "photo", max: 24, labelKey: "caption" }),
    ],
  },
  {
    type: "testimonials",
    name: "Testimonials",
    description: "Quotes from happy customers.",
    icon: "❞",
    wire: "quote",
    fields: [
      text("heading", "Heading", { max: 80 }),
      list("items", "Quotes", [
        para("quote", "What they said", { max: 320, required: true }),
        text("author", "Who said it", { max: 48, required: true }),
        text("role", "Their job or town", { max: 48 }),
        image("avatar", "Their photo"),
      ], { itemNoun: "quote", max: 12, labelKey: "author" }),
    ],
  },
  {
    type: "faq",
    name: "Questions & answers",
    description: "Questions and answers that open when clicked.",
    icon: "▤",
    wire: "rows",
    fields: [
      text("heading", "Heading", { max: 80 }),
      list("items", "Questions", [
        text("question", "Question", { max: 120, required: true }),
        para("answer", "Answer", { max: 600, required: true }),
      ], { itemNoun: "question", max: 20, labelKey: "question" }),
    ],
  },
  {
    type: "cta",
    name: "Call to action",
    description: "A short band with one clear button.",
    icon: "◈",
    wire: "band",
    fields: [
      text("heading", "Heading", { max: 80, required: true }),
      para("subheading", "Short line underneath", { max: 200 }),
      buttons(2),
    ],
  },
  {
    type: "contact",
    name: "Contact",
    description: "Address, opening hours, map and a message form.",
    icon: "✉",
    wire: "split",
    fields: [
      text("heading", "Heading", { max: 80 }),
      para("intro", "Introduction", { max: 300 }),
      text("address", "Address", { max: 160 }),
      text("phone", "Phone number", { max: 32 }),
      text("email", "Email address", { max: 80 }),
      list("hours", "Opening hours", [
        text("days", "Days", { max: 24, required: true }),
        text("time", "Hours", { max: 24, required: true }),
      ], { itemNoun: "row", max: 7, labelKey: "days" }),
      toggle("showForm", "Show a message form", { default: true }),
    ],
  },
];

const BY_TYPE = new Map(SECTION_REGISTRY.map((def) => [def.type, def]));

export const getSectionType = (type: string): SectionTypeDef | undefined => BY_TYPE.get(type);

export const isKnownSectionType = (type: string): boolean => BY_TYPE.has(type);

export const sectionTypeNames = (): string[] => SECTION_REGISTRY.map((d) => d.type);
