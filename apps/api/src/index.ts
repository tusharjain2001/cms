import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { env } from "./config/env.js";

async function main() {
  await connectDb(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  createApp().listen(env.PORT, () => {
    console.log(`Pagecraft API listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
