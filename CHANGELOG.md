# Changelog

What changed, when, and why. [HANDOVER.md](HANDOVER.md) says where the project
*is*; this says how it got there. Newest first — append, do not rewrite.

---

## 2026-08-28 · Integration and documentation

**The problem this solves.** A developer could sign up, build content, and then
have no idea how to render it. The only integration guide was a single commented
line on the settings page, and `links.docs` was a `TODO` sentinel, so the footer
"Docs" link rendered as grey text. Everything below closes that gap at three
altitudes: before signup, after signup, and in code.

### 1 · New per-website Integration screen

**Added** `apps/admin/app/(dash)/(app)/projects/[projectId]/integration/page.tsx`

A five-step walkthrough where **every value is that website's own** — API URL,
key, enabled section types, actual published page slugs. A developer copies
working code instead of substituting their own details into a generic tutorial,
which is the step people get wrong.

| Step | Contents |
|---|---|
| 1 | `.env` block with real values, plus Show/Copy for the key |
| 2 | `lib/cms.js` fetch helper |
| — | **What comes back** — see below |
| 3 | One component per section type + **field reference** — see below |
| 4 | `app/[[...slug]]/page.jsx`, the single catch-all |
| 5 | `app/api/revalidate/route.js` + live webhook status |

Then an endpoint reference table, the website's real published page URLs, and a
`curl` line with the key already in it.

Three details that read real state rather than being static text:

