import type { ImageValue } from "@pagecraft/shared";

/**
 * Image delivery helpers.
 *
 * Clients upload whatever came off their phone. These rewrite the URL so the
 * visitor gets a resized, modern-format copy from the CDN instead — usually a
 * 70–80% saving, with no work on the website's part.
 *
 * Two CDNs are understood:
 *
 * - **Cloudflare Image Transformations** (`/cdn-cgi/image/<opts>/<key>`), which
 *   is what the R2 media backbone serves through — see `apps/api/src/lib/r2.ts`.
 * - **Cloudinary** (`/upload/<opts>/…`), the previous backbone. Still handled,
 *   because content uploaded before the migration keeps its old URL forever.
 *
 * Anything else is left exactly as it was. A URL on a host with no transform
 * service must never be rewritten — the rewrite would 404 a working image.
 */

export type ImageTransformProvider = "auto" | "cloudflare" | "cloudinary" | "none";

export interface ImageOptions {
  /** Max width in pixels. The image is never scaled up. */
  width?: number;
  height?: number;
  /** `limit` keeps the whole image; `fill` crops to the exact box. */
  crop?: "limit" | "fill" | "thumb";
  quality?: "auto" | number;
  /**
   * Which CDN to ask. `auto` (the default) reads it off the URL and falls back
   * to whatever `configureCmsImages` set — `none` if it was never called.
   */
  provider?: ImageTransformProvider;
}

/**
 * Widths the responsive `srcset` offers.
 *
 * Deliberately short: Cloudflare bills *unique* transformations, so every extra
 * width multiplies cost across every image on the site. Mirrors `SRCSET_WIDTHS`
 * in the API's r2.ts.
 */
export const SRCSET_WIDTHS = [320, 640, 960, 1280, 1920];

/* --------------------------------------------------------------- site config */

interface CmsImageConfig {
  /** Used when the URL itself does not say which CDN it is on. */
  provider: Exclude<ImageTransformProvider, "auto">;
}

let config: CmsImageConfig = { provider: "none" };

/**
 * Tells the SDK which CDN a plain media URL lives on, once, for the whole site.
 *
 * A Pagecraft media URL is just `https://<your-cdn>/<projectId>/<hash>.jpg` —
 * there is nothing in it that says the host can resize. So a site whose media
 * domain is a Cloudflare zone with Image Transformations turned on declares it:
 *
 * ```ts
 * configureCmsImages({ provider: "cloudflare" });
 * ```
 *
 * Leave it unset and images are served at their original size, which is slower
 * but never broken. That is the right default: a wrong guess here turns every
 * photo on a live site into a 404.
 */
export function configureCmsImages(next: Partial<CmsImageConfig>): void {
  config = { ...config, ...next };
}

/** Back to the safe default. Mostly here so tests cannot leak into each other. */
export function resetCmsImages(): void {
  config = { provider: "none" };
}

/* ------------------------------------------------------------------ internals */

const CF_MARKER = "/cdn-cgi/image/";
const CLOUDINARY_MARKER = "/upload/";

function resolveProvider(url: string, requested: ImageTransformProvider = "auto") {
  if (requested !== "auto") return requested;
  if (url.includes(CF_MARKER)) return "cloudflare";
  if (url.includes(CLOUDINARY_MARKER)) return "cloudinary";
  return config.provider;
}

const CF_FIT: Record<NonNullable<ImageOptions["crop"]>, string> = {
  limit: "scale-down",
  fill: "cover",
  thumb: "crop",
};

function cloudflareUrl(url: string, opts: ImageOptions): string {
  let origin: string;
  let path: string;

  try {
    const parsed = new URL(url);
    origin = parsed.origin;
    // Re-transforming an already-transformed URL must not stack option
    // segments, or the second set is read as part of the object key.
    const at = parsed.pathname.indexOf(CF_MARKER);
    const endOfOpts = at === -1 ? -1 : parsed.pathname.indexOf("/", at + CF_MARKER.length);
    path = endOfOpts === -1 ? parsed.pathname : parsed.pathname.slice(endOfOpts);
    path = path.replace(/^\/+/, "") + parsed.search;
  } catch {
    return url; // relative or malformed — nothing safe to do
  }

  const crop = opts.crop ?? "limit";
  const params = [
    "f=auto",
    // Cloudflare has no q=auto; omitting it takes their default (85).
    typeof opts.quality === "number" ? `q=${opts.quality}` : "",
    opts.width ? `w=${opts.width}` : "",
    opts.height ? `h=${opts.height}` : "",
    `fit=${CF_FIT[crop]}`,
    crop === "thumb" ? "gravity=auto" : "",
  ].filter(Boolean);

  return `${origin}${CF_MARKER}${params.join(",")}/${path}`;
}

