import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { z } from "zod";
import type { MediaDTO, PageDTO, PageSummaryDTO, ProjectDTO } from "@pagecraft/shared";
import { PagecraftClient } from "./client.js";
import type { McpConfig } from "./config.js";

/**
 * Every tool this server exposes, as plain data.
 *
 * They are defined here rather than inside the server so a test can run a
 * handler directly against a stub API — no MCP transport, no live keys.
 *
 * `surface` records which of the API's two front doors a tool goes through, and
 * decides whether it is offered at all: `content` tools need PAGECRAFT_API_KEY,
 * `session` tools need an account sign-in. `write` tools disappear entirely
 * when PAGECRAFT_READ_ONLY is set.
 */

export interface ToolContext {
  client: PagecraftClient;
  config: McpConfig;
}

export type ToolSurface = "content" | "session";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  surface: ToolSurface;
  /** Changes something on the website. */
  write: boolean;
  /** Removes or overwrites something a client cannot get back. */
  destructive: boolean;
  run(ctx: ToolContext, args: unknown): Promise<unknown>;
}

function defineTool<S extends z.ZodRawShape>(def: {
  name: string;
  title: string;
  description: string;
  input: S;
  surface: ToolSurface;
  write?: boolean;
  destructive?: boolean;
  run: (ctx: ToolContext, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}): ToolDef {
  const schema = z.object(def.input);
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    input: def.input,
    surface: def.surface,
    write: def.write ?? false,
    destructive: def.destructive ?? false,
    // The MCP server validates arguments before calling, but parsing here too
    // means a direct call in a test gets the same defaults and coercions.
    // `async` so a rejected argument surfaces as a rejected promise rather than
    // a synchronous throw the caller has to catch a second way.
    run: async (ctx, args) => def.run(ctx, schema.parse(args ?? {})),
  };
}

/**
 * Ids reach these handlers as free-form strings an assistant chose, so every one
 * is escaped before it is interpolated into a path. A real id — an ObjectId or a
 * uuid — passes through unchanged; a value carrying `/`, `?` or `#` would
 * otherwise re-point the request at a different route entirely.
 */
const seg = (value: string) => encodeURIComponent(value);

/** The public content API spells the home page "index"; the CMS stores "". */
const contentSlug = (slug: string) => {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  return clean === "" ? "index" : clean;
};

const projectIdArg = {
  projectId: z
    .string()
    .optional()
    .describe("Website id. Defaults to PAGECRAFT_PROJECT_ID when that is set."),
};

const seoArg = z
  .object({
    metaTitle: z
      .string()
      .max(70)
      .optional()
      .describe("Shown as the result's title. Blank falls back to the page title. Aim for 30-60 characters."),
    metaDescription: z
      .string()
      .max(200)
      .optional()
      .describe("The snippet under the result. Aim for 70-160 characters. Blank means Google writes its own."),
    ogImage: z.string().max(500).optional().describe("Absolute URL of the social sharing image."),
    canonicalUrl: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Absolute URL this page should be credited as, when the same content lives at more than one address. Leave blank for the page's own address, which is almost always right."
      ),
    noIndex: z
      .boolean()
      .optional()
      .describe(
        "Keep this page out of search results. It stays published and readable — this is noindex, not unpublishing."
      ),
  })
  .describe(
    "Search-engine and social-sharing fields. Only the keys you pass are changed, and like every other edit they are a DRAFT until the page is published."
  );

/* ------------------------------------------------------------------------- */
/* Published content — the read-only key                                      */
/* ------------------------------------------------------------------------- */

