import { prisma } from "@/lib/db/prisma";
import { enqueueExportJob } from "@/lib/export/enqueueExportJob";

async function main() {
  // Designs without a generated preview thumbnail (assetType="preview").
  const designs = await prisma.design.findMany({
    where: {
      assets: {
        none: { assetType: "preview" },
      },
    },
    select: { id: true, currentVersion: true },
  });

  // eslint-disable-next-line no-console
  console.log(`[thumbnails:backfill] Enqueuing ${designs.length} thumbnail jobs…`);

  let enqueued = 0;
  for (const d of designs) {
    try {
      await enqueueExportJob({ designId: d.id, versionNumber: d.currentVersion, format: "thumbnail" });
      enqueued += 1;
    } catch {
      // best effort
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[thumbnails:backfill] Enqueued ${enqueued}/${designs.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

