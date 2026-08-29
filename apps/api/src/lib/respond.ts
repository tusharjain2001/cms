import type { Response } from "express";
import type { ApiErrorCode, ValidationIssue } from "@pagecraft/shared";

/** Every response in this API uses the same envelope. */
export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(
  res: Response,
  status: number,
  error: string,
  issues?: ValidationIssue[],
  code?: ApiErrorCode
) {
  return res.status(status).json({
    success: false,
    error,
    ...(code ? { code } : {}),
    ...(issues ? { issues } : {}),
  });
}

/** Thrown anywhere in a handler; turned into a response by the error middleware. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: ValidationIssue[],
    /** Set only where the dashboard has to branch on the reason. */
    public code?: ApiErrorCode
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string, issues?: ValidationIssue[]) =>
  new HttpError(400, msg, issues);
export const unauthorized = (msg = "Please sign in.", code?: ApiErrorCode) =>
  new HttpError(401, msg, undefined, code);
export const forbidden = (msg = "You do not have access to that.", code?: ApiErrorCode) =>
  new HttpError(403, msg, undefined, code);
export const notFound = (msg = "Not found.") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
/** A plan limit was hit — 402 tells the dashboard to offer an upgrade. */
export const paymentRequired = (msg: string) =>
  new HttpError(402, msg, undefined, "quota_exceeded");
export const serviceUnavailable = (msg: string, code?: ApiErrorCode) =>
  new HttpError(503, msg, undefined, code);
