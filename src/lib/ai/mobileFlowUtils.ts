import type { MobileScreenDescriptor, ParsedIntent } from "@/types/ai";
import type { MobileAppCategory } from "@/constants/mobileAppCategories";

export function isMobileFlowFormat(format: string): boolean {
  return String(format).toLowerCase().endsWith("_flow");
}

export function defaultScreenCountForMobile(format: string, hinted?: number): number {
  if (hinted && hinted > 0) return Math.min(10, hinted);
  const f = String(format).toLowerCase();
  if (f === "onboarding_flow") return 4;
  if (f === "auth_flow") return 3;
  if (f === "checkout_flow") return 4;
  return 1;
}

/** Heuristic extraction of shared chrome for the next screen prompt (token-efficient). */
export function extractStructuralSummary(html: string): string {
  const nav =
    html.match(/<nav[\s\S]{0,1200}<\/nav>/i)?.[0] ??
    html.match(/<header[\s\S]{0,1200}<\/header>/i)?.[0] ??
    "";
  const tab =
    html.match(/(?:bottom|tab)[\s\S]{0,800}(?:fixed|sticky)[\s\S]{0,1200}<\/(?:div|nav)>/i)?.[0] ?? "";
  const styles = html.match(/<style[\s\S]*?<\/style>/gi)?.slice(0, 2).join("\n") ?? "";
  const snippet = [nav.slice(0, 2000), tab.slice(0, 2000), styles.slice(0, 1500)].filter(Boolean).join("\n");
  return snippet.slice(0, 4000);
}

export function padScreenPlan(
  plan: MobileScreenDescriptor[],
  targetCount: number,
  format: string
): MobileScreenDescriptor[] {
  if (plan.length >= targetCount) return plan.slice(0, targetCount);
  const out = [...plan];
  let i = plan.length;
  while (out.length < targetCount) {
    out.push({
      screenIndex: i,
      screenType: "feature_highlight",
      screenTitle: "More to explore",
      primaryAction: "Next",
      navigationPattern: "next_button",
    });
    i++;
  }
  return out;
}

export function buildFallbackScreenPlan(intent: ParsedIntent, count: number): MobileScreenDescriptor[] {
  const fmt = String(intent.format);
  const base =
    fmt === "onboarding_flow" ?
      ["welcome", "feature_1", "feature_2", "permissions", "account"]
    : fmt === "auth_flow" ?
      ["sign_in", "sign_up", "forgot"]
    : fmt === "checkout_flow" ?
      ["cart", "shipping", "payment", "confirmation"]
    : ["screen_1", "screen_2", "screen_3", "screen_4"];

  return Array.from({ length: count }, (_, i) => ({
    screenIndex: i,
    screenType: base[i % base.length] ?? `step_${i + 1}`,
    screenTitle: `Step ${i + 1}`,
    primaryAction: i === count - 1 ? "Continue" : "Next",
    navigationPattern: (i === 0 ? "next_button" : "back_button") as MobileScreenDescriptor["navigationPattern"],
  }));
}