const contentTools: ToolDef[] = [
  defineTool({
    name: "pagecraft_list_published_pages",
    title: "List published pages",
    description:
      "Every published page of the website this API key belongs to, in menu order. This is what a live site sees — drafts are not included.",
    surface: "content",
    input: {},
    run: ({ client }) => client.content("/pages"),
  }),

  defineTool({
    name: "pagecraft_get_published_page",
    title: "Get a published page",
    description:
      "One published page with its ordered, visible sections — the live content, exactly as the website renders it.",
    surface: "content",
    input: {
      slug: z.string().describe('Page address, e.g. "about". Use "" or "index" for the home page.'),
    },
    run: ({ client }, { slug }) => client.content(`/pages/${seg(contentSlug(slug))}`),
  }),

  defineTool({
    name: "pagecraft_get_published_home",
    title: "Get the published home page",
    description: "The website's live home page — the page whose address is the site root.",
    surface: "content",
    input: {},
    run: ({ client }) => client.content("/home"),
  }),

  defineTool({
    name: "pagecraft_get_page_preview",
    title: "Preview an unpublished draft",
    description:
      "The draft of one page, using a preview token from pagecraft_create_preview_token. Tokens last 30 minutes and only work for the page they were minted for.",
    surface: "content",
    input: {
      slug: z.string().describe('Page address. Use "" or "index" for the home page.'),
      token: z.string().describe("Preview token from pagecraft_create_preview_token."),
    },
    run: ({ client }, { slug, token }) =>
      client.content(`/pages/${seg(contentSlug(slug))}`, { preview: token }),
  }),
];

/* ------------------------------------------------------------------------- */
/* Websites and the section registry                                          */
/* ------------------------------------------------------------------------- */

const projectTools: ToolDef[] = [
  defineTool({
    name: "pagecraft_list_projects",
    title: "List websites",
    description:
      "Every website this account owns or was added to. Start here to find the projectId the other tools need.",
    surface: "session",
    input: {},
    run: ({ client }) => client.authed<ProjectDTO[]>("GET", "/api/projects"),
  }),

  defineTool({
    name: "pagecraft_get_project",
    title: "Get one website",
    description:
      "Settings for one website, including allowedSectionTypes — the only section types that may be added to its pages.",
    surface: "session",
    input: { ...projectIdArg },
    run: ({ client }, { projectId }) =>
      client.authed<ProjectDTO>("GET", `/api/projects/${seg(client.projectId(projectId))}`),
  }),

  defineTool({
    name: "pagecraft_list_section_types",
    title: "List section types",
    description:
      "The section registry: every section type this CMS knows, with its fields, limits and which are required. Read this before writing section content — it is the source of truth for the shape each section's content object must take.",
    surface: "session",
    input: {},
    run: ({ client }) => client.authed("GET", "/api/section-types"),
  }),
];

/* ------------------------------------------------------------------------- */
/* Pages                                                                      */
/* ------------------------------------------------------------------------- */

