import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { createCmsClient, CmsError } from "./client.js";
import { cmsImageUrl, cmsSrcSet, imageProps } from "./image.js";
import { checkRevalidateRequest } from "./revalidate.js";

/**
 * The SDK against a stub of the content API — so a website's integration is
 * verified without needing a database.
 */

let server: Server;
let baseUrl = "";
const seen: { url: string; key: string | undefined }[] = [];

const PAGE = {
  slug: "",
  title: "Home",
  order: 0,
  seo: { metaTitle: "Home" },
  sections: [{ id: "s1", type: "hero", order: 0, visible: true, content: { heading: "Hi" } }],
  preview: false,
};

before(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? "", key: req.headers["x-api-key"] as string | undefined });
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.headers["x-api-key"] !== "pk_live_test") {
      return send(401, { success: false, error: "That API key is not valid." });
    }
    if (req.url === "/api/content/pages") {
      return send(200, { success: true, data: [{ slug: "", title: "Home", order: 0, seo: {} }] });
    }
    if (req.url?.startsWith("/api/content/pages/index")) {
      const preview = req.url.includes("preview=");
      return send(200, { success: true, data: { ...PAGE, preview } });
    }
    if (req.url === "/api/content/home") return send(200, { success: true, data: PAGE });
    if (req.url === "/api/content/pages/missing") {
      return send(404, { success: false, error: "There is no published page at that address." });
    }
    return send(404, { success: false, error: "No such endpoint." });
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

after(() => server?.close());

const client = () => createCmsClient({ apiKey: "pk_live_test", baseUrl });

describe("cms client", () => {
  it("refuses to be built without a key or url", () => {
    assert.throws(() => createCmsClient({ apiKey: "", baseUrl }), /apiKey is required/);
    assert.throws(() => createCmsClient({ apiKey: "k", baseUrl: "" }), /baseUrl is required/);
  });

  it("sends the api key on every request", async () => {
    await client().getPages();
    assert.equal(seen.at(-1)!.key, "pk_live_test");
  });

  it("fetches the page list for navigation", async () => {
    const pages = await client().getPages();
    assert.equal(pages[0].title, "Home");
  });

  it("treats an empty slug and a leading slash as the home page", async () => {
    await client().getPage("");
    assert.match(seen.at(-1)!.url, /\/pages\/index$/);
    await client().getPage("/");
    assert.match(seen.at(-1)!.url, /\/pages\/index$/);
  });

  it("returns sections ready to render", async () => {
    const page = await client().getPage("index");
    assert.equal(page.sections[0].type, "hero");
    assert.equal(page.preview, false);
  });

  it("surfaces a missing page as a 404 CmsError, not a crash", async () => {
    await assert.rejects(
      () => client().getPage("missing"),
      (err: unknown) => err instanceof CmsError && err.status === 404
    );
  });

  it("explains a bad key in plain English", async () => {
    const bad = createCmsClient({ apiKey: "wrong", baseUrl });
    await assert.rejects(
      () => bad.getPages(),
      (err: unknown) => err instanceof CmsError && /not valid/.test(err.message)
    );
  });

  it("reports an unreachable CMS rather than hanging", async () => {
    const offline = createCmsClient({ apiKey: "k", baseUrl: "http://127.0.0.1:1" });
    await assert.rejects(
      () => offline.getPages(),
      (err: unknown) => err instanceof CmsError && err.status === 0
    );
  });

  it("passes a preview token through and marks the result", async () => {
    const page = await client().getPreview("", "tok123");
    assert.equal(page.preview, true);
    assert.match(seen.at(-1)!.url, /preview=tok123/);
  });
});

describe("image helpers", () => {
  const url = "https://res.cloudinary.com/demo/image/upload/v1/pagecraft/p1/photo.jpg";

  it("asks Cloudinary for a modern, resized copy", () => {
    const out = cmsImageUrl(url, { width: 800 });
    assert.match(out, /\/upload\/f_auto,q_auto,w_800,c_limit\//);
  });

  it("leaves a non-Cloudinary url alone", () => {
    const other = "https://example.com/photo.jpg";
    assert.equal(cmsImageUrl(other, { width: 800 }), other);
  });

  it("builds a srcset so browsers pick the right size", () => {
    const set = cmsSrcSet(url, [400, 800]);
    assert.match(set, /w_400.* 400w/);
    assert.match(set, /w_800.* 800w/);
  });

  it("hands an <img> everything it needs, alt included", () => {
    const props = imageProps(
      { publicId: "p", url, width: 2400, height: 1350, alt: "Sourdough" },
      { width: 1200 }
    );
    assert.equal(props!.alt, "Sourdough");
    assert.equal(props!.width, 2400);
  });

  it("returns null when no photo has been chosen", () => {
    assert.equal(imageProps(null), null);
    assert.equal(imageProps(undefined), null);
  });

  it("uses an empty alt for a decorative image rather than inventing one", () => {
    const props = imageProps({ publicId: "p", url, width: 10, height: 10 });
    assert.equal(props!.alt, "");
  });
});

describe("revalidate webhook", () => {
  it("accepts a correctly signed publish", () => {
    const res = checkRevalidateRequest({ secret: "s3cret", paths: ["/about"] }, "s3cret");
    assert.deepEqual(res, { ok: true, paths: ["/about"] });
  });

  it("rejects a wrong secret", () => {
    const res = checkRevalidateRequest({ secret: "nope", paths: ["/"] }, "s3cret");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 401);
  });

  it("refuses to run when the site has no secret configured", () => {
    const res = checkRevalidateRequest({ secret: "", paths: ["/"] }, "");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 500);
  });

  it("rejects a malformed body", () => {
    const res = checkRevalidateRequest(null, "s3cret");
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 400);
  });

  it("falls back to the root when no paths are given", () => {
    const res = checkRevalidateRequest({ secret: "s3cret" }, "s3cret");
    assert.deepEqual(res, { ok: true, paths: ["/"] });
  });

  it("strips path traversal out of the payload", () => {
    const res = checkRevalidateRequest(
      { secret: "s3cret", paths: ["../../etc/passwd", "about"] },
      "s3cret"
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.paths.some((p) => p.includes("..")), false);
      assert.equal(res.paths[1], "/about");
    }
  });
});
