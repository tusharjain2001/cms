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

- **This repo contains the CMS and nothing else.** Client websites are built in their own separate folders and repos — never here, not even as an example. A demo site once lived in `examples/` and was deliberately deleted. Do not scaffold, re-add, or "just for testing" create a client website inside this repo; the recipe for building one lives under "The website recipe" below, and that is where it stays.
- **One Next.js app serves both the public landing page and the dashboard** (`apps/admin`). There is no separate marketing site; that was tried and removed.
- **TypeScript everywhere**, strict mode
- **Express + Mongoose + MongoDB Atlas** for the API
- **Next.js (App Router) + Tailwind CSS v4** for the admin dashboard
- **Cloudflare R2** for media (S3-compatible presigned uploads; CDN delivery via an R2 custom domain + URL-based Image Transformations). Replaced Cloudinary in Phase 7; media stored under the old backbone keeps its Cloudinary URL and still renders.
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
│   └── admin/              # Next.js: landing page + admin dashboard    (BUILT, live API)
└── packages/
    ├── shared/             # section registry, Zod schemas, wire types (BUILT)
    ├── sdk/                # tiny package client websites install      (BUILT)
    └── mcp/                # MCP server: the API as AI-assistant tools (BUILT)
```

`packages/shared` is a **build-first** package: it compiles to `dist/` and both other packages consume its types through a TypeScript project reference. Any script that touches it runs `npm run shared` first — that is why the root scripts are chained rather than using `--workspaces` alone.

**Always run npm from the repo root, never from inside a workspace folder.** Running `npm install` inside `apps/admin` makes npm treat it as a standalone project and write it a private `package-lock.json`; Next then finds two lockfiles, cannot tell which marks the project root, and warns that it guessed. There must be exactly one lockfile, at the root. To add a package to one workspace, use `npm install <pkg> --workspace @pagecraft/admin` **from the root**. If the warning reappears, delete the stray lockfile rather than setting `outputFileTracingRoot` — that only silences the symptom and leaves two lockfiles drifting apart.

### Commands (run from the repo root)

| Command | What it does |
|---|---|
| `npm install` | Installs everything and builds `packages/shared` via its `prepare` script |
| **`npm run dev`** | **The usual one.** Rebuilds shared, then runs the API (:4000) and the dashboard (:3000) together, output prefixed `[api]` / `[admin]` |
| `npm run dev:api` | Just the API on :4000, with watch |
| `npm run dev:admin` | Just the dashboard on :3000 |
| `npm test` | 339 tests: registry/validation (15), API integration against a real in-memory MongoDB (170 — including self-service accounts, the per-website billing ladder against a stubbed Dodo Payments, draft-vs-live search settings, and a contract test that walks the dashboard's exact request sequence), SDK (75, of which 32 cover the SEO helpers) and MCP server (79, against a stub API — no live keys) |
| `npm run build` | Builds shared → sdk → mcp → api → admin |
| `npm run typecheck` | Type-checks every workspace |
| `npm run seed` | Creates the first developer account and a demo website |

## Data model (MongoDB)

- **users**: `{ email, passwordHash, name, emailVerifiedAt, isPlatformAdmin, projectIds, plan, subscription, sessionVersion }`. `subscription` mirrors the live provider subscription — `{ status, websites, period, providerSubscriptionId, currentPeriodEnd, cancelAtPeriodEnd, lastEventAt }` — named for the role, not the vendor, since they held Razorpay ids before Dodo — and `subscription.websites` is the quantity paid for, which `websiteAllowance()` turns into the ceiling on how many websites this account may own. It is mirrored rather than fetched because every page and website creation consults it, and a plan check that depended on a third party's uptime would take the CMS down with them. `emailVerifiedAt` is null until the emailed link is clicked, and sign-in is refused until it is set. `projectIds` lists websites this user was *invited* to; ones they **own** are not in it. `sessionVersion` is bumped on every password change and is carried in both token kinds, so a reset logs every other device out at once.
- **auth_tokens**: `{ userId, kind: 'verify' | 'reset' | 'invite', tokenHash, projectId?, expiresAt, usedAt }` — the one-shot links sent by email. Deliberately **not** JWTs: a reset link that still works after it has been used is how accounts get stolen, and a database row can be burned the moment it is spent. Only a SHA-256 of the token is stored. A TTL index sweeps expired rows.

**Roles are per website, not per person** (`ProjectRole = 'owner' | 'editor'`). This is the rule the whole authorization model rests on:

- `owner` — created the website. Alone controls its settings, API key, revalidate webhook, enabled section types, who else has access, and deleting it.
- `editor` — was added to someone else's website. Edits and publishes content, nothing more. Enforced everywhere, but **nothing currently creates this relationship** — see the note under the roadmap. In practice today, everyone is an `owner`.
- The same account can own one website and merely edit another, which is exactly why this never lives on the user record. `ProjectDTO.role` carries the viewer's relationship to that one website, and the dashboard gates on it.

An earlier version had `role: 'admin' | 'client'` on the user, where `admin` meant "sees every project in the database". That was safe only while the sole admin was the developer who owned the server. It could not survive open signup and was replaced.
- **projects** (one per website): `{ ownerId, name, slug, apiKey, revalidateUrl?, revalidateSecret?, allowedSectionTypes: string[], createdAt }`. `ownerId` is what every access decision hangs off. `allowedSectionTypes` limits a site to the section types the developer actually built for it. **`slug` is unique per owner, not globally** — two unrelated developers must both be able to call a website "portfolio", and a shared namespace would leak that someone else had taken the name.
- **pages**: `{ projectId, slug, title, order, seo, draftSeo?, sections: Section[], draftSections: Section[], status: 'draft' | 'published', updatedAt, publishedAt }`. `draftSections` is the editing copy; **publish copies draft → sections**. The public API serves only `sections`.
- **The SEO block is draft/live separated too**, for the same reason sections are — "nothing is visible until you press Publish" cannot have an exception. `seo` is live and `draftSeo` is what the dashboard edits: `{ metaTitle?, metaDescription?, ogImage?, canonicalUrl?, noIndex? }`. Publish copies draft → live, discard copies live → draft, and a preview token serves the draft block so a preview does not show the live description. **`draftSeo` absent means "the same as live"**, not "empty" — every page written before search settings existed has none, and `draftSeoOf()` in `models/page.ts` is the single place that resolves it. Without that, adding the field would have blanked the meta title of every page already in the database on its next save.
- `canonicalUrl` must be absolute or empty (a relative canonical is silently ignored by every crawler, which is worse than a rejected one), and `noIndex` is *not* unpublishing — the page still serves, it is simply not listed.
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

**Email** is plain SMTP via nodemailer (`lib/mailer.ts`), so any ordinary mailbox works — no provider SDK, no lock-in. It is **optional the way R2 is**: without it the CMS boots and everything else works, signup refuses honestly with `email_not_configured`, and outside production the link is printed to the server log so you can click through your own flow locally. `captureMail()` is the test seam. Templates are inline-styled plain HTML on purpose — email clients strip stylesheets.

**Pages** (Phase 2, built): `GET/POST /api/projects/:projectId/pages`, `PATCH /api/projects/:projectId/pages/reorder`, `GET/PATCH/DELETE /api/pages/:pageId`. A page titled "Home" automatically gets the empty slug, so it serves at `/`.

**Sections** — every one of these edits `draftSections` only, never what is live:
`POST /api/pages/:pageId/sections` (type must be registered *and* in the project's `allowedSectionTypes`; content starts as `defaultContent`), `PATCH /api/pages/:pageId/sections/:sectionId` (`name`, `visible`, `content` — validated in draft mode), `DELETE` the same path, and `PATCH /api/pages/:pageId/sections-reorder` with `{ ids }`.

**Publish**: `POST /api/pages/:pageId/publish` validates every draft section in **publish** mode, copies draft → live, stamps `publishedAt`, clears the dirty flag, then calls the project's `revalidateUrl` with `{ secret, paths }`. A webhook failure never fails the publish — the content is already live in the CMS — and the response carries a `revalidated: { attempted, ok, message }` the dashboard can show. `POST /api/pages/:pageId/discard-draft` copies live back over the draft. `POST /api/pages/:pageId/preview-token` mints a 30-minute token scoped to that one page.

**Public content API** (read-only, `x-api-key` header or `?key=`, published content only) — what client websites call:
- `GET /api/content/pages` → nav-ready list of published pages, carrying each page's `seo` (including `noIndex`), `updatedAt` and `publishedAt` — one request is also everything a `sitemap.xml` needs
- `GET /api/content/pages/:slug` → page with ordered, **visible** sections (`:slug` = `index` for the home page)
- `GET /api/content/home` → convenience for the root page
- `?preview=<token>` swaps in the draft, and is served `no-store`; everything else is `s-maxage=60, stale-while-revalidate=600`

The whole router is **rate limited at 120 requests per minute per IP**, and that limiter is mounted *before* `requireApiKey` on purpose — this is the one surface the entire internet can reach, so a flood of made-up keys must be turned away before it costs a database lookup. Real sites sit behind a CDN and hit the origin rarely; raise `max` in `routes/content.ts` if a large static-site build legitimately bursts past it.

Two mounting details worth remembering: the page router takes the broad `/api` prefix (its routes span both `/api/projects/:id/pages` and `/api/pages/:pageId`), so it attaches `requireAuth` **per route** rather than with `router.use` — a blanket guard there would have locked out the public content API. And `/api/content` is mounted before it for the same reason.

**Media** (Phase 4, built; moved to Cloudflare R2 in Phase 7) — uploads go **browser → R2 directly** via a presigned PUT, so a client's 8MB phone photo never passes through the API:

- `POST /api/projects/:projectId/media/sign` → a one-shot upload ticket (`uploadUrl`, `key`, `publicUrl`, `headers`), the presigned PUT valid for 10 minutes. The browser sends a SHA-256 of the file and the key comes back as `<projectId>/<hash>[.ext]` — content-addressed, so it is cache-immutable, re-uploading the same bytes dedupes for free, and one client's upload can never land in another's prefix. The R2 secret never leaves the server.
- `POST /api/projects/:projectId/media` → register what R2 accepted. Rejects a `publicId` outside this project's prefix, and is idempotent so a retried registration does not duplicate. `width`/`height` default to `0` — the library genuinely does not know the size of an SVG or a raw file, which is why `imageProps` omits those attributes rather than emitting `width="0"`.
- `GET /api/projects/:projectId/media` → `{ items, uploadsEnabled }`
- `PATCH /api/media/:mediaId` (alt text) · `DELETE /api/media/:mediaId` (also deletes the R2 object; reports `removedFromStorage` honestly if storage did not confirm)

**R2 is optional.** Without the five `R2_*` env vars the CMS runs normally, `uploadsEnabled` is `false`, the sign endpoint returns a plain-English explanation, and the dashboard shows the client what is missing instead of a broken upload button. `lib/r2.ts` holds the whole integration — presigning via `@aws-sdk/client-s3` + `s3-request-presigner`, and `publicUrl`/`transformUrl` for delivery. **Deliver from the R2 custom domain, never the un-cached `r2.dev` host.**

**Orphan cleanup is not built.** Content-hashed keys mean replacing a file leaves the old object behind; an R2 lifecycle rule or a GC job is the fix, and it is deliberately deferred (see the note in `lib/r2.ts`).

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
| `lib/seo.ts` | **The customer's** SEO: search-result truncation, the checks behind the score, and the word/alt/heading analysis. Pure functions over the draft, so the panel updates as they type. |
| `components/editor/seo-panel.tsx` | The Search & sharing panel — result preview, length meters, sharing picture, checklist. |
| `lib/site-meta.ts` | **This site's** SEO: `SITE_URL`, `pageMeta()` and the JSON-LD builders every public route uses. Unrelated to `lib/seo.ts` despite the neighbouring names. |
| `lib/og.tsx` | The generated sharing cards, and `OG_CARDS` — the one place a card's words live. |
| `lib/media.tsx` | Library state, direct-to-R2 presigned uploads with progress, and the promise-based `pick()` that image/file fields await. |
| `components/media-picker.tsx` | The modal `pick()` opens. |

Routes — public: `/` (the landing page) · `/pricing` · **`/docs`** · the four policy pages `/terms` `/privacy` `/refunds` `/contact` · `/login` · `/signup` · `/verify-email?token=` · `/forgot-password` · `/reset-password?token=`. Generated alongside them: `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` and the sharing cards at `/og/<card>`. Signed in: `/projects` → **`/billing`** → `/projects/[projectId]/pages` → `/projects/[projectId]/pages/[pageId]` (editor) → `/projects/[projectId]/media` → **`/projects/[projectId]/integration`** → `/projects/[projectId]/settings`.

**The four policy pages are a payment requirement, not decoration.** A payment provider will not verify a website for payments without Terms, a Privacy Policy, a Refund/Cancellation Policy, a Contact page carrying a **real postal address and phone number**, and public pricing. A missing one is the usual reason a verification request bounces — an email-only contact page being the most common single cause.

- **`lib/legal.ts` is the only file you edit to complete them.** Business name, address, phone, GSTIN and jurisdiction live there once; all four pages read from it. Anything left as the `FILL_ME` sentinel renders through `<Fill>` as a loud inline **"TO BE FILLED IN"** marker, so an unfinished policy cannot quietly ship the word `undefined` to the reviewer who decides whether you may take money. Grep the built HTML for that string before submitting.
- **They are server components with no `motion.tsx` import**, so they ship ~180 B of JS and prerender to static HTML. That is deliberate beyond weight: a reviewer or regulator must be able to read the text with scripts blocked.
- **The privacy policy describes what the code actually does**, which is the part a template always gets wrong — bcrypt password hashes, SHA-256-only one-shot links, the single httpOnly refresh cookie, IPs held in memory for rate limiting and never written to Mongo, media served from **public** CDN URLs, and card details never reaching our servers. Its header comment lists the file behind each claim. Change one of those, change the page in the same commit.
- The commercial terms in `refunds` (a 7-day full refund on a first payment) and the liability cap in `terms` are **business decisions**, flagged as such in `lib/legal.ts`. These documents are a careful draft, not legal advice.

**The two integration surfaces, and why there are two.** A developer reads docs *before* signing up and needs their own key *after*, so the same material exists at two altitudes and neither replaces the other:

- **`/docs`** (public, no account) — the generic guide: quick start, the four endpoints, the response shape, and a reference for every registered section type. It is a **server component that imports `SECTION_REGISTRY` directly**, so the field reference cannot drift from what the API validates. That import is server-only — the page prerenders to static HTML and ships 160 B of its own JS, so Zod never reaches the browser. Do not add `"use client"` to it.
- **`/projects/[projectId]/integration`** (owner-only) — the same five steps with *that website's* real API URL, key, enabled section types and published page slugs already filled in, plus a **live "Fetch it live" button** that makes the real content request from the browser and shows the actual JSON. It warns in red when `API_URL` is a localhost address, because copy-pasting that into a deployed site is an hour lost.

Both generate their section-field reference from the registry rather than hard-coding it, so a new section type documents itself in both places. `links.docs` is now a real path; the remaining `TODO` sentinels (SDK reference, self-hosting, GitHub, status, privacy) still render as muted text.

An eighth tour step, **"Connect the website"**, points at the Integration screen and is judged done when `revalidateUrl` is set — real state, like every other step. It carries an `unavailable` note for editors, who cannot reach that screen.

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

Screens: Sign up → confirm email → Sign in → Projects (someone invited to exactly one website lands straight in it; owners stay on the list) → **Pages** (drag-reorder, add with auto-slug, delete w/ confirm, draft/published chips) → **Page editor** (left: section cards titled by the client-entered section `name` — falling back to the type label — drag-reorder, show/hide, delete, "+ Add section" limited to `allowedSectionTypes`; right: form auto-generated from the registry, with a "Section name (for your reference)" field at the top of every section form; above the section list, **Search & sharing** — this page's search settings — repeatable rows for list fields, image picker backed by media library + R2 upload; top: Preview / **Publish** / Discard draft) → **Media library** → **Settings** (owner-only: API key, revalidate URL/secret, enabled section types, who else has access, and a danger zone that **deletes the website** — guarded by typing its name, since the API cascades pages, media, tokens and the stored R2 objects with no undo. Deleting frees the slot on the plan, which is how someone swaps one website for another.).

Drafts autosave (debounced). Publish is the single action that pushes content live.

## Landing page (`apps/admin/app/page.tsx`) — BUILT

The public front page, implemented from the Claude Design "Landing Page" artboard. **It lives in the same Next app as the dashboard — one website, one domain, one deploy.** There is deliberately no separate marketing app.

The route layout is the whole trick:

```
app/
├── layout.tsx          <html>, fonts, tokens. NO providers.
├── icon.svg            the mark on its ink tile — the favicon
├── (marketing)/        route group: never appears in a URL
│   ├── layout.tsx      pins light + wears `brand-coat`
│   └── page.tsx        /  — the landing page, + pricing/ docs/
└── (dash)/
    ├── layout.tsx      AuthProvider > StoreProvider > MediaProvider + AppChrome
    ├── (auth)/         the signed-out screens
    │   ├── layout.tsx  SiteNav + pins light + wears `brand-coat`
    │   ├── login/      /login  — sign in
    │   └── signup/ verify-email/ forgot-password/ reset-password/
    └── (app)/          the signed-in shell: sidebar + /projects/…