- **Step 5 changes with the project.** Green with the URL when the webhook is
  set; a specific warning when a URL is set but no secret ("anyone who finds
  that address can trigger rebuilds"); a link to the right settings card when
  neither is.
- **Nothing is hard-coded about section types.** The imports, the component map
  and the field list all derive from `allowedSectionTypes`, so ticking a type on
  in settings updates this page with no edit.
- **Owner-only**, gated exactly like Website settings.

**Changed** [`apps/admin/components/sidebar.tsx`](apps/admin/components/sidebar.tsx)
— new **Integration** nav item between Photos & files and Website settings,
carrying `data-tour="nav-integration"`.

**Changed** [`apps/admin/lib/tour.ts`](apps/admin/lib/tour.ts) and
[`apps/admin/components/tour.tsx`](apps/admin/components/tour.tsx) — an eighth
tour step, *"Connect the website"*, after Publish. Judged done from real state
(`hasRevalidateUrl`) like every other step, never from a click counter. Two new
`TourState` fields: `hasRevalidateUrl`, `isOwner`. An editor gets the
`unavailable` escape hatch rather than a wall, since they cannot reach the
screen at all.

### 2 · "What comes back" — the live response viewer

Same file, sitting between step 2 (fetch it) and step 3 (render it), because
that is where a developer needs it.

- A field guide to the envelope: `success`, `data.slug`, `data.sections`,
  `section.type`, `section.content` — including the two facts that save the most
  time: **the empty slug is the home page**, and **hidden sections are already
  stripped**, so you never filter on `visible`.
- A **Fetch it live** button that makes the real request from the browser with
  the real key. Not a documented sample that can drift — the actual answer. The
  response is trimmed to one complete section plus a `…3 more sections` marker,
  because a real page runs hundreds of lines and the second section teaches
  nothing the first did not.
- A realistic example renders before the button is pressed, so the box is never
  empty. Nothing published → says so. API unreachable → names `ADMIN_ORIGIN` as
  the likely cause instead of failing silently.

Works because the API's CORS already admits the dashboard origin. Where it does
not, the button degrades to the message and the example stays.

### 3 · Localhost guard

Same file. `API_URL` is wherever *this* dashboard's API lives, so on a
developer's machine it is `http://localhost:4000` — correct there, and useless
in a deployed website. Since the entire point of the screen is copy-paste, it
now detects a local address (`localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`) and
says so in red.

Invisible to customers: verified against the deployed bundle, where the compiled
expression is
`("https://api.mypagecraft.com".replace(/\/$/,"")) ?? "http://localhost:4000"` —
the fallback is dead code, so the warning cannot fire on `mypagecraft.com`.

### 4 · Field reference — the guessing problem

Same file. Section types were shown as name-only chips, which told a developer
nothing. They are now expandable, showing every field's **key, kind and JSON
shape**, with list children indented under their parent:

```
heading *          text     string, up to 140 characters
backgroundImage    image    { url, width, height, alt } · absent until chosen
buttons            list     array · at most 3
  └ label *        text     string, up to 24 characters
  └ variant        select   "Solid" | "Outline"
```

`*` marks a field the CMS refuses to publish without, so a component can rely on
it existing. The data was already loaded in `s.sectionTypes` and going unused.

Before this, the only ways to learn that `backgroundImage` is an object rather
than a string were to fetch a page and reverse-engineer the JSON, or open the
editor and infer key names from labels.

### 5 · Public documentation at `/docs`

**Added** [`apps/admin/app/docs/page.tsx`](apps/admin/app/docs/page.tsx)

Readable **without an account**, which is the order developers actually work in:
they read docs before they sign up. Quick start, the four endpoints, the
response shape, a reference for all nine section types, five gotchas, and a
sign-up CTA.

**It is a server component that imports `SECTION_REGISTRY` directly**, so the
field reference cannot drift from what the API validates. That import stays
server-side — the build confirms `/docs` is prerendered static with **160 B** of
its own JS, so Zod never reaches the browser. **Do not add `"use client"` to
this file.**

**Changed** [`apps/admin/lib/links.ts`](apps/admin/lib/links.ts) — `docs: TODO`
→ `docs: "/docs"`. Because of the `MaybeLink` sentinel design, that one edit
turned the grey placeholder into a live link everywhere it appears.

**Changed** [`apps/admin/components/landing/site-nav.tsx`](apps/admin/components/landing/site-nav.tsx)
— **Docs** added to the top navigation, between "For developers" and "Pricing".

### 6 · Starter template — built, then **reverted the same day**

> **⚠ Deleted by decision on 28 Aug 2026, hours after being built.** It worked,
> but it was a third place to keep in step with `SECTION_REGISTRY` on top of
> `/docs` and the Integration screen, and that maintenance cost was judged not
> worth it. **Do not re-add one without asking.** The record below stays because
> the work produced §7 — the `showPrices` bug was found while writing the
> template's `product-grid.tsx` against the registry, and that fix is kept.

**Added** a Next.js project at `C:\Users\Intel\Desktop\pagecraft-starter`,
**outside this repo on purpose** (CLAUDE.md: client websites never live here).

20 files: the four recipe files, `lib/types.ts` carrying the `content` shape of
every section type, one plain-CSS component per registered type, and a README.

Clone → paste one key → the client's real content renders. The developer then
deletes the styling and builds the design, which is the only part that is
genuinely their job. The nine components exist mainly so **every field name is
already correct** — the same guessing problem as §4, solved by example.

Deliberate choices:

- **No Tailwind.** `npm install` pulls only Next and React, and nobody fights
  someone else's utility classes before starting.
- **`lib/cms.ts` distinguishes failure modes.** A network failure returns a
  holding page so a CMS outage cannot fail a deploy; a 401 or 500 still throws,
  because that is a real misconfiguration you want to see in the build log.
- **Photos omit `width`/`height` when unmeasured** — `width={0}` instructs a
  browser to render nothing.
- **An unmapped section type renders nothing**, with a dev-only console warning.

**Verified end to end, not just compiled**: pointed at a real website's key
against `https://api.mypagecraft.com`, it prerendered all four published pages
(`/`, `/menu`, `/about`, `/contact`) and the generated HTML contains their real
content — *"The board, this week"*, *"Whitstable plaice, samphire, brown
butter"*.

`.env.local` exists in that folder with a live read-only key so it runs
immediately. Gitignored. Swap it for a real client's key.

Intended to become a public GitHub template repo so a developer clicks "Use this
template" rather than assembling five files by hand.

### 7 · Dropped the `showPrices` toggle

**Changed** [`packages/shared/src/registry.ts`](packages/shared/src/registry.ts)

`productGrid` offered a **Show prices** toggle, but products carry no price
field — `photo`, `name`, `description`, `category`, `specs`, `detailsUrl`,
`specSheet`. The toggle switched on something that did not exist. Found while
writing the starter's `product-grid.tsx` against the registry.

Removed, with a comment recording why so nobody re-adds it. The `toggle` import
stays — `hero` and `contact` still use it.

The dashboard form, the Integration field reference and the `/docs` reference
all updated themselves, being registry-driven. Also removed from the starter's
`lib/types.ts`, `product-grid.tsx` and README.

**Known residue, not yet cleaned.** Stripping unknown keys happens on *write*,
when Zod validates against the registry — not on read;
[`toSectionDTOs`](apps/api/src/models/page.ts#L64) passes `content` through
untouched. Four stored sections still carry the key:

```
menu    · sections       · showPrices = true
menu    · draftSections  · showPrices = true
(home)  · draftSections  · showPrices = false
(home)  · draftSections  · showPrices = true
```

Harmless — no form offers it and no component reads it — but the public API
keeps emitting a dead key until each section is next edited and saved. Opening
that `productGrid` section in the editor and changing anything clears it for
good. A one-off Mongo script would too, but editing once is safer.

### 8 · Housekeeping

- **Ran `npm install`.** `npm run typecheck` was already failing before any of
  the above: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` were added
  by the R2 commit but never installed on this machine. All five workspaces are
  clean now.
- **Updated [CLAUDE.md](CLAUDE.md)** — the routes list, why there are two
  integration surfaces rather than one, the server-only registry import rule,
  and a pointer to the starter under *The website recipe*.
- **Updated [HANDOVER.md](HANDOVER.md)** — struck the documentation gap,
  promoted publishing the SDK to the top of the roadmap, renumbered the rest.
- **Cleared `apps/admin/.next`** after each verification build, so `npm run dev`
  starts fresh rather than tripping the stale-build problem.

### Verification

| Check | Result |
|---|---|
| `npm run typecheck` | all 5 workspaces clean |
| `npm test` | 258 pass, 0 fail (77 MCP · 43 SDK · 15 registry · 123 API) |
| `npm run build --workspace @pagecraft/admin` | compiled; `/docs` static at 160 B, `/integration` at 6.4 kB |
| Starter `npx next build` | 4 real pages prerendered from the live API |
| Starter `npx tsc --noEmit` | clean |

### Deliberately not done

**Publishing `@pagecraft/sdk` to npm.** It is still `"private": true`.
Publishing is outward-facing and irreversible, and the `@pagecraft` scope may
not be yours — that is a decision to make, not a step to run. The manifest is
otherwise ready: `files`, `exports`, dual entry points, React as an optional
peer.

The cost of the delay is real and now recorded as roadmap item 1: until it
ships, `content` is untyped for every customer, the image helpers (`cmsSrcSet`,
`imageProps`) are unreachable so nobody gets responsive images, and the starter
has to hand-maintain `lib/types.ts` in step with the registry.
