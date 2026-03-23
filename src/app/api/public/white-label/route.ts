import { ok } from "@/lib/api/response";
import { getPublicWhiteLabel } from "@/lib/whiteLabel/getWhiteLabel";

export const runtime = "nodejs";

export async function GET() {
  const config = await getPublicWhiteLabel();
  if (!config.isEnabled) {
    return ok({ enabled: false, config: null }, 200);
  }
  return ok({ enabled: true, config }, 200);
}
