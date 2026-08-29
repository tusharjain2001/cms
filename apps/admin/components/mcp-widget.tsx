"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Modal, cx } from "./ui";

/**
 * "Connect your coding agent" — the one place the Pagecraft MCP server is
 * surfaced in the product. Manan's note was that Argus built an MCP but nobody
 * could find it; this is the find.
 *
 * A bobbing pill at centre-top opens a popup that hands a developer a
 * ready-to-paste MCP client config, filled in with THIS website's real API
 * address, key and id — the same copy-working-code-not-a-tutorial idea as the
 * Integration screen. Their coding agent (Claude, Cursor, Windsurf, Claude
 * Code…) can then read the site's section types, page shapes and published
 * content and build a matching front-end.
 *
 * Only a website owner sees it: it needs a project to fill the config from, and
 * it is a developer tool, not something to wave at whoever only writes copy.
 * The X hides it for good on this browser.
 */

const DISMISS_KEY = "pc-mcp-widget-dismissed";

/** A little copy-to-clipboard code panel, self-contained so this file needs nothing else. */
function CodeBox({ code, label }: { code: string; label: string }) {
  const s = useStore();
  return (
    <div className="overflow-hidden rounded-lg border border-line-mid bg-sunken">
      <div className="flex items-center justify-between gap-3 border-b border-line-mid px-3.5 py-2">
        <span className="truncate font-mono text-micro text-muted">{label}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            s.pushToast("Copied to your clipboard");
          }}
          className="shrink-0 cursor-pointer text-micro font-semibold text-accent hover:underline"
        >
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-mid leading-[1.6] text-slate">{code}</pre>
    </div>
  );
}

export function McpWidget() {
  const s = useStore();
  const project = s.project;
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1"
  );

  // Nothing to hand out without a website to fill it from, and this is an
  // owner's tool. Matches who gets the Integration screen.
  if (hidden || !project || project.role !== "owner") return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — hiding for the session is still fine */
    }
    setHidden(true);
    setOpen(false);
  };

  const config = `{
  "mcpServers": {
    "pagecraft": {
      "command": "npx",
      "args": ["-y", "@pagecraft/mcp"],
      "env": {
        "PAGECRAFT_API_URL": "${API_URL}",
        "PAGECRAFT_API_KEY": "${project.apiKey}",
        "PAGECRAFT_PROJECT_ID": "${project.id}",
        "PAGECRAFT_READ_ONLY": "1"
      }
    }
  }
}`;

  const fromSource = `# Until @pagecraft/mcp is on npm, build it from the CMS repo,
# then point your MCP client's "command" at node + this path:
npm install
npm run build --workspace @pagecraft/mcp
#   "command": "node",
#   "args": ["<path-to-repo>/packages/mcp/dist/bin.js"]`;

  return (
    <>
      {/* the bobbing button + close, pinned just below the top edge, centred */}
      <div className="fixed top-3 left-1/2 z-[45] -translate-x-1/2">
        <div className="flex animate-bob-up items-center gap-1 rounded-full border border-accent-line bg-surface py-1 pr-1 pl-1 shadow-[0_14px_34px_-16px_rgba(20,24,32,.5)]">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-accent px-4 py-2 text-label font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            <span aria-hidden className="text-[15px]">
              🔌
            </span>
            Connect your coding agent
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide this"
            title="Hide this"
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-quiet transition-colors hover:bg-chip-hover"
          >
            ✕
          </button>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} width="560px" scroll>
        <div className="p-6">
          <div className="mb-4 flex items-start gap-3">
            <span aria-hidden className="text-[26px] leading-none">
              🔌
            </span>
            <div>
              <h2 className="text-modal font-bold">Connect your coding agent</h2>
              <p className="mt-1 text-label leading-[1.55] text-quiet">
                Pagecraft ships an <strong>MCP server</strong> — a bridge your AI coding agent
                (Claude, Cursor, Windsurf, Claude Code…) plugs into. Once connected it can read
                this website&apos;s section types, page shapes and published content, and build a
                matching front-end for you.
              </p>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-accent-line bg-accent-wash px-4 py-3 text-label leading-[1.55] text-slate">
            <p className="font-semibold">1. Paste this into your MCP client&apos;s config</p>
            <p className="mt-0.5 text-mid text-quiet">
              It is already filled in for <strong>{project.name}</strong> — the address, the
              read-only key, the website id. Drop it into your agent&apos;s{" "}
              <span className="font-mono text-micro">mcp.json</span> (Claude Desktop, Cursor and
              Windsurf all use this shape) and restart the agent.
            </p>
          </div>

          <CodeBox code={config} label="mcp.json" />

          <p className="mt-2 text-helper leading-[1.55] text-muted">
            The key here is <strong>read-only</strong> and scoped to this website alone, so it is
            safe to keep in your config. To let the agent <em>author</em> content (create pages, add
            sections, publish) swap it for <span className="font-mono text-micro">PAGECRAFT_EMAIL</span>{" "}
            + <span className="font-mono text-micro">PAGECRAFT_PASSWORD</span> and drop{" "}
            <span className="font-mono text-micro">PAGECRAFT_READ_ONLY</span>.
          </p>

          <details className="group mt-4 rounded-lg border border-line-mid bg-rail">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-label font-semibold text-slate">
              <span aria-hidden className="text-tiny text-faint transition-transform group-open:rotate-90">
                ▶
              </span>
              The MCP isn&apos;t on npm yet — how to run it today
            </summary>
            <div className="border-t border-line-mid px-4 py-3">
              <p className="mb-2.5 text-mid leading-[1.55] text-quiet">
                The <span className="font-mono text-micro">npx</span> line above works the moment{" "}
                <span className="font-mono text-micro">@pagecraft/mcp</span> is published. Until
                then, build it from the CMS repo and point <span className="font-mono text-micro">command</span>{" "}
                at the built file:
              </p>
              <CodeBox code={fromSource} label="terminal" />
            </div>
          </details>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="cursor-pointer text-mid font-medium text-muted hover:text-slate"
            >
              Don&apos;t show this again
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cx(
                "cursor-pointer rounded-[7px] bg-accent px-4 py-2.5 text-sub font-semibold text-white",
                "transition-colors hover:bg-accent-dark"
              )}
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