const pageTools: ToolDef[] = [
  defineTool({
    name: "pagecraft_list_pages",
    title: "List pages (drafts included)",
    description:
      "Every page of a website, published or not, with whether each has unpublished changes. This is the dashboard's view, unlike pagecraft_list_published_pages.",
    surface: "session",
    input: { ...projectIdArg },
    run: ({ client }, { projectId }) =>
      client.authed<PageSummaryDTO[]>("GET", `/api/projects/${seg(client.projectId(projectId))}/pages`),
  }),

  defineTool({
    name: "pagecraft_get_page",
    title: "Get a page for editing",
    description:
      "One page with both its live `sections` and its editable `draftSections`. Every editing tool changes the draft; only publishing moves it live.",
    surface: "session",
    input: { pageId: z.string() },
    run: ({ client }, { pageId }) => client.authed<PageDTO>("GET", `/api/pages/${seg(pageId)}`),
  }),

  defineTool({
    name: "pagecraft_create_page",
    title: "Create a page",
    description:
      'Adds an empty draft page. The address is derived from the title unless you pass a slug; a page titled "Home" is placed at the site root.',
    surface: "session",
    write: true,
    input: {
      ...projectIdArg,
      title: z.string().min(1).max(120),
      slug: z.string().max(120).optional().describe("Web address. Derived from the title if omitted."),
    },
    run: ({ client }, { projectId, title, slug }) =>
      client.authed<PageDTO>("POST", `/api/projects/${seg(client.projectId(projectId))}/pages`, {
        title,
        ...(slug === undefined ? {} : { slug }),
      }),
  }),

  defineTool({
    name: "pagecraft_update_page",
    title: "Rename a page or edit its SEO",
    description:
      "Changes a page's title, web address or SEO fields. Does not touch its sections. Changing the address of a published page changes where the live site serves it.",
    surface: "session",
    write: true,
    input: {
      pageId: z.string(),
      title: z.string().min(1).max(120).optional(),
      slug: z.string().max(120).optional(),
      seo: seoArg.optional(),
    },
    run: ({ client }, { pageId, ...body }) =>
      client.authed<PageDTO>("PATCH", `/api/pages/${seg(pageId)}`, body),
  }),

  defineTool({
    name: "pagecraft_delete_page",
    title: "Delete a page",
    description:
      "Removes a page and all its content, draft and live. This cannot be undone — confirm with the person you are working for first.",
    surface: "session",
    write: true,
    destructive: true,
    input: { pageId: z.string() },
    run: ({ client }, { pageId }) => client.authed("DELETE", `/api/pages/${seg(pageId)}`),
  }),

  defineTool({
    name: "pagecraft_reorder_pages",
    title: "Reorder pages",
    description:
      "Sets the menu order. `ids` must list every page of the website exactly once — a partial list is rejected.",
    surface: "session",
    write: true,
    input: { ...projectIdArg, ids: z.array(z.string()).min(1).describe("Page ids, in the order wanted.") },
    run: ({ client }, { projectId, ids }) =>
      client.authed<PageSummaryDTO[]>(
        "PATCH",
        `/api/projects/${seg(client.projectId(projectId))}/pages/reorder`,
        { ids }
      ),
  }),
];

/* ------------------------------------------------------------------------- */
/* Sections — draft only, always                                              */
/* ------------------------------------------------------------------------- */

const sectionTools: ToolDef[] = [
  defineTool({
    name: "pagecraft_add_section",
    title: "Add a section to a page",
    description:
      "Appends a section of the given type to the page's draft, filled with that type's default content. The type must be registered AND enabled for this website (see allowedSectionTypes on pagecraft_get_project).",
    surface: "session",
    write: true,
    input: {
      pageId: z.string(),
      type: z.string().describe('Section type id, e.g. "hero" — from pagecraft_list_section_types.'),
    },
    run: ({ client }, { pageId, type }) =>
      client.authed("POST", `/api/pages/${seg(pageId)}/sections`, { type }),
  }),

  defineTool({
    name: "pagecraft_update_section",
    title: "Edit a section",
    description:
      "Updates one draft section. `content` replaces the whole content object, so send every field you want to keep — read the section first. Content is checked against the registry: shape and limits are enforced now, blank required fields only at publish. `name` is the nickname shown in the dashboard and is never rendered on the website.",
    surface: "session",
    write: true,
    input: {
      pageId: z.string(),
      sectionId: z.string(),
      name: z.string().max(120).optional().describe("Dashboard nickname, e.g. \"Main Banner\"."),
      visible: z.boolean().optional().describe("Hidden sections stay on the page but are not served."),
      content: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("The complete content object for this section type."),
    },
    run: ({ client }, { pageId, sectionId, ...body }) =>
      client.authed<PageDTO>("PATCH", `/api/pages/${seg(pageId)}/sections/${seg(sectionId)}`, body),
  }),

  defineTool({
    name: "pagecraft_delete_section",
    title: "Delete a section",
    description:
      "Removes a section from the page's draft. The live page keeps it until the page is published again.",
    surface: "session",
    write: true,
    destructive: true,
    input: { pageId: z.string(), sectionId: z.string() },
    run: ({ client }, { pageId, sectionId }) =>
      client.authed<PageDTO>("DELETE", `/api/pages/${seg(pageId)}/sections/${seg(sectionId)}`),
  }),

  defineTool({
    name: "pagecraft_reorder_sections",
    title: "Reorder sections",
    description:
      "Sets the order sections appear in on the page. `ids` must list every draft section exactly once.",
    surface: "session",
    write: true,
    input: { pageId: z.string(), ids: z.array(z.string()).min(1) },
    run: ({ client }, { pageId, ids }) =>
      client.authed<PageDTO>("PATCH", `/api/pages/${seg(pageId)}/sections-reorder`, { ids }),
  }),

  defineTool({
    name: "pagecraft_publish_page",
    title: "Publish a page",
    description:
      "Copies the draft over the live content and tells the website to regenerate. This is the only action that changes what visitors see. Required fields are enforced here, so a half-finished page is refused with a list of what is missing. The response's `revalidated` says whether the website's webhook answered — a failure there does not undo the publish.",
    surface: "session",
    write: true,
    input: { pageId: z.string() },
    run: ({ client }, { pageId }) => client.authed("POST", `/api/pages/${seg(pageId)}/publish`),
  }),

  defineTool({
    name: "pagecraft_discard_draft",
    title: "Discard unpublished changes",
    description:
      "Throws away every unpublished change on a page by copying the live content back over the draft. Cannot be undone.",
    surface: "session",
    write: true,
    destructive: true,
    input: { pageId: z.string() },
    run: ({ client }, { pageId }) =>
      client.authed<PageDTO>("POST", `/api/pages/${seg(pageId)}/discard-draft`),
  }),

  defineTool({
    name: "pagecraft_create_preview_token",
    title: "Create a preview token",
    description:
      "Mints a 30-minute token for one page, so its draft can be read through pagecraft_get_page_preview or previewed on the live site.",
    surface: "session",
    write: true,
    input: { pageId: z.string() },
    run: ({ client }, { pageId }) => client.authed("POST", `/api/pages/${seg(pageId)}/preview-token`),
  }),
];

