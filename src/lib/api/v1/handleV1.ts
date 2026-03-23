import type { NextRequest, NextResponse } from "next/server";
import { runV1Auth, requirePermission, logV1Usage, type ApiKeyContext } from "@/lib/auth/apiKeyAuth";
import { v1Error } from "@/lib/api/v1/envelope";

export type V1HandlerResult = NextResponse;

/**
 * Authenticates API key, enforces permission, runs handler, logs usage on success/error.
 */
export async function withV1Permission(
  req: NextRequest,
  permission: string,
  handler: (args: {
    ctx: ApiKeyContext;
    requestId: string;
    startedAt: number;
    rateHeaders: Record<string, string>;
  }) => Promise<V1HandlerResult>
): Promise<V1HandlerResult> {
  const auth = await runV1Auth(req);
  if (!auth.ok) return auth.response;

  const { ctx, requestId, startedAt, rateHeaders } = auth;

  if (!requirePermission(ctx, permission)) {
    const res = v1Error(
      "INSUFFICIENT_PERMISSIONS",
      `This API key does not have the '${permission}' permission.`,
      requestId,
      403,
      rateHeaders
    );
    logV1Usage(ctx, req, requestId, startedAt, 403, { errorCode: "INSUFFICIENT_PERMISSIONS" });
    return res;
  }

  try {
    return await handler({ ctx, requestId, startedAt, rateHeaders });
  } catch (e) {
    console.error(e);
    const res = v1Error("INTERNAL_ERROR", "Unexpected server error.", requestId, 500, rateHeaders);
    logV1Usage(ctx, req, requestId, startedAt, 500, { errorCode: "INTERNAL_ERROR" });
    return res;
  }
}
