import { prisma } from "./helpers";
import { seedShadcnTier1 } from "./tier1/shadcn";
import { seedFlowbiteTier1 } from "./tier1/flowbite";
import { seedSocialTier1 } from "./tier1/social";
import { seedWebsiteTier2 } from "./tier2/website";
import { seedDashboardTier2 } from "./tier2/dashboard";
import { seedPatternsTier3 } from "./tier3/patterns";

async function main() {
  console.log("Seeding template library…");

  try {
    console.log("Tier 1: shadcn/ui components");
    await seedShadcnTier1();
    console.log("Tier 1: Flowbite sections");
    await seedFlowbiteTier1();
    console.log("Tier 1: social templates");
    await seedSocialTier1();

    console.log("Tier 2: website sections");
    await seedWebsiteTier2();
    console.log("Tier 2: dashboard sections");
    await seedDashboardTier2();

    console.log("Tier 3: design patterns");
    await seedPatternsTier3();

    const templateCount = await prisma.template.count();
    const patternCount = await prisma.designPattern.count();
    console.log(`Seed complete. Templates: ${templateCount}, Patterns: ${patternCount}`);
  } catch (err) {
    console.error("Seed failed", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

