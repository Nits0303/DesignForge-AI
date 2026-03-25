import { z } from "zod";
import crypto from "crypto";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { streamReviseDesign } from "@/lib/ai/generationOrchestrator";
import { logApiCall, payloadHash } from "@/lib/server/apiCallLogger";

export const runtime = "nodejs";

const referenceUrlSchema = z
  .string()
  .trim()
  .refine((v) => v.length === 0 || /^https?:\/\//i.test(v) || v.startsWith("/"), {
    message: "referenceImageUrl must be an absolute URL or app-relative path",
  });

const bodySchema = z.object({
  designId: z.string().min(1),
  revisionPrompt: z.string().min(4),
  slideIndex: z.number().int().min(0).optional(),
  referenceImageUrl: referenceUrlSchema.optional().nullable(),
  referenceIds: z.array(z.string().min(1)).max(3).optional().nullable(),
  referenceRoles: z.record(z.string(), z.enum(["layout", "style", "color"]).catch("style")).optional().nullable(),
});

type SseEvent =
  | { event: "status"; data: { message: string } }
  | { event: "chunk"; data: { html: string } }
  | { event: "complete"; data: { versionId: string; versionNumber: number; model: string; generationTimeMs: number } }
  | { event: "error"; data: { code: string; message: string; retryable: boolean } };

function encodeSse(event: SseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let session: Awaited<ReturnType<typeof getRequiredSession>>;
  try {
    session = await getRequiredSession();
  } catch (err: any) {
    return new Response(
      encodeSse({ event: "error", data: { code: "UNAUTHORIZED", message: "Authentication required", retryable: false } }),
      { status: 401, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const userId = session.user.id;

  let json: unknown;
  try {
    json = await req.json();
    await logApiCall({
      requestId,
      route: "/api/design/revise",
      phase: "received",
      userId,
      payloadHash: payloadHash(json),
    });
  } catch {
    return new Response(
      encodeSse({ event: "error", data: { code: "VALIDATION_ERROR", message: "Invalid JSON body", retryable: false } }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    console.warn("[design/revise] validation failed", parsed.error.flatten());
    await logApiCall({
      requestId,
      route: "/api/design/revise",
      phase: "failed",
      userId,
      payloadHash: payloadHash(json),
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
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }
  const bodyHash = payloadHash(parsed.data);
  await logApiCall({
    requestId,
    route: "/api/design/revise",
    phase: "validated",
    userId,
    payloadHash: bodyHash,
    durationMs: Date.now() - startedAt,
  });

  const { designId, revisionPrompt, slideIndex, referenceImageUrl, referenceIds, referenceRoles } = parsed.data;

  const design = await prisma.design.findFirst({
    where: { id: designId, userId },
    select: { id: true, status: true },
  });
  if (!design) {
    return new Response(
      encodeSse({ event: "error", data: { code: "NOT_FOUND", message: "Design not found", retryable: false } }),
      { status: 404, headers: { "Content-Type": "text/event-stream" } }
    );
  }
  if (design.status === "generating") {
    return new Response(
      encodeSse({ event: "error", data: { code: "REVISION_IN_PROGRESS", message: "Waiting for revision to complete...", retryable: true } }),
      { status: 409, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: SseEvent) => controller.enqueue(encodeSse(event));
      try {
        enqueue({ event: "status", data: { message: "Revising design..." } });

        const result = await streamReviseDesign(
          {
            userId,
            designId,
            revisionPrompt,
            slideIndex,
            referenceImageUrl: referenceImageUrl || undefined,
            referenceIds: referenceIds ?? undefined,
            referenceRoles: referenceRoles ?? undefined,
          },
          {
            onChunk: async ({ html }) => {
              enqueue({ event: "chunk", data: { html } });
            },
          }
        );

        enqueue({
          event: "complete",
          data: {
            versionId: result.versionId,
            versionNumber: result.versionNumber,
            model: result.model,
            generationTimeMs: result.generationTimeMs,
          },
        });
        await logApiCall({
          requestId,
          route: "/api/design/revise",
          phase: "completed",
          userId,
          payloadHash: bodyHash,
          statusCode: 200,
          durationMs: Date.now() - startedAt,
          meta: { versionId: result.versionId, versionNumber: result.versionNumber },
        });

        controller.close();
      } catch (err: any) {
        const code = err?.code ?? "INTERNAL_ERROR";
        const message = err?.message ?? "An unexpected error occurred";
        enqueue({ event: "error", data: { code, message, retryable: code !== "INTERNAL_ERROR" } });
        await logApiCall({
          requestId,
          route: "/api/design/revise",
          phase: "failed",
          userId,
          payloadHash: bodyHash,
          statusCode: 200,
          durationMs: Date.now() - startedAt,
          message,
          meta: { code },
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
