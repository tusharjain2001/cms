# HANDOVER — Pagecraft

**Written:** 28 August 2026 · **Branch:** `master` · working tree clean

This is the "where things stand right now" note. [CLAUDE.md](CLAUDE.md) is the
blueprint — what the product is, why every decision was made, and the rules that
must not be re-litigated. **Read CLAUDE.md first; this file only covers state,
setup and what to do next.** Where the two disagree, CLAUDE.md wins.
[CHANGELOG.md](CHANGELOG.md) is the third: what changed on which day, and why.

---

## 1. Where the project actually is

Phases 1–6 are built and verified end to end. The promise works: someone signs
up, confirms their email, builds content, presses **Publish**, and a live static
Next.js site regenerates itself within seconds with nobody involved.

| Phase | State |
|---|---|
| 1 · Foundation — monorepo, registry, auth, project CRUD | ✅ done |
| 2 · Content engine — pages, sections, draft/publish, public API | ✅ done |
| 3 · Admin dashboard — every screen on the live API | ✅ done |
| 4 · Media — presigned direct uploads, library, picker | ✅ done |
| 5 · SDK — client, image helpers, webhook validator, renderer | ✅ done |
| 6 · Open signup — self-service accounts, email confirmation, per-website roles | ✅ done |
| 7 · Launch | ⬅ in progress |
| — · MCP server (`packages/mcp`) — the API as AI-assistant tools | ✅ done |

**`packages/mcp` is a package, not a service.** It is `pagecraft-mcp`, an MCP
server a customer runs on their own machine and points at their Pagecraft API;
it holds no state and nothing about it is deployed or restarted alongside the
API and dashboard. Setup, all 26 tools and the known gaps are in
[`packages/mcp/README.md`](packages/mcp/README.md); the decisions behind it are
in CLAUDE.md. The one to know before touching it: **a website's API key is
read-only, so anything that writes signs in as an account** — there is no
scoped machine token yet, and inventing one in the MCP server rather than the
API would be the wrong place.

**248 tests pass**: registry/validation 15 · API integration against a real
in-memory MongoDB 113 · SDK 43 · MCP server 77.

### What is deliberately NOT built

Not oversights — decisions. Do not "fix" these without asking:

- **No invite flow.** One account per website; the owner shares the sign-in by
  hand. `ProjectRole`, `user.projectIds`, `AuthToken.kind: "invite"` and
  `sendProjectInviteEmail` exist as unused scaffolding so the model does not need
  changing if invites are ever wanted.
- **No client website in this repo.** Ever. Client sites live in their own
  folders and repos. A demo site once sat in `examples/` and was deleted on
  purpose. The build recipe is written out in CLAUDE.md under *The website
  recipe* — that is where it stays.
- **No separate marketing app.** One Next app (`apps/admin`) serves the landing
  page at `/` and the dashboard behind it. A second app was tried and removed.

### What is claimed but NOT enforced ⚠

`/pricing` is currently a **design artefact, not an offer**. There is no
billing, no Stripe, no trial clock, no page cap, no media metering. A signup
today gets unlimited websites, pages and media, forever. Fix this before the
page is shown to anyone who could pay.

---

## 2. Getting it running (5 minutes)

Everything runs from the **repo root**. Never run npm inside a workspace folder
— it writes a second lockfile and Next then cannot tell which marks the project
root.

```bash
npm install          # also builds packages/shared via its prepare script
npm run dev          # API on :4000 + dashboard on :3000, prefixed [api] / [admin]
```

Then open **http://localhost:3000/login** — not `/`, which is the public landing
page.

| Command | What it does |
|---|---|
| `npm run dev` | **the usual one** — both apps together |
| `npm run dev:api` | just the API, with watch |
| `npm run dev:admin` | just the dashboard |
| `npm test` | all 248 tests |
| `npm run typecheck` | every workspace |
| `npm run build` | shared → sdk → mcp → api → admin |
| `npm run seed` | creates the platform-admin account + a demo website |

### Config on this machine

`apps/api/.env` **exists and works.** MongoDB Atlas is connected and seeded.

| Group | State |
|---|---|
| `MONGODB_URI`, both JWT secrets, `APP_URL`, `ADMIN_ORIGIN` | ✅ filled in |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | ✅ filled in |
| `R2_*` (5 vars: account, key id, secret, bucket, public base URL) | ✅ filled in |
| `SEED_EMAIL` / `SEED_PASSWORD` | ⬜ **emptied after seeding** |

On this server `apps/admin/.env.local` **does** exist and sets
`NEXT_PUBLIC_API_URL=https://api.mypagecraft.com`. It is a *build-time* value, so
changing it means rebuilding the dashboard, not just restarting it. On a fresh
machine you can skip the file entirely — the dashboard defaults to
`http://localhost:4000`.

