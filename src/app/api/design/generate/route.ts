import { z } from "zod";
import crypto from "crypto";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { APP_LIMITS } from "@/constants/limits";
import { streamGenerateDesign } from "@/lib/ai/generationOrchestrator";
import { isGeminiPrimaryLlm } from "@/lib/ai/geminiClient";
import { logApiCall, payloadHash } from "@/lib/server/apiCallLogger";
import { startTraceRun } from "@/lib/server/langsmith";
import { SOCIAL_DIMENSIONS } from "@/constants/platforms";

export const runtime = "nodejs";
const STALE_GENERATING_MINUTES = 2;
const IS_DEV = process.env.NODE_ENV !== "production";

const referenceUrlSchema = z
  .string()
  .trim()
  .refine((v) => v.length === 0 || /^https?:\/\//i.test(v) || v.startsWith("/"), {
    message: "referenceImageUrl must be an absolute URL or app-relative path",
  });

const bodySchema = z.object({
  prompt: z.string().min(4),
  brandId: z.string().min(1),
  projectId: z.string().optional(),
  referenceImageUrl: referenceUrlSchema.optional().nullable(),
  // Be tolerant here; ids may come from different providers/environments.
  referenceIds: z.array(z.string().min(1)).max(3).optional().nullable(),
  referenceRoles: z.record(z.string(), z.enum(["layout", "style", "color"]).catch("style")).optional().nullable(),
  strategy: z.enum(["fast", "quality"]).optional(),
  sectionPlanOverride: z.array(z.string()).optional(),
  selectedDimensionId: z.enum(["square", "portrait", "landscape"]).optional(),
});

type SseEvent =
  | { event: "status"; data: any }
  | { event: "chunk"; data: { html: string } }
  | { event: "image_start"; data: { imageCount: number } }
  | { event: "image_complete"; data: { updatedHtml: string } }
  | { event: "section_start"; data: { sectionType: string; sectionIndex: number; totalSections: number } }
  | { event: "section_complete"; data: { sectionType: string; sectionIndex: number; sectionHtml: string; assembledHtml?: string } }
  | {
      event: "screen_start";
      data: { screenIndex: number; screenType: string; screenTitle: string; totalScreens: number };
    }
  | { event: "screen_complete"; data: { screenIndex: number; screenType: string; screenHtml: string } }
  | { event: "complete"; data: any }
  | { event: "error"; data: { code: string; message: string; retryable: boolean } };

