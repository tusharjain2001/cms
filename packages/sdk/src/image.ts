import type { ImageValue } from "@pagecraft/shared";

/**
 * Cloudinary delivery helpers.
 *
 * Clients upload whatever came off their phone. These rewrite the URL so the
 * visitor gets a resized, modern-format copy from the CDN instead — usually a
 * 70–80% saving, with no work on the website's part.
 */

export interface ImageOptions {
  /** Max width in pixels. The image is never scaled up. */
  width?: number;
  height?: number;
  /** `limit` keeps the whole image; `fill` crops to the exact box. */
  crop?: "limit" | "fill" | "thumb";
  quality?: "auto" | number;
}

export function cmsImageUrl(url: string, opts: ImageOptions = {}): string {
  const marker = "/upload/";
  const at = url.indexOf(marker);
  if (at === -1) return url; // not a Cloudinary URL — leave it alone

  const parts = [
    "f_auto",
    `q_${opts.quality ?? "auto"}`,
    opts.width ? `w_${opts.width}` : "",
    opts.height ? `h_${opts.height}` : "",
    `c_${opts.crop ?? "limit"}`,
  ].filter(Boolean);

  return `${url.slice(0, at + marker.length)}${parts.join(",")}/${url.slice(at + marker.length)}`;
}

/** A ready-made `srcset` so browsers pick the right size for the screen. */
export function cmsSrcSet(url: string, widths = [640, 960, 1280, 1920]): string {
  return widths.map((w) => `${cmsImageUrl(url, { width: w })} ${w}w`).join(", ");
}

/** Everything an `<img>` needs from a CMS image field, including the alt text. */
export function imageProps(
  image: ImageValue | null | undefined,
  opts: ImageOptions = {}
): { src: string; srcSet: string; width: number; height: number; alt: string } | null {
  if (!image?.url) return null;
  return {
    src: cmsImageUrl(image.url, opts),
    srcSet: cmsSrcSet(image.url),
    width: image.width,
    height: image.height,
    // Empty alt is correct for decorative images; never invent a description.
    alt: image.alt ?? "",
  };
}
