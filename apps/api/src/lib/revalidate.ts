import type { ProjectDoc } from "../models/project.js";

export interface RevalidateOutcome {
  attempted: boolean;
  ok: boolean;
  message: string;
}

/**
 * Tell the live website to regenerate the pages that just changed.
 *
 * This is the mechanism behind "the client presses Publish and the site
 * updates itself" — the site exposes a small `/api/revalidate` route that
 * checks the shared secret and calls `revalidatePath`.
 *
 * A failure here never fails the publish: the content IS live in the database
 * and the site will pick it up on its next natural rebuild. We report what
 * happened so the dashboard can say so plainly.
 */
export async function fireRevalidate(
  project: ProjectDoc,
  paths: string[]
): Promise<RevalidateOutcome> {
  if (!project.revalidateUrl) {
    return {
      attempted: false,
      ok: true,
      message: "No publish webhook is set for this website, so nothing was notified.",
    };
  }

  try {
    const res = await fetch(project.revalidateUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: project.revalidateSecret, paths }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return {
        attempted: true,
        ok: false,
        message: `The website answered ${res.status} when told to refresh. Your content is saved and live in the CMS.`,
      };
    }

    return { attempted: true, ok: true, message: "The website has been told to refresh." };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "did not answer in time" : "could not be reached";
    return {
      attempted: true,
      ok: false,
      message: `The website ${reason}. Your content is saved and live in the CMS.`,
    };
  }
}
