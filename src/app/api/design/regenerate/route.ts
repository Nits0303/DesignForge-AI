import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { streamGenerateDesign } from "@/lib/ai/generationOrchestrator";

export const runtime = "nodejs";

const schema = z.object({
  designId: z.string().cuid(),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession();
    const userId = session.user.id;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid input", 400);

    const sourceDesign = await prisma.design.findFirst({
      where: { id: parsed.data.designId, userId },
    });
    if (!sourceDesign) return fail("NOT_FOUND", "Design not found", 404);

    const stream = new ReadableStream({
      async start(controller) {
        const encode = (event: string, data: unknown) =>
          `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          const result = await streamGenerateDesign(
            {
              userId,
              brandId: sourceDesign.brandId ?? "",
              projectId: sourceDesign.projectId ?? undefined,
              prompt: sourceDesign.originalPrompt,
              existingDesignId: sourceDesign.id,
              nextVersionNumber: sourceDesign.currentVersion + 1,
            },
            {
              onStatus: async (payload) => controller.enqueue(encode("status", payload)),
              onChunk: async ({ html }) => controller.enqueue(encode("chunk", { html })),
              onImageStart: async ({ imageCount }) =>
                controller.enqueue(encode("image_start", { imageCount })),
              onImageComplete: async ({ updatedHtml }) =>
                controller.enqueue(encode("image_complete", { updatedHtml })),
            }
          );

          controller.enqueue(
            encode("complete", {
              designId: result.designId,
              versionNumber: result.versionNumber,
              totalTokens: result.totalTokens,
              cachedTokens: result.cachedTokens,
              costUsd: result.costUsd,
              generationTimeMs: result.generationTimeMs,
            })
          );
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encode("error", {
              code: err?.code ?? "INTERNAL_ERROR",
              message: err?.message ?? "An unexpected error occurred",
              retryable: true,
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
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}