function cloudinaryUrl(url: string, opts: ImageOptions): string {
  const at = url.indexOf(CLOUDINARY_MARKER);
  if (at === -1) return url;

  const parts = [
    "f_auto",
    `q_${opts.quality ?? "auto"}`,
    opts.width ? `w_${opts.width}` : "",
    opts.height ? `h_${opts.height}` : "",
    `c_${opts.crop ?? "limit"}`,
  ].filter(Boolean);

  const rest = url.slice(at + CLOUDINARY_MARKER.length);
  return `${url.slice(0, at + CLOUDINARY_MARKER.length)}${parts.join(",")}/${rest}`;
}

/* -------------------------------------------------------------------- public */

export function cmsImageUrl(url: string, opts: ImageOptions = {}): string {
  if (!url) return url;

  switch (resolveProvider(url, opts.provider)) {
    case "cloudflare":
      return cloudflareUrl(url, opts);
    case "cloudinary":
      return cloudinaryUrl(url, opts);
    default:
      return url;
  }
}

/**
 * A ready-made `srcset` so browsers pick the right size for the screen.
 *
 * Returns an empty string when the URL cannot be resized — a srcset of four
 * identical URLs with different width descriptors is worse than none at all:
 * the browser believes it is choosing, picks the widest, and downloads the full
 * original on a phone.
 */
export function cmsSrcSet(
  url: string,
  widths: number[] = SRCSET_WIDTHS,
  opts: ImageOptions = {}
): string {
  if (!url) return "";
  if (resolveProvider(url, opts.provider) === "none") return "";

  const unique = [...new Set(widths.filter((w) => w > 0))].sort((a, b) => a - b);
  return unique.map((w) => `${cmsImageUrl(url, { ...opts, width: w })} ${w}w`).join(", ");
}

export interface ImagePropsResult {
  src: string;
  /** Omitted when the URL cannot be resized, rather than emitting a fake one. */
  srcSet?: string;
  sizes?: string;
  /**
   * The original's intrinsic size, **omitted when it is not known**.
   *
   * The library stores 0 for anything it could not measure — an SVG, a PDF, a
   * file registered through the API without dimensions (the register endpoint
   * defaults both to 0). And `width={0}` on an `<img>` does not mean "unknown",
   * it is an instruction to render a zero-pixel box: the image disappears.
   * Leaving the attribute off lets the browser size the image from the file,
   * which is exactly what a site with no measurement should do.
   *
   * The two are independent — a known width still ships even if the height is
   * missing, since a wrong pair is worse than a partial one.
   */
  width?: number;
  height?: number;
  alt: string;
}

/** A usable pixel dimension, or undefined for 0, negative, NaN and missing. */
function knownSize(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Everything an `<img>` needs from a CMS image field, including the alt text. */
export function imageProps(
  image: ImageValue | null | undefined,
  opts: ImageOptions & { sizes?: string } = {}
): ImagePropsResult | null {
  if (!image?.url) return null;

  // Never offer a candidate wider than the original: the CDN would bill a
  // transformation to hand back the same pixels.
  const intrinsic = knownSize(image.width);
  const height = knownSize(image.height);
  const widths = intrinsic
    ? [...SRCSET_WIDTHS.filter((w) => w < intrinsic), intrinsic]
    : SRCSET_WIDTHS;

  const srcSet = cmsSrcSet(image.url, widths, opts);

  // The same rule applies to `src`: asking for 1920 of a 1600px original is a
  // second billed transform that returns the first one's pixels.
  const src = intrinsic && opts.width && opts.width > intrinsic ? { ...opts, width: intrinsic } : opts;

  return {
    src: cmsImageUrl(image.url, src),
    ...(srcSet ? { srcSet } : {}),
    ...(opts.sizes ? { sizes: opts.sizes } : {}),
    ...(intrinsic ? { width: intrinsic } : {}),
    ...(height ? { height } : {}),
    // Empty alt is correct for decorative images; never invent a description.
    alt: image.alt ?? "",
  };
}
