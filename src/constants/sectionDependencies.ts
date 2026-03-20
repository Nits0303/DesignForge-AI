/**
 * Section dependency graph for website/dashboard generation.
 *
 * Each section maps to prerequisites that should be generated before it. We keep the
 * original user-provided order as a soft preference, but we can parallelize any sections
 * that are simultaneously "ready".
 */
export const SECTION_DEPENDENCIES: Record<string, string[]> = {
  navbar: [],
  hero: ["navbar"],
  social_proof: ["hero"],
  features: ["hero"],
  testimonials: ["features"],
  pricing: ["features"],
  faq: ["pricing"],
  footer: [],
  about: ["navbar"],
  contact: ["navbar"],
  blog: ["navbar"],

  sidebar_nav: [],
  top_bar: ["sidebar_nav"],
  kpi_row: ["top_bar"],
  chart_primary: ["kpi_row"],
  chart_secondary: ["kpi_row"],
  data_table: ["top_bar"],
  activity_feed: ["top_bar"],
  action_bar: ["top_bar"],
  pagination: ["data_table"],
  filter_bar: ["top_bar"],
  user_table: ["filter_bar"],
  settings_sections: ["top_bar"],
};

function isReady(section: string, completed: Set<string>) {
  const deps = SECTION_DEPENDENCIES[section] ?? [];
  return deps.every((d) => completed.has(d));
}

/**
 * Produces dependency-aware parallel batches.
 *
 * - Maintains deterministic ordering by respecting the incoming plan order for tie breaks.
 * - Falls back safely when unknown section types appear (treated as no dependencies).
 */
export function buildDependencyBatches(sectionPlan: string[]): string[][] {
  const remaining = [...sectionPlan];
  const completed = new Set<string>();
  const batches: string[][] = [];

  while (remaining.length > 0) {
    const ready: string[] = [];
    for (const s of remaining) {
      if (isReady(s, completed)) ready.push(s);
    }

    // Cycle/unknown-dependency fallback: at least make progress with next item.
    const batch = ready.length > 0 ? ready : [remaining[0]!];
    batches.push(batch);

    for (const s of batch) {
      completed.add(s);
      const idx = remaining.indexOf(s);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  return batches;
}

