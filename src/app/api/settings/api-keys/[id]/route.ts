import { fail, ok } from "@/lib/api/response";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ALL_API_KEY_PERMISSIONS } from "@/constants/apiKeyPermissions";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getRequiredSession();
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      action?: string;
      name?: string;
      permissions?: string[];
      webhookUrl?: string | null;
      webhookBatchItemEvents?: boolean;
    };

    const key = await prisma.apiKey.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!key) return fail("NOT_FOUND", "API key not found", 404);

    if (body.action === "revoke") {
      await prisma.apiKey.update({
        where: { id },
        data: { status: "revoked" },
      });
      return ok({ revoked: true }, 200);
    }

    const wantsUpdate =
      body.action === "update" ||
      (!body.action &&
        (body.name !== undefined ||
          body.permissions !== undefined ||
          body.webhookUrl !== undefined ||
          body.webhookBatchItemEvents !== undefined));

    /** Update metadata (name, scopes, webhook) without rotating the key. */
    if (wantsUpdate) {
      if (key.status !== "active") {
        return fail("INVALID_STATE", "Only active keys can be updated.", 400);
      }

      const data: {
        name?: string;
        permissions?: object;
        webhookUrl?: string | null;
        webhookSecret?: string | null;
        webhookBatchItemEvents?: boolean;
      } = {};

      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (name.length < 3 || name.length > 120) {
          return fail("VALIDATION_ERROR", "Name must be 3–120 characters.", 400);
        }
        data.name = name;
      }

      if (body.permissions != null) {
        const perms = Array.isArray(body.permissions) ? body.permissions.filter((p) => typeof p === "string") : [];
        const invalid = perms.filter((p) => !ALL_API_KEY_PERMISSIONS.includes(p));
        if (invalid.length) {
          return fail("VALIDATION_ERROR", `Invalid permissions: ${invalid.join(", ")}`, 400);
        }
        if (perms.length === 0) {
          return fail("VALIDATION_ERROR", "Select at least one permission.", 400);
        }
        data.permissions = perms as unknown as object;
      }

      if (body.webhookUrl !== undefined) {
        const url = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
        data.webhookUrl = url.length ? url : null;
        if (data.webhookUrl) {
          const prev = key.webhookUrl?.trim() || "";
          if (prev !== data.webhookUrl || !key.webhookSecret) {
            data.webhookSecret = randomBytes(32).toString("hex");
          }
        } else {
          data.webhookSecret = null;
        }
      }

      if (typeof body.webhookBatchItemEvents === "boolean") {
        data.webhookBatchItemEvents = body.webhookBatchItemEvents;
      }

      if (Object.keys(data).length === 0) {
        return fail("VALIDATION_ERROR", "No updates provided. Use action: \"update\" with name, permissions, and/or webhookUrl.", 400);
      }

      const updated = await prisma.apiKey.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          permissions: true,
          status: true,
          expiresAt: true,
          rateLimitTier: true,
          webhookUrl: true,
          webhookBatchItemEvents: true,
          updatedAt: true,
        },
      });

      return ok({ key: updated }, 200);
    }

    return fail("VALIDATION_ERROR", "Unknown action. Use \"revoke\" or \"update\" (or send name/permissions without action).", 400);
  } catch (e: any) {
    if (e?.code === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Sign in required", 401);
    console.error(e);
    return fail("INTERNAL_ERROR", "Failed", 500);
  }
}
