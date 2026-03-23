import type { ResolvedStyles } from "../../shared/types";
import { resolveStaticClass } from "./tailwindClassMap";

function merge(base: ResolvedStyles, patch: Partial<ResolvedStyles>): ResolvedStyles {
  return { ...base, ...patch };
}

export function resolveClassList(classList: string[]): { styles: ResolvedStyles; uncovered: string[] } {
  let styles: ResolvedStyles = {};
  const uncovered: string[] = [];

  for (const cls of classList) {
    const r = resolveStaticClass(cls);
    if (r && Object.keys(r).length) {
      styles = merge(styles, r);
    } else if (cls.trim()) {
      uncovered.push(cls);
    }
  }

  return { styles, uncovered };
}
