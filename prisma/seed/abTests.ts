import { randomUUID } from "crypto";
import { prisma } from "./helpers";

/**
 * Draft A/B tests for Sprint 16 — launch from admin when ready.
 */
export async function seedAbTestDrafts() {
  const existing = await prisma.promptABTest.count();
  if (existing > 0) {
    console.log("Skipping A/B seed: PromptABTest rows already exist.");
    return;
  }

  const v1a = randomUUID();
  const v1b = randomUUID();
  const v2a = randomUUID();
  const v2b = randomUUID();

  await prisma.promptABTest.create({
    data: {
      name: "Instagram Post — Headline Size Default",
      description: "Control vs +15% headline size modifier.",
      platform: "instagram",
      format: "post",
      status: "draft",
      variants: [
        {
          id: v1a,
          name: "Control",
          allocationPercent: 50,
          templateSelectionStrategy: "default",
          promptModifications: {},
        },
        {
          id: v1b,
          name: "Larger headlines",
          allocationPercent: 50,
          templateSelectionStrategy: "default",
          promptModifications: { headlineSizeModifier: 1.15 },
        },
      ],
      minSamplesPerVariant: 50,
    },
  });

  await prisma.promptABTest.create({
    data: {
      name: "Website Landing Page — Template Diversity",
      description: "Default selection vs prefer_diversity.",
      platform: "website",
      format: "landing_page",
      status: "draft",
      variants: [
        {
          id: v2a,
          name: "Control",
          allocationPercent: 50,
          templateSelectionStrategy: "default",
          promptModifications: {},
        },
        {
          id: v2b,
          name: "Diversity",
          allocationPercent: 50,
          templateSelectionStrategy: "prefer_diversity",
          promptModifications: {},
        },
      ],
      minSamplesPerVariant: 30,
    },
  });

  console.log("Seeded 2 draft PromptABTest records.");
}
