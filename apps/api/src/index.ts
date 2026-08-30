import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { env, isProd } from "./config/env.js";
import { warnAboutBillingConfig } from "./lib/razorpay.js";

async function main() {
  await connectDb(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  // Payments can be misconfigured in ways that look healthy until money is
  // involved, so the server says so at boot rather than at the first renewal.
  warnAboutBillingConfig();

  // In production the API sits behind nginx on the same box, so it only needs
  // the loopback interface — binding 0.0.0.0 there would expose it to the
  // internet directly. Local dev binds all interfaces so a phone on the same
  // network can reach it. (Previously this was a hand-applied patch on the
  // server, re-done on every redeploy; making it conditional removes that.)
  const host = isProd ? "127.0.0.1" : "0.0.0.0";
  createApp().listen(env.PORT, host, () => {
    console.log(`Pagecraft API listening on http://${host === "0.0.0.0" ? "localhost" : host}:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
