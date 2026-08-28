import { createServer, type Server } from "node:http";

/**
 * A stand-in for the Pagecraft API, used by this package's tests.
 *
 * It implements only what the MCP tools call, but it enforces the parts that
 * actually matter: the read-only key reaches `/api/content/*` and nothing else,
 * everything else wants a bearer token, and an expired token comes back as a
 * 401 so the client's refresh path is exercised for real rather than mocked.
 *
 * Shipped in `src/` rather than a test file because three test files share it.
 * It is not exported from the package's entry point.
 */

/** Mirrors `ALLOWED_UPLOAD_TYPES` in the API — notably without SVG. */
const STORABLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
]);

export const API_KEY = "pk_test_key";
export const EMAIL = "owner@example.test";
export const PASSWORD = "correct horse battery staple";
export const PROJECT_ID = "proj_1";
export const PAGE_ID = "page_1";
export const SECTION_ID = "sec_1";
export const MEDIA_ID = "media_1";

export interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
  auth?: string;
  apiKey?: string;
  cookie?: string;
}

export interface StubApi {
  baseUrl: string;
  calls: RecordedCall[];
  /** Uploads that reached the presigned storage URL. */
  uploads: { url: string; bytes: number; contentType?: string }[];
  /** Makes the next bearer token look expired, so the client must renew. */
  expireTokens(): void;
  /** Refuse refresh, so the client has to sign in again. */
  breakRefresh(): void;
  /** The bearer token the stub currently accepts. */
  currentToken(): string;
  loginCount(): number;
  refreshCount(): number;
  close(): Promise<void>;
}

const PAGE = {
  id: PAGE_ID,
  slug: "",
  title: "Home",
  order: 0,
  status: "draft",
  seo: {},
  sections: [],
  draftSections: [
    { id: SECTION_ID, type: "hero", name: "Main Banner", order: 0, visible: true, content: { heading: "Hi" } },
  ],
  hasDraftChanges: true,
  updatedAt: "2026-08-28T00:00:00.000Z",
};

const PUBLISHED_PAGE = {
  slug: "",
  title: "Home",
  order: 0,
  seo: { metaTitle: "Home" },
  sections: [{ id: SECTION_ID, type: "hero", order: 0, visible: true, content: { heading: "Hi" } }],
  preview: false,
};

const MEDIA = {
  id: MEDIA_ID,
  publicId: `${PROJECT_ID}/abc123`,
  url: "https://cdn.example.test/proj_1/abc123.png",
  resourceType: "image",
  format: "png",
  width: 0,
  height: 0,
  bytes: 12,
  originalName: "logo.png",
  alt: "",
  createdAt: "2026-08-28T00:00:00.000Z",
};

