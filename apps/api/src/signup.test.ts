import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { Server } from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { SentMail } from "./lib/mailer.js";

/**
 * Self-service accounts: sign up, confirm the address, sign in, and rescue a
 * forgotten password — with nobody on the other end to help.
 *
 * Email is captured rather than sent, so these tests assert on the exact link a
 * real person would receive and then click it.
 *
 * A theme runs through the whole file: none of these endpoints may reveal
 * whether a given email address has an account here. That is what most of the
 * "identical answer" assertions are protecting.
 */

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let disconnect: () => Promise<void>;
let resetRateLimits: () => void;
let User: typeof import("./models/user.js").User;
const outbox: SentMail[] = [];

before(async () => {
  mongo = await MongoMemoryServer.create();

  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = mongo.getUri("pagecraft_signup_test");
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value";
  process.env.ADMIN_ORIGIN = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  // Signup refuses outright when the CMS cannot send email, so these must be
  // present for the flow to run at all. Nothing is actually delivered.
  process.env.SMTP_HOST = "smtp.example.test";
  process.env.SMTP_USER = "postmaster@example.test";
  process.env.SMTP_PASSWORD = "not-a-real-password";

  const { connectDb, disconnectDb } = await import("./db.js");
  const { createApp } = await import("./app.js");
  const { captureMail } = await import("./lib/mailer.js");
  ({ resetRateLimits } = await import("./middleware/rate-limit.js"));
  ({ User } = await import("./models/user.js"));

  await connectDb(process.env.MONGODB_URI);
  disconnect = disconnectDb;
  captureMail(outbox);

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

after(async () => {
  const { captureMail } = await import("./lib/mailer.js");
  captureMail(null);
  server?.close();
  await disconnect?.();
  await mongo?.stop();
});

beforeEach(() => resetRateLimits?.());

/* ------------------------------------------------------------------ helpers */

type Json = Record<string, any>;

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; cookie?: string } = {}
): Promise<{ status: number; json: Json; setCookie: string | null }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return {
    status: res.status,
    json: (await res.json()) as Json,
    setCookie: res.headers.get("set-cookie"),
  };
}

const signUp = (email: string, password = "a-good-password", name = "Sam Rivera") =>
  api("/api/auth/signup", { method: "POST", body: { name, email, password } });

const login = (email: string, password: string) =>
  api("/api/auth/login", { method: "POST", body: { email, password } });

/** Pulls the one-shot token out of the most recent email sent to an address. */
function tokenFrom(email: string): string {
  const mail = [...outbox].reverse().find((m) => m.to === email);
  assert.ok(mail, `expected an email to ${email}`);
  const match = mail.text.match(/token=([\w-]+)/);
  assert.ok(match, `expected a link with a token in:\n${mail.text}`);
  return match[1];
}

const lastMailTo = (email: string) => [...outbox].reverse().find((m) => m.to === email);

/**
 * Puts an account on a live subscription for `websites` sites.
 *
 * Websites are the thing money buys, so any test that needs one has to say so
 * explicitly — which is exactly the behaviour worth pinning down.
 */
const grantWebsites = (email: string, websites: number) =>
  User.updateOne(
    { email },
    { $set: { plan: "starter", subscription: { status: "active", websites, period: "monthly" } } }
  );

/**
 * A brand-new account cannot build anything until it pays. This is the whole
 * shape of the business, so it is asserted here rather than only in the quota
 * suite: signing up is free, building is not.
 */
describe("what a new account may do before paying", () => {
  it("refuses to create a website until there is a subscription", async () => {
    const email = "browsing@example.com";
    await signUp(email);
    const session = await api("/api/auth/verify-email", {
      method: "POST",
      body: { token: tokenFrom(email) },
    });

    const res = await api("/api/projects", {
      method: "POST",
      token: session.json.data.accessToken,
      body: { name: "Not Yet" },
    });
    assert.equal(res.status, 402);
    assert.equal(res.json.code, "subscription_required");
  });
});

/* ------------------------------------------------------------- signing up */

