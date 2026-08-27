import { createHash } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Cloudinary, without the SDK.
 *
 * The important property here is that the API secret NEVER leaves this server.
 * The browser asks for a signature, uploads the file straight to Cloudinary
 * with it, and then tells us what landed. That keeps large files off our API
 * entirely — the upload does not pass through Render — while the secret stays
 * server-side.
 */

export const cloudinaryConfigured = () =>
  Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

/**
 * Cloudinary's documented signing rule: take the params to sign, sort them by
 * key, join as `k=v&k=v`, append the API secret, then SHA-1 the result.
 */
export function signParams(params: Record<string, string | number>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1")
    .update(toSign + (env.CLOUDINARY_API_SECRET ?? ""))
    .digest("hex");
}

export interface UploadTicket {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  uploadUrl: string;
}

/**
 * A one-shot permit for the browser to upload a single file into this
 * project's folder. Scoping the folder per project means one client's upload
 * can never land in another's library.
 */
export function createUploadTicket(projectId: string, resourceType: "image" | "raw"): UploadTicket {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `${env.CLOUDINARY_FOLDER}/${projectId}`;
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    timestamp,
    folder,
    signature: signParams({ folder, timestamp }),
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
  };
}

/** Removes the file from Cloudinary so deleting from the library is real. */
export async function destroyAsset(
  publicId: string,
  resourceType: "image" | "raw"
): Promise<boolean> {
  if (!cloudinaryConfigured()) return false;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp });

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          public_id: publicId,
          api_key: env.CLOUDINARY_API_KEY,
          timestamp,
          signature,
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    return res.ok;
  } catch {
    // The library row is still removed; an orphaned file is a small price
    // next to a delete that appears to fail.
    return false;
  }
}

/**
 * Rewrites a delivery URL to ask Cloudinary for an optimised version.
 * `f_auto,q_auto` alone typically cuts a client's phone photo by 70–80%.
 */
export function optimisedUrl(url: string, width?: number): string {
  const marker = "/upload/";
  const at = url.indexOf(marker);
  if (at === -1) return url;
  const transform = ["f_auto", "q_auto", width ? `w_${width}` : "", "c_limit"]
    .filter(Boolean)
    .join(",");
  return `${url.slice(0, at + marker.length)}${transform}/${url.slice(at + marker.length)}`;
}
