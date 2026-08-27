import type { Response } from "express";
import type { ValidationIssue } from "@pagecraft/shared";

/** Every response in this API uses the same envelope. */
export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(
  res: Response,
  status: number,
  error: string,
  issues?: ValidationIssue[]
) {
  return res.status(status).json({ success: false, error, ...(issues ? { issues } : {}) });
}

/** Thrown anywhere in a handler; turned into a response by the error middleware. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: ValidationIssue[]
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string, issues?: ValidationIssue[]) =>
  new HttpError(400, msg, issues);
export const unauthorized = (msg = "Please sign in.") => new HttpError(401, msg);
export const forbidden = (msg = "You do not have access to that.") => new HttpError(403, msg);
export const notFound = (msg = "Not found.") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
