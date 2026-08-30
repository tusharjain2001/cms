import { connectDb, disconnectDb } from "./db.js";
import { env } from "./config/env.js";
import { User, hashPassword } from "./models/user.js";
import { Project, newApiKey } from "./models/project.js";
import { Page, newSectionId } from "./models/page.js";
import { defaultContent, getSectionType, sectionTypeNames } from "@pagecraft/shared";

/**
 * Creates the platform administrator — you, whoever runs this CMS — and a demo
 * website to look at.
 *
 * This is the ONLY way an account gets `isPlatformAdmin`, and the only way one
 * gets created without confirming an email address. Everybody else signs up
 * through the dashboard like any other user.
 *
 * Safe to re-run: it never overwrites an existing account.
 *
 *   npm run seed
 */
async function main() {
  const email = (process.env.SEED_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.SEED_PASSWORD ?? "";
  const name = process.env.SEED_NAME ?? "Developer";

  if (!email || !password) {
    console.error("Set SEED_EMAIL and SEED_PASSWORD in apps/api/.env first.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("SEED_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  await connectDb(env.MONGODB_URI);

  let user = await User.findOne({ email });
  if (user) {
    console.log(`Account already exists: ${email}`);
  } else {
    user = await User.create({
      email,
      name,
      isPlatformAdmin: true,
      // Seeded by hand at the console, so there is nothing to prove by email.
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(password),
      projectIds: [],
      // Whoever runs the instance is not a customer, so they are not sent
      // through Razorpay to get a website. This is a comped subscription, not
      // a trial — ordinary signups still start at zero websites and pay.
      plan: "starter",
      subscription: {
        status: "active",
        websites: 20,
        period: "monthly",
      },
    });
    console.log(`Created platform administrator: ${email}`);
  }

  let project = await Project.findOne({ ownerId: user._id, slug: "demo" });
  if (project) {
    console.log("Demo website already exists.");
  } else {
    project = await Project.create({
      ownerId: user._id,
      name: "Demo Website",
      slug: "demo",
      domain: "example.com",
      apiKey: newApiKey(),
      allowedSectionTypes: sectionTypeNames(),
    });
    console.log(`Created demo website with key ${project.apiKey}`);
  }

  // A home page with one filled-in hero, so there is something to look at.
  const existingHome = await Page.findOne({ projectId: project._id, slug: "" });
  if (existingHome) {
    console.log("Demo home page already exists.");
  } else {
    const hero = getSectionType("hero")!;
    const section = {
      id: newSectionId(),
      type: "hero",
      name: "Main Banner",
      order: 0,
      visible: true,
      content: {
        ...defaultContent(hero),
        heading: "Your words, your website",
        subheading: "Edit everything on this page from the Pagecraft dashboard.",
      },
    };

    await Page.create({
      projectId: project._id,
      slug: "",
      title: "Home",
      order: 0,
      status: "draft",
      draftDirty: true,
      sections: [],
      draftSections: [section],
    });
    console.log("Created a demo Home page with a hero section.");
  }

  console.log(`\nSign in at the dashboard with ${email}`);
  console.log(`Public content key for this website: ${project.apiKey}`);

  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
