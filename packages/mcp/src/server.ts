import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PagecraftClient, PagecraftError } from "./client.js";
import { hasSessionCredentials, type McpConfig } from "./config.js";
import { ALL_TOOLS, type ToolContext, type ToolDef } from "./tools.js";

/**
 * Wires the tool definitions into an MCP server.
 *
 * Only the tools the configured credentials can actually perform are
 * registered. A model that cannot see a tool cannot spend a turn discovering it
 * is not allowed to use it — and an operator who wanted read-only access gets
 * a server with no way to write, rather than a promise not to.
 */

const INSTRUCTIONS = `Pagecraft is a headless CMS. A website is a "project"; each project has pages; each page is an ordered list of sections; each section has a registered type and a content object whose shape comes from the section registry.

Three rules matter more than the rest:

1. Editing never goes live. Every write tool changes the page's DRAFT. pagecraft_publish_page is the single action that changes what visitors see.
2. Read pagecraft_list_section_types before writing section content. It is the source of truth for every field, limit and required flag, and it is the same registry the API validates against.
3. pagecraft_update_section replaces a section's whole content object. Fetch the page first and send back the fields you want to keep.

Section types must also be enabled for the website — check allowedSectionTypes on pagecraft_get_project. This is the developer's decision about what that site was designed to render, not a restriction to work around.`;

/** The tools these credentials can actually perform. */
export function selectTools(config: McpConfig): ToolDef[] {
  const canRead = Boolean(config.apiKey);
  const canAuthor = hasSessionCredentials(config);

  return ALL_TOOLS.filter((tool) => {
    if (tool.write && config.readOnly) return false;
    return tool.surface === "content" ? canRead : canAuthor;
  });
}

const text = (value: string): CallToolResult["content"] => [{ type: "text", text: value }];

/** Turns whatever a handler returned — or threw — into a tool result. */
export async function runTool(tool: ToolDef, ctx: ToolContext, args: unknown): Promise<CallToolResult> {
  try {
    const data = await tool.run(ctx, args);
    return { content: text(JSON.stringify(data, null, 2)) };
  } catch (err) {
    if (err instanceof PagecraftError) {
      // The API's own words, plus the per-field reasons a publish refusal
      // carries — those are the actionable part and must not be swallowed.
      const detail = err.issues?.length
        ? `\n\n${err.issues.map((i) => `- ${i.path}: ${i.message}`).join("\n")}`
        : "";
      return { content: text(`${err.message}${detail}`), isError: true };
    }
    return { content: text(err instanceof Error ? err.message : String(err)), isError: true };
  }
}

export interface BuiltServer {
  server: McpServer;
  client: PagecraftClient;
  tools: ToolDef[];
}

export function createServer(config: McpConfig, fetchImpl?: typeof fetch): BuiltServer {
  const client = new PagecraftClient({ config, fetchImpl });
  const ctx: ToolContext = { client, config };
  const tools = selectTools(config);

  const server = new McpServer(
    { name: "pagecraft", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: {
          title: tool.title,
          readOnlyHint: !tool.write,
          destructiveHint: tool.destructive,
          idempotentHint: !tool.write,
          openWorldHint: true,
        },
      },
      (args: unknown) => runTool(tool, ctx, args)
    );
  }

  return { server, client, tools };
}
