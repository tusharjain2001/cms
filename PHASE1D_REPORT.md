# PHASE 1D REPORT

## Commits

| | |
|---|---|
| Source at session start | `507dcfa` Complete Pagecraft onboarding and MCP delivery |
| Source now | `3fe7a81` Phase 1d: proxy upload fallback for blocked direct-to-R2 uploads |
| Deployed to `/opt/pagecraft` | `3fe7a81` (copied file-by-file; `/opt/pagecraft` is not a git repo) |
| Pushed? | **No.** Committed locally only — no push was requested. |

`/opt/pagecraft` deliberately keeps one source difference: `apps/api/src/index.ts`
binds to `127.0.0.1` so only nginx can reach the API. That is a deploy-time
hardening from `deploy2.sh`, not drift.

## 1. Was production behind HEAD?

**No — the premise from phase1c did not hold.** Production was already serving
507dcfa when this session started, and the four bugs were already fixed live.
Evidence:

- The deployed source tree was byte-identical to HEAD apart from the `listen`
  hardening above.
- `apps/admin/.next/BUILD_ID` was stamped 06:05, **after** the newest source file
  (05:57), and pm2 had restarted at 06:06 — i.e. a HEAD build, not a stale one.

Verified against live production, not just timestamps:

| Reported bug | Live status |
|---|---|
| Fake homepage screenshot placeholder on `/projects` | **Not present.** Page text contains no "screenshot"; the screenshot of `/projects` shows the real website card. |
| Dead `/projects//pages`, `/media`, `/settings` sidebar links | **Fixed and live.** Playwright found **0** links containing `/projects//`. `sidebar.tsx` gates each on `hasProject`. |
| Stale build chunks | **Not stale.** Rebuilt again this session anyway; chunk hashes current. |
| Media upload fails (R2 CORS) | **Real, confirmed, and now worked around** — see §2. |

So three of the four were already resolved. The fourth was the genuine one.

## 2. Media upload — root cause and what was done

### Confirmed root cause

A CORS preflight to the bucket, sent exactly as a browser sends it:

```
OPTIONS https://<acct>.r2.cloudflarestorage.com/pagecraft-media/... 
  Origin: https://mypagecraft.com
→ HTTP/1.1 403 Forbidden
  <Error><Code>Unauthorized</Code>
  <Message>CORS not configured for this bucket</Message></Error>
```

The presigned PUT is cross-origin, so with no CORS rule the browser never sends
the upload at all. **And the API cannot fix it itself:** its R2 credential is
object-scoped — `GetBucketCors` returns `403 AccessDenied`, while `PutObject`
and `DeleteObject` both succeed. Setting the rule needs a Cloudflare token with
bucket-admin scope, which is not available here. I did not attempt any
Cloudflare account-admin change, and no token or secret was printed.

### The app-level route-around (implemented)

`POST /api/projects/:projectId/media/upload` — raw bytes through the API, written
to R2 server-side. Accepting an upload body gives up what the presign got for
free, so both properties are re-established explicitly:

- **Server-recomputed content hash.** The object key is
  `<projectId>/<sha256-of-received-bytes>[.ext]`. No client-supplied hash is
  accepted, so a client cannot aim the write at a key of its choosing.
- **Tenant isolation from `req.project`.** The prefix comes from
  `requireProjectAccess` resolving the URL, so the write lands in the caller's
  own prefix by construction rather than by trusting the body.
- Idempotent registration (identical bytes → identical key → existing row).
- 15MB cap (`MAX_PROXY_UPLOAD_BYTES`), MIME allowlist excluding `text/html` and
  every JavaScript spelling — media is served from the CDN domain, where a
  stored script would run in someone else's browser.
- body-parser's `entity.too.large` now maps to a readable **413** instead of the
  bare 500 it produced before.

Admin side: the dashboard **still tries direct-to-R2 first** and only falls back
on failure. So the fallback goes quiet by itself the moment the bucket is
configured — no code change, no redeploy. Direct-to-R2 remains the north star,
and the exact CORS rule to restore it is written into `lib/r2.ts` and HANDOVER.

One infra change was unavoidable: nginx capped the API body at `4m`, below which
most phone photos would have been rejected by nginx before Express saw them.
Raised to `16m` on the API server block only, with a comment tying it to
`MAX_PROXY_UPLOAD_BYTES`. Config backed up to `pagecraft.bak.phase1d`;
`nginx -t` passed; reloaded, not restarted.

