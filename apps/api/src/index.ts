import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { env, isProd } from "./config/env.js";

async function main() {
  await connectDb(env.MONGODB_URI);
  console.log("Connected to MongoDB");

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
