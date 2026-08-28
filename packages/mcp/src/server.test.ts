import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpConfig } from "./config.js";
import { createServer, runTool, selectTools } from "./server.js";
import { PagecraftClient, PagecraftError } from "./client.js";
import { toolByName, type ToolContext } from "./tools.js";
import { API_KEY, EMAIL, PAGE_ID, PASSWORD, PROJECT_ID, startStubApi, type StubApi } from "./stub-api.js";

/**
 * What the server offers, and what an MCP client actually gets back.
 *
 * The selection rules are the security-relevant part: a config with only a
 * read-only key must not be handed a tool that writes, because the tool would
 * fail anyway and a model would waste a turn discovering that.
 */

let api: StubApi;

before(async () => {
  api = await startStubApi();
});
after(() => api.close());

const config = (over: Partial<McpConfig> = {}): McpConfig => ({
  apiUrl: api?.baseUrl ?? "http://127.0.0.1:1",
  readOnly: false,
  ...over,
});

const names = (c: McpConfig) => selectTools(c).map((t) => t.name);

describe("which tools are offered", () => {
  it("offers only published-content reads for a website key", () => {
    const offered = names(config({ apiKey: API_KEY }));
    assert.deepEqual(offered.sort(), [
      "pagecraft_get_page_preview",
      "pagecraft_get_published_home",
      "pagecraft_get_published_page",
      "pagecraft_list_published_pages",
    ]);
  });

  it("offers no content tool without a content key", () => {
    const offered = names(config({ email: EMAIL, password: PASSWORD }));
    assert.ok(offered.length > 10);
    assert.ok(!offered.some((n) => n.includes("published")));
  });

  it("offers everything when both credentials are present", () => {
    const offered = names(config({ apiKey: API_KEY, email: EMAIL, password: PASSWORD }));
    assert.ok(offered.includes("pagecraft_list_published_pages"));
    assert.ok(offered.includes("pagecraft_publish_page"));
  });

  it("hides every write when read-only", () => {
    const offered = selectTools(config({ apiKey: API_KEY, email: EMAIL, password: PASSWORD, readOnly: true }));
    assert.ok(offered.length > 0);
    assert.ok(offered.every((t) => !t.write));
    assert.ok(!offered.some((t) => t.name === "pagecraft_delete_page"));
    assert.ok(offered.some((t) => t.name === "pagecraft_get_page"), "reads must survive read-only mode");
  });
});

describe("results", () => {
  const ctx = (): ToolContext => {
    const c = config({ apiKey: API_KEY, email: EMAIL, password: PASSWORD, defaultProjectId: PROJECT_ID });
    return { client: new PagecraftClient({ config: c }), config: c };
  };

  it("returns JSON a model can read", async () => {
    const result = await runTool(toolByName("pagecraft_list_published_pages")!, ctx(), {});
    assert.equal(result.isError, undefined);
    const text = result.content[0] as { type: string; text: string };
    assert.equal(text.type, "text");
    assert.deepEqual(JSON.parse(text.text), [{ slug: "", title: "Home", order: 0, seo: {} }]);
  });

  it("reports an API refusal as a tool error, not a crash", async () => {
    const result = await runTool(toolByName("pagecraft_get_published_page")!, ctx(), { slug: "missing" });
    assert.equal(result.isError, true);
    assert.match((result.content[0] as { text: string }).text, /no published page/i);
  });

  it("includes the per-field reasons when a publish is refused", async () => {
    const result = await runTool(toolByName("pagecraft_publish_page")!, ctx(), { pageId: "page_unready" });
    assert.equal(result.isError, true);
    assert.match((result.content[0] as { text: string }).text, /Add a headline/);
  });

  it("reports a bad argument as a tool error too", async () => {
    const result = await runTool(toolByName("pagecraft_get_page")!, ctx(), {});
    assert.equal(result.isError, true);
  });

  it("never throws PagecraftError out of runTool", async () => {
    const result = await runTool(toolByName("pagecraft_delete_media")!, ctx(), { mediaId: "nope" });
    assert.equal(result.isError, true);
    assert.ok(!(result instanceof PagecraftError));
  });
});

describe("over a real MCP connection", () => {
  it("lists tools with their annotations, and calls one", async () => {
    const { server } = createServer(
      config({ apiKey: API_KEY, email: EMAIL, password: PASSWORD, defaultProjectId: PROJECT_ID })
    );
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.length >= 20, `expected the full tool set, got ${listed.tools.length}`);

      const publish = listed.tools.find((t) => t.name === "pagecraft_publish_page")!;
      assert.equal(publish.annotations?.readOnlyHint, false);
      assert.ok(publish.inputSchema.properties?.pageId, "pageId must be advertised");
      assert.deepEqual(publish.inputSchema.required, ["pageId"]);

      const del = listed.tools.find((t) => t.name === "pagecraft_delete_page")!;
      assert.equal(del.annotations?.destructiveHint, true);

      const called = await client.callTool({ name: "pagecraft_list_pages", arguments: {} });
      const content = called.content as { type: string; text: string }[];
      assert.equal(JSON.parse(content[0].text)[0].id, PAGE_ID);

      // A tool that does not exist is refused, never answered with data.
      const missing = await client
        .callTool({ name: "pagecraft_not_a_tool", arguments: {} })
        .catch(() => ({ isError: true }));
      assert.equal(missing.isError, true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("advertises no write tool at all in read-only mode", async () => {
    const { server } = createServer(
      config({ apiKey: API_KEY, email: EMAIL, password: PASSWORD, readOnly: true })
    );
    const client = new Client({ name: "test", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.every((t) => t.annotations?.readOnlyHint === true));
      assert.ok(!listed.tools.some((t) => t.name.startsWith("pagecraft_delete")));
    } finally {
      await client.close();
      await server.close();
    }
  });
});
