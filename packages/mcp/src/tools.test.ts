import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { PagecraftClient, PagecraftError } from "./client.js";
import type { McpConfig } from "./config.js";
import { ALL_TOOLS, toolByName, type ToolContext } from "./tools.js";
import {
  API_KEY,
  EMAIL,
  MEDIA_ID,
  PAGE_ID,
  PASSWORD,
  PROJECT_ID,
  SECTION_ID,
  startStubApi,
  type StubApi,
} from "./stub-api.js";

/**
 * Every tool handler, run for real against the stub API. This is the test that
 * catches a wrong path or a wrong HTTP verb — the two mistakes that would make
 * a tool look fine and do nothing.
 */

let api: StubApi;
let ctx: ToolContext;

before(async () => {
  api = await startStubApi();
  const config: McpConfig = {
    apiUrl: api.baseUrl,
    apiKey: API_KEY,
    email: EMAIL,
    password: PASSWORD,
    defaultProjectId: PROJECT_ID,
    readOnly: false,
  };
  ctx = { client: new PagecraftClient({ config }), config };
});
after(() => api.close());
beforeEach(() => {
  api.calls.length = 0;
});

const run = (name: string, args: Record<string, unknown> = {}) => {
  const tool = toolByName(name);
  assert.ok(tool, `no tool named ${name}`);
  return tool.run(ctx, args);
};

/** The last call that was not part of signing in. */
const lastApiCall = () => api.calls.filter((c) => !c.url.startsWith("/api/auth/")).at(-1)!;

describe("the tool list itself", () => {
  it("has unique, prefixed names", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, "duplicate tool name");
    assert.ok(names.every((n) => n.startsWith("pagecraft_")));
  });

  it("gives every tool a description a model can act on", () => {
    for (const tool of ALL_TOOLS) {
      assert.ok(tool.title.length > 0, `${tool.name} has no title`);
      assert.ok(tool.description.length > 40, `${tool.name} has a thin description`);
    }
  });

  it("marks the tools that cannot be undone as destructive writes", () => {
    const destructive = ALL_TOOLS.filter((t) => t.destructive).map((t) => t.name);
    assert.deepEqual(destructive.sort(), [
      "pagecraft_delete_media",
      "pagecraft_delete_page",
      "pagecraft_delete_section",
      "pagecraft_discard_draft",
    ]);
    assert.ok(ALL_TOOLS.filter((t) => t.destructive).every((t) => t.write));
  });

  it("only routes reads through the content key", () => {
    assert.ok(ALL_TOOLS.filter((t) => t.surface === "content").every((t) => !t.write));
  });
});

describe("published content tools", () => {
  it("lists published pages", async () => {
    assert.deepEqual(await run("pagecraft_list_published_pages"), [
      { slug: "", title: "Home", order: 0, seo: {} },
    ]);
  });

  it("maps the empty slug to index", async () => {
    await run("pagecraft_get_published_page", { slug: "" });
    assert.equal(lastApiCall().url, "/api/content/pages/index");
  });

  it("strips slashes from a slug", async () => {
    await run("pagecraft_get_published_page", { slug: "/index/" });
    assert.equal(lastApiCall().url, "/api/content/pages/index");
  });

  it("gets the home page", async () => {
    const page = (await run("pagecraft_get_published_home")) as { title: string };
    assert.equal(page.title, "Home");
  });

  it("reads a draft through a preview token", async () => {
    const page = (await run("pagecraft_get_page_preview", { slug: "index", token: "tok_1" })) as {
      preview: boolean;
    };
    assert.equal(page.preview, true);
  });
});

describe("website tools", () => {
  it("lists websites", async () => {
    const projects = (await run("pagecraft_list_projects")) as { id: string }[];
    assert.equal(projects[0].id, PROJECT_ID);
  });

  it("uses the default website when projectId is omitted", async () => {
    await run("pagecraft_get_project");
    assert.equal(lastApiCall().url, `/api/projects/${PROJECT_ID}`);
  });

  it("serves the section registry", async () => {
    await run("pagecraft_list_section_types");
    assert.equal(lastApiCall().url, "/api/section-types");
  });
});

