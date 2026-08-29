"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, API_URL, api } from "@/lib/api";
import type { FieldDef, ProjectTokenDTO, QuotaUsageDTO, SectionTypeDef } from "@/lib/dto";
import { useStore } from "@/lib/store";
import { Button, Card, CardTitle, Input, Modal, ModalActions, cx } from "@/components/ui";

/**
 * How a developer connects a real website to this one CMS website.
 *
 * Everything on this page is filled in with THIS project's own values — its
 * API URL, its key, the section types it has switched on, its actual page
 * addresses. That is the whole point: a developer copies working code rather
 * than reading a generic tutorial and substituting their own details, which is
 * the step people get wrong.
 *
 * It deliberately teaches plain `fetch` rather than `@mypagecraft/sdk`: the
 * copy stays dependency-free and runs anywhere as-is. The SDK is on npm for a
 * typed client, but plain fetch is the surer thing to hand someone starting out.
 *
 * Nothing here is hard-coded about any section type: the component map and the
 * type list are both generated from `allowedSectionTypes`, so a new entry in
 * the registry appears here on its own.
 */

/** `textBlock` → `TextBlock`, so generated code reads like hand-written code. */
const componentName = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

/**
 * Stand-in shown before anyone presses "Fetch it live", and on a website with
 * nothing published yet. Written to look like a real answer rather than a
 * schema, because a developer reads shapes far faster than field lists.
 */
const EXAMPLE_RESPONSE = `{
  "success": true,
  "data": {
    "slug": "",
    "title": "Home",
    "seo": { "metaTitle": "…", "metaDescription": "…" },
    "sections": [
      {
        "id": "10134a79-b640-486f-8e2d-d1b05c924d59",
        "type": "hero",
        "order": 0,
        "visible": true,
        "content": {
          "heading": "Your words, your website",
          "subheading": "Everything on this page is editable.",
          "backgroundImage": {
            "url": "https://…/banner.jpg",
            "width": 1600,
            "height": 1000,
            "alt": "Tables set for dinner"
          },
          "buttons": [
            { "label": "Book a table", "href": "/contact", "variant": "Solid" }
          ]
        }
      }
    ],
    "publishedAt": "2026-08-28T18:04:11.402Z"
  }
}`;

/**
 * A real page can carry a dozen sections and run for hundreds of lines, which
 * teaches nothing. One section in full says everything about the shape; the
 * rest is the same thing again.
 */
function trimForReading(json: unknown): string {
  const body = json as { success?: boolean; data?: { sections?: unknown[] } };
  if (!body?.success || !Array.isArray(body.data?.sections)) {
    return JSON.stringify(json, null, 2);
  }
  const sections = body.data.sections;
  const rest = sections.length - 1;
  return JSON.stringify(
    {
      ...body,
      data: {
        ...body.data,
        sections: rest > 0 ? [sections[0], `…${rest} more section${rest === 1 ? "" : "s"}`] : sections,
      },
    },
    null,
    2
  );
}

/**
 * What a field's value actually looks like in the JSON.
 *
 * The registry is written for the person filling the form in — labels, help
 * text, character counts. A developer needs the other half: the key, the JSON
 * type, and the limits their component can rely on. This translates one into
 * the other, so nobody has to reverse-engineer a response to learn that
 * `backgroundImage` is an object rather than a string.
 */
function shapeOf(field: FieldDef): string {
  switch (field.kind) {
    case "text":
    case "para":
      return field.max ? `string · up to ${field.max} characters` : "string";
    case "link":
      return "string · a URL or a path";
    case "image":
      return "{ url, width, height, alt } · absent until a photo is chosen";
    case "file":
      return "{ url, name, bytes }";
    case "select":
      return field.options.map((o) => `"${o}"`).join(" | ");
    case "toggle":
      return `boolean · defaults to ${field.default ? "true" : "false"}`;
    case "list": {
      const limits = [
        field.min ? `at least ${field.min}` : "",
        field.max ? `at most ${field.max}` : "",
      ]
        .filter(Boolean)
        .join(", ");
      return `array${limits ? ` · ${limits}` : ""}`;
    }
  }
}

