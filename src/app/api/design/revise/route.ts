import { z } from "zod";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { streamReviseDesign } from "@/lib/ai/generationOrchestrator";

export const runtime = "nodejs";

const bodySchema = z.object({
  designId: z.string().cuid(),
  revisionPrompt: z.string().min(4),
  slideIndex: z.number().int().min(0).optional(),
  referenceImageUrl: z.string().url().optional(),
  referenceIds: z.array(z.string().cuid()).max(3).optional(),
  referenceRoles: z.record(z.string(), z.enum(["layout", "style", "color"])).optional(),
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
  } catch {
    return new Response(
      encodeSse({ event: "error", data: { code: "VALIDATION_ERROR", message: "Invalid JSON body", retryable: false } }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      encodeSse({ event: "error", data: { code: "VALIDATION_ERROR", message: "Invalid input", retryable: false } }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

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
          { userId, designId, revisionPrompt, slideIndex, referenceImageUrl, referenceIds, referenceRoles },
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

        controller.close();
      } catch (err: any) {
        const code = err?.code ?? "INTERNAL_ERROR";
        const message = err?.message ?? "An unexpected error occurred";
        enqueue({ event: "error", data: { code, message, retryable: code !== "INTERNAL_ERROR" } });
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
