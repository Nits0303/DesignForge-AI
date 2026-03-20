import { prisma } from "./helpers";
import { generateTemplatePreview } from "@/lib/templates/previewGenerator";

async function main() {
  const templates = await prisma.template.findMany({
    where: { previewUrl: null, isActive: true },
    select: { id: true },
  });

  console.log(`Generating previews for ${templates.length} templates…`);

  for (const tpl of templates) {
    try {
      await generateTemplatePreview(tpl.id);
      console.log("Generated preview for", tpl.id);
    } catch (err) {
      console.error("Failed to generate preview for", tpl.id, err);
    }
  }

  await prisma.$disconnect();
}

main();

