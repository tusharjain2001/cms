import nodemailer, { type Transporter } from "nodemailer";
import { emailEnabled, env, isProd } from "../config/env.js";

/**
 * Transactional email over plain SMTP, so this works with whatever mailbox the
 * developer already has — Zoho, Fastmail, their registrar's mail, or Gmail with
 * an app password. No provider SDK and no vendor lock-in.
 *
 * Email is OPTIONAL, exactly like the R2 media backbone. Without SMTP the CMS
 * still boots and every other feature works; what breaks is signing up, so the
 * signup endpoint refuses honestly instead of silently swallowing the address.
 * Outside production the link is printed to the server log, which is all a
 * developer needs to click through their own signup flow locally.
 */

let cached: Transporter | null = null;

function transport(): Transporter {
  if (!cached) {
    cached = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // Port 465 is TLS from the first byte; 587 upgrades with STARTTLS.
      secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASSWORD! },
    });
  }
  return cached;
}

/** Test seam: lets the suite assert what would have been sent, with no SMTP. */
export interface SentMail {
  to: string;
  subject: string;
  text: string;
}
let capture: SentMail[] | null = null;
export function captureMail(into: SentMail[] | null) {
  capture = into;
}

interface Mail {
  to: string;
  subject: string;
  heading: string;
  body: string;
  action?: { label: string; url: string };
  footer?: string;
}

/**
 * Deliberately plain HTML with inline styles: email clients strip stylesheets,
 * and a verification email that renders as unstyled text everywhere beats a
 * pretty one that breaks in Outlook.
 */
function render(mail: Mail): { html: string; text: string } {
  const { heading, body, action, footer } = mail;
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f2f1ed;padding:32px 16px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e7e5e0;border-radius:14px;padding:32px">
    <div style="font-weight:700;font-size:18px;color:#1e232d;margin-bottom:24px">Pagecraft</div>
    <h1 style="font-size:17px;color:#1e232d;margin:0 0 12px">${heading}</h1>
    <p style="font-size:14px;line-height:1.6;color:#5b6270;margin:0 0 24px">${body}</p>
    ${
      action
        ? `<a href="${action.url}" style="display:inline-block;background:#2f4a9a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">${action.label}</a>
    <p style="font-size:12px;line-height:1.6;color:#8b909b;margin:24px 0 0">If the button does not work, copy this address into your browser:<br><span style="color:#5b6270;word-break:break-all">${action.url}</span></p>`
        : ""
    }
    ${footer ? `<p style="font-size:12px;line-height:1.6;color:#8b909b;margin:24px 0 0">${footer}</p>` : ""}
  </div>
</div>`.trim();

  const text = [heading, "", body, action ? `\n${action.label}: ${action.url}` : "", footer ?? ""]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}

async function send(mail: Mail): Promise<void> {
  const { html, text } = render(mail);

  if (capture) {
    capture.push({ to: mail.to, subject: mail.subject, text });
    return;
  }

  if (!emailEnabled) {
    // Never print a working sign-in link to a production log.
    if (!isProd) {
      console.log(`\n[pagecraft] Email is not configured, so nothing was sent.`);
      console.log(`[pagecraft] To: ${mail.to} — ${mail.subject}`);
      if (mail.action) console.log(`[pagecraft] ${mail.action.url}\n`);
    }
    return;
  }

  await transport().sendMail({
    from: env.MAIL_FROM,
    to: mail.to,
    subject: mail.subject,
    text,
    html,
  });
}

const link = (path: string, token: string) =>
  `${env.APP_URL.replace(/\/+$/, "")}${path}?token=${encodeURIComponent(token)}`;

export function sendVerificationEmail(to: string, name: string, token: string) {
  return send({
    to,
    subject: "Confirm your email address",
    heading: `Welcome, ${name}.`,
    body: "Confirm this address and your Pagecraft account is ready to use. This link works for the next 24 hours.",
    action: { label: "Confirm my email", url: link("/verify-email", token) },
    footer: "If you did not create a Pagecraft account, you can ignore this email.",
  });
}

export function sendPasswordResetEmail(to: string, name: string, token: string) {
  return send({
    to,
    subject: "Reset your password",
    heading: `Hello ${name},`,
    body: "Use the button below to choose a new password. This link works once, and expires in one hour.",
    action: { label: "Choose a new password", url: link("/reset-password", token) },
    footer:
      "If you did not ask to reset your password, ignore this email — your current password still works.",
  });
}

/**
 * Sent when someone tries to sign up with an address that already has an
 * account. The signup endpoint must not reveal which addresses are taken, so
 * the person who actually owns the address is told instead.
 */
export function sendDuplicateSignupEmail(to: string, name: string) {
  return send({
    to,
    subject: "You already have a Pagecraft account",
    heading: `Hello ${name},`,
    body: "Someone just tried to sign up using this email address, and you already have an account. If that was you, sign in as usual — or reset your password if you have forgotten it.",
    action: { label: "Sign in", url: `${env.APP_URL.replace(/\/+$/, "")}/` },
  });
}

/** Tells someone they have been given access to a website they did not create. */
export function sendProjectInviteEmail(
  to: string,
  websiteName: string,
  invitedBy: string,
  token?: string
) {
  const base = env.APP_URL.replace(/\/+$/, "");
  return send({
    to,
    subject: `You have been given access to ${websiteName}`,
    heading: `${invitedBy} has invited you to edit ${websiteName}.`,
    body: token
      ? "Create your password and you can start editing the content of this website straight away."
      : "Sign in with your usual Pagecraft account and you will find it waiting for you.",
    action: token
      ? { label: "Set up my account", url: link("/accept-invite", token) }
      : { label: "Sign in", url: `${base}/` },
  });
}