/* ------------------------------------------------------------------------- */
/* Media                                                                      */
/* ------------------------------------------------------------------------- */

const MIME_BY_EXT: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

interface UploadTicket {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  headers: Record<string, string>;
}

const mediaTools: ToolDef[] = [
  defineTool({
    name: "pagecraft_list_media",
    title: "List the media library",
    description:
      "Every file in a website's library, newest first, plus `uploadsEnabled` — false when the CMS has no storage configured, in which case uploading will be refused.",
    surface: "session",
    input: { ...projectIdArg },
    run: ({ client }, { projectId }) =>
      client.authed<{ items: MediaDTO[]; uploadsEnabled: boolean }>(
        "GET",
        `/api/projects/${seg(client.projectId(projectId))}/media`
      ),
  }),

  defineTool({
    name: "pagecraft_create_media_upload_ticket",
    title: "Create an upload ticket",
    description:
      "Asks for a short-lived presigned PUT so bytes go straight to storage instead of through the API. Use pagecraft_upload_media unless you are uploading the bytes yourself; after your own PUT you must still call pagecraft_register_media.",
    surface: "session",
    write: true,
    input: {
      ...projectIdArg,
      contentHash: z.string().regex(/^[a-f0-9]{8,64}$/i).describe("SHA-256 hex digest of the file."),
      contentType: z.string().min(1).max(120),
      resourceType: z.enum(["image", "raw"]).default("image"),
      ext: z.string().max(8).optional().describe("File extension without the dot."),
    },
    run: ({ client }, { projectId, ...body }) =>
      client.authed<UploadTicket>(
        "POST",
        `/api/projects/${seg(client.projectId(projectId))}/media/sign`,
        body
      ),
  }),

  defineTool({
    name: "pagecraft_register_media",
    title: "Register an uploaded file",
    description:
      "Puts an already-uploaded object into the website's library. The key must sit under this website's prefix, and registering the same key twice returns the existing row rather than duplicating it.",
    surface: "session",
    write: true,
    input: {
      ...projectIdArg,
      publicId: z.string().min(1).describe("Storage object key, from the upload ticket."),
      url: z.string().url().describe("Public URL of the object, from the upload ticket."),
      resourceType: z.enum(["image", "raw"]).default("image"),
      format: z.string().max(20).default(""),
      width: z.number().int().nonnegative().default(0),
      height: z.number().int().nonnegative().default(0),
      bytes: z.number().int().nonnegative().default(0),
      originalName: z.string().max(300).default(""),
    },
    run: ({ client }, { projectId, ...body }) =>
      client.authed<MediaDTO>("POST", `/api/projects/${seg(client.projectId(projectId))}/media`, body),
  }),

  defineTool({
    name: "pagecraft_upload_media",
    title: "Upload a file into the library",
    description:
      "The whole upload in one step for a file on this machine: hash it, get a ticket, PUT the bytes to storage, register it, and set its alt text. Image dimensions are only recorded if you pass width and height — this server does not decode images, and the CMS takes them from whoever uploads.",
    surface: "session",
    write: true,
    input: {
      ...projectIdArg,
      filePath: z.string().describe("Absolute path to the file to upload."),
      alt: z.string().max(300).optional().describe("Description for screen readers and SEO."),
      contentType: z.string().max(120).optional().describe("Guessed from the extension if omitted."),
      resourceType: z.enum(["image", "raw"]).default("image"),
      width: z.number().int().nonnegative().optional(),
      height: z.number().int().nonnegative().optional(),
    },
    run: async ({ client }, args) => {
      const projectPath = `/api/projects/${seg(client.projectId(args.projectId))}`;
      const bytes = new Uint8Array(await readFile(args.filePath));
      const contentHash = createHash("sha256").update(bytes).digest("hex");
      const ext = extname(args.filePath).replace(/^\./, "").toLowerCase();
      const contentType = args.contentType ?? MIME_BY_EXT[ext] ?? "application/octet-stream";

      const ticket = await client.authed<UploadTicket>(
        "POST",
        `${projectPath}/media/sign`,
        { contentHash, contentType, resourceType: args.resourceType, ...(ext ? { ext } : {}) }
      );

      await client.putToStorage(ticket.uploadUrl, bytes, ticket.headers);

      let media = await client.authed<MediaDTO>("POST", `${projectPath}/media`, {
        publicId: ticket.key,
        url: ticket.publicUrl,
        resourceType: args.resourceType,
        format: ext,
        width: args.width ?? 0,
        height: args.height ?? 0,
        bytes: bytes.byteLength,
        originalName: basename(args.filePath),
      });

      if (args.alt !== undefined) {
        media = await client.authed<MediaDTO>("PATCH", `/api/media/${seg(media.id)}`, { alt: args.alt });
      }
      return media;
    },
  }),

  defineTool({
    name: "pagecraft_update_media_alt",
    title: "Set a file's alt text",
    description:
      "Alt text is the description a screen reader speaks and a search engine reads. It is the only field of a library file that can be edited.",
    surface: "session",
    write: true,
    input: { mediaId: z.string(), alt: z.string().max(300) },
    run: ({ client }, { mediaId, alt }) =>
      client.authed<MediaDTO>("PATCH", `/api/media/${seg(mediaId)}`, { alt }),
  }),

  defineTool({
    name: "pagecraft_delete_media",
    title: "Delete a file",
    description:
      "Removes a file from the library and from storage. Pages already using it will show a broken image, so check first. `removedFromStorage` is false when the library row went but storage did not confirm.",
    surface: "session",
    write: true,
    destructive: true,
    input: { mediaId: z.string() },
    run: ({ client }, { mediaId }) => client.authed("DELETE", `/api/media/${seg(mediaId)}`),
  }),
];

export const ALL_TOOLS: ToolDef[] = [
  ...contentTools,
  ...projectTools,
  ...pageTools,
  ...sectionTools,
  ...mediaTools,
];

export const toolByName = (name: string): ToolDef | undefined =>
  ALL_TOOLS.find((tool) => tool.name === name);