describe("signing up", () => {
  it("creates an account and emails a confirmation link", async () => {
    const res = await signUp("sam@example.com");
    assert.equal(res.status, 200);
    assert.equal(res.json.data.emailSent, true);

    const mail = lastMailTo("sam@example.com");
    assert.match(mail!.subject, /confirm/i);
    assert.match(mail!.text, /verify-email\?token=/);
  });

  it("does not sign the new account in before the address is confirmed", async () => {
    const res = await signUp("notyet@example.com");
    // No token, no cookie, nothing that resembles a session.
    assert.equal(res.json.data.accessToken, undefined);
    assert.equal(res.setCookie, null);

    const attempt = await login("notyet@example.com", "a-good-password");
    assert.equal(attempt.status, 401);
    assert.equal(attempt.json.code, "email_not_verified");
  });

  it("refuses a password too short to be worth having", async () => {
    const res = await signUp("weak@example.com", "short");
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.json.issues), /at least 8 characters/);
  });

  it("answers a taken address exactly as it answers a new one", async () => {
    const first = await signUp("twice@example.com");
    const second = await signUp("twice@example.com");

    // Byte-for-byte identical: anything else turns this endpoint into a way of
    // asking "does this person have an account here?".
    assert.equal(second.status, first.status);
    assert.deepEqual(second.json, first.json);
  });

  it("tells the real account holder that someone tried to reuse their address", async () => {
    outbox.length = 0;
    await signUp("owner@example.com");
    await api("/api/auth/verify-email", {
      method: "POST",
      body: { token: tokenFrom("owner@example.com") },
    });

    await signUp("owner@example.com", "different-password", "Impostor");

    const mail = lastMailTo("owner@example.com");
    assert.match(mail!.subject, /already have/i);
    // And crucially, the impostor's password did not replace theirs.
    const stillWorks = await login("owner@example.com", "a-good-password");
    assert.equal(stillWorks.status, 200);
  });

  it("normalises the address so Sam@Example.com is not a second account", async () => {
    await signUp("MixedCase@Example.com");
    const again = await signUp("mixedcase@example.com");
    assert.equal(again.status, 200);

    const { User } = await import("./models/user.js");
    assert.equal(await User.countDocuments({ email: "mixedcase@example.com" }), 1);
  });
});

/* ----------------------------------------------------------- confirming it */

describe("confirming an email address", () => {
  it("verifies the account and signs the person straight in", async () => {
    await signUp("confirmed@example.com");
    const res = await api("/api/auth/verify-email", {
      method: "POST",
      body: { token: tokenFrom("confirmed@example.com") },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.data.user.emailVerified, true);
    assert.ok(res.json.data.accessToken);
    assert.match(res.setCookie ?? "", /pc_refresh=/);

    // And now the ordinary sign-in works too.
    assert.equal((await login("confirmed@example.com", "a-good-password")).status, 200);
  });

  it("burns the link, so a forwarded email cannot be reused", async () => {
    await signUp("once@example.com");
    const token = tokenFrom("once@example.com");

    assert.equal((await api("/api/auth/verify-email", { method: "POST", body: { token } })).status, 200);
    const replay = await api("/api/auth/verify-email", { method: "POST", body: { token } });
    assert.equal(replay.status, 400);
    assert.match(replay.json.error, /expired or has already been used/);
  });

  it("rejects a made-up token", async () => {
    const res = await api("/api/auth/verify-email", {
      method: "POST",
      body: { token: "definitely-not-a-real-token" },
    });
    assert.equal(res.status, 400);
  });

  it("invalidates the previous link when a new one is requested", async () => {
    await signUp("resend@example.com");
    const first = tokenFrom("resend@example.com");

    await api("/api/auth/resend-verification", {
      method: "POST",
      body: { email: "resend@example.com" },
    });
    const second = tokenFrom("resend@example.com");
    assert.notEqual(first, second);

    // Only the newest link works, so a leaked older email is worthless.
    assert.equal(
      (await api("/api/auth/verify-email", { method: "POST", body: { token: first } })).status,
      400
    );
    assert.equal(
      (await api("/api/auth/verify-email", { method: "POST", body: { token: second } })).status,
      200
    );
  });

  it("says the same thing when asked to resend to an address with no account", async () => {
    const unknown = await api("/api/auth/resend-verification", {
      method: "POST",
      body: { email: "ghost@example.com" },
    });
    assert.equal(unknown.status, 200);
    assert.equal(lastMailTo("ghost@example.com"), undefined);
  });
});

/* ------------------------------------------------------- forgotten password */

describe("resetting a forgotten password", () => {
  const email = "forgetful@example.com";

  before(async () => {
    await signUp(email);
    await api("/api/auth/verify-email", { method: "POST", body: { token: tokenFrom(email) } });
  });

  it("emails a reset link and accepts a new password once", async () => {
    await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    const token = tokenFrom(email);
    assert.match(lastMailTo(email)!.text, /reset-password\?token=/);

    const res = await api("/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "brand-new-password" },
    });
    assert.equal(res.status, 200);
    assert.ok(res.json.data.accessToken, "resetting signs you in");

    assert.equal((await login(email, "brand-new-password")).status, 200);
    assert.equal((await login(email, "a-good-password")).status, 401);

    // A reset link is the one thing that can take an account over, so it must
    // never work twice.
    const replay = await api("/api/auth/reset-password", {
      method: "POST",
      body: { token, password: "third-password" },
    });
    assert.equal(replay.status, 400);
  });

  it("logs every other device out the moment the password changes", async () => {
    const session = await login(email, "brand-new-password");
    const oldToken = session.json.data.accessToken;
    const oldCookie = (session.setCookie ?? "").split(";")[0];
    assert.equal((await api("/api/auth/me", { token: oldToken })).status, 200);

    await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    await api("/api/auth/reset-password", {
      method: "POST",
      body: { token: tokenFrom(email), password: "after-the-breach" },
    });

    // Whoever was holding the old session is out, without waiting for it to expire.
    assert.equal((await api("/api/auth/me", { token: oldToken })).status, 401);
    assert.equal(
      (await api("/api/auth/refresh", { method: "POST", cookie: oldCookie })).status,
      401
    );
  });

  it("says the same thing for an address with no account", async () => {
    const known = await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    const unknown = await api("/api/auth/forgot-password", {
      method: "POST",
      body: { email: "nobody-at-all@example.com" },
    });
    assert.deepEqual(unknown.json, known.json);
    assert.equal(lastMailTo("nobody-at-all@example.com"), undefined);
  });

  it("will not reset an unconfirmed account", async () => {
    // Otherwise signing up with someone else's address, then "resetting" it,
    // would be a way to take over an address you cannot read.
    await signUp("unclaimed@example.com");
    outbox.length = 0;
    const res = await api("/api/auth/forgot-password", {
      method: "POST",
      body: { email: "unclaimed@example.com" },
    });
    assert.equal(res.status, 200);
    assert.equal(lastMailTo("unclaimed@example.com"), undefined);
  });
});

