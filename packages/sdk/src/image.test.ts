import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  SRCSET_WIDTHS,
  cmsImageUrl,
  cmsSrcSet,
  configureCmsImages,
  imageProps,
  resetCmsImages,
} from "./image.js";

/**
 * The R2 backbone serves media from a Cloudflare custom domain, so the helpers
 * have to speak Image Transformations as well as Cloudinary. The rule that
 * matters most: a URL we cannot resize is never rewritten and never gets a
 * srcset, because a srcset of identical URLs makes a phone download the
 * full-size original while believing it chose the small one.
 */

const R2 = "https://media.example.com/6a9050049d7e1f35b078c966/ab12cd34.jpg";
const CLOUDINARY = "https://res.cloudinary.com/demo/image/upload/v1/pagecraft/p1/photo.jpg";

afterEach(() => resetCmsImages());

describe("cloudflare image transformations", () => {
  it("rewrites an R2 url once the site has declared its CDN", () => {
    configureCmsImages({ provider: "cloudflare" });
    assert.equal(
      cmsImageUrl(R2, { width: 960 }),
      "https://media.example.com/cdn-cgi/image/f=auto,w=960,fit=scale-down/6a9050049d7e1f35b078c966/ab12cd34.jpg"
    );
  });

  it("can be asked per call, without configuring the site", () => {
    const out = cmsImageUrl(R2, { width: 640, provider: "cloudflare" });
    assert.match(out, /\/cdn-cgi\/image\/f=auto,w=640,fit=scale-down\//);
  });

  it("maps crop modes onto Cloudflare's fit values", () => {
    const fill = cmsImageUrl(R2, { width: 400, height: 400, crop: "fill", provider: "cloudflare" });
    assert.match(fill, /w=400,h=400,fit=cover/);

    const thumb = cmsImageUrl(R2, { width: 200, crop: "thumb", provider: "cloudflare" });
    assert.match(thumb, /fit=crop,gravity=auto/);
  });

  it("passes a numeric quality through and omits it for 'auto'", () => {
    assert.match(cmsImageUrl(R2, { quality: 60, provider: "cloudflare" }), /f=auto,q=60,/);
    assert.doesNotMatch(cmsImageUrl(R2, { quality: "auto", provider: "cloudflare" }), /q=/);
  });

  it("re-transforming an already-transformed url replaces the options", () => {
    const once = cmsImageUrl(R2, { width: 1920, provider: "cloudflare" });
    const twice = cmsImageUrl(once, { width: 320 });

    assert.equal(twice.match(/cdn-cgi\/image/g)?.length, 1);
    assert.match(twice, /w=320/);
    assert.doesNotMatch(twice, /w=1920/);
    assert.ok(twice.endsWith("/6a9050049d7e1f35b078c966/ab12cd34.jpg"));
  });

  it("detects an already-transformed url without any configuration", () => {
    const transformed =
      "https://media.example.com/cdn-cgi/image/f=auto,w=1280,fit=scale-down/p/x.jpg";
    assert.match(cmsImageUrl(transformed, { width: 640 }), /w=640/);
  });
});

describe("cloudinary urls still work after the R2 migration", () => {
  it("asks Cloudinary for a modern, resized copy", () => {
    assert.match(cmsImageUrl(CLOUDINARY, { width: 800 }), /\/upload\/f_auto,q_auto,w_800,c_limit\//);
  });

  it("is picked automatically even when the site is configured for Cloudflare", () => {
    configureCmsImages({ provider: "cloudflare" });
    const out = cmsImageUrl(CLOUDINARY, { width: 800 });
    assert.match(out, /\/upload\/f_auto/);
    assert.doesNotMatch(out, /cdn-cgi/);
  });
});

describe("urls we must not touch", () => {
  it("leaves a plain url alone when no CDN has been declared", () => {
    const other = "https://example.com/photo.jpg";
    assert.equal(cmsImageUrl(other, { width: 800 }), other);
  });

  it("leaves a relative url alone even when configured", () => {
    configureCmsImages({ provider: "cloudflare" });
    assert.equal(cmsImageUrl("/local/photo.jpg", { width: 800 }), "/local/photo.jpg");
  });

  it("survives an empty url", () => {
    assert.equal(cmsImageUrl("", { width: 800 }), "");
    assert.equal(cmsSrcSet(""), "");
  });
});

describe("srcset", () => {
  it("offers one candidate per width on a resizable url", () => {
    configureCmsImages({ provider: "cloudflare" });
    const set = cmsSrcSet(R2, [400, 800]);
    assert.match(set, /w=400,fit=scale-down\/\S+ 400w/);
    assert.match(set, /w=800,fit=scale-down\/\S+ 800w/);
  });

  it("never emits duplicate candidates for the same url", () => {
    configureCmsImages({ provider: "cloudflare" });
    const urls = cmsSrcSet(R2).split(", ").map((c) => c.split(" ")[0]);
    assert.equal(new Set(urls).size, urls.length, "every candidate must be a distinct url");
    assert.equal(urls.length, SRCSET_WIDTHS.length);
  });

  it("is empty rather than misleading when the url cannot be resized", () => {
    // This is the R2 regression: before the fix these were four identical URLs
    // with different width descriptors, so a phone fetched the full original.
    assert.equal(cmsSrcSet(R2), "");
    assert.equal(cmsSrcSet("https://example.com/photo.jpg"), "");
  });

  it("sorts and de-duplicates the widths it is handed", () => {
    configureCmsImages({ provider: "cloudflare" });
    const descriptors = cmsSrcSet(R2, [800, 400, 800]).split(", ").map((c) => c.split(" ")[1]);
    assert.deepEqual(descriptors, ["400w", "800w"]);
  });
});

describe("imageProps", () => {
  it("hands an <img> everything it needs, alt included", () => {
    const props = imageProps(
      { publicId: "p", url: CLOUDINARY, width: 2400, height: 1350, alt: "Sourdough" },
      { width: 1200 }
    );
    assert.equal(props!.alt, "Sourdough");
    assert.equal(props!.width, 2400);
    assert.equal(props!.height, 1350);
  });

  it("returns null when no photo has been chosen", () => {
    assert.equal(imageProps(null), null);
    assert.equal(imageProps(undefined), null);
  });

  it("uses an empty alt for a decorative image rather than inventing one", () => {
    const props = imageProps({ publicId: "p", url: CLOUDINARY, width: 10, height: 10 });
    assert.equal(props!.alt, "");
  });

  it("never offers a candidate wider than the original", () => {
    configureCmsImages({ provider: "cloudflare" });
    const props = imageProps({ publicId: "p", url: R2, width: 900, height: 600 });
    const widths = props!.srcSet!.split(", ").map((c) => Number(c.split(" ")[1].replace("w", "")));

    assert.deepEqual(widths, [320, 640, 900]);
    assert.ok(Math.max(...widths) <= 900, "an upscaled candidate is a billed transform for nothing");
  });

  it("clamps a too-wide request down to the original's width", () => {
    configureCmsImages({ provider: "cloudflare" });
    const props = imageProps({ publicId: "p", url: R2, width: 1600, height: 1000 }, { width: 1920 });

    assert.match(props!.src, /w=1600,/);
    assert.doesNotMatch(props!.src, /w=1920/);
  });

  it("leaves a request narrower than the original alone", () => {
    configureCmsImages({ provider: "cloudflare" });
    const props = imageProps({ publicId: "p", url: R2, width: 1600, height: 1000 }, { width: 960 });
    assert.match(props!.src, /w=960,/);
  });

  it("omits srcSet entirely on a url that cannot be resized", () => {
    const props = imageProps({ publicId: "p", url: R2, width: 900, height: 600 });
    assert.equal(props!.srcSet, undefined);
    assert.equal(props!.src, R2);
  });

  it("omits both dimensions when the library never measured the file", () => {
    // The register endpoint defaults width/height to 0, so this is the ordinary
    // shape for an SVG, a PDF, or anything uploaded without measurement.
    // `width={0}` on an <img> is not "unknown" — it renders a zero-pixel box.
    const props = imageProps({ publicId: "p", url: R2, width: 0, height: 0 });
    assert.equal(props!.width, undefined);
    assert.equal(props!.height, undefined);
    assert.ok(!("width" in props!), "the key must be absent, not present-and-zero");
    assert.ok(!("height" in props!));
  });

  it("keeps a known width even when the height is missing", () => {
    const props = imageProps({ publicId: "p", url: R2, width: 800, height: 0 });
    assert.equal(props!.width, 800);
    assert.equal(props!.height, undefined);
  });

  it("omits dimensions absent from older content rather than emitting NaN", () => {
    // Media registered before width/height existed comes back without them.
    const legacy = { publicId: "p", url: R2 } as unknown as Parameters<typeof imageProps>[0];
    const props = imageProps(legacy);
    assert.ok(!("width" in props!));
    assert.ok(!("height" in props!));
  });

  it("rejects a nonsense dimension instead of passing it to the browser", () => {
    const bad = {
      publicId: "p",
      url: R2,
      width: Number.NaN,
      height: -100,
    } as unknown as Parameters<typeof imageProps>[0];
    const props = imageProps(bad);
    assert.ok(!("width" in props!));
    assert.ok(!("height" in props!));
  });

  it("still offers the full width ladder when the original's size is unknown", () => {
    configureCmsImages({ provider: "cloudflare" });
    const props = imageProps({ publicId: "p", url: R2, width: 0, height: 0 });
    const widths = props!.srcSet!.split(", ").map((c) => Number(c.split(" ")[1].replace("w", "")));
    assert.deepEqual(widths, SRCSET_WIDTHS);
  });

  it("passes a sizes hint through when the design supplies one", () => {
    configureCmsImages({ provider: "cloudflare" });
    const props = imageProps(
      { publicId: "p", url: R2, width: 1600, height: 900 },
      { width: 1280, sizes: "(max-width: 768px) 100vw, 50vw" }
    );
    assert.equal(props!.sizes, "(max-width: 768px) 100vw, 50vw");
  });
});
