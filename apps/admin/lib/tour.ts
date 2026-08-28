/**
 * The first-sign-in tour: what it teaches, and how it knows what has been done.
 *
 * Two rules shape this file:
 *
 *  1. **Every step is judged from real product state**, never from a counter of
 *     how many times "Next" was pressed. Someone who created a page yesterday
 *     and signs in on a new laptop is not asked to create one again, and
 *     someone who wanders off mid-way picks up exactly where they left off.
 *  2. **Nothing here knows about any particular section type.** The tour points
 *     at the "Add section" button and lets the registry-driven picker say what
 *     is available, because the registry is the only place that decides that.
 *
 * The overlay that draws these lives in `components/tour.tsx`.
 */

export interface TourState {
  pathname: string;
  projectId: string;
  projectCount: number;
  pageCount: number;
  /** The page to send someone to when a step lives in the editor. */
  editorPageId: string;
  sectionCount: number;
  /** True while the page editor is open, so a page's sections are visible. */
  inEditor: boolean;
  /** True once any section on the open page has words or photos in it. */
  contentFilled: boolean;
  mediaCount: number;
  uploadsEnabled: boolean;
  anyPagePublished: boolean;
}

export interface TourStep {
  id: string;
  /** Short label for the progress list. */
  label: string;
  title: string;
  body: string;
  /**
   * Selectors for the control this step is about, best first. The first one
   * present on screen is spotlit; if none are, the card sits in the corner with
   * a link to the screen that has them.
   */
  anchors: string[];
  /** Judged from real state — see the note at the top of this file. */
  done: (s: TourState) => boolean;
  /** Where this step's controls live, or "" when it has no particular home. */
  href: (s: TourState) => string;
  /** Wording for the "take me there" button. */
  hereLabel: string;
  /**
   * Set when the step cannot be finished through no fault of the person doing
   * it — uploads switched off, say. The step then explains itself and offers to
   * be skipped rather than blocking the rest of the tour.
   */
  unavailable?: (s: TourState) => string | null;
}

/** A section counts as filled once it holds any words, photo or list row. */
export function hasContent(content: Record<string, unknown>): boolean {
  return Object.values(content).some((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    // Toggles are deliberately ignored: several start switched on, so they say
    // nothing about whether anybody has typed anything.
    return value !== null && typeof value === "object";
  });
}

const pages = (s: TourState) => (s.projectId ? `/projects/${s.projectId}/pages` : "/projects");
const editor = (s: TourState) =>
  s.projectId && s.editorPageId ? `${pages(s)}/${s.editorPageId}` : pages(s);
const media = (s: TourState) => (s.projectId ? `/projects/${s.projectId}/media` : "/projects");

export const TOUR_STEPS: TourStep[] = [
  {
    id: "website",
    label: "Create your website",
    title: "Start with a website",
    body: "Everything you write lives inside a website. Press “New website”, give it a name, and you are in.",
    anchors: ['[data-tour="new-website"]'],
    done: (s) => s.projectCount > 0,
    href: () => "/projects",
    hereLabel: "Go to your websites",
  },
  {
    id: "page",
    label: "Add a page",
    title: "Now add a page",
    body: "A page is one address on your website — Home, About, Contact. Most people start with Home. Its web address is made for you.",
    anchors: ['[data-tour="add-page"]', '[data-tour="nav-pages"]'],
    done: (s) => s.pageCount > 0,
    href: pages,
    hereLabel: "Go to Pages",
  },
  {
    id: "open",
    label: "Open the page",
    title: "Open it to start building",
    body: "Press Edit on the page you just made. That is where you choose what appears on it, top to bottom.",
    anchors: ['[data-tour="page-row"]', '[data-tour="nav-pages"]'],
    // Reaching the editor at all is the lesson; anything on the page proves it
    // too, so this stays done once there is something to show for it.
    done: (s) => s.inEditor || s.sectionCount > 0,
    href: pages,
    hereLabel: "Go to Pages",
  },
  {
    id: "section",
    label: "Add a section",
    title: "Add your first section",
    body: "Sections are the ready-made parts your website was built from — a banner, a list of features, a contact block. Press “+ Add section” and pick one.",
    anchors: ['[data-tour="add-section"]', '[data-tour="page-row"]'],
    done: (s) => s.sectionCount > 0,
    href: editor,
    hereLabel: "Open the page editor",
  },
  {
    id: "content",
    label: "Fill it in",
    title: "Fill in your words",
    body: "This panel changes to match whichever section you have selected. Type into it — everything saves as you go, and nothing is live yet.",
    anchors: ['[data-tour="content-panel"]', '[data-tour="add-section"]'],
    done: (s) => s.contentFilled,
    href: editor,
    hereLabel: "Open the page editor",
  },
  {
    id: "media",
    label: "Add a photo",
    title: "Your photos live here",
    body: "Upload once, then pick the same photo in as many sections as you like. Drag photos onto the dotted area, or click it to choose from your computer.",
    anchors: [
      '[data-tour="media-dropzone"]',
      '[data-tour="uploads-disabled"]',
      '[data-tour="nav-media"]',
    ],
    done: (s) => s.mediaCount > 0,
    href: media,
    hereLabel: "Go to Photos & files",
    // Uploads are optional infrastructure, so this step must never be a wall.
    unavailable: (s) =>
      s.uploadsEnabled
        ? null
        : "Uploads are not switched on for this CMS yet, so there is nothing to try here. Everything else works without them — skip this one for now.",
  },
  {
    id: "publish",
    label: "Publish",
    title: "Press Publish to go live",
    body: "Nothing you have done so far is on your website yet. Publish copies this page across, and your website updates itself within seconds.",
    anchors: ['[data-tour="publish"]', '[data-tour="page-row"]'],
    done: (s) => s.anyPagePublished,
    href: editor,
    hereLabel: "Open the page editor",
  },
];

/**
 * The first step still to do, or `TOUR_STEPS.length` when there are none.
 *
 * `skipped` carries the steps that could not be done here — an upload step on
 * an instance with no storage configured. Without it the tour could never
 * reach its closing card on such an instance, which is exactly the situation
 * the `unavailable` escape hatch exists to rescue.
 */
export function firstUndoneIndex(state: TourState, skipped: string[] = []): number {
  const index = TOUR_STEPS.findIndex((step) => !step.done(state) && !skipped.includes(step.id));
  return index === -1 ? TOUR_STEPS.length : index;
}
