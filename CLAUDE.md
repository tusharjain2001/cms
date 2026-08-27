# CLAUDE.md — Custom Headless CMS

## What this project is

A headless CMS for websites built in React/Next.js. Whoever owns a site gets an easy admin dashboard to manage **content only** — pages, sections, headings, paragraphs, buttons, images — while all design, components, routing, and functionality stay in the developer's React code. This replaces the need to build client sites on WordPress/Squarespace just so clients can self-edit.

**This is a public, multi-tenant product, not a single developer's private tool.** Anyone can create an account at the CMS's own domain, confirm their email and start building. That decision is load-bearing and shapes everything below:

- **Nothing about a user grants power over anyone else's content.** Access is a relationship between one user and one website — see the roles note under Data model. A signup is nobody's administrator.
- Every endpoint reachable while signed out is rate limited, and none of them reveal whether a given email address has an account here.
- `isPlatformAdmin` — whoever operates the instance — is granted by the seed script alone and is the single exception to tenant isolation.

One instance serves many websites: each site is a **project** with its own API key, owned by the account that created it.

**Status**: Phases 1–6 are built and verified end to end. The whole promise works: someone signs up, builds their content, presses Publish, and their live static website updates itself within seconds — nobody involved, no rebuild triggered by hand.

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
| `npm test` | 141 tests: registry/validation (15), API integration against a real in-memory MongoDB (105 — including self-service accounts and a contract test that walks the dashboard's exact request sequence), and SDK (21) |
| `npm run build` | Builds shared → sdk → api → admin |
| `npm run build:demo` | Builds the example website (needs `examples/demo-site/.env.local` and a reachable CMS) |
| `npm run dev:demo` | Runs the example website on :3200 |
| `npm run typecheck` | Type-checks every workspace |
| `npm run seed` | Creates the first developer account and a demo website |

## Data model (MongoDB)

- **users**: `{ email, passwordHash, name, emailVerifiedAt, isPlatformAdmin, projectIds, sessionVersion }`. `emailVerifiedAt` is null until the emailed link is clicked, and sign-in is refused until it is set. `projectIds` lists websites this user was *invited* to; ones they **own** are not in it. `sessionVersion` is bumped on every password change and is carried in both token kinds, so a reset logs every other device out at once.
- **auth_tokens**: `{ userId, kind: 'verify' | 'reset' | 'invite', tokenHash, projectId?, expiresAt, usedAt }` — the one-shot links sent by email. Deliberately **not** JWTs: a reset link that still works after it has been used is how accounts get stolen, and a database row can be burned the moment it is spent. Only a SHA-256 of the token is stored. A TTL index sweeps expired rows.

**Roles are per website, not per person** (`ProjectRole = 'owner' | 'editor'`). This is the rule the whole authorization model rests on:

- `owner` — created the website. Alone controls its settings, API key, revalidate webhook, enabled section types, who else has access, and deleting it.
- `editor` — was added to someone else's website. Edits and publishes content, nothing more. Enforced everywhere, but **nothing currently creates this relationship** — see the note under the roadmap. In practice today, everyone is an `owner`.
- The same account can own one website and merely edit another, which is exactly why this never lives on the user record. `ProjectDTO.role` carries the viewer's relationship to that one website, and the dashboard gates on it.

An earlier version had `role: 'admin' | 'client'` on the user, where `admin` meant "sees every project in the database". That was safe only while the sole admin was the developer who owned the server. It could not survive open signup and was replaced.
- **projects** (one per website): `{ ownerId, name, slug, apiKey, revalidateUrl?, revalidateSecret?, allowedSectionTypes: string[], createdAt }`. `ownerId` is what every access decision hangs off. `allowedSectionTypes` limits a site to the section types the developer actually built for it. **`slug` is unique per owner, not globally** — two unrelated developers must both be able to call a website "portfolio", and a shared namespace would leak that someone else had taken the name.
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

Express + Mongoose, ESM TypeScript, run with `tsx` in dev. Auth = short-lived JWT access token in the `Authorization` header + a rotating refresh token in an httpOnly cookie scoped to `/api/auth`. Both carry `sv`, the account's session version, checked on every request. Middleware: `requireAuth`, `requireVerified`, `requireProjectAccess`, `requireProjectOwner`, `validateBody(zodSchema)`, `rateLimit({...})`, plus a central error handler that turns anything thrown into the standard envelope.

Before running it: copy `apps/api/.env.example` to `apps/api/.env` and fill in `MONGODB_URI`, the two JWT secrets, and the SMTP settings. The app refuses to boot on invalid config rather than starting with a blank secret.

**Built and tested:**

- `GET /health`
- **Accounts** (public): `POST /api/auth/signup`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- **Session**: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`, `DELETE /api/auth/me`
- **Projects**: `GET /api/projects` (what you own plus what you were invited to — nothing else), `POST` (any confirmed account; you own what you create), `GET/PATCH/DELETE /api/projects/:projectId`, `POST /api/projects/:projectId/rotate-key` (the last three owner-only)
- **Registry**: `GET /api/section-types` — serves `SECTION_REGISTRY` so the dashboard can build its forms

**Rules the tests pin down** — the ones about signed-out endpoints are the reason those endpoints look repetitive, so do not "simplify" them:

- Signup answers a **taken address byte-for-byte identically** to a new one; `forgot-password` and `resend-verification` do the same for an address with no account. Anything else makes these endpoints a way to discover who has an account here. The real owner of a reused address is told by email instead.
- Login checks the password **before** mentioning verification, for the same reason. Only a correct password earns the `email_not_verified` code.
- Verification and reset links are single-use, and issuing a new one invalidates the old.
- `forgot-password` refuses an **unconfirmed** account — otherwise signing up with an address you do not own, then "resetting" it, is account takeover.
- A password reset bumps `sessionVersion`, so every other device is signed out immediately rather than when its token expires.
- Login/reset/resend are rate limited per IP **and** email together, so one person on a shared office IP cannot lock out their colleagues.
- Deleting your account is refused while you still own a website — a live site is reading from it.
- `passwordHash` and `revalidateSecret` never appear in any response; two accounts cannot see each other's websites, media or pages; `allowedSectionTypes` is rejected unless every entry is a registered type.

**Email** is plain SMTP via nodemailer (`lib/mailer.ts`), so any ordinary mailbox works — no provider SDK, no lock-in. It is **optional the way Cloudinary is**: without it the CMS boots and everything else works, signup refuses honestly with `email_not_configured`, and outside production the link is printed to the server log so you can click through your own flow locally. `captureMail()` is the test seam. Templates are inline-styled plain HTML on purpose — email clients strip stylesheets.

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

**Status: built and wired to the live API.** All mock data is gone.

Stack: Next.js App Router + Tailwind CSS v4 + TypeScript. No UI, state or data-fetching libraries — the store is one React context and drag reordering is native HTML5. Must feel effortless for non-technical clients.

Where things live:

| Path | What it is |
|---|---|
| `app/globals.css` | **All design tokens** (`@theme`): colours, type scale, motion. Never hand-pick a colour — add it here. |
| `components/ui.tsx` | Button/Input/Chip/Card/Modal/Toggle/Grip primitives, straight from the design's parts sheet. |
| `components/editor/field-renderer.tsx` | Walks a **registry field definition** and renders the right control. Knows nothing about Heroes or Product grids. Adding a section type must never require editing this file. |
| `components/editor/section-list.tsx` | Left rail of the editor — section cards, drag, show/hide, delete. |
| `components/app-chrome.tsx` | Section picker, add-page and confirm modals, plus the toast. |
| `components/auth-shell.tsx` | The card every signed-out screen sits in, so the four of them cannot drift apart. |
| `lib/api.ts` | The only place that talks to the API. Bearer token, auto-refresh-and-retry on 401. `ApiError.code` carries the machine-readable reason where the UI must branch rather than just display. |
| `lib/auth.tsx` | Session: sign up, confirm, sign in/out, forgotten passwords, and restoring a session from the refresh cookie on reload. |
| `lib/store.tsx` | All dashboard state, backed by real API calls. |
| `lib/dto.ts` | Type-only re-exports from `@pagecraft/shared`, plus small display helpers. |
| `lib/media.tsx` | Library state, direct-to-Cloudinary uploads with progress, and the promise-based `pick()` that image/file fields await. |
| `components/media-picker.tsx` | The modal `pick()` opens. |
| `app/(app)/foundation` | Live style guide — palette, type, parts, skeletons, phone layouts. Keep it current. |

Routes — signed out: `/` (sign in) · `/signup` · `/verify-email?token=` · `/forgot-password` · `/reset-password?token=`. Signed in: `/projects` → `/projects/[projectId]/pages` → `/projects/[projectId]/pages/[pageId]` (editor) → `/projects/[projectId]/media` → `/projects/[projectId]/settings` → `/foundation`.

**Owner-only UI is gated on `project.role`, never on the user.** Website settings appear when `s.project?.role === "owner"`. There is no such thing as a globally privileged user in the dashboard.

### Four things worth knowing before changing this code

**The forms build themselves.** The dashboard fetches `/api/section-types` and renders whatever field definitions come back. There is no hard-coded knowledge of any section type anywhere in `apps/admin`. Add a type to `packages/shared/src/registry.ts`, tick it on for a project, and its editing form appears.

**Nothing from `@pagecraft/shared` reaches the browser.** `lib/dto.ts` re-exports types only, and `blankListItem` is deliberately reimplemented there rather than imported — importing the real one would pull Zod into the bundle for validation the server already does. If you add a runtime import from that package, check the bundle size.

**Content saves on a 600ms debounce.** Typing updates local React state instantly and reaches the API shortly after; `saveSeq` in the store drops a slow response that a newer keystroke has already superseded. Publish flushes the pending save first, so the last thing typed always goes live.

**The signed-out screens must not leak who has an account.** The API answers a taken address exactly as it answers a new one; `/signup` and `/forgot-password` show the same "check your email" panel either way, and must keep doing so. `/verify-email` guards against React's double-invoked effects with a ref, because a one-shot token would otherwise be spent by the first run and reported as broken by the second.

### Running the whole thing locally

Two terminals, from the repo root:

1. `npm run dev:api` — API on :4000 (needs `apps/api/.env`; run `npm run seed` once to create your platform-admin account and a demo website)
2. `npm run dev:admin` — dashboard on :3000 (copy `apps/admin/.env.example` to `.env.local` if your API is not on :4000)

CORS and the refresh cookie are already configured for this pair; `ADMIN_ORIGIN` in the API's `.env` must match the dashboard's origin. Without SMTP set, signing up is refused — but the seeded account signs in normally, and any verification link the CMS would have emailed is printed to the API's log.

Screens: Sign up → confirm email → Sign in → Projects (someone invited to exactly one website lands straight in it; owners stay on the list) → **Pages** (drag-reorder, add with auto-slug, delete w/ confirm, draft/published chips) → **Page editor** (left: section cards titled by the client-entered section `name` — falling back to the type label — drag-reorder, show/hide, delete, "+ Add section" limited to `allowedSectionTypes`; right: form auto-generated from the registry, with a "Section name (for your reference)" field at the top of every section form — repeatable rows for list fields, image picker backed by media library + Cloudinary upload; top: Preview / **Publish** / Discard draft) → **Media library** → **Settings** (owner-only: API key, revalidate URL/secret, enabled section types, who else has access).

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
6. **Open signup** — ✅ **DONE.** The pivot from "one developer's private tool" to a product anyone can use: per-website ownership replacing global roles, self-service signup with emailed confirmation, forgotten-password rescue, session invalidation on password change, SMTP mail, and rate limiting on every signed-out endpoint. *Milestone met: a stranger creates an account, confirms it, builds a website, and sees nobody else's.*
7. **Launch** — ⬅ **NEXT.**
   - Rate limiting on the **public content API** (the signed-out auth routes are already covered).
   - Per-account limits — a public signup form with no cap on websites is an open-ended bill on the Atlas and Render tiers below.
   - SEO fields surfaced in the dashboard, and the deployment run-through.

**One account per website, shared by hand — decided, do not rebuild.** There is deliberately no invite flow. Whoever owns a website shares those sign-in details with the other party directly. `ProjectRole` and `user.projectIds` still model an `editor` who was added to someone else's website, and `requireProjectAccess` honours it, so the model does not need changing if invites are ever wanted — but nothing currently creates that relationship, and `AuthToken.kind: "invite"` plus `sendProjectInviteEmail` are unused scaffolding.

Two consequences of sharing one account that follow from the auth design above, and should be explained rather than engineered around:

- A password reset bumps `sessionVersion`, so it signs **both** parties out. Whoever resets must pass on the new password.
- "Forgot password" emails whichever inbox owns the address, so only that person can complete a reset.

## Deployment (note: Vercel Hobby forbids commercial use — client work is commercial)

- **CMS backend (Express)**: **Render** (decided) always-on Node service at `api.<domain>` (free instance sleeps after idle — fine for dev; use the ~$7/mo Starter once real clients are live so dashboards/publish webhooks don't hit cold starts). Railway is the equivalent alternative. Not Vercel serverless — a CMS API wants a persistent server + pooled Mongo connection.
- **CMS dashboard (Next.js)**: **Cloudflare Pages** (decided) at `admin.<domain>` — free, commercial use allowed, unlimited bandwidth. Root directory `apps/admin`. Because the dashboard is Next.js rather than a plain static bundle, deploy it through `@opennextjs/cloudflare` (Cloudflare's Next.js adapter) — the ISR caveats that rule Cloudflare out for *client sites* don't apply here, since the dashboard is entirely client-rendered behind a login and fetches everything from the API at runtime.
- **Client websites (Next.js, need ISR + on-demand revalidation)**: Netlify free tier to start; move to a single Vercel Pro account ($20/mo flat, unlimited projects) as client count grows. Avoid Vercel Hobby (non-commercial only) and Cloudflare Pages (ISR caveats). Self-hosted `next start` on Render/VPS also fully supports ISR.
- **Data**: MongoDB Atlas M0 (free, 512 MB — content JSON is tiny; no media in Mongo) + Cloudinary free tier (media originals + CDN + URL transforms).
- **Email**: any SMTP mailbox on the CMS's own domain. Zoho Mail's free plan is the tidiest fit; Gmail needs an App Password and has low daily limits. Set `MAIL_FROM` to an address at a domain you control and publish SPF and DKIM records for it — without them, confirmation links go straight to spam and nobody can finish signing up. Since the whole product now depends on delivering that one email, treat it as infrastructure, not a nicety.
- **`APP_URL`** must be the dashboard's public address (`https://admin.<domain>`), because every emailed link is built from it. Getting this wrong sends new users to localhost.
- Same monorepo deploys everywhere: each platform points at its app's root directory (`apps/api`, `apps/admin`).
- Rate limiting is in-memory and therefore **per instance**. That is right for one always-on Render service; if this ever scales to several instances, `middleware/rate-limit.ts` is the only piece that needs Redis — nothing else in the API keeps state.

## Conventions

- TypeScript strict; no `any` at module boundaries
- Zod validates every request body and all section content against the registry
- Responses: `{ success: true, data }` / `{ success: false, error }`
- Secrets via `.env` (never committed); keep `.env.example` current
- Public API must never leak drafts, other projects' data, or Cloudinary secrets
- **Authorization is always a lookup, never a property of the user.** Ask "what is this account's relationship to this website?" — never "is this user an admin?" The one exception is `isPlatformAdmin`, granted by seeding alone.
- **Signed-out endpoints must not reveal which email addresses have accounts.** Identical answers for known and unknown addresses, every time.
