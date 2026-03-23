import { createHash, randomUUID } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { ApiKey, ApiRateLimitTier } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/redis/rateLimiter";
import { v1Error } from "@/lib/api/v1/envelope";

export type ApiKeyContext = {
  apiKeyId: string;
  userId: string;
  teamId: string | null;
  permissions: string[];
  rateLimitTier: ApiRateLimitTier;
  apiKeyRow: ApiKey;
};

function hashKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function parseApiKeyFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim() || null;
  }
  return req.headers.get("x-api-key")?.trim() || null;
}

export async function authenticateApiKey(rawKey: string): Promise<
  | { ok: true; ctx: ApiKeyContext }
  | { ok: false; code: string; message: string }
> {
  if (!rawKey || rawKey.length < 12) {
    return { ok: false, code: "INVALID_API_KEY", message: "Missing or malformed API key." };
  }

  const keyPrefix = rawKey.slice(0, 8);
  const digest = hashKey(rawKey);

  const candidates = await prisma.apiKey.findMany({
    where: {
      keyPrefix,
      status: "active",
    },
  });

  const row = candidates.find((k) => k.keyHash === digest);
  if (!row) {
    return { ok: false, code: "INVALID_API_KEY", message: "Invalid or revoked API key." };
  }

  if (row.expiresAt && row.expiresAt < new Date()) {
    return { ok: false, code: "API_KEY_EXPIRED", message: "This API key has expired." };
  }

  const permissions = Array.isArray(row.permissions)
    ? (row.permissions as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  return {
    ok: true,
    ctx: {
      apiKeyId: row.id,
      userId: row.userId,
      teamId: row.teamId,
      permissions,
      rateLimitTier: row.rateLimitTier,
      apiKeyRow: row,
    },
  };
}

export function requirePermission(ctx: ApiKeyContext, permission: string): boolean {
  return ctx.permissions.includes(permission);
}

const TIER_LIMITS: Record<
  ApiRateLimitTier,
  { perMinute: number; perDay: number } | null
> = {
  standard: { perMinute: 60, perDay: 1000 },
  elevated: { perMinute: 300, perDay: 10000 },
  unlimited: null,
};

export async function enforceApiKeyRateLimit(
  apiKeyId: string,
  tier: ApiRateLimitTier
): Promise<
  | { ok: true; headers: Record<string, string> }
  | { ok: false; retryAfter: number; headers: Record<string, string> }
> {
  const limits = TIER_LIMITS[tier];
  if (!limits) {
    return {
      ok: true,
      headers: {
        "X-RateLimit-Limit": "unlimited",
        "X-RateLimit-Remaining": "unlimited",
        "X-RateLimit-Reset": "",
      },
    };
  }

  const minute = await checkRateLimit(`apikey:${apiKeyId}:minute`, {
    windowSeconds: 60,
    maxRequests: limits.perMinute,
  });
  const day = await checkRateLimit(`apikey:${apiKeyId}:day`, {
    windowSeconds: 86400,
    maxRequests: limits.perDay,
  });

  const reset = String(Math.ceil(Date.now() / 1000) + 60);
  const baseHeaders: Record<string, string> = {
    "X-RateLimit-Limit": `${limits.perMinute}/min;${limits.perDay}/day`,
    "X-RateLimit-Remaining": `${Math.min(minute.remaining, day.remaining)}`,
    "X-RateLimit-Reset": reset,
  };

  if (!minute.allowed) {
    return {
      ok: false,
      retryAfter: minute.retryAfterSeconds ?? 60,
      headers: baseHeaders,
    };
  }
  if (!day.allowed) {
    return {
      ok: false,
      retryAfter: day.retryAfterSeconds ?? 3600,
      headers: baseHeaders,
    };
  }

  return { ok: true, headers: baseHeaders };
}

export function scheduleApiUsageLog(args: {
  apiKeyId: string;
  userId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  requestTokens?: number | null;
  responseTimeMs: number;
  costUsd?: number | null;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  errorCode?: string | null;
}) {
  setImmediate(() => {
    prisma.apiUsageLog
      .create({
        data: {
          apiKeyId: args.apiKeyId,
          userId: args.userId,
          endpoint: args.endpoint,
          method: args.method,
          statusCode: args.statusCode,
          requestTokens: args.requestTokens ?? null,
          responseTimeMs: args.responseTimeMs,
          costUsd: args.costUsd ?? null,
          requestId: args.requestId,
          ipAddress: args.ipAddress ?? null,
          userAgent: args.userAgent ?? null,
          errorCode: args.errorCode ?? null,
        },
      })
      .catch(() => {});
  });
}

export function touchApiKeyLastUsed(apiKeyId: string, ip: string | null) {
  setImmediate(() => {
    prisma.apiKey
      .update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date(), lastUsedIp: ip },
      })
      .catch(() => {});
  });
}

/** Full v1 request pipeline: auth + rate limit + returns context or error response */
export async function runV1Auth(req: NextRequest): Promise<
  | {
      ok: true;
      ctx: ApiKeyContext;
      requestId: string;
      startedAt: number;
      rateHeaders: Record<string, string>;
    }
  | { ok: false; response: NextResponse }
> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const raw = parseApiKeyFromRequest(req);
  if (!raw) {
    return {
      ok: false,
      response: v1Error(
        "UNAUTHORIZED",
        "Provide Authorization: Bearer <key> or X-API-Key.",
        requestId,
        401
      ),
    };
  }

  const auth = await authenticateApiKey(raw);
  if (!auth.ok) {
    return { ok: false, response: v1Error(auth.code, auth.message, requestId, 401) };
  }

  const rl = await enforceApiKeyRateLimit(auth.ctx.apiKeyId, auth.ctx.rateLimitTier);
  if (!rl.ok) {
    return {
      ok: false,
      response: v1Error("RATE_LIMITED", "Too many requests for this API key.", requestId, 429, {
        ...rl.headers,
        "Retry-After": String(rl.retryAfter),
      }),
    };
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  touchApiKeyLastUsed(auth.ctx.apiKeyId, ip);

  return {
    ok: true,
    ctx: auth.ctx,
    requestId,
    startedAt,
    rateHeaders: rl.headers,
  };
}

export function logV1Usage(
  ctx: ApiKeyContext,
  req: NextRequest,
  requestId: string,
  startedAt: number,
  statusCode: number,
  opts?: { errorCode?: string | null; requestTokens?: number | null; costUsd?: number | null }
) {
  scheduleApiUsageLog({
    apiKeyId: ctx.apiKeyId,
    userId: ctx.userId,
    endpoint: `${req.nextUrl.pathname}${req.nextUrl.search || ""}`,
    method: req.method,
    statusCode,
    requestTokens: opts?.requestTokens ?? null,
    responseTimeMs: Date.now() - startedAt,
    costUsd: opts?.costUsd ?? null,
    requestId,
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
    errorCode: opts?.errorCode ?? null,
  });
}
