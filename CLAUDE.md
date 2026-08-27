# CLAUDE.md — Custom Headless CMS

## What this project is

A self-hosted headless CMS built by a freelance developer for the client websites they develop in React/Next.js. Clients get an easy admin dashboard to manage **content only** — pages, sections, headings, paragraphs, buttons, images — while all design, components, routing, and functionality stay in the developer's React code. This replaces the need to build client sites on WordPress/Squarespace just so clients can self-edit.

One CMS instance serves many client websites: each site is a **project** with its own API key.

**Status**: blueprint only — no code written yet. Implement in the phases listed at the bottom.

## Core concept

1. Content is stored as structured JSON: a **page** is a list of **sections**; each section has a `type` and a `content` object.
2. The developer builds a React component per section type (Hero, Features, CTA, ...). Clients can add/remove/reorder/fill sections but can never invent new designs — that keeps design quality in the developer's hands.
3. When a client hits **Publish**, the CMS fires the site's revalidate webhook so the live Next.js site regenerates that page within seconds — static-speed pages, automatic updates, zero developer involvement.

## Confirmed tech decisions (do not re-ask)

- **TypeScript everywhere**, strict mode
- **Express + Mongoose + MongoDB Atlas** for the API
- **React (Vite)** for the admin dashboard
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
│   ├── api/                # Express + TS + Mongoose REST API
│   └── admin/              # React (Vite) + TS admin dashboard
├── packages/
│   ├── shared/             # section registry, Zod schemas, shared TS types
│   └── sdk/                # tiny package client websites install
└── examples/
    └── demo-site/          # Next.js site proving the end-to-end flow