/* ------------------------------------------------------------ abuse control */

describe("standing up to abuse", () => {
  it("stops password guessing after ten tries", async () => {
    resetRateLimits();
    const attempts = [];
    for (let i = 0; i < 11; i++) attempts.push(await login("guessme@example.com", `try-${i}`));

    assert.equal(attempts[9].status, 401, "the tenth attempt is still answered normally");
    assert.equal(attempts[10].status, 429);
    assert.match(attempts[10].json.error, /too many sign-in attempts/i);
  });

  it("caps how often one address can ask for a reset link", async () => {
    resetRateLimits();
    const email = "spammed@example.com";
    for (let i = 0; i < 3; i++) {
      await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    }
    const fourth = await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    assert.equal(fourth.status, 429);
    assert.ok(Number(fourth.json.error.length) > 0);
  });

  it("tells the caller when it will let them back in", async () => {
    resetRateLimits();
    for (let i = 0; i < 11; i++) await login("retryheader@example.com", "nope");
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "retryheader@example.com", password: "nope" }),
    });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get("retry-after")) > 0);
  });
});

/* ------------------------------------------------------------ closing down */

describe("closing an account", () => {
  it("refuses while the account still owns a website", async () => {
    const email = "quitter@example.com";
    await signUp(email);
    const session = await api("/api/auth/verify-email", {
      method: "POST",
      body: { token: tokenFrom(email) },
    });
    const token = session.json.data.accessToken;

    // A fresh signup is entitled to zero websites — there is no free trial —
    // so this one has to be paid for before it can exist at all.
    await grantWebsites(email, 1);
    const made = await api("/api/projects", { method: "POST", token, body: { name: "Still Live" } });
    assert.equal(made.status, 201);

    const res = await api("/api/auth/me", { method: "DELETE", token });
    assert.equal(res.status, 400);
    // A live website is reading from that project; deleting it by accident
    // while closing an account would take a client's site down.
    assert.match(res.json.error, /Delete your website first/);
  });

  it("closes an account that owns nothing", async () => {
    const email = "cleanexit@example.com";
    await signUp(email);
    const session = await api("/api/auth/verify-email", {
      method: "POST",
      body: { token: tokenFrom(email) },
    });

    const res = await api("/api/auth/me", {
      method: "DELETE",
      token: session.json.data.accessToken,
    });
    assert.equal(res.status, 200);
    assert.equal((await login(email, "a-good-password")).status, 401);
  });
});