describe("page tools", () => {
  it("lists pages including drafts", async () => {
    await run("pagecraft_list_pages");
    assert.equal(lastApiCall().url, `/api/projects/${PROJECT_ID}/pages`);
  });

  it("gets one page with its draft sections", async () => {
    const page = (await run("pagecraft_get_page", { pageId: PAGE_ID })) as {
      draftSections: unknown[];
    };
    assert.equal(page.draftSections.length, 1);
  });

  it("creates a page from a title alone", async () => {
    await run("pagecraft_create_page", { title: "About" });
    const call = lastApiCall();
    assert.equal(call.method, "POST");
    assert.deepEqual(call.body, { title: "About" });
  });

  it("passes a slug through when one is given", async () => {
    await run("pagecraft_create_page", { title: "About", slug: "about-us" });
    assert.deepEqual(lastApiCall().body, { title: "About", slug: "about-us" });
  });

  it("updates only the fields it was given", async () => {
    await run("pagecraft_update_page", { pageId: PAGE_ID, seo: { metaTitle: "Home page" } });
    const call = lastApiCall();
    assert.equal(call.method, "PATCH");
    assert.deepEqual(call.body, { seo: { metaTitle: "Home page" } });
  });

  it("carries the canonical and noindex search settings through", async () => {
    await run("pagecraft_update_page", {
      pageId: PAGE_ID,
      seo: { canonicalUrl: "https://acme.com/", noIndex: true },
    });
    assert.deepEqual(lastApiCall().body, {
      seo: { canonicalUrl: "https://acme.com/", noIndex: true },
    });
  });

  it("deletes a page", async () => {
    assert.deepEqual(await run("pagecraft_delete_page", { pageId: PAGE_ID }), { deleted: true });
    assert.equal(lastApiCall().method, "DELETE");
  });

  it("reorders pages", async () => {
    await run("pagecraft_reorder_pages", { ids: [PAGE_ID] });
    const call = lastApiCall();
    assert.equal(call.url, `/api/projects/${PROJECT_ID}/pages/reorder`);
    assert.deepEqual(call.body, { ids: [PAGE_ID] });
  });

  it("refuses an empty reorder list before it reaches the API", async () => {
    await assert.rejects(run("pagecraft_reorder_pages", { ids: [] }));
  });
});

describe("section tools", () => {
  it("adds a section by type", async () => {
    await run("pagecraft_add_section", { pageId: PAGE_ID, type: "cta" });
    const call = lastApiCall();
    assert.equal(call.url, `/api/pages/${PAGE_ID}/sections`);
    assert.deepEqual(call.body, { type: "cta" });
  });

  it("passes the API's refusal of an unknown type straight through", async () => {
    await assert.rejects(
      run("pagecraft_add_section", { pageId: PAGE_ID, type: "unknownType" }),
      /no section called "unknownType"/
    );
  });

  it("edits a section's content, name and visibility", async () => {
    await run("pagecraft_update_section", {
      pageId: PAGE_ID,
      sectionId: SECTION_ID,
      name: "Main Banner",
      visible: false,
      content: { heading: "Hello" },
    });
    const call = lastApiCall();
    assert.equal(call.url, `/api/pages/${PAGE_ID}/sections/${SECTION_ID}`);
    assert.deepEqual(call.body, { name: "Main Banner", visible: false, content: { heading: "Hello" } });
  });

  it("deletes and reorders sections", async () => {
    await run("pagecraft_delete_section", { pageId: PAGE_ID, sectionId: SECTION_ID });
    assert.equal(lastApiCall().method, "DELETE");

    await run("pagecraft_reorder_sections", { pageId: PAGE_ID, ids: [SECTION_ID] });
    assert.equal(lastApiCall().url, `/api/pages/${PAGE_ID}/sections-reorder`);
  });

  it("publishes, and reports what the website's webhook said", async () => {
    const result = (await run("pagecraft_publish_page", { pageId: PAGE_ID })) as {
      revalidated: { ok: boolean };
    };
    assert.equal(result.revalidated.ok, true);
  });

  it("carries the per-field reasons a refused publish gives", async () => {
    await assert.rejects(
      run("pagecraft_publish_page", { pageId: "page_unready" }),
      (err: PagecraftError) => {
        assert.equal(err.issues?.[0].path, `${SECTION_ID}.heading`);
        return true;
      }
    );
  });

  it("discards a draft and mints a preview token", async () => {
    await run("pagecraft_discard_draft", { pageId: PAGE_ID });
    assert.equal(lastApiCall().url, `/api/pages/${PAGE_ID}/discard-draft`);

    const token = (await run("pagecraft_create_preview_token", { pageId: PAGE_ID })) as {
      expiresInMinutes: number;
    };
    assert.equal(token.expiresInMinutes, 30);
  });
});