```

## Data model (MongoDB)

- **users**: `{ email, passwordHash, role: 'admin' | 'client', projectIds }` — `admin` is the developer (all projects); `client` is scoped to their project(s).
- **projects** (one per client website): `{ name, slug, apiKey, revalidateUrl?, revalidateSecret?, allowedSectionTypes: string[], createdAt }`. `allowedSectionTypes` limits a site to the section types the developer actually built for it.
- **pages**: `{ projectId, slug, title, order, seo: { metaTitle?, metaDescription?, ogImage? }, sections: Section[], draftSections: Section[], status: 'draft' | 'published', updatedAt, publishedAt }`. `draftSections` is the editing copy; **publish copies draft → sections**. The public API serves only `sections`.
- **Section** (embedded): `{ id: uuid, type, name?, order, visible, content: Record<string, unknown> }`. Stored as Mongoose `Mixed`; Zod (via the registry) is the real validator. `name` is an optional client-entered nickname ("Main Banner", "Why Choose Us") shown on the section card in the admin section list to identify sections at a glance — it is never rendered on the website (falls back to the type's label when blank).
- **media**: `{ projectId, cloudinaryPublicId, url, width, height, format, bytes, alt?, createdAt }` — per-project reusable library.

## Section type registry (heart of the system)

Lives in `packages/shared`: a map of section type → field definition, consumed by BOTH the API (validation) and the admin (auto-generated forms). Adding a new section type = one file edit.

Field primitives: `text`, `richtext`, `image`, `link`, `boolean`, `select`, `list(of, min?, max?)` (repeatable groups — this is how clients control "how many buttons/paragraphs").

v1 section types:

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

Structure: `routes/ → controllers/ → services/ → models/`. Auth = JWT access token + httpOnly refresh cookie. Middleware: `requireAuth`, `requireAdmin`, `requireProjectAccess`.

- **Auth**: `POST /api/auth/login | refresh | logout`
- **Projects** (admin): CRUD on `/api/projects`, plus `POST /api/projects/:id/rotate-key`
- **Pages**: CRUD under `/api/projects/:id/pages` and `/api/pages/:pageId`, `PATCH .../pages/reorder`
- **Sections** (edit `draftSections` only): add / patch content (registry-validated) / delete / reorder under `/api/pages/:pageId/sections`
- **Publish**: `POST /api/pages/:pageId/publish` → copy draft→live, set `publishedAt`, `POST` the project's `revalidateUrl` with `{ secret, paths }`; also `POST .../discard-draft`
- **Media**: `POST /api/projects/:id/media/sign` (signed Cloudinary params — secret never reaches the browser), list/delete library
- **Registry**: `GET /api/section-types` (drives admin forms)
- **Public content API** (read-only, `x-api-key`, published content only):
  - `GET /api/content/pages` → `[{ slug, title, order, seo }]` (nav-ready)
  - `GET /api/content/pages/:slug` → page with ordered, visible sections
  - `?preview=1&token=...` → draft content for preview
  - `Cache-Control: s-maxage=60, stale-while-revalidate`

## Admin dashboard (`apps/admin`)

Stack: React Router, TanStack Query, react-hook-form + Zod resolver, dnd-kit, Tailwind. Must feel effortless for non-technical clients.

Screens: Login → Projects (clients land straight in theirs) → **Pages** (drag-reorder, add with auto-slug, delete w/ confirm, draft/published chips) → **Page editor** (left: section cards titled by the client-entered section `name` — falling back to the type label — drag-reorder, show/hide, delete, "+ Add section" limited to `allowedSectionTypes`; right: form auto-generated from the registry, with a "Section name (for your reference)" field at the top of every section form — repeatable rows for list fields, image picker backed by media library + Cloudinary upload; top: Preview / **Publish** / Discard draft) → **Media library** → **Settings** (admin-only: API key, revalidate URL/secret, enabled section types, client users).

Drafts autosave (debounced). Publish is the single action that pushes content live.

## SDK (`packages/sdk`) & site integration

- `createCmsClient({ apiKey, baseUrl })` → `getPages()`, `getPage(slug)`, `getPreviewPage(slug, token)`; exports shared `Page`/`Section` types.
- `<SectionRenderer sections={page.sections} components={{ hero: Hero, cta: Cta, ... }} />` — developer maps type → their own components; unknown types render nothing.
- **Next.js recipe**: server components fetch via SDK with ISR; a small `app/api/revalidate/route.ts` checks the secret and calls `revalidatePath`. Optional catch-all `[slug]` route driven by `getPages()` lets clients control the page count; custom routes stay hand-built.
- **Plain React (Vite) recipe**: runtime fetch; CDN cache headers keep it fast; edits show on next load.

## Build roadmap

1. **Foundation** — monorepo scaffolding, `packages/shared` (registry + Zod), API skeleton, Mongo connection, auth, project CRUD. *Milestone: login + create project via REST.*
2. **Content engine** — page/section CRUD with registry validation, publish flow, public content API. *Milestone: full content lifecycle via REST.*
3. **Admin dashboard** — all screens except media. *Milestone: a non-technical user can build a page.*
4. **Media** — Cloudinary signed uploads, library, image fields wired in.
5. **SDK + demo site** — publish SDK, build `examples/demo-site`, wire revalidation end-to-end. *Milestone: edit in CMS → live Next.js page updates automatically.*
6. **Polish** — preview tokens, client invites, key rotation, rate limiting on the public API, deployment guides.

## Deployment (note: Vercel Hobby forbids commercial use — client work is commercial)

- **CMS backend (Express)**: **Render** (decided) always-on Node service at `api.<domain>` (free instance sleeps after idle — fine for dev; use the ~$7/mo Starter once real clients are live so dashboards/publish webhooks don't hit cold starts). Railway is the equivalent alternative. Not Vercel serverless — a CMS API wants a persistent server + pooled Mongo connection.
- **CMS dashboard (Vite static)**: **Cloudflare Pages** (decided) at `admin.<domain>` — free, commercial use allowed, unlimited bandwidth. Build command `vite build`, output `dist`, root directory `apps/admin`.
- **Client websites (Next.js, need ISR + on-demand revalidation)**: Netlify free tier to start; move to a single Vercel Pro account ($20/mo flat, unlimited projects) as client count grows. Avoid Vercel Hobby (non-commercial only) and Cloudflare Pages (ISR caveats). Self-hosted `next start` on Render/VPS also fully supports ISR.
- **Data**: MongoDB Atlas M0 (free, 512 MB — content JSON is tiny; no media in Mongo) + Cloudinary free tier (media originals + CDN + URL transforms).
- Same monorepo deploys everywhere: each platform points at its app's root directory (`apps/api`, `apps/admin`).

## Conventions

- TypeScript strict; no `any` at module boundaries
- Zod validates every request body and all section content against the registry
- Responses: `{ success: true, data }` / `{ success: false, error }`
- Secrets via `.env` (never committed); keep `.env.example` current
- Public API must never leak drafts, other projects' data, or Cloudinary secrets
