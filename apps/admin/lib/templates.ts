/**
 * Sample-content page templates — a starting point instead of a blank page.
 *
 * These describe CONTENT only, in the exact shape `packages/shared/src/registry.ts`
 * expects for each section type. No design, no layout, no new API surface: applying
 * one is just the normal "create a page, add a section, fill it in" calls the store
 * already makes for `duplicatePage`, run against sample copy instead of a copied page.
 *
 * Keep every string inside its field's `max` (see registry.ts) and leave every
 * `image`/`file` field out — a new website has no media yet, so those stay for the
 * client to fill in.
 */

export interface PageTemplateSection {
  type: string;
  /** Only set this to override the section's default (type) name. */
  name?: string;
  content: Record<string, unknown>;
}

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  sections: PageTemplateSection[];
}

/** A solid button with the generic "get in touch" destination the client swaps in. */
const btn = (label: string, href = "/contact") => ({ label, href, variant: "Solid" });

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "landing",
    name: "Landing page",
    description: "A hero, feature highlights, testimonials and a call to action — a strong all-purpose homepage.",
    sections: [
      {
        type: "hero",
        content: {
          heading: "A short headline about what you do",
          subheading: "One clear sentence that tells a first-time visitor who you help and why it matters.",
          buttons: [btn("Get started")],
        },
      },
      {
        type: "features",
        content: {
          heading: "Why people choose you",
          items: [
            {
              title: "What makes you different",
              description: "A sentence about the value you deliver and why it matters to the people you serve.",
              bullets: [],
            },
            {
              title: "A skill or service you're known for",
              description: "The specific expertise, quality or experience that sets this apart.",
              bullets: [],
            },
            {
              title: "Something that builds trust",
              description: "A credential, guarantee or track record that reassures a new visitor.",
              bullets: [],
            },
          ],
        },
      },
      {
        type: "testimonials",
        content: {
          heading: "What people are saying",
          items: [
            {
              quote: "Working with them was easy from the very first conversation — clear, responsive, and exactly what we needed.",
              author: "A happy customer",
              role: "Client",
            },
            {
              quote: "The results spoke for themselves within the first month.",
              author: "Another happy customer",
              role: "Client",
            },
          ],
        },
      },
      {
        type: "cta",
        content: {
          heading: "Ready to get started?",
          subheading: "Reach out and let's talk about what you need.",
          buttons: [btn("Contact us")],
        },
      },
    ],
  },
  {
    id: "about",
    name: "About",
    description: "Introduce yourself with a hero, your story, what makes you different, and photos.",
    sections: [
      {
        type: "hero",
        content: {
          heading: "A little about us",
          subheading: "Share who you are, what you do, and why you do it — in your own words.",
        },
      },
      {
        type: "textBlock",
        content: {
          heading: "Our story",
          paragraphs: [
            {
              body: "Write a paragraph or two about how this began and what you set out to do. Keep it honest and specific — visitors read this to decide if they trust you.",
            },
            {
              body: "A second paragraph is a good place for what makes your approach different, or what you've learned along the way.",
            },
          ],
        },
      },
      {
        type: "features",
        content: {
          heading: "What we care about",
          items: [
            {
              title: "How we work",
              description: "A sentence about your process or approach — what someone can expect when they work with you.",
              bullets: [],
            },
            {
              title: "What we value",
              description: "A principle or value that guides the way you do things.",
              bullets: [],
            },
            {
              title: "Where we've been",
              description: "A bit of history, experience, or the milestones that got you here.",
              bullets: [],
            },
          ],
        },
      },
      {
        type: "gallery",
        content: {
          heading: "A few photos",
          images: [],
        },
      },
    ],
  },
  {
    id: "contact",
    name: "Contact",
    description: "A hero, contact details, common questions, and a call to action.",
    sections: [
      {
        type: "hero",
        content: {
          heading: "Get in touch",
          subheading: "We'd love to hear from you — send a message or reach out below.",
        },
      },
      {
        type: "contact",
        content: {
          heading: "Where to find us",
          intro: "Have a question or want to work together? Send a message and we'll get back to you soon.",
          hours: [{ days: "Monday – Friday", time: "9am – 5pm" }],
          showForm: true,
        },
      },
      {
        type: "faq",
        content: {
          heading: "Common questions",
          items: [
            {
              question: "What should I know before reaching out?",
              answer: "Share a little about what you need, and we'll follow up with next steps and timing.",
            },
            {
              question: "How quickly will I hear back?",
              answer: "We aim to reply within one or two business days.",
            },
          ],
        },
      },
      {
        type: "cta",
        content: {
          heading: "We usually reply within a day",
          subheading: "However you reach out, we're glad to hear from you.",
          buttons: [btn("Send a message")],
        },
      },
    ],
  },
  {
    id: "services",
    name: "Services",
    description: "A hero, a grid for what you offer, and a call to action.",
    sections: [
      {
        type: "hero",
        content: {
          heading: "What we offer",
          subheading: "A quick look at how we can help — take a look below or get in touch with questions.",
          buttons: [btn("Get in touch")],
        },
      },
      {
        type: "productGrid",
        content: {
          heading: "Our services",
          categories: [],
          products: [
            {
              name: "Your first service",
              description: "A short line about what it includes and who it's for.",
              specs: [],
            },
            {
              name: "Your second service",
              description: "A short line about what makes it worth choosing.",
              specs: [],
            },
          ],
        },
      },
      {
        type: "cta",
        content: {
          heading: "Not sure where to start?",
          subheading: "Tell us what you need and we'll point you in the right direction.",
          buttons: [btn("Get in touch")],
        },
      },
    ],
  },
];
