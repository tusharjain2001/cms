import { Router } from "express";
import { SECTION_REGISTRY } from "@pagecraft/shared";
import { requireAuth } from "../middleware/auth.js";
import { ok } from "../lib/respond.js";

const router = Router();

/**
 * The registry, served to the dashboard so it can generate editing forms.
 * This is what makes "add a section type" a one-file change: the dashboard
 * has no built-in knowledge of what a Hero or a Product grid is.
 */
router.get("/", requireAuth, (_req, res) => ok(res, SECTION_REGISTRY));

export default router;
