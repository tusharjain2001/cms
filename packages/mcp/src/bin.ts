#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, describeConfig, loadConfig, type McpConfig } from "./config.js";
import { createServer } from "./server.js";

/**
 * The `pagecraft-mcp` command an MCP client spawns.
 *
 * It speaks MCP over stdio, so **stdout belongs to the protocol**: every human
 * message here goes to stderr, which the client shows in its log. A stray
 * console.log would corrupt the stream and the connection would simply fail.
 */

const USAGE = `
Environment:
  PAGECRAFT_API_URL       required — e.g. https://api.example.com
  PAGECRAFT_API_KEY       a website's read-only key: reading published content
  PAGECRAFT_EMAIL         account sign-in: everything that edits content
  PAGECRAFT_PASSWORD
  PAGECRAFT_ACCESS_TOKEN  short-lived alternative to the email/password pair
  PAGECRAFT_PROJECT_ID    default website, so tools need not repeat it
  PAGECRAFT_READ_ONLY     set to 1 to offer no tool that changes anything
`;

async function main(): Promise<void> {
  let config: McpConfig;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`pagecraft-mcp: ${err.message}`);
      console.error(USAGE);
      process.exit(1);
    }
    throw err;
  }

  const { server, tools } = createServer(config);
  console.error(`pagecraft-mcp: ${describeConfig(config)}`);
  console.error(`pagecraft-mcp: ${tools.length} tools available`);

  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error("pagecraft-mcp: failed to start —", err instanceof Error ? err.message : err);
  process.exit(1);
});
