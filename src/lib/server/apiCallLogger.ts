import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
import crypto from "crypto";

type ApiCallLogEvent = {
  requestId: string;
  route: string;
  phase: "received" | "validated" | "completed" | "failed";
  userId?: string;
  statusCode?: number;
  durationMs?: number;
  payloadHash?: string;
  message?: string;
  meta?: Record<string, unknown>;
  at?: string;
};

function filePath() {
  return join(process.cwd(), "logs", "api-calls.jsonl");
}

export function payloadHash(value: unknown): string {
  const raw = JSON.stringify(value ?? {});
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export async function logApiCall(event: ApiCallLogEvent): Promise<void> {
  try {
    const fp = filePath();
    await mkdir(join(fp, ".."), { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      ...event,
    });
    await appendFile(fp, `${line}\n`, "utf8");
  } catch {
    // Never break request flow due to logging failure.
  }
}