/** Depth-tagged rows, so a list's children sit indented under it. */
function flattenFields(fields: FieldDef[], depth = 0): { field: FieldDef; depth: number }[] {
  return fields.flatMap((field) =>
    field.kind === "list"
      ? [{ field, depth }, ...flattenFields(field.of, depth + 1)]
      : [{ field, depth }]
  );
}

function FieldReference({ def }: { def: SectionTypeDef }) {
  const rows = flattenFields(def.fields);
  return (
    <details className="group border-b border-line-soft last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 hover:bg-rail">
        <span aria-hidden className="w-3 text-tiny text-faint transition-transform group-open:rotate-90">
          ▶
        </span>
        <span className="font-mono text-mid font-semibold text-accent">{def.type}</span>
        <span className="text-label text-quiet">{def.name}</span>
        <span className="ml-auto text-micro text-muted tabular-nums">
          {rows.length} field{rows.length === 1 ? "" : "s"}
        </span>
      </summary>

      <div className="grid grid-cols-[auto_auto_1fr] gap-x-4 gap-y-1 border-t border-line-soft bg-sunken px-4 py-3">
        {rows.map(({ field, depth }) => (
          <div key={`${depth}-${field.key}`} className="contents">
            <div
              className="font-mono text-mid text-slate"
              style={{ paddingLeft: `${depth * 14}px` }}
            >
              {depth > 0 && <span className="mr-1.5 text-faint">└</span>}
              {field.key}
              {field.required && (
                <span className="text-destructive" title="required to publish">
                  {" *"}
                </span>
              )}
            </div>
            <div className="font-mono text-micro text-muted">{field.kind}</div>
            <div className="text-helper leading-[1.5] text-quiet">{shapeOf(field)}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

function CodeBlock({ code, file }: { code: string; file?: string }) {
  const s = useStore();
  return (
    <div className="overflow-hidden rounded-lg border border-line-mid bg-sunken">
      <div className="flex items-center justify-between gap-3 border-b border-line-mid px-4 py-2">
        <span className="truncate font-mono text-micro text-muted">{file ?? "terminal"}</span>
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
      <pre className="overflow-x-auto p-4 font-mono text-mid leading-[1.65] text-slate">{code}</pre>
    </div>
  );
}

function Step({
  n,
  title,
  sub,
  children,
}: {
  n: number;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-tiny font-bold text-white tabular-nums">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="mt-1 text-label leading-[1.55] text-quiet">{sub}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
    </Card>
  );
}

/**
 * Write-scoped tokens: how an owner hands a developer authoring access to
 * exactly ONE website — no account password, revocable, nothing else exposed.
 * Owner-only; a 403 (not the owner) just hides the card rather than erroring.
 */
function DeveloperTokensCard({ projectId }: { projectId: string }) {
  const s = useStore();
  const [tokens, setTokens] = useState<ProjectTokenDTO[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  /** The one moment the raw secret exists in this browser — never fetched again. */
  const [newToken, setNewToken] = useState<(ProjectTokenDTO & { token: string }) | null>(null);

  async function load() {
    try {
      setTokens(await api<ProjectTokenDTO[]>(`/api/projects/${projectId}/tokens`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true);
        return;
      }
      s.pushToast(err instanceof ApiError ? err.message : "Could not load tokens.", "error");
    }
  }

  useEffect(() => {
    void load();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (forbidden) return null;

  async function create() {
    if (!label.trim()) return;
    setCreating(true);
    try {
      const created = await api<ProjectTokenDTO & { token: string }>(
        `/api/projects/${projectId}/tokens`,
        { method: "POST", body: { label: label.trim() } }
      );
      setNewToken(created);
      setLabel("");
      await load();
    } catch (err) {
      s.pushToast(err instanceof ApiError ? err.message : "Could not create that token.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(t: ProjectTokenDTO) {
    if (!window.confirm(`Revoke “${t.label}”? Anything using it stops working immediately.`)) return;
    try {
      await api(`/api/projects/${projectId}/tokens/${t.id}`, { method: "DELETE" });
      s.pushToast("Token revoked");
      await load();
    } catch (err) {
      s.pushToast(err instanceof ApiError ? err.message : "Could not revoke that token.", "error");
    }
  }

  return (
    <Card>
      <CardTitle sub="Safe to hand out — it never exposes your account, only this website, and you can revoke it any time.">
        Developer access tokens
      </CardTitle>
      <p className="mb-4 text-label leading-[1.6] text-quiet">
        Mint a token and give it to your (or your client&apos;s) developer, or drop it into their
        coding agent&apos;s config. It can create pages, add sections and publish — on{" "}
        <strong>this website only</strong>. It cannot see or touch anything else in your account.
      </p>

      {tokens === null ? (
        <p className="text-label text-muted">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="mb-4 text-label text-muted">No tokens yet.</p>
      ) : (
        <div className="mb-4 overflow-hidden rounded-lg border border-line-mid">
          <table className="w-full border-collapse text-left">
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-b border-line-soft last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="text-label font-semibold">{t.label}</div>
                    <div className="mt-0.5 font-mono text-micro text-muted">{t.prefix}</div>
                  </td>
                  <td className="px-4 py-3 text-mid whitespace-nowrap text-quiet">
                    Created{" "}
                    {new Date(t.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-mid whitespace-nowrap text-quiet">
                    {t.lastUsedAt
                      ? `Used ${new Date(t.lastUsedAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}`
                      : "Never used"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="quiet" onClick={() => void revoke(t)}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button variant="secondary" onClick={() => setModalOpen(true)}>
        Create token
      </Button>

      <Modal
        open={modalOpen}
        onClose={() => {
          // The raw secret only ever lived in this state — once shown, closing
          // the modal any other way must not silently drop it unseen.
          if (!newToken) setModalOpen(false);
        }}
      >
        <div className="p-6">
          {newToken ? (
            <>
              <h2 className="text-modal font-bold">Copy this now</h2>
              <p className="mt-1 mb-4 rounded-lg border border-destructive-line bg-destructive-bg px-4 py-3 text-label leading-[1.55] text-slate">
                <strong>Copy this now — you won&apos;t be able to see it again.</strong> Paste it
                wherever your developer needs it (their MCP config, or an{" "}
                <span className="font-mono text-micro">Authorization: Bearer</span> header).
              </p>
              <CodeBlock code={newToken.token} file={newToken.label} />
              <ModalActions>
                <Button
                  variant="primary"
                  onClick={() => {
                    setNewToken(null);
                    setModalOpen(false);
                  }}
                >
                  Done
                </Button>
              </ModalActions>
            </>
          ) : (
            <>
              <h2 className="text-modal font-bold">Create a token</h2>
              <p className="mt-1 mb-4 text-label text-quiet">
                Give it a name so you recognise it later — e.g. “Acme Co. developer”.
              </p>
              <Input
                autoFocus
                placeholder="Label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                }}
              />
              <ModalActions>
                <Button variant="quiet" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!label.trim() || creating}
                  onClick={() => void create()}
                >
                  {creating ? "Creating…" : "Create"}
                </Button>
              </ModalActions>
            </>
          )}
        </div>
      </Modal>
    </Card>
  );
}

/** bytes → the largest unit that keeps the number readable. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** One labelled meter bar — amber past 80%, red at or over the limit. */
function Meter({
  label,
  used,
  limit,
  format = (n: number) => n.toLocaleString(),
}: {
  label: string;
  used: number;
  limit: number;
  format?: (n: number) => string;
}) {
  const unlimited = limit <= 0;
  const pct = unlimited ? 0 : Math.min(100, (used / limit) * 100);
  const over = !unlimited && used >= limit;
  const near = !unlimited && !over && used / limit >= 0.8;
  const ariaLabel = unlimited
    ? `${label}: ${format(used)} used, unlimited`
    : `${label}: ${format(used)} of ${format(limit)} used`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-label">
        <span className="font-semibold">{label}</span>
        <span className="text-mid text-quiet">
          {format(used)} / {limit > 0 ? format(limit) : "∞"}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={unlimited ? undefined : limit}
        aria-valuenow={unlimited ? undefined : used}
        className="h-2 overflow-hidden rounded-full bg-chip"
      >
        <div
          className={cx(
            "h-full rounded-full transition-[width]",
            over ? "bg-destructive" : near ? "bg-draft" : "bg-accent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Plan + quota snapshot — read-only, fetched once on mount. */
function UsageCard({ projectId }: { projectId: string }) {
  const s = useStore();
  const [usage, setUsage] = useState<QuotaUsageDTO | null>(null);

  useEffect(() => {
    api<QuotaUsageDTO>(`/api/projects/${projectId}/usage`)
      .then(setUsage)
      .catch((err) =>
        s.pushToast(err instanceof ApiError ? err.message : "Could not load usage.", "error")
      );
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardTitle sub={usage ? `You're on the ${usage.planName} plan.` : undefined}>
        Usage & plan
      </CardTitle>
      {!usage ? (
        <p className="text-label text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Meter label="Websites" used={usage.projects.used} limit={usage.projects.limit} />
          <Meter label="Pages" used={usage.pages.used} limit={usage.pages.limit} />
          <Meter
            label="Storage"
            used={usage.storageBytes.used}
            limit={usage.storageBytes.limit}
            format={formatBytes}
          />
          <Meter
            label="API calls this month"
            used={usage.apiCallsThisMonth.used}
            limit={usage.apiCallsThisMonth.limit}
          />
        </div>
      )}
    </Card>
  );
}

export default function IntegrationScreen() {
  const s = useStore();
  const params = useParams<{ projectId: string }>();
  const project = s.project;
  const [revealed, setRevealed] = useState(false);

  /** The live sample: what this website's own API actually answers, right now. */
  const [sample, setSample] = useState<string | null>(null);
  const [sampleNote, setSampleNote] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (params.projectId && params.projectId !== s.projectId) s.setProjectId(params.projectId);
  }, [params.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) {
    return <div className="px-6 py-10 text-label text-muted lg:px-11">Loading…</div>;
  }

  const key = revealed ? project.apiKey : `${project.apiKey.slice(0, 8)}${"•".repeat(16)}`;
  /**
   * `API_URL` is wherever THIS dashboard's API lives, so on a developer's
   * machine it is localhost — correct here, and useless in a deployed website.
   * Copy-paste is the whole point of this screen, so say so rather than let
   * someone ship it.
   */
  const isLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(API_URL);
  const enabled = s.sectionTypes.filter((t) => project.allowedSectionTypes.includes(t.type));
  const published = s.pages.filter((p) => p.status === "published");

  const envFile = `PAGECRAFT_API_URL=${API_URL}
PAGECRAFT_API_KEY=${key}
PAGECRAFT_WEBHOOK_SECRET=the-secret-you-set-in-website-settings`;

  const cmsFile = `const API = process.env.PAGECRAFT_API_URL;
const KEY = process.env.PAGECRAFT_API_KEY;

export async function cms(path) {
  const res = await fetch(\`\${API}/api/content/\${path}\`, {
    headers: { "x-api-key": KEY },
    // Next caches this and rebuilds only when we tell it to (step 5).
    cache: "force-cache",
  });
  const json = await res.json();
  return json.success ? json.data : null;
}`;

  const componentFile = `// Your design, in your code. The CMS never sends layout,
// colours or spacing — only the words and photos below.

export function ${componentName(enabled[0]?.type ?? "hero")}({ content }) {
  return (
    <section className="your-own-classes-here">
      <h1>{content.heading}</h1>
      {content.subheading && <p>{content.subheading}</p>}
    </section>
  );
}`;

  const mapFile = `${enabled
    .map((t) => `import { ${componentName(t.type)} } from "./${t.type}";`)
    .join("\n")}

// One entry per section type switched on for this website.
export const components = {
${enabled.map((t) => `  ${t.type}: ${componentName(t.type)},`).join("\n")}
};`;

  const pageFile = `import { cms } from "@/lib/cms";
import { components } from "@/components/sections";

export const dynamic = "force-static";

// Build a route for every page in the CMS. Pages added later still work —
// Next generates them on first request, with no redeploy.
export async function generateStaticParams() {
  const pages = await cms("pages");
  return pages.map((p) => ({ slug: p.slug ? p.slug.split("/") : [] }));
}

export default async function Page({ params }) {
  const { slug } = await params;
  const page = await cms(\`pages/\${slug?.join("/") || "index"}\`);
  if (!page) return <h1>Not found</h1>;

  return page.sections.map((section) => {
    const Component = components[section.type];
    // A type with no component renders nothing rather than crashing the page.
    return Component ? <Component key={section.id} content={section.content} /> : null;
  });
}`;

  const revalidateFile = `import { revalidatePath } from "next/cache";

export async function POST(req) {
  const body = await req.json();

  // Proves the request really came from your CMS.
  if (body.secret !== process.env.PAGECRAFT_WEBHOOK_SECRET) {
    return Response.json({ ok: false }, { status: 401 });
  }

  for (const path of body.paths ?? []) revalidatePath(path);
  revalidatePath("/", "layout"); // so the navigation refreshes too

  return Response.json({ ok: true });
}`;

  const curl = `curl -H "x-api-key: ${key}" \\
  ${API_URL}/api/content/pages`;

  /** The page the live sample reads — a published one, or the home page. */
  const sampleSlug = published[0]?.slug || "index";

  /**
   * Runs the real request, with this website's real key, from the browser. It
   * is the same call a live site makes, so what comes back is the truth rather
   * than a documented approximation that can drift.
   */
  async function fetchSample() {
    setFetching(true);
    setSampleNote(null);
    try {
      const res = await fetch(`${API_URL}/api/content/pages/${sampleSlug}`, {
        headers: { "x-api-key": project!.apiKey },
      });
      const json = await res.json();
      setSample(trimForReading(json));
      if (!json.success) {
        setSampleNote("Nothing is published on this website yet, so there is no live page to read.");
      }
    } catch {
      setSample(null);
      setSampleNote(
        `Could not reach ${API_URL} from this browser. If the API is running, check that its ADMIN_ORIGIN allows this address.`
      );
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="max-w-[900px] px-6 py-10 lg:px-11">
      <h1 className="text-screen font-bold">Connect your website</h1>
      <p className="mt-[5px] mb-7 max-w-[620px] text-body text-quiet">
        Everything below is already filled in for <strong>{project.name}</strong>. Hand this page
        to whoever builds the website — they copy five files and it is done.
      </p>

      <div className="flex flex-col gap-4">
        {/* ------------------------------------------- the two ways to build it */}
        <div className="flex items-start gap-3 rounded-xl border border-accent-line bg-accent-wash px-4 py-3.5">
          <span aria-hidden className="text-[20px] leading-none">
            🔌
          </span>
          <p className="text-label leading-[1.6] text-slate">
            <strong>Two ways from here.</strong> Copy the five files below by hand — or let your AI
            coding agent do it. Press{" "}
            <span className="font-semibold text-accent">“🔌 Connect your coding agent”</span> at the
            top of the screen to plug an agent into Pagecraft&apos;s MCP; it reads this website&apos;s
            sections and content and writes the same code for you.
          </p>
        </div>

        {/* --------------------------------------------- developer tokens */}
        <DeveloperTokensCard projectId={project.id} />

        {/* ------------------------------------------------------ the idea */}
        <Card>
          <CardTitle sub="Worth understanding once, before any code.">How this works</CardTitle>
          <p className="text-sub leading-[1.65] text-quiet">
            This CMS never sends design. It sends <strong>words, photos and links</strong> as
            plain data. The website asks for a page, gets a list of sections, and renders each one
            with a React component the developer wrote. That is why you can rewrite every headline
            on the site and never change how it looks.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-label text-quiet">
            <span className="rounded-md border border-line-mid bg-rail px-2.5 py-1.5 font-medium">
              You press Publish
            </span>
            <span aria-hidden className="text-faint">
              →
            </span>
            <span className="rounded-md border border-line-mid bg-rail px-2.5 py-1.5 font-medium">
              CMS pings the website
            </span>
            <span aria-hidden className="text-faint">
              →
            </span>
            <span className="rounded-md border border-line-mid bg-rail px-2.5 py-1.5 font-medium">
              That page rebuilds itself
            </span>
          </div>
        </Card>

        {/* ---------------------------------------------------------- step 1 */}
        <div data-tour="integration-keys">
          <Step
            n={1}
            title="Put these in the website's environment file"
            sub="The key is read-only and scoped to this website alone, so it is safe to ship in the site's code."
          >
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRevealed((v) => !v)} className="px-[13px] py-[9px] text-mid">
                {revealed ? "Hide key" : "Show key"}
              </Button>
              <Button
                className="px-[13px] py-[9px] text-mid"
                onClick={() => {
                  void navigator.clipboard?.writeText(project.apiKey);
                  s.pushToast("Public key copied to your clipboard");
                }}
              >
                Copy key
              </Button>
            </div>
            <CodeBlock file=".env.local" code={envFile} />
            {isLocalApi && (
              <p className="rounded-lg border border-destructive-line bg-destructive-bg px-4 py-3 text-label leading-[1.55] text-slate">
                <strong>That address only works on this computer.</strong> You are signed into a
                dashboard talking to a CMS on <span className="font-mono text-mid">{API_URL}</span>,
                so that is what gets written here. Fine while you build the site locally — but a
                deployed website cannot reach it, and every page would fail to load. Swap it for the
                CMS&apos;s public address before you deploy.
              </p>
            )}
          </Step>
        </div>

        {/* ---------------------------------------------------------- step 2 */}
        <Step
          n={2}
          title="Add one small helper that fetches content"
          sub="Every other file calls this. It is the only place the key is used."
        >
          <CodeBlock file="lib/cms.js" code={cmsFile} />
        </Step>

        {/* -------------------------------------------- what the answer looks like */}
        <Card>
          <CardTitle sub="Read this before writing any components — it is the shape they receive.">
            What comes back
          </CardTitle>

          <dl className="mb-4 grid gap-x-5 gap-y-2.5 sm:grid-cols-[auto_1fr]">
            {[
              ["success", "Always there. false means the error field explains why."],
              ["data.slug", "The page's address. Empty string is the home page."],
              ["data.sections", "Ordered, and hidden sections are already removed."],
              ["section.type", "Which of your components renders it."],
              ["section.content", "The only part that differs per type — this is what you read."],
            ].map(([field, what]) => (
              <div key={field} className="contents">
                <dt className="font-mono text-mid text-accent">{field}</dt>
                <dd className="text-label leading-[1.55] text-quiet">{what}</dd>
              </div>
            ))}
          </dl>

          <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
            <Button
              variant="primary"
              onClick={() => void fetchSample()}
              className="px-[13px] py-[9px] text-mid"
            >
              {fetching ? "Fetching…" : sample ? "Fetch again" : "Fetch it live"}
            </Button>
            <span className="font-mono text-micro break-all text-muted">
              GET /api/content/pages/{sampleSlug}
            </span>
          </div>

          <CodeBlock
            file={sample ? `live answer for /${published[0]?.slug ?? ""}` : "example"}
            code={sample ?? EXAMPLE_RESPONSE}
          />

          {sampleNote && (
            <p className="mt-3 rounded-lg border border-line-mid bg-rail px-4 py-3 text-label leading-[1.55] text-quiet">
              {sampleNote}
            </p>
          )}

          <p className="mt-3.5 text-helper leading-[1.6] text-muted">
            Notice what is <em>not</em> there: no colours, no fonts, no spacing, no class names.
            Only words, photos and links. That is why your client can rewrite every headline on the
            site without changing how any of it looks.
          </p>
        </Card>

        {/* ---------------------------------------------------------- step 3 */}
        <Step
          n={3}
          title="Write one component per section type"
          sub={`This website has ${enabled.length} section ${
            enabled.length === 1 ? "type" : "types"
          } switched on, so it needs ${enabled.length} ${
            enabled.length === 1 ? "component" : "components"
          }. This is where all the design work lives.`}
        >
          <div className="overflow-hidden rounded-lg border border-line-mid">
            <div className="border-b border-line-mid bg-rail px-4 py-2.5">
              <p className="text-label font-semibold">Every field, by section type</p>
              <p className="mt-0.5 text-helper text-muted">
                Open one to see the exact keys your component receives.{" "}
                <span className="text-destructive">*</span> means the CMS refuses to publish
                without it, so you can rely on it being there.
              </p>
            </div>
            {enabled.map((t) => (
              <FieldReference key={t.type} def={t} />
            ))}
          </div>
          <CodeBlock file={`components/sections/${enabled[0]?.type ?? "hero"}.jsx`} code={componentFile} />
          <CodeBlock file="components/sections/index.js" code={mapFile} />
          <p className="text-helper leading-[1.55] text-muted">
            Switch a section type on or off in{" "}
            <Link
              href={`/projects/${project.id}/settings`}
              className="font-medium text-accent hover:underline"
            >
              Website settings
            </Link>{" "}
            and this list changes with it.
          </p>
        </Step>

        {/* ---------------------------------------------------------- step 4 */}
        <Step
          n={4}
          title="One file renders every page"
          sub="Not one file per page — this single catch-all route serves the whole website."
        >
          <CodeBlock file="app/[[...slug]]/page.jsx" code={pageFile} />
        </Step>

        {/* ---------------------------------------------------------- step 5 */}
        <Step
          n={5}
          title="Make the site update itself on Publish"
          sub="Without this everything still works — but the live site only changes when it is redeployed by hand."
        >
          <CodeBlock file="app/api/revalidate/route.js" code={revalidateFile} />
          <div
            className={cx(
              "rounded-lg border px-4 py-3 text-label leading-[1.55]",
              project.revalidateUrl
                ? "border-published-line bg-published-bg text-slate"
                : "border-line-mid bg-rail text-quiet"
            )}
          >
            {project.revalidateUrl ? (
              <>
                <strong>Connected.</strong> Publishing calls{" "}
                <span className="font-mono text-mid">{project.revalidateUrl}</span>
                {project.hasRevalidateSecret ? "." : " — but no secret is set, so anyone who finds that address can trigger rebuilds."}
              </>
            ) : (
              <>
                <strong>Not connected yet.</strong> Add the website&apos;s address plus a secret you
                invent under{" "}
                <Link
                  href={`/projects/${project.id}/settings`}
                  className="font-semibold text-accent hover:underline"
                >
                  Website settings → Publish webhook
                </Link>
                , and use the same secret in the file above.
              </>
            )}
          </div>
        </Step>

        {/* ------------------------------------------------------- reference */}
        <Card>
          <CardTitle sub="Read-only, published content only, and never another website's.">
            Every address you can call
          </CardTitle>
          <div className="overflow-x-auto rounded-lg border border-line-mid">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <tbody>
                {[
                  ["/api/content/pages", "Every published page — build your navigation from this"],
                  ["/api/content/home", "The home page"],
                  ["/api/content/pages/:slug", "One page and its sections"],
                  ["/api/content/pages/:slug?preview=TOKEN", "The unpublished draft, for checking work"],
                ].map(([path, what]) => (
                  <tr key={path} className="border-b border-line-soft last:border-b-0">
                    <td className="w-[46%] px-4 py-3 font-mono text-mid break-all text-slate">
                      {path}
                    </td>
                    <td className="px-4 py-3 text-label text-quiet">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {published.length > 0 && (
            <p className="mt-3.5 text-helper leading-[1.6] text-muted">
              Live on this website right now:{" "}
              {published.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <span className="font-mono text-mid text-slate">
                    /api/content/pages/{p.slug || "index"}
                  </span>
                </span>
              ))}
            </p>
          )}
        </Card>

        {/* ------------------------------------------------------------ test */}
        <Card>
          <CardTitle sub="Paste this into a terminal to prove the key works before writing any code.">
            Try it now
          </CardTitle>
          <CodeBlock code={curl} />
          {published.length === 0 && (
            <p className="mt-3.5 text-helper leading-[1.55] text-muted">
              This returns an empty list until something is published. Open a page, press{" "}
              <strong>Publish</strong>, and run it again.
            </p>
          )}
        </Card>

        {/* ----------------------------------------------------- usage & plan */}
        <UsageCard projectId={project.id} />
      </div>
    </div>
  );
}
