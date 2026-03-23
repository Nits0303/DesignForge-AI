import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createApiKeyRecord } from "@/lib/api/apiKeyFactory";
import { ALL_API_KEY_PERMISSIONS } from "@/constants/apiKeyPermissions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getRequiredSession();
    const keys = await prisma.apiKey.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        status: true,
        expiresAt: true,
        lastUsedAt: true,
        lastUsedIp: true,
        rateLimitTier: true,
        webhookUrl: true,
        webhookBatchItemEvents: true,
        createdAt: true,
        updatedAt: true,
        teamId: true,
      },
    });
    return ok({ keys }, 200);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed to load API keys", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getRequiredSession();
    const body = (await req.json()) as {
      name?: string;
      permissions?: string[];
      expiresAt?: string | null;
      webhookUrl?: string | null;
      webhookBatchItemEvents?: boolean;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 3 || name.length > 60) {
      return fail("VALIDATION_ERROR", "Name must be 3–60 characters.", 400);
    }

    const perms = Array.isArray(body.permissions) ? body.permissions.filter((p) => typeof p === "string") : [];
    const invalid = perms.filter((p) => !ALL_API_KEY_PERMISSIONS.includes(p));
    if (invalid.length) {
      return fail("VALIDATION_ERROR", `Invalid permissions: ${invalid.join(", ")}`, 400);
    }
    if (perms.length === 0) {
      return fail("VALIDATION_ERROR", "Select at least one permission.", 400);
    }

    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const d = new Date(body.expiresAt);
      if (!Number.isNaN(d.getTime())) expiresAt = d;
    }

    const { rawKey, record } = await createApiKeyRecord({
      userId: session.user.id,
      name,
      permissions: perms,
      expiresAt,
      webhookUrl: body.webhookUrl ?? null,
      webhookBatchItemEvents: body.webhookBatchItemEvents ?? false,
    });

    return ok(
      {
        key: {
          id: record.id,
          name: record.name,
          keyPrefix: record.keyPrefix,
          permissions: record.permissions,
          status: record.status,
          expiresAt: record.expiresAt,
          rateLimitTier: record.rateLimitTier,
          webhookUrl: record.webhookUrl,
          createdAt: record.createdAt,
        },
        rawKey,
        message: "Copy this key now — it will not be shown again.",
      },
      201
    );
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed to create API key", 500);
  }
}