describe("media tools", () => {
  it("lists the library and whether uploads are switched on", async () => {
    const library = (await run("pagecraft_list_media")) as { uploadsEnabled: boolean };
    assert.equal(library.uploadsEnabled, true);
  });

  it("asks for an upload ticket", async () => {
    const ticket = (await run("pagecraft_create_media_upload_ticket", {
      contentHash: "abc123def456",
      contentType: "image/png",
      ext: "png",
    })) as { key: string };
    assert.equal(ticket.key, `${PROJECT_ID}/abc123def456.png`);
    assert.equal((lastApiCall().body as { resourceType: string }).resourceType, "image");
  });

  it("rejects a hash that is not a hex digest", async () => {
    await assert.rejects(
      run("pagecraft_create_media_upload_ticket", { contentHash: "not a hash", contentType: "image/png" })
    );
  });

  it("registers an already-uploaded object", async () => {
    const media = (await run("pagecraft_register_media", {
      publicId: `${PROJECT_ID}/abc123`,
      url: "https://cdn.example.test/proj_1/abc123.png",
    })) as { id: string };
    assert.equal(media.id, MEDIA_ID);
  });

  it("refuses to register an object belonging to another website", async () => {
    await assert.rejects(
      run("pagecraft_register_media", {
        publicId: "someone_else/abc123",
        url: "https://cdn.example.test/someone_else/abc123.png",
      }),
      /does not belong to this website/
    );
  });

  it("uploads a real file end to end: hash, ticket, PUT, register, alt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pagecraft-mcp-"));
    const file = join(dir, "logo.png");
    const bytes = Buffer.from("not really a png");
    await writeFile(file, bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");

    const before = api.uploads.length;
    const media = (await run("pagecraft_upload_media", { filePath: file, alt: "Our logo" })) as {
      alt: string;
    };

    assert.equal(api.uploads.length - before, 1, "the bytes should go straight to storage");
    assert.equal(api.uploads.at(-1)!.bytes, bytes.byteLength);
    assert.equal(api.uploads.at(-1)!.contentType, "image/png", "content type comes from the extension");

    const sign = api.calls.find((c) => c.url.endsWith("/media/sign"))!;
    assert.equal((sign.body as { contentHash: string }).contentHash, hash);

    const register = api.calls.find((c) => c.method === "POST" && c.url === `/api/projects/${PROJECT_ID}/media`)!;
    assert.equal((register.body as { bytes: number }).bytes, bytes.byteLength);
    assert.equal((register.body as { originalName: string }).originalName, "logo.png");
    assert.equal((register.body as { publicId: string }).publicId, `${PROJECT_ID}/${hash}.png`);

    assert.equal(media.alt, "Our logo", "alt text is a second call, and it is made");
  });

  it("does not call the alt endpoint when no alt text was given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pagecraft-mcp-"));
    const file = join(dir, "doc.pdf");
    await writeFile(file, Buffer.from("%PDF-1.4"));

    await run("pagecraft_upload_media", { filePath: file, resourceType: "raw" });
    assert.equal(api.calls.filter((c) => c.method === "PATCH" && c.url.startsWith("/api/media/")).length, 0);
    assert.equal(api.uploads.at(-1)!.contentType, "application/pdf");
  });

  it("sets alt text and deletes a file", async () => {
    const updated = (await run("pagecraft_update_media_alt", { mediaId: MEDIA_ID, alt: "A logo" })) as {
      alt: string;
    };
    assert.equal(updated.alt, "A logo");

    const removed = (await run("pagecraft_delete_media", { mediaId: MEDIA_ID })) as {
      removedFromStorage: boolean;
    };
    assert.equal(removed.removedFromStorage, true);
  });
});
