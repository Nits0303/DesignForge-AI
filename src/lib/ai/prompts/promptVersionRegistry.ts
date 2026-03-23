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
    content: GENERATION_SYSTEM_PROMPT,
    description: "Semantic baseline for A/B comparisons (same content as bundled default).",
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
