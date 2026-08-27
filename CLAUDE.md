# CLAUDE.md — Custom Headless CMS

## What this project is

A self-hosted headless CMS built by a freelance developer for the client websites they develop in React/Next.js. Clients get an easy admin dashboard to manage **content only** — pages, sections, headings, paragraphs, buttons, images — while all design, components, routing, and functionality stay in the developer's React code. This replaces the need to build client sites on WordPress/Squarespace just so clients can self-edit.

One CMS instance serves many client websites: each site is a **project** with its own API key.

**Status**: Phases 1–5 are built and verified end to end. The whole promise works: a client signs in, edits their content, presses Publish, and their live static website updates itself within seconds — no developer involved, no rebuild triggered by hand.

## Core concept

1. Content is stored as structured JSON: a **page** is a list of **sections**; each section has a `type` and a `content` object.
2. The developer builds a React component per section type (Hero, Features, CTA, ...). Clients can add/remove/reorder/fill sections but can never invent new designs — that keeps design quality in the developer's hands.
3. When a client hits **Publish**, the CMS fires the site's revalidate webhook so the live Next.js site regenerates that page within seconds — static-speed pages, automatic updates, zero developer involvement.

## Confirmed tech decisions (do not re-ask)

- **TypeScript everywhere**, strict mode
- **Express + Mongoose + MongoDB Atlas** for the API
- **Next.js (App Router) + Tailwind CSS v4** for the admin dashboard
- **Cloudinary** for media (signed uploads; CDN delivery + URL-based optimization)
- **Zod** validation at every boundary; the section registry is the source of truth
- Content delivery: public REST API consumed at runtime; **Next.js sites use ISR + on-demand revalidation** via webhook on publish
- API response shape: `{ success: true, data }` / `{ success: false, error }`
- npm workspaces monorepo

## Monorepo layout

```
cms/
├── CLAUDE.md
├── package.json            # npm workspaces + TS project references
├── apps/
│   ├── api/                # Express + TS + Mongoose REST API          (BUILT)
│   └── admin/              # Next.js + Tailwind + TS admin dashboard   (BUILT, live API)
├── packages/
│   ├── shared/             # section registry, Zod schemas, wire types (BUILT)
│   └── sdk/                # tiny package client websites install      (BUILT)
└── examples/
    └── demo-site/          # Next.js site proving the end-to-end flow  (BUILT)
```

`packages/shared` is a **build-first** package: it compiles to `dist/` and both other packages consume its types through a TypeScript project reference. Any script that touches it runs `npm run shared` first — that is why the root scripts are chained rather than using `--workspaces` alone.

### Commands (run from the repo root)

