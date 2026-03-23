import { randomUUID } from "crypto";
import { v1Success } from "@/lib/api/v1/envelope";

export const runtime = "nodejs";

/** Public health check — no API key required. */
export async function GET() {
  const requestId = randomUUID();
  return v1Success({ status: "ok", version: "1.0" }, requestId, 200);
}
