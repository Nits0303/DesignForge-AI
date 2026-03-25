import { prisma } from "../src/lib/db/prisma";

async function main() {
  const designs = await prisma.design.findMany({
    select: {
      id: true,
      platform: true,
      dimensions: true,
      selectedDimensionId: true,
    },
  });

  let updated = 0;
  for (const d of designs) {
    if (d.selectedDimensionId) continue;
    const dims = d.dimensions as any;
    if (!dims || typeof dims !== "object") continue;
    const w = Number(dims.width);
    const h = Number(dims.height);
    if (!Number.isFinite(w) || !Number.isFinite(h)) continue;

    let id: string | null = null;
    if (w === 1080 && h === 1080) id = "square";
    else if (w === 1080 && h === 1350) id = "portrait";
    else if (w === 1200 && h === 675) id = "landscape";
    else if (w === 1200) id = "landscape";
    else if (w === 1080 && h === 1920) id = null; // story format, leave null

    if (!id) continue;

    await prisma.design.update({
      where: { id: d.id },
      data: { selectedDimensionId: id },
      select: { id: true },
    });
    updated += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`[backfillDimensions] Updated ${updated} designs.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[backfillDimensions] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