```

**The root layout is bare on purpose.** Session, store and media providers sit in `(dash)/layout.tsx`, not at the root, so the landing page carries none of the dashboard's state management and never fires an auth refresh for a visitor who has no session. Measured: the landing page loads 5 JS chunks, `/login` loads 10. It is a server component throughout and Next prerenders it to static HTML, so search engines get the real text.

**`(dash)` covers both the sign-in screens and the dashboard**, in one provider tree. They must share session state — splitting them would remount `AuthProvider` between typing a password and landing on `/projects`, forcing a second refresh mid-flow.

**The signed-out screens carry the marketing nav**, from `(dash)/(auth)/layout.tsx` — a visitor who arrives at `/login` from an ad can get back to the pitch. It renders in that *server* layout rather than inside `auth-shell.tsx`, which is a client component: importing `SiteNav` there would pull the whole nav into the login bundle. Rendered from the layout it costs those pages no JavaScript, and moving the logo out of the card actually made `/login` smaller. `SiteNav`'s `showAuthCtas={false}` drops its Sign in / Create account buttons there, since each auth card already links to the other in its footer and one of the two would always point at the current page.

**The public surfaces wear `brand-coat`; the dashboard does not.** Marketing and the signed-out screens override the accent tokens to the logo's coral, while everything behind the login keeps Press Blue — the artboard's own instruction, "coral is the brand's coat, not the buttons". It is a token override rather than new utilities, so every existing `bg-accent` / `text-accent` in those trees retunes with no markup change. **The accent is `#b93f20`, not the mark's `#e8542e`**: the mark's coral is 3.66:1 on white and fails AA for text, where the deeper coral matches the Press Blue ramp it replaces. `#e8542e` lives on as `--color-brand`, which the logo paints with. See the `.brand-coat` comment in `globals.css`.

