import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-meta";

/**
 * The web app manifest.
 *
 * It is here for the dashboard rather than for search: someone who edits their
 * website every week ends up adding it to a phone's home screen, and without
 * this that shortcut opens in a browser chrome with a URL bar eating a tenth
 * of the screen. `start_url` is the projects list because an installed icon is
 * only ever pressed by someone who has an account.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: "Edit the words and photos on your website, then press Publish.",
    start_url: "/projects",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#f6f5f2",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