| Command | What it does |
|---|---|
| `npm install` | Installs everything and builds `packages/shared` via its `prepare` script |
| `npm run dev:api` | Rebuilds shared, then starts the API on :4000 with watch |
| `npm run dev:admin` | Starts the dashboard on :3000 |
| `npm test` | 116 tests: registry/validation (15), API integration against a real in-memory MongoDB (80, including a contract test that walks the dashboard's exact request sequence), and SDK (21) |
| `npm run build` | Builds shared → sdk → api → admin |
| `npm run build:demo` | Builds the example website (needs `examples/demo-site/.env.local` and a reachable CMS) |
| `npm run dev:demo` | Runs the example website on :3200 |
| `npm run typecheck` | Type-checks every workspace |
| `npm run seed` | Creates the first developer account and a demo website |

## Data model (MongoDB)

- **users**: `{ email, passwordHash, role: 'admin' | 'client', projectIds }` — `admin` is the developer (all projects); `client` is scoped to their project(s).
- **projects** (one per client website): `{ name, slug, apiKey, revalidateUrl?, revalidateSecret?, allowedSectionTypes: string[], createdAt }`. `allowedSectionTypes` limits a site to the section types the developer actually built for it.
- **pages**: `{ projectId, slug, title, order, seo: { metaTitle?, metaDescription?, ogImage? }, sections: Section[], draftSections: Section[], status: 'draft' | 'published', updatedAt, publishedAt }`. `draftSections` is the editing copy; **publish copies draft → sections**. The public API serves only `sections`.
- **Section** (embedded): `{ id: uuid, type, name?, order, visible, content: Record<string, unknown> }`. Stored as Mongoose `Mixed`; Zod (via the registry) is the real validator. `name` is an optional client-entered nickname ("Main Banner", "Why Choose Us") shown on the section card in the admin section list to identify sections at a glance — it is never rendered on the website (falls back to the type's label when blank).
- **media**: `{ projectId, publicId, url, resourceType: 'image'|'raw', format, width, height, bytes, originalName, alt, createdAt }` — per-project reusable library, unique on `(projectId, publicId)`.

## Section type registry (heart of the system)

**Built** — `packages/shared/src/registry.ts`. A list of section type → field definitions, consumed by BOTH the API (validation) and the admin (auto-generated forms). Adding a new section type = one entry in that file.

Field primitives (`src/fields.ts`), eight in total: `text`, `para`, `image`, `file`, `link`, `select`, `toggle`, `list(of, min?, max?)`. `list` nests, and is how clients control "how many buttons/products/paragraphs" inside limits you set.

**Draft vs publish validation** (`src/validate.ts`) — an important rule discovered while building:

- `validateSectionContent(type, content, "draft")` — used on every autosave. Checks shape, character limits and list maximums, but **tolerates blank required fields**, because a section the client just added is empty by definition and they save constantly as they type.
- `validateSectionContent(type, content, "publish")` — the gate. Additionally enforces `required` fields and list minimums, because that is the moment content goes live.

Unknown section types are always rejected, and keys the registry no longer defines are silently stripped, so removing a field from a section type cannot leave stale data behind.

Registered types (v1): `hero`, `textBlock`, `features`, `productGrid`, `gallery`, `testimonials`, `faq`, `cta`, `contact`. Original sketch of the field shapes:

| Type | Fields |
|---|---|
| `hero` | heading, subheading?, backgroundImage?, buttons: list({label, href, variant}, max 3) |
| `textBlock` | heading?, paragraphs: list(richtext) |
| `features` | heading?, items: list({icon?, title, description}) |
| `gallery` | heading?, images: list({image, alt, caption?}) |
| `testimonials` | heading?, items: list({quote, author, role?, avatar?}) |
| `cta` | heading, subheading?, buttons: list({label, href, variant}, max 2) |
| `faq` | heading?, items: list({question, answer}) |
| `contact` | heading?, paragraphs?, showForm: boolean |

## API surface (`apps/api`)

Express + Mongoose, ESM TypeScript, run with `tsx` in dev. Auth = short-lived JWT access token in the `Authorization` header + a rotating refresh token in an httpOnly cookie scoped to `/api/auth`. Middleware: `requireAuth`, `requireAdmin`, `requireProjectAccess`, `validateBody(zodSchema)`, plus a central error handler that turns anything thrown into the standard envelope.

Before running it: copy `apps/api/.env.example` to `apps/api/.env` and fill in `MONGODB_URI` and the two JWT secrets. The app refuses to boot on invalid config rather than starting with a blank secret.

**Built and tested:**

- `GET /health`
- **Auth**: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Projects**: `GET /api/projects` (admins see all, clients only their own), `POST` (admin), `GET/PATCH/DELETE /api/projects/:projectId`, `POST /api/projects/:projectId/rotate-key`
- **Registry**: `GET /api/section-types` — serves `SECTION_REGISTRY` so the dashboard can build its forms

Security rules the tests pin down: login gives an identical message for a wrong password and an unknown email; `passwordHash` and `revalidateSecret` never appear in any response; a client cannot create a project or read one they are not assigned to; `allowedSectionTypes` is rejected unless every entry is a registered type.

**Pages** (Phase 2, built): `GET/POST /api/projects/:projectId/pages`, `PATCH /api/projects/:projectId/pages/reorder`, `GET/PATCH/DELETE /api/pages/:pageId`. A page titled "Home" automatically gets the empty slug, so it serves at `/`.

**Sections** — every one of these edits `draftSections` only, never what is live:
`POST /api/pages/:pageId/sections` (type must be registered *and* in the project's `allowedSectionTypes`; content starts as `defaultContent`), `PATCH /api/pages/:pageId/sections/:sectionId` (`name`, `visible`, `content` — validated in draft mode), `DELETE` the same path, and `PATCH /api/pages/:pageId/sections-reorder` with `{ ids }`.

**Publish**: `POST /api/pages/:pageId/publish` validates every draft section in **publish** mode, copies draft → live, stamps `publishedAt`, clears the dirty flag, then calls the project's `revalidateUrl` with `{ secret, paths }`. A webhook failure never fails the publish — the content is already live in the CMS — and the response carries a `revalidated: { attempted, ok, message }` the dashboard can show. `POST /api/pages/:pageId/discard-draft` copies live back over the draft. `POST /api/pages/:pageId/preview-token` mints a 30-minute token scoped to that one page.

**Public content API** (read-only, `x-api-key` header or `?key=`, published content only) — what client websites call:
- `GET /api/content/pages` → nav-ready list of published pages
- `GET /api/content/pages/:slug` → page with ordered, **visible** sections (`:slug` = `index` for the home page)
- `GET /api/content/home` → convenience for the root page
- `?preview=<token>` swaps in the draft, and is served `no-store`; everything else is `s-maxage=60, stale-while-revalidate=600`

Two mounting details worth remembering: the page router takes the broad `/api` prefix (its routes span both `/api/projects/:id/pages` and `/api/pages/:pageId`), so it attaches `requireAuth` **per route** rather than with `router.use` — a blanket guard there would have locked out the public content API. And `/api/content` is mounted before it for the same reason.

**Media** (Phase 4, built) — uploads go **browser → Cloudinary directly**, so a client's 8MB phone photo never passes through the API:

- `POST /api/projects/:projectId/media/sign` → a one-shot upload ticket (`timestamp`, `folder`, `signature`, `uploadUrl`). The folder is scoped to the project, so one client's upload cannot land in another's library. The API secret never leaves the server.
- `POST /api/projects/:projectId/media` → register what Cloudinary accepted. Rejects a `publicId` outside this project's folder, and is idempotent so a retried registration does not duplicate.
- `GET /api/projects/:projectId/media` → `{ items, uploadsEnabled }`
- `PATCH /api/media/:mediaId` (alt text) · `DELETE /api/media/:mediaId` (also destroys the Cloudinary asset; reports `removedFromStorage` honestly if storage did not confirm)

**Cloudinary is optional.** Without the three env vars the CMS runs normally, `uploadsEnabled` is `false`, the sign endpoint returns a plain-English explanation, and the dashboard shows the client what is missing instead of a broken upload button. Signing is implemented directly with `node:crypto` in `lib/cloudinary.ts` (sorted `k=v&k=v` + secret, SHA-1) — no SDK dependency.

## Admin dashboard (`apps/admin`)

**Status: built and wired to the live API.** All mock data is gone. Only the media library is still a placeholder, pending Phase 4.

Stack: Next.js App Router + Tailwind CSS v4 + TypeScript. No UI, state or data-fetching libraries — the store is one React context and drag reordering is native HTML5. Must feel effortless for non-technical clients.

Where things live:

| Path | What it is |
|---|---|
| `app/globals.css` | **All design tokens** (`@theme`): colours, type scale, motion. Never hand-pick a colour — add it here. |
| `components/ui.tsx` | Button/Input/Chip/Card/Modal/Toggle/Grip primitives, straight from the design's parts sheet. |
| `components/editor/field-renderer.tsx` | Walks a **registry field definition** and renders the right control. Knows nothing about Heroes or Product grids. Adding a section type must never require editing this file. |
| `components/editor/section-list.tsx` | Left rail of the editor — section cards, drag, show/hide, delete. |
| `components/app-chrome.tsx` | Section picker, add-page and confirm modals, plus the toast. |
| `lib/api.ts` | The only place that talks to the API. Bearer token, auto-refresh-and-retry on 401. |
| `lib/auth.tsx` | Session: sign in/out, and restoring a session from the refresh cookie on reload. |
| `lib/store.tsx` | All dashboard state, backed by real API calls. |
| `lib/dto.ts` | Type-only re-exports from `@pagecraft/shared`, plus small display helpers. |
| `lib/media.tsx` | Library state, direct-to-Cloudinary uploads with progress, and the promise-based `pick()` that image/file fields await. |
| `components/media-picker.tsx` | The modal `pick()` opens. |
| `app/(app)/foundation` | Live style guide — palette, type, parts, skeletons, phone layouts. Keep it current. |

Routes: `/` (login) → `/projects` → `/projects/[projectId]/pages` → `/projects/[projectId]/pages/[pageId]` (editor) → `/projects/[projectId]/media` → `/projects/[projectId]/settings` → `/foundation`.

### Three things worth knowing before changing this code

**The forms build themselves.** The dashboard fetches `/api/section-types` and renders whatever field definitions come back. There is no hard-coded knowledge of any section type anywhere in `apps/admin`. Add a type to `packages/shared/src/registry.ts`, tick it on for a project, and its editing form appears.

**Nothing from `@pagecraft/shared` reaches the browser.** `lib/dto.ts` re-exports types only, and `blankListItem` is deliberately reimplemented there rather than imported — importing the real one would pull Zod into the bundle for validation the server already does. If you add a runtime import from that package, check the bundle size.

**Content saves on a 600ms debounce.** Typing updates local React state instantly and reaches the API shortly after; `saveSeq` in the store drops a slow response that a newer keystroke has already superseded. Publish flushes the pending save first, so the last thing typed always goes live.

### Running the whole thing locally

Two terminals, from the repo root:

1. `npm run dev:api` — API on :4000 (needs `apps/api/.env`; run `npm run seed` once to create your account and a demo website)
2. `npm run dev:admin` — dashboard on :3000 (copy `apps/admin/.env.example` to `.env.local` if your API is not on :4000)

CORS and the refresh cookie are already configured for this pair; `ADMIN_ORIGIN` in the API's `.env` must match the dashboard's origin.

Screens: Login → Projects (clients land straight in theirs) → **Pages** (drag-reorder, add with auto-slug, delete w/ confirm, draft/published chips) → **Page editor** (left: section cards titled by the client-entered section `name` — falling back to the type label — drag-reorder, show/hide, delete, "+ Add section" limited to `allowedSectionTypes`; right: form auto-generated from the registry, with a "Section name (for your reference)" field at the top of every section form — repeatable rows for list fields, image picker backed by media library + Cloudinary upload; top: Preview / **Publish** / Discard draft) → **Media library** → **Settings** (admin-only: API key, revalidate URL/secret, enabled section types, client users).

Drafts autosave (debounced). Publish is the single action that pushes content live.

## SDK (`packages/sdk`) & site integration — BUILT

What a client website installs. Two entry points so a non-React site never pulls in React:

- **`@pagecraft/sdk`** — `createCmsClient({ apiKey, baseUrl, fetchOptions })` → `getPages()`, `getPage(slug)`, `getHome()`, `getPreview(slug, token)`. Framework-agnostic: `fetchOptions` passes straight through to `fetch`, so Next hands it `{ cache: "force-cache" }` and a Vite site hands it nothing. Errors surface as `CmsError` with a status (`0` = unreachable, `404` = no such page) so a site can decide what to do.
- **`@pagecraft/sdk`** also exports the image helpers — `cmsImageUrl`, `cmsSrcSet`, `imageProps` — which rewrite a Cloudinary URL to ask for a resized, modern-format copy. And `checkRevalidateRequest(body, secret)`, which validates the publish webhook with a constant-time secret comparison and strips path traversal.
- **`@pagecraft/sdk/react`** — `<SectionRenderer sections components fallback />`. You map section types to your own components; a type with no component renders nothing rather than crashing a live page.

### The website recipe (see `examples/demo-site`)

1. `lib/cms.ts` — one client, `fetchOptions: { cache: "force-cache" }`.
2. `app/[[...slug]]/page.tsx` — a catch-all with `dynamic = "force-static"` and `generateStaticParams()` from `getPages()`, rendering `<SectionRenderer>`. **Pages the client adds after the build still work**: Next generates them on first request, so a new page needs no deploy.
3. `app/api/revalidate/route.ts` — about fifteen lines: `checkRevalidateRequest`, then `revalidatePath` for each path plus `revalidatePath("/", "layout")` so the navigation refreshes too.
4. `components/sections/index.tsx` — **your design, in code**. One component per section type. Nothing about layout, colour or spacing ever comes from the CMS.

A CMS outage must not fail a deploy: the demo's page catches `CmsError` with status `0`, warns in the build log and renders a holding page that regenerates on the next publish. Any other error (bad key, 500) still fails the build, because that is a real misconfiguration.

**Plain React (Vite) recipe**: same client, no `fetchOptions`; fetch at runtime and let the CDN cache headers do the work. Edits appear on the next page load instead of instantly.

## Build roadmap

1. **Foundation** — ✅ **DONE.** Monorepo scaffolding, `packages/shared` (registry + Zod validation), API skeleton, Mongo connection, JWT auth, project CRUD, section-types endpoint, 33 passing tests. *Milestone met: login + create project via REST.*
2. **Content engine** — ✅ **DONE.** Page and section CRUD with registry validation, draft/publish separation, revalidate webhook, preview tokens, public content API. *Milestone met: full content lifecycle via REST.*
3. **Admin dashboard** — ✅ **DONE.** Every screen wired to the live API: real login and session, registry-driven forms, autosave, publish with per-field errors, preview tokens. *Milestone met: a non-technical user can build and publish a page.*
4. **Media** — ✅ **DONE.** Cloudinary signed uploads (direct from the browser), per-project library with alt text and delete, a picker modal wired into the `image` and `file` fields, and URL-based thumbnails.
5. **SDK + demo site** — ✅ **DONE.** SDK with client, image helpers, webhook validator and `SectionRenderer`; a full demo Next.js site with nine section components. *Milestone met and verified: edit in CMS → live page updates automatically.*
6. **Polish** — ⬅ **NEXT.** Client invites (creating client users is still seed/DB-only), rate limiting on the public content API, SEO fields surfaced in the dashboard, and the deployment run-through. Preview tokens and key rotation are already done.

## Deployment (note: Vercel Hobby forbids commercial use — client work is commercial)

- **CMS backend (Express)**: **Render** (decided) always-on Node service at `api.<domain>` (free instance sleeps after idle — fine for dev; use the ~$7/mo Starter once real clients are live so dashboards/publish webhooks don't hit cold starts). Railway is the equivalent alternative. Not Vercel serverless — a CMS API wants a persistent server + pooled Mongo connection.
- **CMS dashboard (Next.js)**: **Cloudflare Pages** (decided) at `admin.<domain>` — free, commercial use allowed, unlimited bandwidth. Root directory `apps/admin`. Because the dashboard is Next.js rather than a plain static bundle, deploy it through `@opennextjs/cloudflare` (Cloudflare's Next.js adapter) — the ISR caveats that rule Cloudflare out for *client sites* don't apply here, since the dashboard is entirely client-rendered behind a login and fetches everything from the API at runtime.
- **Client websites (Next.js, need ISR + on-demand revalidation)**: Netlify free tier to start; move to a single Vercel Pro account ($20/mo flat, unlimited projects) as client count grows. Avoid Vercel Hobby (non-commercial only) and Cloudflare Pages (ISR caveats). Self-hosted `next start` on Render/VPS also fully supports ISR.
- **Data**: MongoDB Atlas M0 (free, 512 MB — content JSON is tiny; no media in Mongo) + Cloudinary free tier (media originals + CDN + URL transforms).
- Same monorepo deploys everywhere: each platform points at its app's root directory (`apps/api`, `apps/admin`).

## Conventions

- TypeScript strict; no `any` at module boundaries
- Zod validates every request body and all section content against the registry
- Responses: `{ success: true, data }` / `{ success: false, error }`
- Secrets via `.env` (never committed); keep `.env.example` current
- Public API must never leak drafts, other projects' data, or Cloudinary secrets
