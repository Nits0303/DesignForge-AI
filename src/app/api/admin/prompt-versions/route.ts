import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/db/prisma";
import { requireAdminUser } from "@/lib/analytics/admin/requireAdmin";
import { PROMPT_VERSION_REGISTRY } from "@/lib/ai/prompts/promptVersionRegistry";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminUser();
    const defaults = await prisma.systemPromptDefault.findMany({
      select: { platform: true, format: true, systemPromptVersion: true, updatedAt: true },
    });
    const staticVersions = Object.values(PROMPT_VERSION_REGISTRY).map((v) => ({
      version: v.version,
      description: v.description,
      createdAt: v.createdAt,
      platform: v.platform ?? null,
      format: v.format ?? null,
      source: "registry" as const,
    }));
    const dynamicRows = await prisma.dynamicPromptVersion.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      select: { versionKey: true, description: true, createdAt: true },
    });
    const dynamicVersions = dynamicRows.map((d) => ({
      version: d.versionKey,
      description: d.description || "Dynamic prompt version",
      createdAt: d.createdAt.toISOString(),
      platform: null as string | null,
      format: null as string | null,
      source: "dynamic" as const,
    }));
    const versions = [...staticVersions, ...dynamicVersions];
    return ok({ versions, defaults }, 200);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.status === 403) return fail("FORBIDDEN", "Admin only", 403);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}
