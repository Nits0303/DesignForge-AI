import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/response";
import { selectTemplatesForIntent } from "@/lib/ai/componentSelector";
import type { ParsedIntent } from "@/types/ai";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const prompt = searchParams.get("prompt") ?? "";
    const platform = (searchParams.get("platform") ?? "instagram") as any;
    const format = searchParams.get("format") ?? "post";

    const intent: ParsedIntent = {
      platform,
      format,
      dimensions: { width: 1080, height: 1080 },
      slideCount: undefined,
      screenCount: undefined,
      styleContext: [],
      contentRequirements: prompt ? [prompt] : [],
      requiresImageGeneration: false,
      suggestedTemplateTags: [],
      designMood: "minimal",
      colorPreference: "brand",
      complexity: "simple",
    };

    const templates = await selectTemplatesForIntent(intent);

    return ok({ items: templates });
  } catch (err) {
    console.error("Error in GET /api/templates/recommend", err);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

