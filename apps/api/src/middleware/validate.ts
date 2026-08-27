import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { badRequest } from "../lib/respond.js";

/**
 * Validates and replaces `req.body`. Every write route runs through this, so a
 * handler can trust its input completely.
 */
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        badRequest(
          "Some of those details are not right.",
          parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          }))
        )
      );
    }
    req.body = parsed.data as z.infer<S>;
    next();
  };
}
