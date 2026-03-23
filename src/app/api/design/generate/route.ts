import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { APP_LIMITS } from "@/constants/limits";
import { streamGenerateDesign } from "@/lib/ai/generationOrchestrator";

export const runtime = "nodejs";

const bodySchema = z.object({
  prompt: z.string().min(4),
  brandId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  referenceImageUrl: z.string().url().optional(),
  referenceIds: z.array(z.string().cuid()).max(3).optional(),
  referenceRoles: z.record(z.string(), z.enum(["layout", "style", "color"])).optional(),
  strategy: z.enum(["fast", "quality"]).optional(),
  sectionPlanOverride: z.array(z.string()).optional(),
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      encodeSse({
        event: "error",
        data: { code: "VALIDATION_ERROR", message: "Invalid input", retryable: false },
      }),
      {
        status: 400,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }

  const { prompt, brandId, projectId, referenceImageUrl, referenceIds, referenceRoles, strategy, sectionPlanOverride } = parsed.data;

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

  const inQueue = await prisma.design.count({
    where: { userId, status: "generating" },
  });
  if (inQueue >= (APP_LIMITS.maxQueueDepthPerUser ?? 3)) {
    return new Response(
      encodeSse({
        event: "error",
        data: {
          code: "QUEUE_FULL",
          message: "You have too many designs generating",
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
      try {
        const enqueue = (event: SseEvent) => controller.enqueue(encodeSse(event));

        const result = await streamGenerateDesign(
          {
            userId,
            brandId,
            projectId,
            prompt,
            referenceImageUrl,
            referenceIds,
            referenceRoles,
            strategy,
            sectionPlanOverride,
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