**Both are optional**, and worth knowing for a fresh checkout where they are
blank:

- **Without SMTP** the CMS boots and everything works, but *signing up is
  refused* with `email_not_configured`. The seeded account signs in normally,
  and outside production any link that would have been emailed is printed to the
  `[api]` log so you can click through your own flow locally.
- **Without the `R2_*` vars** the CMS runs, `uploadsEnabled` is `false`, and
  the dashboard tells the client what is missing instead of showing a broken
  upload button. Media uploaded under the previous Cloudinary backbone keeps
  working — those URLs are stored as-is and the SDK still rewrites them.

Sign-in credentials were `SEED_EMAIL` / `SEED_PASSWORD` in `apps/api/.env`, but
**both are now blank on this server** — the seeded account exists in Mongo and
its password is no longer recoverable from the config. If you need back in, use
"Forgot password" (SMTP is configured, so the email will arrive), or re-seed with
a fresh address. `.env` is gitignored and its values are not repeated here on
purpose.

### ⚠ Media on the live server: two things need a Cloudflare admin

The R2 credential in `apps/api/.env` is **object-scoped**. It can read, write and
delete objects — verified — but it cannot touch bucket-level settings. Two
consequences are live right now, and neither can be fixed from this repo or this
server. Both need somebody signed in to the Cloudflare dashboard.

**1. The bucket has no CORS rule, so browsers cannot upload straight to R2.**
A presigned PUT is cross-origin, so the browser sends a preflight first, and R2
answers it `403 Unauthorized — CORS not configured for this bucket`. Attempting
`GetBucketCors` with the API's own credential returns `403 AccessDenied`, which
is how we know the token cannot set it either.

Set this on the `pagecraft-media` bucket (R2 → bucket → Settings → CORS policy):

```json
[{ "AllowedOrigins": ["https://mypagecraft.com"],
   "AllowedMethods": ["PUT"],
   "AllowedHeaders": ["content-type", "cache-control"],
   "MaxAgeSeconds": 3600 }]
```

Until then uploads still work, because the dashboard falls back to
`POST /api/projects/:projectId/media/upload`, which streams the bytes through the
API and writes them server-side. That fallback is a **workaround, not the
design**: every megabyte now crosses this box, which is exactly what the
presigned path existed to avoid. Once the rule above is in place the direct PUT
succeeds again and the fallback goes quiet on its own — no code change, no
deploy. Keep it afterwards only as a retry for locked-down networks.

Note `client_max_body_size` on the API's nginx server block was raised 4m → 16m
to accommodate it. It must stay at or above `MAX_PROXY_UPLOAD_BYTES` in
`apps/api/src/routes/media.ts`, or nginx returns its own HTML 413 and the
friendly JSON error never reaches the client.

**2. `media.mypagecraft.com` is not connected to the bucket, so uploaded files
do not display.** `R2_PUBLIC_BASE_URL` points there, but the DNS record resolves
to *this VPS*, which has no route and no certificate for that name — a browser
loading a thumbnail gets `ERR_CERT_COMMON_NAME_INVALID`. All 11 media rows are
affected, so this predates the upload work and is not caused by it.

The fix is to attach it as an **R2 custom domain** (R2 → bucket → Settings →
Public access → Custom domain), which also gives the Image Transformations that
`transformUrl` and the SDK's `cmsSrcSet` build `/cdn-cgi/image/...` URLs against.
Cloudflare issues the certificate and repoints DNS itself. Do **not** switch
`R2_PUBLIC_BASE_URL` to the `r2.dev` host as a shortcut — it is uncached, bills
every view as a Class-B op, and has no transform service, so every generated
thumbnail URL would 404.

Until that domain is connected, uploading works but the picture stays blank.

### The seeded "Demo Website"

`npm run seed` creates a platform-admin account plus a project literally named
**Demo Website** — one page (*Home*, empty slug) holding one `hero` section
nicknamed *Main Banner*. It exists so the dashboard is not empty on first login.
It is an ordinary project you own: rename it, edit it, or delete it freely.

Note it is created **as a draft** — the hero sits in `draftSections` and live
`sections` is empty. A site fetching it right now gets nothing back until you
open it and press Publish. That is the draft/live split working correctly, and
it is a good first thing to see for yourself.

---

## 3. Things that will bite you

Each of these cost real time already.

**One lockfile, at the root.** If Next warns that it guessed the project root,
look for a stray `apps/admin/package-lock.json` and delete it — plus any empty
`apps/admin/node_modules/@*` dirs — then reinstall from the root. Do **not** set
`outputFileTracingRoot`; that silences the symptom and leaves two lockfiles
drifting apart.