function encodeSse(event: SseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const session = await getRequiredSession().catch((err: any) => {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) {
      throw new Response(encodeSse({ event: "error", data: { code: "UNAUTHORIZED", message: "Authentication required", retryable: false } }), {
        status: 401,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    throw err;
  });

  const userId = session.user.id;

  const json = await req.json();
  const bodyHash = payloadHash(json);
  await logApiCall({
    requestId,
    route: "/api/design/generate",
    phase: "received",
    userId,
    payloadHash: bodyHash,
    meta: {
      hasReferenceImageUrl: Boolean((json as any)?.referenceImageUrl),
      referenceIdsCount: Array.isArray((json as any)?.referenceIds) ? (json as any).referenceIds.length : 0,
      strategy: (json as any)?.strategy ?? null,
    },
  });
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    console.warn("[design/generate] validation failed", parsed.error.flatten());
    await logApiCall({
      requestId,
      route: "/api/design/generate",
      phase: "failed",
      userId,
      payloadHash: bodyHash,
      statusCode: 400,
      durationMs: Date.now() - startedAt,
      message: parsed.error.issues?.[0]?.message ?? "Invalid input",
    });
    return new Response(
      encodeSse({
        event: "error",
        data: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues?.[0]?.message ?? "Invalid input",
          retryable: false,
        },
      }),
      {
        status: 400,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }
  await logApiCall({
    requestId,
    route: "/api/design/generate",
    phase: "validated",
    userId,
    payloadHash: bodyHash,
    durationMs: Date.now() - startedAt,
  });

  const {
    prompt,
    brandId,
    projectId,
    referenceImageUrl,
    referenceIds,
    referenceRoles,
    strategy,
    sectionPlanOverride,
    selectedDimensionId,
  } = parsed.data;

  const resolvedSelectedDimension =
    SOCIAL_DIMENSIONS.find((d) => d.id === (selectedDimensionId ?? "landscape")) ?? SOCIAL_DIMENSIONS[2]!;

  const brand = await prisma.brandProfile.findFirst({
    where: { id: brandId, userId },
    select: { id: true },
  });
  if (!brand) {
    return new Response(
      encodeSse({
        event: "error",
        data: { code: "NOT_FOUND", message: "Brand not found", retryable: false },
      }),
      {
        status: 404,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }

  if (projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!proj) {
      return new Response(
        encodeSse({
          event: "error",
          data: { code: "NOT_FOUND", message: "Project not found", retryable: false },
        }),
        {
          status: 404,
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    }
  }

  if (!IS_DEV) {
    const rlKey = `generate:${userId}`;
    const limit = await checkRateLimit(rlKey, {
      windowSeconds: 60,
      maxRequests: APP_LIMITS.generationRatePerMinute ?? 30,
    });
    if (!limit.allowed) {
      return new Response(
        encodeSse({
          event: "error",
          data: {
            code: "RATE_LIMITED",
            message: "Too many generation requests",
            retryable: true,
          },
        }),
        {
          status: 429,
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    }
  }

  // Self-heal stale/inconsistent "generating" rows so users don't get stuck in QUEUE_FULL.
  const staleCutoff = new Date(Date.now() - STALE_GENERATING_MINUTES * 60 * 1000);
  await prisma.design.updateMany({
    where: { userId, status: "generating", currentVersion: { gt: 0 } },
    data: { status: "preview" },
  });
  await prisma.design.updateMany({
    where: { userId, status: "generating", updatedAt: { lt: staleCutoff } },
    data: { status: "archived" },
  });

  // Queue depth should only consider active, recent in-flight generations.
  const effectiveMaxQueueDepth = isGeminiPrimaryLlm() ? 10 : (APP_LIMITS.maxQueueDepthPerUser ?? 3);
  const inQueue = await prisma.design.count({
    where: { userId, status: "generating", updatedAt: { gte: staleCutoff } },
  });
  if (!IS_DEV && inQueue >= effectiveMaxQueueDepth) {
    return new Response(
      encodeSse({
        event: "error",
        data: {
          code: "QUEUE_FULL",
          message: "You have too many designs generating. Please wait ~30s and retry.",
          retryable: true,
        },
      }),
      {
        status: 429,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const topRun = await startTraceRun({
        name: "design_generate_request",
        runType: "chain",
        inputs: {
          route: "/api/design/generate",
          prompt,
          brandId,
          projectId: projectId ?? null,
          strategy: strategy ?? null,
          referenceIdsCount: referenceIds?.length ?? 0,
          hasReferenceImageUrl: Boolean(referenceImageUrl),
        },
        metadata: {
          provider: isGeminiPrimaryLlm() ? "gemini" : "anthropic",
        },
        tags: ["design-generate", "api"],
        trace: { requestId, userId },
      });
      try {
        const enqueue = (event: SseEvent) => controller.enqueue(encodeSse(event));

        const result = await streamGenerateDesign(
          {
            userId,
            brandId,
            projectId,
            prompt,
            referenceImageUrl: referenceImageUrl || undefined,
            referenceIds: referenceIds ?? undefined,
            referenceRoles: referenceRoles ?? undefined,
            strategy,
            sectionPlanOverride,
            selectedDimension: resolvedSelectedDimension,
            trace: {
              requestId,
              userId,
              stage: "generate",
            },
            parentRunId: topRun?.id,
          },
          {
            onStatus: async (payload) => {
              enqueue({ event: "status", data: payload });
            },
            onChunk: async ({ html }) => {
              enqueue({ event: "chunk", data: { html } });
            },
            onImageStart: async ({ imageCount }) => {
              enqueue({ event: "image_start", data: { imageCount } });
            },
            onImageComplete: async ({ updatedHtml }) => {
              enqueue({ event: "image_complete", data: { updatedHtml } });
            },
            onSectionStart: async (p) => {
              enqueue({ event: "section_start", data: p });
            },
            onSectionComplete: async (p) => {
              enqueue({
                event: "section_complete",
                data: {
                  sectionType: p.sectionType,
                  sectionIndex: p.sectionIndex,
                  sectionHtml: p.sectionHtml,
                  assembledHtml: p.assembledHtml,
                },
              });
            },
            onScreenStart: async (p) => {
              enqueue({ event: "screen_start", data: p });
            },
            onScreenComplete: async (p) => {
              enqueue({ event: "screen_complete", data: p });
            },
          }
        );

        enqueue({
          event: "complete",
          data: {
            designId: result.designId,
            versionNumber: result.versionNumber,
            html: result.finalHtml,
            totalTokens: result.totalTokens,
            cachedTokens: result.cachedTokens,
            costUsd: result.costUsd,
            generationTimeMs: result.generationTimeMs,
          },
        });
        await logApiCall({
          requestId,
          route: "/api/design/generate",
          phase: "completed",
          userId,
          payloadHash: bodyHash,
          statusCode: 200,
          durationMs: Date.now() - startedAt,
          meta: {
            designId: result.designId,
            versionNumber: result.versionNumber,
            totalTokens: result.totalTokens,
          },
        });
        await topRun?.finish({
          outputs: {
            designId: result.designId,
            versionNumber: result.versionNumber,
            totalTokens: result.totalTokens,
            costUsd: result.costUsd,
          },
        });

        controller.close();
      } catch (err: any) {
        const code = err?.code ?? "INTERNAL_ERROR";
        const message = err?.message ?? "An unexpected error occurred";
        controller.enqueue(
          encodeSse({
            event: "error",
            data: {
              code,
              message,
              retryable: code !== "GENERATION_INVALID_HTML" && code !== "INTERNAL_ERROR",
            },
          })
        );
        await logApiCall({
          requestId,
          route: "/api/design/generate",
          phase: "failed",
          userId,
          payloadHash: bodyHash,
          statusCode: 200,
          durationMs: Date.now() - startedAt,
          message,
          meta: { code },
        });
        await topRun?.finish({
          error: message,
          metadata: { code },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
