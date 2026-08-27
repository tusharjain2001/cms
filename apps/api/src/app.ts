import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { allowedOrigins } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import sectionTypeRoutes from "./routes/section-types.js";
import pageRoutes from "./routes/pages.js";
import mediaRoutes from "./routes/media.js";
import contentRoutes from "./routes/content.js";

/**
 * The Express app, separate from the server bootstrap so tests can mount it
 * without opening a port.
 */
export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true, // the refresh cookie has to travel
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" } });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/section-types", sectionTypeRoutes);
  // Read-only, API-key authenticated. This is what client websites call.
  // Mounted BEFORE the page routes, which sit on the broad `/api` prefix.
  app.use("/api/content", contentRoutes);
  // Pages, sections and media span both /api/projects/:id/... and
  // /api/pages|media/:id, so these routers take the whole `/api` prefix and
  // authenticate per route rather than with `router.use`.
  app.use("/api", pageRoutes);
  app.use("/api", mediaRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