**`packages/shared` is build-first.** Both other packages consume its types
through a TypeScript project reference, so every root script chains
`npm run shared` before doing anything. Stale types mean that step was skipped.

**Do not mix `next build` / `next start` with `next dev`.** It leaves a `.next`
that throws `ENOENT: .next/server/app/page.js`. Delete `apps/admin/.next` and
restart.

**`--kill-others-on-fail` does not fire when the API config is bad.** `tsx watch`
stays alive after the failure, so `concurrently` never sees a non-zero exit. The
`[api]` error block is the real signal — read it, it names the exact file and
the missing keys.

**"Could not reach the CMS" on the signup/login screen** means the API is not
running or its config is incomplete. Check the `[api]` output, not the browser.

---

## 4. Ground rules for whoever picks this up

Full reasoning is in CLAUDE.md; these are the ones easiest to break by accident.

- **Authorization is always a lookup, never a property of the user.** Ask "what
  is this account's relationship to *this website*?" — never "is this user an
  admin?" `isPlatformAdmin` is the single exception and is granted by the seed
  script alone. An earlier `role: 'admin' | 'client'` on the user record meant
  any admin saw every project in the database; it could not survive open signup
  and was removed.
- **Signed-out endpoints must not reveal which addresses have accounts.** Signup
  answers a taken address byte-for-byte like a new one; `forgot-password` and
  `resend-verification` do the same; login checks the password *before*
  mentioning verification. The repetition in those handlers is the feature — do
  not "simplify" it. The signed-out screens mirror this, showing the same "check
  your email" panel either way.
- **Adding a section type is one file**: `packages/shared/src/registry.ts`. The
  dashboard builds its forms from `GET /api/section-types` and hard-codes
  nothing about any section type. If a change makes you edit
  `field-renderer.tsx` to add a *type*, it is the wrong change.
- **Nothing from `@pagecraft/shared` reaches the browser** — `lib/dto.ts`
  re-exports types only. A runtime import there pulls Zod into the bundle for
  validation the server already does.
- **Never commit `.env`, and never paste real connection strings or credentials
  into a chat or a file.** Keep `.env.example` current instead.
- Publish is the only action that pushes content live. Everything else edits
  `draftSections`.

---

## 5. Next up — Phase 7, Launch

Two are done. In the order I would do the rest:

- ~~**Rate limit the public content API.**~~ ✅ **Done.** `/api/content/*` is
  capped at 120 requests per minute per IP, mounted ahead of `requireApiKey` so
  a flood of bogus keys is refused before it reaches Mongo. *(In-memory and
  therefore per-instance. Right for one always-on Render service; it is the only
  piece needing Redis if this ever scales horizontally — nothing else in the API
  keeps state.)*
- ~~**Move media to Cloudflare R2.**~~ ✅ **Done.** Same endpoints, presigned
  PUTs straight from the browser; media uploaded before the migration keeps its
  Cloudinary URL and still renders.

- ~~**Nowhere to learn the integration.**~~ ✅ **Done.** Three things landed
  together: a public **`/docs`** page (readable without an account, which is the
  order developers actually work in), a per-website **Integration** screen in the
  dashboard with that website's own key, a live response fetch, and a field
  reference for every section type. Both surfaces build that reference from
  `SECTION_REGISTRY`, so a new section type documents itself in both places.
  (A starter template was built alongside these and then deleted by decision —
  see CHANGELOG. Do not re-add one without asking.)

1. **Publish `@pagecraft/sdk` to npm.** Still `"private": true`, so a client
   website cannot install it and everything is documented as plain `fetch`.
   Until it ships, `content` is untyped for every customer and the image helpers
   (`cmsSrcSet`, `imageProps`) are unreachable, so nobody gets responsive images.
   The starter works around it by hand-writing the types in `lib/types.ts` —
   which now has to be kept in step with the registry by hand.
2. **Per-account limits.** A public signup form with no cap on websites is an
   open-ended bill on the Atlas and Render free tiers. At minimum a website cap
   and a page cap per project.
3. **Surface the SEO fields** (`metaTitle`, `metaDescription`, `ogImage`) in the
   dashboard — they exist on the page model and nothing edits them.
4. **Deployment run-through:** API → Render (~$7/mo Starter once real clients are
   live, so publish webhooks do not hit cold starts); dashboard + landing →
   Cloudflare Pages via `@opennextjs/cloudflare`, root dir `apps/admin`, at the
   apex domain. `APP_URL` must be the dashboard's public address — every emailed
   link is built from it, and getting it wrong sends new users to localhost.
5. **SMTP on a real domain**, with SPF and DKIM published. Without them
   confirmation links go to spam and nobody can finish signing up. The entire
   product now depends on delivering that one email — treat it as
   infrastructure, not a nicety.

Then, and only then, the billing work that makes `/pricing` true.
