import jwt, { type SignOptions } from "jsonwebtoken";
import type { Response } from "express";
import { env, isProd } from "../config/env.js";
import type { Role } from "@pagecraft/shared";

export interface AccessClaims {
  sub: string;
  role: Role;
}

export const REFRESH_COOKIE = "pc_refresh";

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
}

/**
 * Short-lived token that lets the client's own website render their unpublished
 * draft. Scoped to one page, so it cannot be used to browse anything else.
 */
export function signPreviewToken(pageId: string): string {
  return jwt.sign({ pageId, kind: "preview" }, env.JWT_ACCESS_SECRET, { expiresIn: "30m" });
}

export function verifyPreviewToken(token: string): { pageId: string } {
  const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as { pageId?: string; kind?: string };
  if (claims.kind !== "preview" || !claims.pageId) {
    throw new Error("Not a preview token");
  }
  return { pageId: claims.pageId };
}

/**
 * The refresh token lives in an httpOnly cookie so JavaScript on the dashboard
 * can never read it; only the short-lived access token is held in memory.
 */
export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}
