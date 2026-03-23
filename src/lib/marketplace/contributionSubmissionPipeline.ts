import { findSimilarTemplate } from "@/lib/marketplace/similarityCheck";
import { checkTemplateRenders } from "@/lib/marketplace/renderCheck";

export type SubmissionPipelineResult = {
  similarityFlagged: boolean;
  similarToTemplateId: string | null;
  renderCheckFailed: boolean;
};

/**
 * Runs optional async checks for templates entering the human review queue.
 */
export async function runSubmissionPipeline(args: {
  html: string;
  platform: string;
  category: string;
  excludeTemplateId?: string;
}): Promise<SubmissionPipelineResult> {
  const [similar, render] = await Promise.all([
    findSimilarTemplate({
      html: args.html,
      platform: args.platform,
      category: args.category,
      excludeTemplateId: args.excludeTemplateId,
    }),
    checkTemplateRenders(args.html),
  ]);

  return {
    similarityFlagged: !!similar,
    similarToTemplateId: similar?.templateId ?? null,
    renderCheckFailed: !render.ok,
  };
}
