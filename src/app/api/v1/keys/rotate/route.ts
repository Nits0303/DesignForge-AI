import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateRawApiKey, hashApiKey } from "@/lib/api/apiKeyFactory";
import { withV1Permission } from "@/lib/api/v1/handleV1";
import { v1Success, v1Error } from "@/lib/api/v1/envelope";
import { logV1Usage } from "@/lib/auth/apiKeyAuth";

export const runtime = "nodejs";

/** Rotates the API key presented in this request (Bearer / x-api-key). Requires `keys:rotate` scope. */
export async function POST(req: NextRequest) {
  return withV1Permission(req, "keys:rotate", async ({ ctx, requestId, startedAt, rateHeaders }) => {
    const old = await prisma.apiKey.findFirst({
      where: { id: ctx.apiKeyId, userId: ctx.userId, status: "active" },
    });
    if (!old) {
      const res = v1Error("NOT_FOUND", "Active API key not found.", requestId, 404, rateHeaders);
      logV1Usage(ctx, req, requestId, startedAt, 404, { errorCode: "NOT_FOUND" });
      return res;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.apiKey.update({
          where: { id: old.id },
          data: { status: "revoked" },
        });
        const rawKey = generateRawApiKey();
        const keyHash = hashApiKey(rawKey);
        const keyPrefix = rawKey.slice(0, 8);
        const created = await tx.apiKey.create({
          data: {
            userId: old.userId,
            teamId: old.teamId,
            name: old.name,
            keyPrefix,
            keyHash,
            permissions: old.permissions as object,
            status: "active",
            expiresAt: old.expiresAt,
            rateLimitTier: old.rateLimitTier,
            webhookUrl: old.webhookUrl,
            webhookSecret: old.webhookSecret,
            webhookBatchItemEvents: old.webhookBatchItemEvents,
          },
        });
        return { rawKey, created };
      });

      const res = v1Success(
        {
          rawKey: result.rawKey,
          key: {
            id: result.created.id,
            name: result.created.name,
            keyPrefix: result.created.keyPrefix,
            permissions: result.created.permissions,
            status: result.created.status,
            expiresAt: result.created.expiresAt,
            rateLimitTier: result.created.rateLimitTier,
            webhookUrl: result.created.webhookUrl,
            createdAt: result.created.createdAt,
          },
          message: "Copy the new key now — the key used for this request is revoked.",
        },
        requestId,
        200,
        rateHeaders
      );
      logV1Usage(ctx, req, requestId, startedAt, 200);
      return res;
    } catch (e) {
      console.error(e);
      const res = v1Error("INTERNAL_ERROR", "Rotate failed.", requestId, 500, rateHeaders);
      logV1Usage(ctx, req, requestId, startedAt, 500, { errorCode: "INTERNAL_ERROR" });
      return res;
    }
  });
}