**The wordmark is `mypagecraft`, not `Pagecraft`** (updated 31 Aug 2026 from the brand artboard). Lowercase throughout, with `my` set at weight 400 in `--color-brand-my` (#8b8e96) and `pagecraft` at 700 in the surrounding text colour, letter-spacing -0.04em. The `my` is the whole point of the change: the product lives at mypagecraft.com, and a wordmark reading "pagecraft" made the domain look like a different company. `PagecraftWordmark` in `components/logo.tsx` is the only place it is built — the nav, the sidebar, the mobile header and the footer all render it, so it cannot drift.

Two deliberate deviations from the artboard, both inherited from when the mark was first built:

- **The typeface stays Bricolage, not the artboard's Space Grotesk.** A fourth family for one word costs a font download on every page, and Bricolage carries the same geometric lowercase.
- **A logotype is exempt from the "display face is headlines >=32px, never dashboard" rule.** A logo that changes typeface between marketing and the sidebar is not one logo. `--color-brand-my` is likewise exempt from the AA floor — it sits at ~3.2:1, which WCAG 1.4.3 exempts for logotypes and which would fail anywhere else, so the token is named for the wordmark rather than given a general-purpose grey name.

**The wordmark is ahead of the copy.** The logo says `mypagecraft`; the page title, the footer copyright, the policy pages and the emails still say "Pagecraft". That is a product-naming decision, not a logo one — decide it deliberately rather than letting a find-and-replace make it.

**The app is light-only. There is no dark palette and no theme toggle** — removed deliberately, not yet-to-be-built. `globals.css` defines one set of `--color-*` tokens and nothing redefines them; `lib/theme.ts`, `components/theme-toggle.tsx`, the sidebar's Theme row, the command palette's "Toggle theme" action and the root layout's no-flash script are all gone, as are the light pins that `(marketing)` and `(auth)` needed only because the dashboard could be dark. Do not re-add a `@media (prefers-color-scheme: dark)` block or a `[data-theme]` selector without asking. `--color-plate` is still a dark ink band inside the light palette — that is a tonal reset, not dark mode.

| Path | What it is |
|---|---|
| `app/(marketing)/page.tsx` | The whole page. Bands: hero → editor mock → stats → how it works → can't/can → for developers → **coding agents (MCP)** → section types → comparison → testimonials → FAQ → closing CTA. Its own `metadata` overrides the root title template. |
| `components/landing/editor-mock.tsx` | The product screenshot, in markup rather than a PNG — it stays sharp, weighs nothing, and cannot silently go stale when the real editor changes. `aria-hidden`: it is decorative, and the surrounding copy carries the meaning. |
| `components/landing/section-types.tsx` | The nine types as tinted mini-page tiles — the hero's sheets, landed in a grid. **Mirrors `SECTION_REGISTRY`** — add a section type there, add it here. |
| `components/logo.tsx` | The p+c mark **and the `mypagecraft` wordmark**, drawn from the artboard's construction spec as ratios of its own height. Shared by marketing, the auth screens and the dashboard sidebar, so there is one mark, not four. |
| `lib/links.ts` | Every destination the landing page points at. Plain relative paths, since it is all one origin. |

**`/` is the landing page, so signing in is at `/login` — but "signed out" has two meanings and they go to different places.** (Revised 31 Aug 2026; it used to send all of them to `/login`.)

- **Pressing Sign out** is someone leaving, so they land on **`/`**. `signOut` in `lib/auth.tsx` owns that.
- **Losing a session** — an expired token, a password changed on another device, or arriving at a dashboard URL with no session at all — is someone who wants back in, so they land on **`/login`**. That is the lost-session handler and the `(app)` layout's guard.

`Auth.signedOutTo` is what keeps the two honest, and it is **not incidental**: the `(app)` shell is still mounted when `status` flips to `signedOut`, so its guard fires *after* the sign-out has navigated. A hard-coded `/login` there silently overrules the landing page — which is exactly how a first attempt at this failed. Set the destination on the context before flipping `status`, and let the guard read it.

Both use `router.replace`, not `push`: Back must not walk into a dashboard shell the visitor has just left.

**Signing out also empties the dashboard.** `/` lives in the `(marketing)` route group, so leaving for it unmounts the whole `(dash)` provider tree and the previous account's websites go with it. `/login` does **not** — it is inside `(dash)`, so `StoreProvider` survives — which is why the store clears itself on `signedOut` as well. Without that, the next person to sign in on a shared computer sees the previous account's website names flash up before the refetch replaces them.

**A link with no destination renders as text, not as a dead link.** `lib/links.ts` marks unwritten pages with the `TODO` sentinel and `MaybeLink` renders those as muted text. Docs, SDK reference, self-hosting guide, GitHub, status and privacy are all still sentinels. Fill a value in and it becomes a real link everywhere it appears, with no other edit. Note that `MaybeLink` owns its own colour: pass it shape classes only, or two competing `text-*` utilities end up on the placeholder and stylesheet order decides which one shows.

## Pricing & billing — BUILT (Dodo Payments, merchant of record)

**The price is $7.99 per website per month, $79.90 a year** (USD since 31 Aug 2026 — see the currency note below). To reprice, change the two constants in `packages/shared/src/plans.ts` (`799` / `7_990` cents) **and** the two in `apps/admin/lib/pricing.ts` (`7.99` / `79.9` dollars), then re-run `npm run setup:razorpay` and swap the new plan ids into `.env`. Every figure the product quotes derives from those four numbers, so that is the whole change — including the tests, which assert against the constant rather than a literal. The price used to be written out in about thirty places and `apps/admin/lib/pricing.ts` exists so it never is again.

Earlier prices left dead Razorpay plans behind on that account; they are unused and Razorpay plans cannot be deleted, so they simply sit there. **The ₹1 test's payment rows were deleted from Mongo by hand**, so there is no INR data left — but money is still never formatted with today's currency: `formatMoney(minor, currency)` takes the currency the amount was recorded in and every `PaymentDTO` carries its own, so the next price or currency change cannot misstate old charges.

**The business model — decided 30 Aug 2026, do not re-derive.** *You pay per website.* Two websites cost twice one, three cost three times, up to twenty. Yearly is twelve months for the price of ten. Billed in **USD** through **Dodo Payments**, plus $1.99 per extra 10 GB and $179 for a bespoke section type. (Those two add-on prices were converted from ₹199 / ₹14,999 when the currency changed and have **not** been signed off — unlike the $7.99, which was.) Dodo is a **merchant of record**: it is the legal seller on the customer's receipt and it collects and remits their local sales tax, which is added on top of $7.99 at checkout.

**The price is strictly linear, and it has to be.** A subscription is billed as `unit price × quantity`, so a ladder that bent — $14.99 for two rather than $15.98 — could not be one product bought twice. It would need a product per rung, and every change to a customer's website count would send them back through checkout. Nobody re-enters a card over a dollar.

⚠️ **USD pricing does NOT work on Razorpay — confirmed empirically on 31 Aug 2026, and this is why the provider changed. Do not re-attempt it.** Creating a USD plan fails with *"Currency provided is not supported"*. The cause is regulatory, not a Razorpay setting: recurring billing there runs on **e-mandates**, and under the RBI e-mandate framework a mandate can only be registered in INR. A probe against the live account proved the split — a one-off **USD order succeeded** (international payments were enabled) while a **USD plan was refused** — so no support ticket or account flag would have unlocked it. **Dodo Payments** replaced it: a merchant of record that bills USD worldwide, handles the sales tax and settles to an Indian bank. The trade is fees — ~4% + $0.40 versus Razorpay's ~2% on cards and *zero* on UPI — bought in exchange for being able to charge USD at all. Reverting to INR would be a two-number change (`CURRENCY` plus the two amounts), but it would also mean changing provider back.

**The free tier is one website holding one page, and both halves are enforced.** (Set 31 Aug 2026, reversing "there is no free trial".) Signing up and confirming an email gets you a real, permanently free, publishable single-page website — **it is a page cap, not a clock**: nothing expires and no card is taken. `FREE_WEBSITES` and `PLANS.free.maxPagesPerProject` in `packages/shared/src/plans.ts` are the two constants, `websiteAllowance()` is the single function that decides the website ceiling, and `assertCanCreateProject` / `assertCanAddPage` are the walls.

**So the wall that sells the product is the page cap, not the website cap.** Almost every customer meets `assertCanAddPage`, never `assertCanCreateProject` — which is why the free case has its own wording in both ("your Free plan includes 1 pages" is ungrammatical and reads like a quota nobody chose). Do not put "14 days free" on any page: an expiring trial was removed deliberately and this is not its return. Do not widen what free includes without changing those two constants first, or a button promises what the product refuses.

**Why a ladder rather than feature tiers.** The old Starter/Business table is gone. Tiers had to differ on *something*, and with one shared sign-in there were no seats to count — which left page counts and storage, proxies for size that a customer cannot predict before buying. Website count is the one number they already know, and the one that tracks what the product actually costs to run. So **every paid website gets everything**: all nine section types, unlimited pages and edits, 10 GB of media, preview links, automatic publishing. There is no cheaper *paid* rung holding features back, and therefore no feature matrix to keep in step — the free tier is short of exactly one thing, pages, and that is the whole difference.

This also **reverses** the old "one account is one website" constraint. An account may now own as many websites as it pays for, which is what makes the developer-with-several-clients case work — it was previously ruled out for want of invites. Invites are still not built, so those clients still share one sign-in; what changed is that the *account* is no longer capped at one site.

**The ladder is a subscription `quantity`, not twenty products.** There are exactly **two** Dodo products — "one website, monthly" and "one website, yearly" — and three websites is quantity 3 of one of them, so `product_cart: [{ product_id, quantity: 3 }]`. Both must have **quantity/seat-based billing on and no trial period**: a provider-side trial would grant *paid* access that `assertCanAddPage` knows nothing about, letting someone add unlimited pages during a trial this API never heard of. Adding a fourth website calls `change-plan` with `prorated_immediately`, so the customer is charged the difference and never sent back through checkout. Products are created **by hand in Dodo's dashboard** — there is no setup script, because there is nothing to create programmatically; `npm run verify:billing` checks that what is there matches what this build advertises.

Where it lives:

| Path | What it is |
|---|---|
| `packages/shared/src/plans.ts` | **The source of truth.** Prices in cents, the ladder bounds, `SubscriptionStatus`, and `websiteAllowance()` — the only function that decides how many websites an account may own. |
| `apps/api/src/lib/dodo.ts` | The whole provider integration: raw `fetch` against Dodo's REST API (no SDK), the Standard-Webhooks verifier, and the price guard. Nothing else in the API knows payments exist — which is why swapping Razorpay for Dodo touched two files. |
| `apps/api/src/verify-billing.ts` | `npm run verify:billing` — asks Dodo whether the configured products charge what this build advertises. |
| `apps/api/src/routes/billing.ts` | `GET /api/billing`, `POST /subscription`, `POST /verify`, `POST /cancel`, `GET /payments`, `GET /plans`, and the webhook. `applySubscription` is the one place entitlement can change. |
| `apps/api/src/models/payment.ts` | **The billing history** — one row per charge the provider actually took. |
| `apps/admin/lib/billing.ts` | Browser side. Checkout is a whole-page navigation to Dodo's hosted page — no script to inject, no modal, and nothing for an ad blocker to eat. |
| `apps/admin/app/(dash)/(app)/billing/page.tsx` | Plan & billing — a stepper, because the whole screen is one number. |
| `apps/admin/lib/pricing.ts` | **The one place the dashboard and marketing quote a price.** Mirrors `plans.ts` rather than importing it — importing `@pagecraft/shared` would pull Zod into the public bundle. Change one, change the other. |
| `apps/admin/components/landing/pricing-plans.tsx` | Still the **only** `"use client"` component on any public page. Derives every figure from `lib/pricing.ts`. |

**State and history are stored separately, and both matter.** `user.subscription` holds the *current* entitlement — status, quantity, period end — which is what gates the product. It holds no history, so the `payments` collection records one row per charge (`amountMinor` + its own `currency`, status, method, websites covered, the provider's payment id). Without it a renewal arrives every month, updates a status, and leaves no trace that money moved: you could not answer "when was I charged and how much?" from your own database, reconcile revenue, or defend a chargeback.

- **The amount and its currency are both stored, never derived.** Prices change — this product has gone ₹999 → ₹1 → ₹999 → $7.99 — and a subscriber charged ₹1 during a settlement test must stay distinguishable from one charged $7.99 later. Recomputing history from today's price list is how billing disputes are lost; formatting it with today's *currency* is how ₹1 becomes "$0.01". `payments.amountMinor` is in the minor unit of that row's own `currency` (it was `amountPaise` before USD; the old name is still read so pre-rename rows keep showing up).
- **`subscription.charged` carries the payment entity alongside the subscription**, which is why a full history needs no `payment.*` webhook subscription. Recording is an upsert on the payment id, so a webhook retried for three days still produces exactly one row.
- **Payment rows survive account deletion on purpose.** They are financial records that tax law requires keeping, and the privacy policy says so. The `userId` becomes a dangling reference deliberately: the account is gone, the receipt is not.
- **Two money formatters exist and their units differ.** `lib/billing.ts` exports `inrFromPaise()` (everything the API sends); `lib/pricing.ts` exports `inr()` (rupees). The unit is in the name because two identically-named formatters is how a bill ends up a hundredfold wrong.

Four rules worth knowing before touching this code:

- **The webhook is mounted above `express.json`** (its own router, `dodoWebhookRouter`), because the signature covers the exact bytes Dodo sent. Re-serialising parsed JSON reorders keys and the digest silently stops matching — which presents as "payments mysteriously never activate". Dodo signs to the **Standard Webhooks** spec, which differs from Razorpay's scheme in four ways that each break it silently: three headers rather than one, the digest covers `webhook-id.webhook-timestamp.body` (so a captured body cannot be replayed under a new id), it is **base64** not hex, and the key is the **base64-decoded** bytes after the `whsec_` prefix. Events older than five minutes are rejected as replays.
- **The advertised price is verified against the provider before every sale.** The customer is charged the **Dodo product's** price, not anything in this codebase, so the two can silently disagree — and did, twice: a ₹1 test price charging ₹999, and a $7.99 page charging ₹999 after the move to USD. `checkProductPrice()` fetches the configured product once per period per process and compares currency *and* amount against `plans.ts`; a mismatch refuses checkout with a 503 saying nothing was charged, and shouts at boot. **Currency is the half that matters most** — amounts differ by a factor, a currency differs by meaning, and `799` is $7.99 or ₹7.99 depending on a field nobody reads. `resetPriceCheckCache()` is the test seam, and `npm run verify:billing` runs the same check on demand.

**The webhook is the ONLY thing that grants access, and that is a change.** Under Razorpay a `POST /verify` route also granted, on a signature Checkout handed the browser. Dodo hosts the payment page, so no such signature exists — the customer leaves the site and returns to `/billing?checkout=done`, **which proves nothing** and is a plain redirect anyone can visit. One source of truth is simpler and safer, but the billing screen must tolerate "paid, not yet confirmed": it polls for the entitlement for ~20s and then says the payment is still settling rather than claiming it failed. With no webhook secret configured every webhook is rejected — which now means **nobody can buy anything at all**, so `DODO_WEBHOOK_SECRET` is not optional in practice even though the schema marks it so.
- **Webhook order is not guaranteed.** Providers retry for days, so `subscription.lastEventAt` drops any event older than the one already applied. Without it a redelivered `cancelled` from last week lands after this morning's `active` and locks a paying customer out of sites they still pay for.
- **`websites` and `websitesAllowed` are two different numbers, and merging them breaks the checkout.** `paidWebsites()` is what the account pays for (**0** on free); `websiteAllowance()` is what it may own (**1** on free, the free website). `SubscriptionDTO` carries both, and the billing screen decides "do they already have a plan?" by asking whether `websites > 0`. Putting the allowance in that field makes a free account look subscribed, so the buy button reads "This is your plan" at quantity 1 and the customer can only purchase 2 — i.e. **the first sale becomes impossible**. That regression happened once, on 31 Aug 2026, the day the free tier landed; `billing.test.ts` now asserts the two are different for a never-paid account.

**Buying one website upgrades the free website in place.** No new site, no migration — subscribing moves the account to `starter`, and `assertCanAddPage` reads the owner's plan, so the page cap lifts on the site they already built. That is what the upgrade copy on the pages screen promises, and it is why the ladder starts at 1 rather than 2.

**Losing a subscription never deletes anything.** The account drops to Free and keeps its websites readable and editable — nobody's live site goes dark over a bounced card. What stops is *adding another*. For the same reason Dodo's `on_hold` (dunning — a renewal charge failed and is being retried) maps to our `pending`, which **is** entitling; `halted` is where access stops. And a downgrade below the number of websites that exist is **refused** — there is no honest way for us to pick which one to switch off.

**Dodo is optional the way R2 and SMTP are.** Without `DODO_*` in `.env` the CMS boots, `billingEnabled` is false, and the billing screen explains what is missing instead of showing a checkout button that dead-ends. Since the free tier needs no payment, **such an instance is still fully usable**: everyone gets their one single-page website and nobody can buy past it. The seed script's platform admin is comped (a subscription written directly, not a trial) so a fresh install has one uncapped account.

**Provider error descriptions are surfaced verbatim** rather than flattened into "payment failed". Messages like *"Currency provided is not supported"* are the whole diagnosis — that one sentence is what settled the Razorpay question — and hiding them turns a five-minute fix into an afternoon.

The landing page speaks to **both** people — the developer who builds the site and the owner who runs it and pays for it. The hero names both, the "For site owners" band mirrors the "For developers" band, and the FAQ carries questions from each. Keep new copy two-voiced.

**Still not enforced:** the page cap and media metering are defined in `PLANS` and checked by `assertCanAddPage` / `assertStorageAllows`, but the numbers are generous starting points rather than tuned limits. Storage add-ons ($2 per 10 GB) are advertised and have no purchase path.

## SDK (`packages/sdk`) & site integration — BUILT

What a client website installs. Two entry points so a non-React site never pulls in React:

- **`@pagecraft/sdk`** — `createCmsClient({ apiKey, baseUrl, fetchOptions })` → `getPages()`, `getPage(slug)`, `getHome()`, `getPreview(slug, token)`. Framework-agnostic: `fetchOptions` passes straight through to `fetch`, so Next hands it `{ cache: "force-cache" }` and a Vite site hands it nothing. Errors surface as `CmsError` with a status (`0` = unreachable, `404` = no such page) so a site can decide what to do.
- **`@pagecraft/sdk`** also exports the image helpers — `cmsImageUrl`, `cmsSrcSet`, `imageProps` — which rewrite a media URL to ask for a resized, modern-format copy. They speak **Cloudflare Image Transformations** (`/cdn-cgi/image/…`, what R2 serves through) and **Cloudinary** (`/upload/…`, kept because media uploaded before the migration keeps its old URL forever). Anything else is left untouched: rewriting a URL on a host with no transform service would 404 a working image.
  - **A plain R2 URL carries no clue that its host can resize**, so a site must say so once: `configureCmsImages({ provider: "cloudflare" })`. Until it does, `cmsImageUrl` is a no-op and `cmsSrcSet` returns `""` — slower, never broken. That is the right default, because a wrong guess turns every photo on a live site into a 404. A srcset is omitted rather than faked for the same reason: four identical URLs with different width descriptors make a phone download the full original believing it chose the small one.
  - `imageProps` **omits `width`/`height` when the library never measured the file** (registration defaults both to `0`). `width={0}` is not "unknown" to a browser — it is an instruction to render nothing.
- **`@pagecraft/sdk`** also exports `checkRevalidateRequest(body, secret)`, which validates the publish webhook with a constant-time secret comparison and strips path traversal.
- **`@pagecraft/sdk`** also exports the SEO helpers — `pageMetadata`, `metaTags`, `sitemapEntries`, `robotsTxt` and the JSON-LD builders. See the SEO section above; the short version is that they need nothing from the site's owner to produce correct tags, and they derive structured data from the sections that already exist.
- **`@pagecraft/sdk/react`** — `<SectionRenderer sections components fallback />`. You map section types to your own components; a type with no component renders nothing rather than crashing a live page.

### The website recipe

This is the pattern for each client website, which lives in **its own repo** — this one holds only the CMS. A worked example previously sat in `examples/demo-site`; it was removed on purpose, so these four steps are now the reference.

**A starter template was built and then deliberately deleted** (28 Aug 2026). It worked — pointed at a real key it prerendered four published pages — but it was a third place to keep in step with the registry, on top of the two documentation surfaces. Decided against; do not re-add one without asking. The four steps below plus `/docs` and the Integration screen are the reference.

1. `lib/cms.ts` — one client, `fetchOptions: { cache: "force-cache" }`.
2. `app/[[...slug]]/page.tsx` — a catch-all with `dynamic = "force-static"` and `generateStaticParams()` from `getPages()`, rendering `<SectionRenderer>`. **Pages the client adds after the build still work**: Next generates them on first request, so a new page needs no deploy.
3. `app/api/revalidate/route.ts` — about fifteen lines: `checkRevalidateRequest`, then `revalidatePath` for each path plus `revalidatePath("/", "layout")` so the navigation refreshes too.
4. `components/sections/index.tsx` — **your design, in code**. One component per section type. Nothing about layout, colour or spacing ever comes from the CMS.
5. `lib/seo.ts` + `app/sitemap.ts` — `pageMetadata(page, seo)` returned from `generateMetadata`, `<JsonLd data={pageJsonLd(page, seo)} />` in the page, and `sitemapEntries(await getPages(), seo)` for the sitemap. About fifteen lines for the whole search surface, and the Integration screen prints them with the site's own origin already filled in.

A CMS outage must not fail a deploy: catch `CmsError` with status `0` in the catch-all page, warn in the build log, and render a holding page that regenerates on the next publish. Any other error (bad key, 500) should still fail the build, because that is a real misconfiguration you want to hear about.

**Plain React (Vite) recipe**: same client, no `fetchOptions`; fetch at runtime and let the CDN cache headers do the work. Edits appear on the next page load instead of instantly.

## SEO — BUILT

SEO here means two separate things that share a word and nothing else. Keeping them apart is the first thing to know:

1. **The customer's website ranking** — the CMS's job, since it holds the content. `lib/seo.ts` (dashboard), the `seo` block on a page, and `packages/sdk/src/seo.ts`.
2. **mypagecraft.com ranking** — the marketing site's own tags. `lib/site-meta.ts`, `lib/og.tsx`, `app/robots.ts`, `app/sitemap.ts`.

They sit next to each other in `apps/admin/lib/` with confusingly similar names. `seo.ts` is theirs, `site-meta.ts` is ours.

### 1. The customer's SEO

**The rule the whole design rests on: a client who never opens the SEO panel must still get a page that indexes correctly.** The person editing a bakery's website will not read an article about meta descriptions, and their site still has to rank. So every field has a real fallback and the SDK applies it: a blank `metaTitle` falls back to the page title, a blank description is **written from the page's own first real sentence** (never from a heading — a description wants prose), a blank sharing image falls back to the first photo on the page, and the canonical falls back to the page's own address. The panel exists to let someone *improve* on those defaults, never as a precondition for them.

**Structured data is derived, never asked for.** This is the part that makes the product worth more than a meta-tag box:

- an **`faq`** section becomes a `FAQPage` — the answers can appear expanded directly in the search result
- a **`contact`** section becomes a `LocalBusiness` with its address, phone and opening hours; for a shop or a tradesperson this is the highest-value markup there is, and the one they would never have added by hand
- a **`productGrid`** becomes an `ItemList` of `Product`
- everything else gets a `WebPage` node, plus a `BreadcrumbList` from the slug

The owner already typed all of it. Asking them to type an address a second time into an "SEO settings" form is how that data ends up wrong in one of the two places.

**Opening hours are dropped rather than guessed.** `parseDays`/`parseTimes` in the SDK map "Mon – Fri" and "9am – 5.30pm" onto schema.org's `Mo-Fr 09:00-17:30`. Anything they cannot parse with confidence is left out entirely: a wrong opening time in a search result sends someone to a closed shop, which is materially worse for that business than showing no hours.

**`GET /api/content/pages` carries `updatedAt`, `publishedAt` and each page's `noIndex`**, so that one request is also everything a site needs for a correct `sitemap.xml` — a `<lastmod>` per URL, and the ability to leave out the pages their owner hid. Listing a `noindex` URL in a sitemap is a direct contradiction and Search Console reports it as an error against the whole file, so `sitemapEntries()` filters them out rather than listing and disallowing.

`packages/sdk/src/seo.ts` is the whole surface, framework-agnostic and dependency-free: `pageMetadata()` (hand it straight back from Next's `generateMetadata`), `metaTags()`/`renderMetaTags()` for everything that is not Next, `sitemapEntries()`/`renderSitemap()`, `robotsTxt()`, the JSON-LD builders, and `<JsonLd>` in `@mypagecraft/sdk/react`. A **preview is never indexable** whatever the page says — `pageMetadata` forces `index: false` when `page.preview` is true.

**The dashboard panel shows the result, not the fields.** A meta description is an abstraction nobody outside this industry has heard of; a Google result is something everybody has looked at. So the search preview sits at the top and moves as they type, the inputs read as "what it says in Google", and the length meters show the *ideal band* rather than a remaining count — "113 characters left" tells someone nothing about whether to keep typing. The checklist is scored out of 100 and includes a duplicate-title check across the website, which is the one problem a client cannot see from inside one page.

**Nothing in the panel can block a publish.** A page scoring 30 still goes live. The alternative is a CMS that refuses to publish a shop's opening hours because its description is 60 characters, and that is a CMS people work around rather than with.

### 2. The marketing site's own SEO

`pageMeta()` in `lib/site-meta.ts` is what every public route exports, so a new page cannot forget a tag. It emits the canonical, the robots directives, `og:*` and `twitter:*` together.

- **`SITE_URL` is load-bearing and fails silently.** Canonicals, `og:url`, the sitemap and every JSON-LD `@id` are built from it, and a wrong value does not break a build — it quietly tells Google the real site lives at localhost. Set `NEXT_PUBLIC_SITE_URL` on the deploy.
- **The home page is the bare origin with no trailing slash, everywhere.** Next strips it from the canonical, so `abs("/")` returns `https://mypagecraft.com` and the sitemap and `@id`s match. A sitemap that spells the home page differently from its own canonical is what Search Console reports as "alternate page with proper canonical tag".
- **There is deliberately no default canonical in the root layout.** It would be inherited by the dashboard screens, telling a crawler that `/projects` is really the home page. A missing canonical is neutral; a wrong one is not.
- **`opengraph-image.tsx` was tried and abandoned.** Next resolves that file convention for the exact segment it sits in and **not for child segments**: a copy at the app root gave `/` a card and left `/contact`, `/login`, `/signup` and the three policy pages with none — a blank grey box everywhere the link was pasted. `app/og/[card]/route.tsx` replaces it: stable URLs (`/og/pricing`), prerendered to PNGs by `generateStaticParams`, named from `pageMeta({ card })` so no page can silently miss one. Stable also matters because Facebook and LinkedIn cache a card against its URL, and a build hash in it defeats that cache.
- **Structured data never restates a price.** `productSchema()` reads `lib/pricing.ts`, the same two numbers the pricing page prints. Markup that disagrees with the page it sits on is a manual-action risk.
- The landing page's `FAQPage` is built from the same `FAQS` array the page renders, for the same reason — Google treats FAQ markup that is not visible on the page as an offence.
- The dashboard is `noindex` from a thin **server** layout wrapping the client shell (`(app)/layout.tsx` → `app-shell.tsx`), and the token-bearing auth screens are `noindex` **and** disallowed in `robots.txt` — `noindex` needs the page fetched before it counts, whereas `Disallow` stops the request, and a password-reset link should never be requested by a crawler at all.
- The five signed-out screens each became a server `page.tsx` wrapping a client `<name>-form.tsx`, purely so they can export `metadata`. A `"use client"` module cannot, and they were shipping the marketing headline as their title.
- `app/sitemap.ts` is **written by hand, not crawled from the route tree**: `app/` also holds the dashboard and the token screens. Adding a public page means adding a line, which is the smallest possible price for never listing a private one.
- `/docs` gives every section type an `id` (`/docs#section-hero`) and an `h3`, so an answer in a support reply lands on the one block that answers it.

## MCP server (`packages/mcp`) — BUILT

`pagecraft-mcp`, a Model Context Protocol server so a customer can point an AI assistant at their own website: read the live content, build pages, fill sections from the registry, manage media, publish. 26 tools over stdio, using the official `@modelcontextprotocol/sdk`. **Full setup, the tool list and the known gaps live in [`packages/mcp/README.md`](packages/mcp/README.md)** — this section is only the decisions that constrain the rest of the repo.

**It is sold as the biggest differentiator, and surfaced in three places** — the `#agent` band on the landing page (butter stage, between the plate code band and the section types), the "Coding agents (MCP)" section of `/docs`, and the "Connect your coding agent" pill in the dashboard (`components/mcp-widget.tsx`), which fills the config in with a real website's address, token and id. The pitch is not "AI in your CMS"; it is that **the registry makes an agent safe**: it can only fill fields you defined, on section types you enabled, within your limits, into a draft. Keep new copy on that line — the guardrail is the product, not the chat.

**It is a client of the REST API and nothing more.** No Mongo connection, no shared code with `apps/api` beyond wire types from `@pagecraft/shared`. Every rule — registry validation, draft-versus-publish, who may touch which website — is enforced where it already was. This is why it can be a package a customer runs on their own machine rather than something we host.

**Credentials, and this is the load-bearing bit.** A website's API key is **read-only by design** (`middleware/api-key.ts` resolves it to one project and serves published content; no write route accepts it). Do not "fix" that by teaching the key to write. Writing takes one of:

- `PAGECRAFT_PROJECT_TOKEN` → **the recommended one.** A write-scoped, never-expiring token for ONE website, minted on that website's Integration screen. It reaches that site and nothing else, needs no account login, and is revocable without a password reset. This is what an owner hands their developer. Pair it with `PAGECRAFT_PROJECT_ID`.
- `PAGECRAFT_EMAIL` + `PAGECRAFT_PASSWORD` → every website the account can reach, authenticating exactly like the dashboard, including the 15-minute access token and the `/api/auth/refresh` rotation that renews it. Refresh is preferred over signing in again because login is rate limited to 10 per 15 minutes per email+IP.
- `PAGECRAFT_API_KEY` → the four published-content tools, and only those.

(The project token was the "scoped, revocable machine token" this file once listed as the right fix that did not exist yet. It exists; prefer it, and reach for the password pair only when the job genuinely spans several websites.)

**Tools that cannot be performed are never advertised.** A key-only config is offered four tools, not 26 that fail; `PAGECRAFT_READ_ONLY=1` removes all 16 writes from `tools/list` entirely. A model cannot reach for a tool it cannot see, which is a stronger guarantee than a refusal.

**stdout belongs to the protocol.** `src/bin.ts` writes every human message to stderr. One stray `console.log` anywhere in this package corrupts the stream and the connection simply fails.

Tests run every handler against `src/stub-api.ts` — a stand-in that enforces the parts that matter (the read-only key reaching only `/api/content/*`, bearer tokens expiring so renewal is exercised for real) — plus two that drive a real MCP client over an in-memory transport. No live key, password or database is needed to run them.

## Build roadmap

1. **Foundation** — ✅ **DONE.** Monorepo scaffolding, `packages/shared` (registry + Zod validation), API skeleton, Mongo connection, JWT auth, project CRUD, section-types endpoint, 33 passing tests. *Milestone met: login + create project via REST.*
2. **Content engine** — ✅ **DONE.** Page and section CRUD with registry validation, draft/publish separation, revalidate webhook, preview tokens, public content API. *Milestone met: full content lifecycle via REST.*
3. **Admin dashboard** — ✅ **DONE.** Every screen wired to the live API: real login and session, registry-driven forms, autosave, publish with per-field errors, preview tokens. *Milestone met: a non-technical user can build and publish a page.*
4. **Media** — ✅ **DONE.** Signed uploads direct from the browser, per-project library with alt text and delete, a picker modal wired into the `image` and `file` fields, and URL-based thumbnails. Originally Cloudinary; re-based on Cloudflare R2 in Phase 7 behind the same endpoints.
5. **SDK** — ✅ **DONE.** SDK with client, image helpers, webhook validator and `SectionRenderer`. *Milestone met and verified at the time with a full demo Next.js site: edit in CMS → live page updates automatically.* That demo site has since been **deleted** — this repo holds the CMS only, and client websites live in their own repos. The recipe it demonstrated is written out under "The website recipe" above; the SDK's own 43 tests still cover the client, image helpers and webhook validator against a stub API.
6. **Open signup** — ✅ **DONE.** The pivot from "one developer's private tool" to a product anyone can use: per-website ownership replacing global roles, self-service signup with emailed confirmation, forgotten-password rescue, session invalidation on password change, SMTP mail, and rate limiting on every signed-out endpoint. *Milestone met: a stranger creates an account, confirms it, builds a website, and sees nobody else's.*
7. **Launch** — ⬅ **IN PROGRESS.**
   - ✅ Rate limiting on the **public content API** — 120 requests per minute per IP, applied before the key lookup so a flood of bogus keys never reaches Mongo. The signed-out auth routes were already covered.
   - ✅ Media re-based on **Cloudflare R2** (replacing Cloudinary) behind the same endpoints.
   - ✅ A **proxy upload fallback** (`POST /api/projects/:projectId/media/upload`), because the
     live bucket carries no CORS rule and the browser's presigned PUT dies in preflight. The
     dashboard tries direct-to-R2 first and only drops to it on failure, so it costs nothing
     once the rule exists. Direct-to-R2 stays the north star — see the Cloudflare notes in
     HANDOVER; the object key is a hash the *server* takes of the bytes it received, so
     accepting raw uploads does not let a client choose where the object lands.
   - ⬜ **Two Cloudflare-admin jobs remain, and media does not display until the second is done**:
     the bucket CORS rule, and connecting `media.mypagecraft.com` as an R2 custom domain (its
     DNS currently points at the VPS, so every stored media URL is unreachable).
   - ✅ **Per-account limits and payment.** Websites are capped at the number the subscription covers, over and above the one free single-page website — a public signup form can no longer run up an open-ended bill. Pages, storage and content-API calls are metered per website too. See "Pricing & billing" above.
   - ⬜ Dodo Payments admin jobs remain: finish identity + bank verification, then fill `DODO_API_KEY`, `DODO_WEBHOOK_SECRET` and the two `DODO_PRODUCT_ID_*` vars. Until then `billingEnabled` is false and nobody but the seeded admin can own more than the free website.
   - ✅ **SEO, end to end.** Search settings are edited in the dashboard, stored draft-first, served by the content API, turned into tags and structured data by the SDK, and the CMS's own marketing pages carry the full set. See "SEO" below.
   - ⬜ The deployment run-through.

**No invite flow, shared sign-ins — decided, do not rebuild.** Whoever owns a website shares those sign-in details with the other party directly. (The *other* half of this rule — "one account is one website" — was **reversed** on 30 Aug 2026: per-website pricing means an account owns as many websites as it pays for. Sharing a login is still how a second person gets in.) `ProjectRole` and `user.projectIds` still model an `editor` who was added to someone else's website, and `requireProjectAccess` honours it, so the model does not need changing if invites are ever wanted — but nothing currently creates that relationship, and `AuthToken.kind: "invite"` plus `sendProjectInviteEmail` are unused scaffolding.

Two consequences of sharing one account that follow from the auth design above, and should be explained rather than engineered around:

- A password reset bumps `sessionVersion`, so it signs **both** parties out. Whoever resets must pass on the new password.
- "Forgot password" emails whichever inbox owns the address, so only that person can complete a reset.

## Deployment (note: Vercel Hobby forbids commercial use — client work is commercial)

- **CMS backend (Express)**: **Render** (decided) always-on Node service at `api.<domain>` (free instance sleeps after idle — fine for dev; use the ~$7/mo Starter once real clients are live so dashboards/publish webhooks don't hit cold starts). Railway is the equivalent alternative. Not Vercel serverless — a CMS API wants a persistent server + pooled Mongo connection.
- **CMS dashboard + landing page (Next.js, one app)**: **Cloudflare Pages** (decided). One deploy serves the public landing page at `/` and the dashboard behind it, so it can sit at the apex `<domain>` rather than `admin.<domain>` — free, commercial use allowed, unlimited bandwidth. Root directory `apps/admin`. Because this is Next.js rather than a plain static bundle, deploy it through `@opennextjs/cloudflare` (Cloudflare's Next.js adapter) — the ISR caveats that rule Cloudflare out for *client sites* don't apply here: the landing page is prerendered static, and everything behind the login is client-rendered and fetches from the API at runtime.
- **Client websites (Next.js, need ISR + on-demand revalidation)**: Netlify free tier to start; move to a single Vercel Pro account ($20/mo flat, unlimited projects) as client count grows. Avoid Vercel Hobby (non-commercial only) and Cloudflare Pages (ISR caveats). Self-hosted `next start` on Render/VPS also fully supports ISR.
- **Data**: MongoDB Atlas M0 (free, 512 MB — content JSON is tiny; no media in Mongo) + Cloudflare R2 (media originals, no egress fee) delivered through an R2 custom domain with Image Transformations.
- **Email**: any SMTP mailbox on the CMS's own domain. Zoho Mail's free plan is the tidiest fit; Gmail needs an App Password and has low daily limits. Set `MAIL_FROM` to an address at a domain you control and publish SPF and DKIM records for it — without them, confirmation links go straight to spam and nobody can finish signing up. Since the whole product now depends on delivering that one email, treat it as infrastructure, not a nicety.
- **`APP_URL`** must be the dashboard's public address (`https://<domain>`), because every emailed link is built from it. Getting this wrong sends new users to localhost.
- Same monorepo deploys everywhere: each platform points at its app's root directory (`apps/api`, `apps/admin`).
- Rate limiting is in-memory and therefore **per instance**. That is right for one always-on Render service; if this ever scales to several instances, `middleware/rate-limit.ts` is the only piece that needs Redis — nothing else in the API keeps state.

## Conventions

- TypeScript strict; no `any` at module boundaries
- Zod validates every request body and all section content against the registry
- Responses: `{ success: true, data }` / `{ success: false, error }`
- Secrets via `.env` (never committed); keep `.env.example` current
- Public API must never leak drafts, other projects' data, or storage secrets
- **Authorization is always a lookup, never a property of the user.** Ask "what is this account's relationship to this website?" — never "is this user an admin?" The one exception is `isPlatformAdmin`, granted by seeding alone.
- **Signed-out endpoints must not reveal which email addresses have accounts.** Identical answers for known and unknown addresses, every time.
