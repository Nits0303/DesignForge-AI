import { prisma } from "@/lib/db/prisma";
import { GENERATION_PROMPT_VERSION, GENERATION_SYSTEM_PROMPT } from "./generationSystemPrompt";

export type PromptVersionMeta = {
  version: string;
  content: string;
  description: string;
  createdAt: string;
  platform?: string;
  format?: string;
};

/** Central registry of system prompt versions (production + test). */
export const PROMPT_VERSION_REGISTRY: Record<string, PromptVersionMeta> = {
  [GENERATION_PROMPT_VERSION]: {
    version: GENERATION_PROMPT_VERSION,
    content: GENERATION_SYSTEM_PROMPT,
    description: "Current bundled generation system prompt (Sprint 4+).",
    createdAt: "2026-03-01T00:00:00.000Z",
  },
  "v1.0.0": {
    version: "v1.0.0",
    content: `You are DesignForge AI, an expert visual designer producing HTML+CSS designs.

CRITICAL: Never generate blank or near-blank designs. Fill the entire canvas. Use rich color treatment on every background.

Output: Return only a complete raw HTML document (<!doctype html> to </html>). No markdown fences. No explanation.

Canvas: Set root element inline style to the exact requested dimensions. No overflow. No horizontal scroll.

Design standards:
- Background: always use gradient or color — never plain white unless explicitly requested
- Headlines: 48px+ font-weight 800, letter-spacing -0.02em
- Brand colors: apply brand primary color to backgrounds, gradients, CTA buttons, and accent shapes
- Cards: box-shadow and border-radius 16px minimum
- Social posts: fill the entire canvas with visual composition — no empty corners
- Images: use <img data-placeholder="true" alt="specific descriptive context" style="width:100%;height:100%;object-fit:cover" /> — never invent URLs

Reference image (if provided): Extract visual style only (colors, layout structure, shape language, spacing). Never copy the reference's text, subject matter, or specific content. Apply style to the user's brand and prompt.

Return the complete HTML when ready. No partial returns.`.trim(),
    description: "Compact baseline variant for A/B testing — same quality targets, minimal prompt length. Tests whether concise instructions produce better or worse output than verbose instructions.",
    createdAt: "2026-03-01T00:00:00.000Z",
  },
};

/** True if the version exists in the in-code registry. */
export function isPromptVersionRegistered(versionKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROMPT_VERSION_REGISTRY, versionKey);
}

/** Static + `DynamicPromptVersion` rows (promoted winners, etc.). */
export async function isPromptVersionKeyValid(versionKey: string): Promise<boolean> {
  if (isPromptVersionRegistered(versionKey)) return true;
  const row = await prisma.dynamicPromptVersion.findUnique({
    where: { versionKey },
    select: { id: true },
  });
  return !!row;
}

/** If any variant references an unknown prompt version key, return that key (Sprint 16 guard). */
export async function getMissingVariantPromptVersionKey(variants: unknown): Promise<string | null> {
  const arr = Array.isArray(variants) ? variants : [];
  for (const v of arr as Array<{
    systemPromptVersion?: string;
    promptModifications?: { systemPromptVersion?: string };
  }>) {
    const keys = [v?.systemPromptVersion, v?.promptModifications?.systemPromptVersion];
    for (const k of keys) {
      if (typeof k === "string" && k.trim()) {
        const ok = await isPromptVersionKeyValid(k.trim());
        if (!ok) return k.trim();
      }
    }
  }
  return null;
}

export function getPromptVersion(versionKey: string): PromptVersionMeta {
  const v = PROMPT_VERSION_REGISTRY[versionKey];
  if (v) return v;
  return {
    version: versionKey,
    content: GENERATION_SYSTEM_PROMPT,
    description: "Fallback: unknown key; using bundled generation system prompt",
    createdAt: new Date().toISOString(),
  };
}

/** Resolve system prompt content for generation (static registry, then DB dynamic rows). */
export async function resolvePromptVersionForGeneration(versionKey: string): Promise<PromptVersionMeta> {
  const staticV = PROMPT_VERSION_REGISTRY[versionKey];
  if (staticV) return staticV;
  const dynamic = await prisma.dynamicPromptVersion.findUnique({
    where: { versionKey },
  });
  if (dynamic) {
    return {
      version: dynamic.versionKey,
      content: dynamic.content,
      description: dynamic.description,
      createdAt: dynamic.createdAt.toISOString(),
    };
  }
  return getPromptVersion(versionKey);
}

/** DB-backed default per platform/format; falls back to bundled generation version string. */
export async function getCurrentDefaultVersionKey(platform: string, format: string): Promise<string> {
  const row = await prisma.systemPromptDefault.findFirst({
    where: { platform, format },
    select: { systemPromptVersion: true },
  });
  return row?.systemPromptVersion ?? GENERATION_PROMPT_VERSION;
}
