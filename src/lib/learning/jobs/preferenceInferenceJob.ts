import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type InferredPreference = {
  preferenceKey: string;
  preferenceValue: any;
  confidence: number;
  sampleCountDelta: number;
  trigger: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonStringify(v: any): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function hexToHslHue(hex: string): number | null {
  const raw = String(hex ?? "").trim().replace("#", "");
  if (![3, 6, 8].includes(raw.length)) return null;

  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.length === 8
        ? raw.slice(0, 6)
        : raw;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  if (d === 0) return 0;

  let hue = 0;
  switch (max) {
    case r:
      hue = ((g - b) / d) % 6;
      break;
    case g:
      hue = (b - r) / d + 2;
      break;
    case b:
      hue = (r - g) / d + 4;
      break;
  }

  hue *= 60;
  if (hue < 0) hue += 360;
  return hue;
}

export async function preferenceInferenceJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  preferenceChanges: Array<{
    userId: string;
    preferenceKey: string;
    oldValue: any;
    newValue: any;
    oldConfidence: number | null;
    newConfidence: number;
    trigger: string;
    manualOverrideSkipped?: boolean;
  }>;
}> {
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const genByUser = await prisma.generationLog.groupBy({
    by: ["userId"],
    where: {
      userId: { not: null },
      createdAt: { gte: since30d },
      testAssignments: { equals: Prisma.DbNull },
    },
    _count: { id: true },
  });

  const activeUsers = genByUser
    .filter((g) => (g._count?.id ?? 0) >= 5)
    .map((g) => g.userId as string);

  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  let recordsUpdated = 0;
  const preferenceChanges: Array<{
    userId: string;
    preferenceKey: string;
    oldValue: any;
    newValue: any;
    oldConfidence: number | null;
    newConfidence: number;
    trigger: string;
    manualOverrideSkipped?: boolean;
  }> = [];

  for (const userId of activeUsers) {
    const userPatterns = await prisma.revisionPattern.findMany({
      where: { userId, isAggregated: true, lastSeenAt: { gte: since30d } },
      select: { patternType: true, frequency: true, patternDetail: true },
    });

    const patternsByType = new Map<string, Array<{ frequency: number; detail: any }>>();
    for (const p of userPatterns) {
      const freq = p.frequency ?? 0;
      const detail = p.patternDetail as any;
      const arr = patternsByType.get(p.patternType) ?? [];
      arr.push({ frequency: freq, detail });
      patternsByType.set(p.patternType, arr);
    }

    const inferred: InferredPreference[] = [];

    // Background preference inference (bg_color_change).
    const bg = patternsByType.get("bg_color_change") ?? [];
    const dark = bg.filter((x) => x.detail?.direction === "dark").sort((a, b) => b.frequency - a.frequency)[0];
    const light = bg.filter((x) => x.detail?.direction === "light").sort((a, b) => b.frequency - a.frequency)[0];
    if (dark && light) {
      if (dark.frequency !== light.frequency) {
        const chosen = dark.frequency > light.frequency ? dark : light;
        const occurrences = chosen.frequency;
        if (occurrences >= 3 && occurrences >= 5) {
          const confidence = clamp(0.65 + 0.05 * (occurrences - 3), 0, 0.95);
          inferred.push({
            preferenceKey: "default_background",
            preferenceValue: chosen.detail.direction,
            confidence,
            sampleCountDelta: Math.max(3, occurrences),
            trigger: `bg_color_change direction=${chosen.detail.direction} freq=${occurrences}`,
          });
        }
      }
    } else {
      const chosen = dark ?? light;
      if (chosen && chosen.frequency >= 5) {
        const occurrences = chosen.frequency;
        if (occurrences >= 3) {
          const confidence = clamp(0.65 + 0.05 * (occurrences - 3), 0, 0.95);
          inferred.push({
            preferenceKey: "default_background",
            preferenceValue: chosen.detail.direction,
            confidence,
            sampleCountDelta: occurrences,
            trigger: `bg_color_change direction=${chosen.detail.direction} freq=${occurrences}`,
          });
        }
      }
    }

    // Headline sizing inference (headline_resize).
    const hr = patternsByType.get("headline_resize") ?? [];
    const larger = hr.filter((x) => x.detail?.direction === "larger").sort((a, b) => b.frequency - a.frequency)[0];
    const smaller = hr.filter((x) => x.detail?.direction === "smaller").sort((a, b) => b.frequency - a.frequency)[0];
    if (larger && smaller) {
      if (larger.frequency !== smaller.frequency) {
        const chosen = larger.frequency > smaller.frequency ? larger : smaller;
        if (chosen.frequency >= 3) {
          if (chosen.detail.direction === "larger") {
            const occurrences = chosen.frequency;
            const scale = clamp(1.2 + 0.05 * (occurrences - 3), 1, 1.5);
            inferred.push({
              preferenceKey: "headline_size_modifier",
              preferenceValue: { scale: scale },
              confidence: clamp(0.65 + 0.05 * (occurrences - 3), 0, 0.95),
              sampleCountDelta: occurrences,
              trigger: `headline_resize direction=larger freq=${occurrences}`,
            });
          } else {
            inferred.push({
              preferenceKey: "headline_size_modifier",
              preferenceValue: { scale: 0.85 },
              confidence: clamp(0.65 + 0.05 * (chosen.frequency - 3), 0, 0.95),
              sampleCountDelta: chosen.frequency,
              trigger: `headline_resize direction=smaller freq=${chosen.frequency}`,
            });
          }
        }
      }
    } else {
      const chosen = larger ?? smaller;
      if (chosen && chosen.frequency >= 3) {
        const occurrences = chosen.frequency;
        if (chosen.detail.direction === "larger") {
          const scale = clamp(1.2 + 0.05 * (occurrences - 3), 1, 1.5);
          inferred.push({
            preferenceKey: "headline_size_modifier",
            preferenceValue: { scale },
            confidence: clamp(0.65 + 0.05 * (occurrences - 3), 0, 0.95),
            sampleCountDelta: occurrences,
            trigger: `headline_resize direction=larger freq=${occurrences}`,
          });
        } else {
          inferred.push({
            preferenceKey: "headline_size_modifier",
            preferenceValue: { scale: 0.85 },
            confidence: clamp(0.65 + 0.05 * (occurrences - 3), 0, 0.95),
            sampleCountDelta: occurrences,
            trigger: `headline_resize direction=smaller freq=${occurrences}`,
          });
        }
      }
    }

    // Layout density inference (spacing_adjust).
    const sa = patternsByType.get("spacing_adjust") ?? [];
    const more = sa.filter((x) => x.detail?.direction === "more_space").sort((a, b) => b.frequency - a.frequency)[0];
    const less = sa.filter((x) => x.detail?.direction === "less_space").sort((a, b) => b.frequency - a.frequency)[0];
    if (more && more.frequency >= 3) {
      inferred.push({
        preferenceKey: "layout_density",
        preferenceValue: "spacious",
        confidence: clamp(0.65 + 0.05 * (more.frequency - 3), 0, 0.95),
        sampleCountDelta: more.frequency,
        trigger: `spacing_adjust direction=more_space freq=${more.frequency}`,
      });
    } else if (less && less.frequency >= 3) {
      inferred.push({
        preferenceKey: "layout_density",
        preferenceValue: "compact",
        confidence: clamp(0.65 + 0.05 * (less.frequency - 3), 0, 0.95),
        sampleCountDelta: less.frequency,
        trigger: `spacing_adjust direction=less_space freq=${less.frequency}`,
      });
    }

    // CTA preference inference (cta_addition).
    const cta = patternsByType.get("cta_addition") ?? [];
    const ctaMax = cta.sort((a, b) => b.frequency - a.frequency)[0];
    if (ctaMax && ctaMax.frequency >= 2) {
      const occurrences = ctaMax.frequency;
      const confidence = occurrences >= 3 ? 0.85 : 0.7;
      inferred.push({
        preferenceKey: "always_include_cta",
        preferenceValue: true,
        confidence,
        sampleCountDelta: occurrences,
        trigger: `cta_addition freq=${occurrences}`,
      });
    }

    // Color temperature inference (warm/cool) based on most-used brand among approved designs.
    const approvedLogs = await prisma.generationLog.findMany({
      where: {
        userId,
        wasApproved: true,
        createdAt: { gte: since30d },
        testAssignments: { equals: Prisma.DbNull },
      },
      select: { brandId: true },
    });
    const brandCounts = new Map<string, number>();
    for (const l of approvedLogs) {
      if (!l.brandId) continue;
      brandCounts.set(l.brandId, (brandCounts.get(l.brandId) ?? 0) + 1);
    }
    const topBrandId = Array.from(brandCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topBrandId) {
      const brand = await prisma.brandProfile.findUnique({
        where: { id: topBrandId },
        select: { colors: true },
      });
      const primary = (brand?.colors as any)?.primary ?? null;
      if (typeof primary === "string" && primary.startsWith("#")) {
        const hue = hexToHslHue(primary);
        if (hue != null) {
          const isWarm = (hue >= 0 && hue <= 60) || (hue >= 300 && hue <= 360);
          const isCool = hue >= 120 && hue <= 240;
          if (isWarm && !isCool) {
            inferred.push({
              preferenceKey: "color_temperature",
              preferenceValue: "warm",
              confidence: 0.75,
              sampleCountDelta: approvedLogs.length,
              trigger: `brand_primary hue=${hue.toFixed(1)} warm`,
            });
          } else if (isCool && !isWarm) {
            inferred.push({
              preferenceKey: "color_temperature",
              preferenceValue: "cool",
              confidence: 0.75,
              sampleCountDelta: approvedLogs.length,
              trigger: `brand_primary hue=${hue.toFixed(1)} cool`,
            });
          }
        }
      }
    }

    // Font swap inference.
    const fs = patternsByType.get("font_swap") ?? [];
    const fontByName = new Map<string, number>();
    for (const p of fs) {
      const fontName = p.detail?.fontName;
      if (!fontName) continue;
      fontByName.set(fontName, (fontByName.get(fontName) ?? 0) + p.frequency);
    }
    const topFont = Array.from(fontByName.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topFont) {
      const [fontName, occurrences] = topFont as [string, number];
      if (occurrences >= 2) {
        const confidence = occurrences >= 3 ? 0.9 : 0.8;
        inferred.push({
          preferenceKey: "preferred_heading_font",
          preferenceValue: { fontName },
          confidence,
          sampleCountDelta: occurrences,
          trigger: `font_swap fontName=${fontName} freq=${occurrences}`,
        });
      }
    }

    // Apply inferred preferences to UserPreference (respect manual overrides).
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { firstPreferenceInferredAt: true } });
    let firstCreatedThisRun = false;

    for (const inf of inferred) {
      // Skip if user manually overrides this key.
      const existing = await prisma.userPreference.findUnique({
        where: { userId_preferenceKey: { userId, preferenceKey: inf.preferenceKey } },
      });
      if (existing?.manualOverride) {
        preferenceChanges.push({
          userId,
          preferenceKey: inf.preferenceKey,
          oldValue: existing.preferenceValue,
          newValue: existing.preferenceValue,
          oldConfidence: existing.confidence ?? null,
          newConfidence: existing.confidence ?? 0,
          trigger: `manualOverride=true (skipped)`,
          manualOverrideSkipped: true,
        });
        continue;
      }

      const oldValue = existing?.preferenceValue ?? null;
      const oldConfidence = existing?.confidence ?? null;
      const oldEq = existing ? safeJsonStringify(existing.preferenceValue) === safeJsonStringify(inf.preferenceValue) : false;

      if (!existing) {
        await prisma.userPreference.create({
          data: {
            userId,
            preferenceKey: inf.preferenceKey,
            preferenceValue: inf.preferenceValue,
            confidence: clamp(inf.confidence, 0, 0.95),
            sampleCount: inf.sampleCountDelta ?? 0,
            manualOverride: false,
          },
        });
        createdCount += 1;
        recordsUpdated += 1;
        if (!user?.firstPreferenceInferredAt) firstCreatedThisRun = true;
        preferenceChanges.push({
          userId,
          preferenceKey: inf.preferenceKey,
          oldValue,
          newValue: inf.preferenceValue,
          oldConfidence,
          newConfidence: inf.confidence,
          trigger: inf.trigger,
        });
      } else {
        const nextConfidenceBase = oldEq
          ? clamp((existing.confidence ?? 0) + 0.05, 0, 0.95)
          : clamp((existing.confidence ?? 0) - 0.1, 0, 0.95);

        if (nextConfidenceBase < 0.3) {
          await prisma.userPreference.delete({
            where: { id: existing.id },
          });
          deletedCount += 1;
          recordsUpdated += 1;
          preferenceChanges.push({
            userId,
            preferenceKey: inf.preferenceKey,
            oldValue,
            newValue: null,
            oldConfidence,
            newConfidence: nextConfidenceBase,
            trigger: `confidence dropped below 0.3 (${inf.trigger})`,
          });
        } else {
          await prisma.userPreference.update({
            where: { id: existing.id },
            data: {
              preferenceValue: inf.preferenceValue,
              confidence: clamp(nextConfidenceBase, 0, 0.95),
              sampleCount: (existing.sampleCount ?? 0) + 1,
              manualOverride: false,
            },
          });
          updatedCount += 1;
          recordsUpdated += 1;
          preferenceChanges.push({
            userId,
            preferenceKey: inf.preferenceKey,
            oldValue,
            newValue: inf.preferenceValue,
            oldConfidence,
            newConfidence: clamp(nextConfidenceBase, 0, 0.95),
            trigger: inf.trigger,
          });
        }
      }
    }

    if (firstCreatedThisRun) {
      await prisma.user.update({
        where: { id: userId },
        data: { firstPreferenceInferredAt: now },
      });
    }
  }

  return {
    recordsProcessed: activeUsers.length,
    recordsUpdated,
    createdCount,
    updatedCount,
    deletedCount,
    preferenceChanges,
  };
}

