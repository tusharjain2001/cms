import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SECTION_REGISTRY, getSectionType } from "./registry.js";
import { defaultContent, validateSectionContent } from "./validate.js";

/**
 * The registry is the contract between the API, the dashboard and every client
 * website, so its guarantees are worth pinning down.
 */

describe("registry shape", () => {
  it("gives every section type a unique id", () => {
    const types = SECTION_REGISTRY.map((d) => d.type);
    assert.equal(new Set(types).size, types.length);
  });

  it("gives every list field a max, so a client can never break the design", () => {
    const walk = (fields: (typeof SECTION_REGISTRY)[number]["fields"], path: string) => {
      for (const f of fields) {
        if (f.kind === "list") {
          assert.ok(f.max !== undefined, `${path}.${f.key} is missing a max`);
          walk(f.of, `${path}.${f.key}`);
        }
      }
    };
    for (const def of SECTION_REGISTRY) walk(def.fields, def.type);
  });

  it("produces empty content that every type accepts as a draft", () => {
    for (const def of SECTION_REGISTRY) {
      const result = validateSectionContent(def.type, defaultContent(def));
      assert.equal(result.ok, true, `${def.type} default content should save as a draft`);
    }
  });
});

describe("draft versus publish", () => {
  const hero = getSectionType("hero")!;

  it("lets a client save a half-finished section", () => {
    const result = validateSectionContent("hero", defaultContent(hero), "draft");
    assert.equal(result.ok, true);
  });

  it("blocks publishing a section with a required field still blank", () => {
    const result = validateSectionContent("hero", defaultContent(hero), "publish");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0].path, "heading");
      assert.match(result.issues[0].message, /cannot be empty/);
    }
  });

  it("blocks publishing a button that has no destination", () => {
    const result = validateSectionContent(
      "hero",
      {
        ...defaultContent(hero),
        heading: "Fresh sourdough",
        buttons: [{ label: "Order", href: "", variant: "Solid" }],
      },
      "publish"
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issues[0].path, "buttons.0.href");
  });

  it("enforces length limits even on drafts, so text never overflows a card", () => {
    const result = validateSectionContent(
      "hero",
      { ...defaultContent(hero), heading: "x".repeat(200) },
      "draft"
    );
    assert.equal(result.ok, false);
  });
});

describe("content validation", () => {
  const hero = getSectionType("hero")!;

  it("accepts well-formed content", () => {
    const result = validateSectionContent("hero", {
      ...defaultContent(hero),
      heading: "Fresh sourdough, baked every morning",
      buttons: [{ label: "Order", href: "/order", variant: "Solid" }],
    });
    assert.equal(result.ok, true);
  });

  it("refuses a section type nobody registered", () => {
    const result = validateSectionContent("crypto-widget", {});
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.issues[0].message, /Unknown section type/);
  });

  it("enforces the list maximum the design can fit", () => {
    const result = validateSectionContent("hero", {
      ...defaultContent(hero),
      heading: "Hi",
      buttons: [
        { label: "One", href: "/1", variant: "Solid" },
        { label: "Two", href: "/2", variant: "Solid" },
        { label: "Three", href: "/3", variant: "Solid" },
        { label: "Four", href: "/4", variant: "Solid" },
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.issues[0].message, /Maximum 3 buttons/);
  });

  it("enforces character limits so text cannot overflow a card", () => {
    const result = validateSectionContent("hero", {
      ...defaultContent(hero),
      heading: "x".repeat(200),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.issues[0].message, /under 140 characters/);
  });

  it("rejects a link that is not a web address", () => {
    const result = validateSectionContent("hero", {
      ...defaultContent(hero),
      heading: "Hi",
      buttons: [{ label: "Call", href: "tel 0117", variant: "Solid" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.issues[0].message, /web address/);
  });

  it("accepts internal, tel and mailto links", () => {
    for (const href of ["/products", "https://example.com", "tel:01179", "mailto:a@b.com", "#top"]) {
      const result = validateSectionContent("hero", {
        ...defaultContent(hero),
        heading: "Hi",
        buttons: [{ label: "Go", href, variant: "Solid" }],
      });
      assert.equal(result.ok, true, `${href} should be allowed`);
    }
  });

  it("drops keys the registry no longer defines", () => {
    const result = validateSectionContent("hero", {
      ...defaultContent(hero),
      heading: "Hi",
      legacyField: "left over from an old design",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal("legacyField" in result.data, false);
  });

  it("validates two levels of nesting", () => {
    const result = validateSectionContent("features", {
      heading: "Why us",
      items: [
        {
          title: "Slow fermented",
          description: "Overnight, always.",
          bullets: [{ text: "18-hour cold ferment" }, { text: "x".repeat(80) }],
        },
      ],
    });
    assert.equal(result.ok, false, "an over-long nested bullet should fail");
    if (!result.ok) assert.equal(result.issues[0].path, "items.0.bullets.1.text");
  });
});
