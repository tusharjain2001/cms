/**
 * Everything the MCP server needs, read from the environment.
 *
 * MCP clients configure a server with a command plus an `env` block, so the
 * environment is the natural place for this — there are deliberately no CLI
 * flags to keep one way of doing it, and no config file to leave a password
 * lying on disk.
 *
 * Two separate credentials, because the Pagecraft API has two separate front
 * doors and they are not interchangeable:
 *
 * - `PAGECRAFT_API_KEY` is a website's public, **read-only** key. It reaches
 *   `/api/content/*` and nothing else. See `apps/api/src/middleware/api-key.ts`
 *   — it grants published content for one project and no writes at all.
 * - `PAGECRAFT_EMAIL` / `PAGECRAFT_PASSWORD` are an ordinary account sign-in.
 *   Everything that edits pages, sections or media authenticates as an account,
 *   exactly like the dashboard does.
 *
 * Supplying one, the other, or both is valid; the server only offers the tools
 * the credentials it has can actually perform.
 */

export interface McpConfig {
  /** Base URL of the Pagecraft API, e.g. https://api.example.com — no trailing slash. */
  apiUrl: string;
  /** A website's read-only content key. Unlocks the published-content tools. */
  apiKey?: string;
  /** Account email, paired with `password`. Unlocks the authoring tools. */
  email?: string;
  password?: string;
  /**
   * An already-minted access token, as an alternative to email/password.
   * Access tokens live 15 minutes by default, so this suits a short-lived
   * process; a long-running server wants the email/password pair, which can
   * refresh itself.
   */
  accessToken?: string;
  /** Used whenever a tool's `projectId` argument is omitted. */
  defaultProjectId?: string;
  /** Hides every tool that changes anything. Reads still work. */
  readOnly: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const clean = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
};

const truthy = (value: string | undefined) =>
  ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiUrl = clean(env.PAGECRAFT_API_URL);
  if (!apiUrl) {
    throw new ConfigError(
      "PAGECRAFT_API_URL is required — the base URL of your Pagecraft API, e.g. https://api.example.com"
    );
  }
  if (!/^https?:\/\//i.test(apiUrl)) {
    throw new ConfigError(`PAGECRAFT_API_URL must start with http:// or https:// (got "${apiUrl}").`);
  }

  const email = clean(env.PAGECRAFT_EMAIL);
  const password = clean(env.PAGECRAFT_PASSWORD);
  if (email && !password) throw new ConfigError("PAGECRAFT_EMAIL is set but PAGECRAFT_PASSWORD is not.");
  if (password && !email) throw new ConfigError("PAGECRAFT_PASSWORD is set but PAGECRAFT_EMAIL is not.");

  const apiKey = clean(env.PAGECRAFT_API_KEY);
  const accessToken = clean(env.PAGECRAFT_ACCESS_TOKEN);

  if (!apiKey && !email && !accessToken) {
    throw new ConfigError(
      "No credentials. Set PAGECRAFT_API_KEY to read published content, and/or " +
        "PAGECRAFT_EMAIL + PAGECRAFT_PASSWORD to edit pages, sections and media."
    );
  }

  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    apiKey,
    email,
    password,
    accessToken,
    defaultProjectId: clean(env.PAGECRAFT_PROJECT_ID),
    readOnly: truthy(env.PAGECRAFT_READ_ONLY),
  };
}

/** True when the config can authenticate as an account, and so may write. */
export const hasSessionCredentials = (config: McpConfig) =>
  Boolean(config.accessToken || (config.email && config.password));

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 1)}***@${domain}`;
};

/**
 * The one-line summary printed to stderr at startup, so an operator can see
 * which credentials took effect. Never prints a key, a token or a password —
 * an MCP server's stderr routinely ends up in a client's log file.
 */
export function describeConfig(config: McpConfig): string {
  const parts = [config.apiUrl];
  parts.push(config.apiKey ? "content key: set" : "content key: none");
  if (config.accessToken) parts.push("account: access token");
  else if (config.email) parts.push(`account: ${maskEmail(config.email)}`);
  else parts.push("account: none");
  if (config.defaultProjectId) parts.push(`default project: ${config.defaultProjectId}`);
  if (config.readOnly) parts.push("READ-ONLY");
  return parts.join(" · ");
}