export async function startStubApi(): Promise<StubApi> {
  const calls: RecordedCall[] = [];
  const uploads: { url: string; bytes: number; contentType?: string }[] = [];
  let tokenSerial = 1;
  let validToken = "";
  let refreshWorks = true;
  let logins = 0;
  let refreshes = 0;

  const mintToken = () => {
    validToken = `access_${tokenSerial++}`;
    return validToken;
  };

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = req.url ?? "";
      const method = req.method ?? "GET";
      const contentType = req.headers["content-type"];

      const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(body));
      };
      const ok = (data: unknown, status = 200) => send(status, { success: true, data });
      const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
        send(status, { success: false, error, ...extra });

      // The presigned storage PUT — a different host in real life.
      if (url.startsWith("/storage/")) {
        uploads.push({
          url,
          bytes: raw.byteLength,
          contentType: typeof contentType === "string" ? contentType : undefined,
        });
        res.writeHead(200);
        return res.end();
      }

      const body = raw.byteLength > 0 ? JSON.parse(raw.toString("utf8")) : undefined;
      const auth = req.headers.authorization as string | undefined;
      const apiKey = req.headers["x-api-key"] as string | undefined;
      const cookie = req.headers.cookie as string | undefined;
      calls.push({ method, url, body, auth, apiKey, cookie });

      const path = url.split("?")[0];
      const query = new URLSearchParams(url.split("?")[1] ?? "");

      /* ------------------------------------------------------------ session */

      if (path === "/api/auth/login") {
        logins++;
        if (body?.email !== EMAIL || body?.password !== PASSWORD) {
          return fail(401, "That email address and password do not match.");
        }
        return send(
          200,
          { success: true, data: { user: { id: "u1", email: EMAIL }, accessToken: mintToken() } },
          { "set-cookie": "pc_refresh=refresh_1; Path=/api/auth; HttpOnly" }
        );
      }

      if (path === "/api/auth/refresh") {
        refreshes++;
        if (!refreshWorks || !cookie?.includes("pc_refresh=")) {
          return fail(401, "Please sign in again.");
        }
        return send(
          200,
          { success: true, data: { user: { id: "u1", email: EMAIL }, accessToken: mintToken() } },
          { "set-cookie": "pc_refresh=refresh_2; Path=/api/auth; HttpOnly" }
        );
      }

      /* ------------------------------------------- public content, key only */

      if (path.startsWith("/api/content")) {
        if (apiKey !== API_KEY) return fail(401, "That API key is not valid.");
        if (path === "/api/content/pages") return ok([{ slug: "", title: "Home", order: 0, seo: {} }]);
        if (path === "/api/content/home") return ok(PUBLISHED_PAGE);
        if (path === "/api/content/pages/index") {
          return ok({ ...PUBLISHED_PAGE, preview: query.get("preview") === "tok_1" });
        }
        if (path === "/api/content/pages/missing") {
          return fail(404, "There is no published page at that address.");
        }
        return fail(404, "No such endpoint.");
      }

      /* ------------------------------------------------- everything else */

      if (auth !== `Bearer ${validToken}`) return fail(401, "Please sign in again.");

      if (path === "/api/projects" && method === "GET") {
        return ok([{ id: PROJECT_ID, name: "Demo Website", slug: "demo", role: "owner" }]);
      }
      if (path === `/api/projects/${PROJECT_ID}` && method === "GET") {
        return ok({ id: PROJECT_ID, name: "Demo Website", allowedSectionTypes: ["hero", "cta"] });
      }
      if (path === "/api/section-types") return ok([{ id: "hero", name: "Hero", fields: [] }]);

      if (path === `/api/projects/${PROJECT_ID}/pages` && method === "GET") {
        return ok([{ id: PAGE_ID, slug: "", title: "Home", order: 0, status: "draft" }]);
      }
      if (path === `/api/projects/${PROJECT_ID}/pages` && method === "POST") {
        if (!body?.title) return fail(400, "Give the page a name.");
        return ok({ ...PAGE, id: "page_2", title: body.title, slug: body.slug ?? "about" }, 201);
      }
      if (path === `/api/projects/${PROJECT_ID}/pages/reorder`) return ok([{ id: PAGE_ID, order: 0 }]);

      if (path === `/api/pages/${PAGE_ID}` && method === "GET") return ok(PAGE);
      if (path === `/api/pages/${PAGE_ID}` && method === "PATCH") return ok({ ...PAGE, ...body });
      if (path === `/api/pages/${PAGE_ID}` && method === "DELETE") return ok({ deleted: true });

      if (path === `/api/pages/${PAGE_ID}/sections` && method === "POST") {
        if (body?.type === "unknownType") return fail(400, 'This CMS has no section called "unknownType".');
        return ok({ page: PAGE, section: { id: "sec_2", type: body?.type, order: 1 } }, 201);
      }
      if (path === `/api/pages/${PAGE_ID}/sections/${SECTION_ID}` && method === "PATCH") return ok(PAGE);
      if (path === `/api/pages/${PAGE_ID}/sections/${SECTION_ID}` && method === "DELETE") return ok(PAGE);
      if (path === `/api/pages/${PAGE_ID}/sections-reorder`) return ok(PAGE);

      if (path === `/api/pages/${PAGE_ID}/publish`) {
        if (body?.forceInvalid) return fail(400, "This page is not ready to go live yet.");
        return ok({
          page: { ...PAGE, status: "published" },
          revalidated: { attempted: true, ok: true, message: "Website updated." },
        });
      }
      if (path === "/api/pages/page_unready/publish") {
        return fail(400, "This page is not ready to go live yet.", {
          issues: [{ path: `${SECTION_ID}.heading`, message: "Hero: Add a headline." }],
        });
      }
      if (path === `/api/pages/${PAGE_ID}/discard-draft`) return ok(PAGE);
      if (path === `/api/pages/${PAGE_ID}/preview-token`) {
        return ok({ token: "tok_1", slug: "", expiresInMinutes: 30 });
      }

      if (path === `/api/projects/${PROJECT_ID}/media` && method === "GET") {
        return ok({ items: [MEDIA], uploadsEnabled: true });
      }
      if (path === `/api/projects/${PROJECT_ID}/media/sign` && method === "POST") {
        // The real API vets the type at signing time, because the presign fixes
        // the Content-Type the PUT must carry. Enforced here too, so a tool that
        // guesses a type the CMS refuses fails in the tests rather than in
        // somebody's library.
        const contentType = String(body?.contentType ?? "").split(";")[0]!.trim().toLowerCase();
        if (!STORABLE_TYPES.has(contentType)) {
          return fail(400, `Files of type "${contentType || "unknown"}" cannot be uploaded.`);
        }
        const key = `${PROJECT_ID}/${String(body?.contentHash ?? "").slice(0, 64)}${body?.ext ? `.${body.ext}` : ""}`;
        return ok({
          uploadUrl: `${baseUrl}/storage/${key}?signature=stub`,
          key,
          publicUrl: `https://cdn.example.test/${key}`,
          headers: { "Content-Type": body?.contentType, "Cache-Control": "public, max-age=31536000, immutable" },
        });
      }
      if (path === `/api/projects/${PROJECT_ID}/media` && method === "POST") {
        if (!String(body?.publicId ?? "").startsWith(`${PROJECT_ID}/`)) {
          return fail(403, "That upload does not belong to this website.");
        }
        return ok({ ...MEDIA, publicId: body.publicId, url: body.url, bytes: body.bytes ?? 0 }, 201);
      }
      if (path === `/api/media/${MEDIA_ID}` && method === "PATCH") return ok({ ...MEDIA, alt: body?.alt ?? "" });
      if (path === `/api/media/${MEDIA_ID}` && method === "DELETE") {
        return ok({ deleted: true, removedFromStorage: true });
      }

      return fail(404, "No such endpoint.");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  mintToken();

  return {
    baseUrl,
    calls,
    uploads,
    expireTokens: () => {
      validToken = "expired";
    },
    breakRefresh: () => {
      refreshWorks = false;
    },
    currentToken: () => validToken,
    loginCount: () => logins,
    refreshCount: () => refreshes,
    close: () => closeServer(server),
  };
}

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
