/**
 * The package's library surface.
 *
 * The command an MCP client spawns is `bin.ts` — kept separate so importing
 * anything from here (a test, or another tool that wants the definitions)
 * never starts a server on stdio.
 */
export { ConfigError, describeConfig, hasSessionCredentials, loadConfig } from "./config.js";
export type { McpConfig } from "./config.js";
export { PagecraftClient, PagecraftError } from "./client.js";
export type { ValidationIssue } from "./client.js";
export { createServer, runTool, selectTools } from "./server.js";
export type { BuiltServer } from "./server.js";
export { ALL_TOOLS, toolByName } from "./tools.js";
export type { ToolContext, ToolDef, ToolSurface } from "./tools.js";