## 3. Verification

```
npm test        258 pass / 0 fail   (was 248; +10 new in media-proxy.test.ts)
                  api 123 · mcp 77 · sdk 43 · shared 15
npm run typecheck   clean, all 5 workspaces
npm run build       clean — shared → sdk → mcp → api → admin (14 routes)
```

The new tests drive a **real local R2 stub** rather than a mock, so the assertion
that the stored key was derived from the bytes the server received is checked
against what the S3 client actually PUT. They live in their own file because they
override the S3 endpoint, and `media.test.ts` asserts a presigned URL targets the
real `*.r2.cloudflarestorage.com` host — separate processes, so neither
assertion has to be weakened.

## 4. Live smoke (production)

| Check | Result |
|---|---|
| `https://mypagecraft.com/` | 200 — title and `h1` correct |
| `/login`, `/pricing` | 200 |
| `https://api.mypagecraft.com/health` | 200 `{"success":true,"data":{"status":"ok"}}` |
| `https://demo.mypagecraft.com/` | 200, 43KB, real content ("Harbour & Vine…") |
| `/api/content/pages` without a key | 401 — correct |
| Sign in → `/projects` | ✅ lands on `/projects`, website card renders |
| Sidebar dead links | ✅ **0** `/projects//` links |
| Pages / Media / Settings screens | ✅ all load, no JS errors |
| pm2 | api, admin, demo all `online`; `pm2 save` done |

**Media upload, driven through the real browser file input:**

```
200 POST /api/projects/…/media/sign
FAILED PUT https://<acct>.r2.cloudflarestorage.com/…   net::ERR_FAILED   ← the CORS block
201 POST /api/projects/…/media/upload                                    ← fallback succeeded
```

The file appeared in the library with no error shown to the user. Live guard
checks through nginx: `text/html` → **400**, 16MB → **413** with the friendly
JSON message. Delete via the API reported `removedFromStorage: true`, so real
R2 writes and deletes both work.

All smoke artifacts (a temporary account, project and two media objects) were
created for this test and **fully removed afterwards** — the database is back to
its original 2 users / 3 projects / 11 media, and the temp credential file was
shredded.

## 5. Remaining blockers — both need a Cloudflare admin

**A. Bucket CORS rule (uploads work without it, but via the slow path).**
Set on `pagecraft-media`:

```json
[{ "AllowedOrigins": ["https://mypagecraft.com"],
   "AllowedMethods": ["PUT"],
   "AllowedHeaders": ["content-type", "cache-control"],
   "MaxAgeSeconds": 3600 }]
```

Not a functional blocker any more — but until it is set, every uploaded megabyte
crosses the API box, which is exactly what the presigned design existed to avoid.

**B. `media.mypagecraft.com` is not connected to the bucket — uploaded media does
not display.** This is the more serious of the two, and it is **not** caused by
this session's work. `R2_PUBLIC_BASE_URL` points at that host, but its DNS
resolves to this VPS (`217.216.79.250`), which has no route and no certificate
for the name. A browser loading a thumbnail gets
`ERR_CERT_COMMON_NAME_INVALID`; curl over plain HTTP gets a 404. **All 11
existing media rows share that host**, so image display has been broken for every
upload, old and new.

Fix: attach it as an **R2 custom domain** (R2 → bucket → Settings → Public
access → Custom domain). Cloudflare issues the certificate and repoints DNS, and
it is also what provides the Image Transformations that `transformUrl` and the
SDK's `cmsSrcSet` build `/cdn-cgi/image/...` URLs against. Do **not** substitute
the `r2.dev` host — uncached, billed per view, and no transform service, so every
generated thumbnail URL would 404.

Net position: **a client can now upload a photo and see it in their library, but
it will not render on their site until B is done.**

## 6. Scope notes

- No push, no force push, no cron jobs, no messages sent, no secrets printed.
- One nginx change (`client_max_body_size` 4m → 16m) — judged unavoidable, since
  the 15MB cap is unreachable without it. No DNS or systemd changes.
- Not attempted: orphan GC for content-hashed keys (still deferred), per-account
  limits, SEO fields — all outside this phase.
