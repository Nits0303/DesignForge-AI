import { PLATFORM_SPECS } from "@/constants/platforms";
import { AI_PRICING } from "@/constants/models";
import { PROMPTS } from "@/lib/ai/prompts";
import type { Platform } from "@/types/design";

export type BatchItemInput = {
  topic: string;
  date: string; // ISO date if parsed; otherwise raw string per edge-case requirements
  platform: Platform;
  format: string;
  notes?: string;
  referenceImageUrl?: string;
};

export type BatchCalendarValidationError = {
  row: number;
  message: string;
};

export type BatchCalendarWarning = {
  row?: number;
  message: string;
};

export type BatchCalendarParseSummary = {
  platformDistribution: Record<string, number>;
  dateRange?: string;
  estimatedCostUsd: number;
};

export type BatchCalendarParseResult = {
  items: BatchItemInput[];
  errors: BatchCalendarValidationError[];
  warnings: BatchCalendarWarning[];
  summary: BatchCalendarParseSummary;
};

type ContentCalendarJson = {
  batchName?: string;
  defaultPlatform?: Platform;
  defaultFormat?: string;
  items: Array<{
    topic: string;
    date: string;
    platform?: Platform;
    format?: string;
    notes?: string;
    referenceImageUrl?: string;
  }>;
};

type ParseMode = "csv" | "json" | "text";

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const DOW: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeSpaces(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV split supporting quotes.
  // Assumes commas inside quoted fields are escaped with double quotes.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"' && line[i - 1] !== "\\") {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function tokenizeTopic(topic: string): string[] {
  return normalizeSpaces(topic)
    .toLowerCase()
    .split(" ")
    .map((w) => w.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
}

function topicSimilarity(a: string, b: string): number {
  const ta = new Set(tokenizeTopic(a));
  const tb = new Set(tokenizeTopic(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function toIsoDateOrRaw(input: string): { date: string; parsed: boolean } {
  const raw = normalizeSpaces(input);
  if (!raw) return { date: "", parsed: false };

  // ISO: YYYY-MM-DD
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [_, y, m, d] = iso;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(dt.getTime())) return { date: dt.toISOString().slice(0, 10), parsed: true };
  }

  // Numeric: DD/MM/YYYY or MM/DD/YYYY
  const mdY = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (mdY) {
    const a = Number(mdY[1]!);
    const b = Number(mdY[2]!);
    const y = Number(mdY[3]!);
    // If one side > 12, it must be day.
    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : b > 12 ? a : a;
    const dt = new Date(Date.UTC(y, month - 1, day));
    if (!Number.isNaN(dt.getTime())) return { date: dt.toISOString().slice(0, 10), parsed: true };
  }

  // Month name: "March 15"
  const monthDay = raw.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s*,?\s*)?$/);
  if (monthDay) {
    const month = MONTHS[monthDay[1]!.toLowerCase()] ?? null;
    const day = Number(monthDay[2]!);
    if (month && day >= 1 && day <= 31) {
      const year = new Date().getUTCFullYear();
      const dt = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(dt.getTime())) return { date: dt.toISOString().slice(0, 10), parsed: true };
    }
  }

  // "next Monday"
  const nextDow = raw.match(/^next\s+([A-Za-z]+)$/i);
  if (nextDow) {
    const dow = DOW[nextDow[1]!.toLowerCase()] ?? null;
    if (dow != null) {
      const now = new Date();
      const curDow = now.getDay();
      const delta = (dow - curDow + 7) % 7 || 7;
      const dt = new Date(Date.now() + delta * 24 * 60 * 60 * 1000);
      const iso = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
      return { date: iso.toISOString().slice(0, 10), parsed: true };
    }
  }

  // Fall back to Date.parse for common formats
  const parsedMs = Date.parse(raw);
  if (!Number.isNaN(parsedMs)) {
    const dt = new Date(parsedMs);
    return { date: dt.toISOString().slice(0, 10), parsed: true };
  }

  return { date: raw, parsed: false };
}

function getDefaultFormat(platform: Platform): string {
  return PLATFORM_SPECS[platform]!.supportedFormats[0]!;
}

function platformFromValue(v: string): Platform | null {
  const lower = normalizeSpaces(v).toLowerCase();
  const keys = Object.keys(PLATFORM_SPECS) as Platform[];
  return keys.find((k) => k.toLowerCase() === lower) ?? null;
}

function estimateItemCostUsd(item: Pick<BatchItemInput, "topic" | "notes" | "platform">): number {
  // Lightweight estimation: matches chooseModel’s cost math style (SONNET pricing) without requiring full prompt assembly.
  const systemTokens = Math.round(PROMPTS.generation.system.length / 4);
  const notesLen = String(item.notes ?? "").length;
  const topicLen = String(item.topic ?? "").length;
  const requestTokens = clamp(Math.round((topicLen + notesLen) / 4) + 450, 300, 1800);
  const componentsTokens = 600; // heuristic for component library slice
  const brandTokens = 200; // heuristic for brand profile slice

  const baseTokens = systemTokens + componentsTokens + brandTokens + requestTokens;
  const targetTokens = 2048;

  const pricing = AI_PRICING.SONNET;
  const costInput = (baseTokens / 1_000_000) * pricing.inputPerMTokens;
  const costOutput = (targetTokens / 1_000_000) * pricing.outputPerMTokens;
  return Number((costInput + costOutput).toFixed(6));
}

function computeSummary(items: BatchItemInput[]): BatchCalendarParseSummary {
  const platformDistribution: Record<string, number> = {};
  for (const it of items) platformDistribution[it.platform] = (platformDistribution[it.platform] ?? 0) + 1;

  const isoDates = items
    .map((x) => x.date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const dateRange = isoDates.length ? `${isoDates[0]} – ${isoDates[isoDates.length - 1]}` : undefined;

  const estimatedCostUsd = items.reduce((a, it) => a + estimateItemCostUsd({ topic: it.topic, notes: it.notes, platform: it.platform }), 0);
  return { platformDistribution, dateRange, estimatedCostUsd };
}

export function estimateBatchCostUsd(items: BatchItemInput[]): number {
  return items.reduce((a, it) => a + estimateItemCostUsd({ topic: it.topic, notes: it.notes, platform: it.platform }), 0);
}

function buildItemsFromRow(row: Record<string, string>, rowNum: number): { item?: BatchItemInput; error?: string; warning?: string } {
  const topicRaw = row.topic ?? row.title ?? "";
  const topic = normalizeSpaces(topicRaw);
  if (!topic) return { error: "Missing required `topic`/`title`." };

  const platformValue = normalizeSpaces(row.platform ?? "");
  const platform = platformFromValue(platformValue);
  if (!platform) return { error: `Unrecognized platform: ${platformValue}` };

  const formatRaw = normalizeSpaces(row.format ?? "");
  const format = formatRaw || getDefaultFormat(platform);

  const dateInput = normalizeSpaces(row.date ?? "");
  if (!dateInput) return { error: "Missing required `date`." };
  const { date } = toIsoDateOrRaw(dateInput);

  const notes = row.notes != null ? String(row.notes).slice(0, 500) : undefined;
  const referenceImageUrl = row.reference_url ?? row.reference_image ?? row.referenceImageUrl ?? undefined;

  return {
    item: {
      topic,
      date,
      platform,
      format,
      notes: notes && notes.trim() ? notes : undefined,
      referenceImageUrl: referenceImageUrl ? String(referenceImageUrl) : undefined,
    },
  };
}

export function parseContentCalendarFromCsv(csv: string): BatchCalendarParseResult {
  const text = String(csv ?? "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length < 2) {
    return { items: [], errors: [{ row: 1, message: "CSV must include a header and at least one row." }], warnings: [], summary: { platformDistribution: {}, estimatedCostUsd: 0 } };
  }

  const header = splitCsvLine(lines[0]!).map((h) => normalizeSpaces(h).toLowerCase());
  const headerIndex: Record<string, number> = {};
  header.forEach((h, i) => (headerIndex[h] = i));

  const getCell = (cols: string[], key: string) => {
    const idx = headerIndex[key];
    return idx == null ? "" : cols[idx] ?? "";
  };

  const items: BatchItemInput[] = [];
  const errors: BatchCalendarValidationError[] = [];
  const warnings: BatchCalendarWarning[] = [];

  const rows = lines.slice(1);
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // account for header
    const cols = splitCsvLine(rows[i]!);
    const row: Record<string, string> = {
      topic: getCell(cols, "topic") || getCell(cols, "title"),
      title: getCell(cols, "title"),
      date: getCell(cols, "date"),
      platform: getCell(cols, "platform"),
      format: getCell(cols, "format"),
      notes: getCell(cols, "notes"),
      reference_url: getCell(cols, "reference_url"),
      reference_image: getCell(cols, "reference_image"),
      referenceImageUrl: getCell(cols, "referenceImageUrl"),
    };

    // If header columns differ (case-insensitive, flexible), attempt direct mapping too.
    for (const h of header) {
      row[h] = cols[headerIndex[h]!] ?? "";
    }

    const { item, error, warning } = buildItemsFromRow(row, rowNum);
    if (warning) warnings.push({ row: rowNum, message: warning });
    if (error) errors.push({ row: rowNum, message: error });
    else if (item) items.push(item);
  }

  // Duplicate detection: same platform + similar topic + same date.
  const duplicateWarnings: BatchCalendarWarning[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (a.platform !== b.platform) continue;
      if (a.date !== b.date) continue;
      const sim = topicSimilarity(a.topic, b.topic);
      if (sim >= 0.7) {
        duplicateWarnings.push({
          message: `Potential duplicate: items ${i + 1} and ${j + 1} share ${Math.round(sim * 100)}% topic similarity on ${a.platform} (${a.date}).`,
        });
      }
    }
  }
  warnings.push(...duplicateWarnings);

  return { items, errors, warnings, summary: computeSummary(items) };
}

export function parseContentCalendarFromJson(jsonText: string): BatchCalendarParseResult {
  let raw: any;
  try {
    raw = JSON.parse(String(jsonText ?? ""));
  } catch {
    return {
      items: [],
      errors: [{ row: 1, message: "Invalid JSON." }],
      warnings: [],
      summary: { platformDistribution: {}, estimatedCostUsd: 0 },
    };
  }

  const doc = raw as ContentCalendarJson;
  const defaultPlatform = doc.defaultPlatform ? platformFromValue(String(doc.defaultPlatform)) : null;
  const defaultFormat =
    doc.defaultFormat && defaultPlatform ? String(doc.defaultFormat) : defaultPlatform ? getDefaultFormat(defaultPlatform) : null;

  const items: BatchItemInput[] = [];
  const errors: BatchCalendarValidationError[] = [];

  doc.items = Array.isArray(doc.items) ? doc.items : [];
  for (let i = 0; i < doc.items.length; i++) {
    const idx = i + 1;
    const it = doc.items[i]!;
    const platform = it.platform ? platformFromValue(String(it.platform)) : defaultPlatform;
    if (!platform) {
      errors.push({ row: idx, message: "Missing platform (and no defaultPlatform provided)." });
      continue;
    }
    const format = String(it.format ?? defaultFormat ?? getDefaultFormat(platform));
    const topic = normalizeSpaces(String(it.topic ?? ""));
    if (!topic) {
      errors.push({ row: idx, message: "Missing required `topic`." });
      continue;
    }
    const dateInput = normalizeSpaces(String(it.date ?? ""));
    if (!dateInput) {
      errors.push({ row: idx, message: "Missing required `date`." });
      continue;
    }
    const { date } = toIsoDateOrRaw(dateInput);
    items.push({
      topic,
      date,
      platform,
      format,
      notes: it.notes ? String(it.notes).slice(0, 500) : undefined,
      referenceImageUrl: it.referenceImageUrl ? String(it.referenceImageUrl) : undefined,
    });
  }

  const warnings: BatchCalendarWarning[] = [];
  // Duplicate detection for JSON as well.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (a.platform !== b.platform) continue;
      if (a.date !== b.date) continue;
      const sim = topicSimilarity(a.topic, b.topic);
      if (sim >= 0.7) {
        warnings.push({
          message: `Potential duplicate: items ${i + 1} and ${j + 1} share ${Math.round(sim * 100)}% topic similarity on ${a.platform} (${a.date}).`,
        });
      }
    }
  }

  return { items, errors, warnings, summary: computeSummary(items) };
}

export function parseContentCalendarFromText(text: string): BatchCalendarParseResult {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: BatchItemInput[] = [];
  const errors: BatchCalendarValidationError[] = [];
  const warnings: BatchCalendarWarning[] = [];

  for (let i = 0; i < lines.length; i++) {
    const row = lines[i]!;
    const rowNum = i + 1;
    if (row.startsWith("#")) continue;

    const parts = row.split("|").map((p) => p.trim());
    if (parts.length < 3) {
      errors.push({ row: rowNum, message: "Each line must be `{date} | {platform} | {topic}` (format optional)." });
      continue;
    }

    const dateInput = parts[0]!;
    const platform = platformFromValue(parts[1]!);
    if (!platform) {
      errors.push({ row: rowNum, message: `Unrecognized platform: ${parts[1]}` });
      continue;
    }

    let format = getDefaultFormat(platform);
    let topicParts: string[] = [];

    // If we have 4 parts, treat 3rd part as format candidate and remainder as topic.
    if (parts.length >= 4) {
      const maybeFormat = parts[2]!;
      if (PLATFORM_SPECS[platform]!.supportedFormats.includes(maybeFormat)) {
        format = maybeFormat;
        topicParts = parts.slice(3);
      } else {
        // Keep default format; treat 3rd part as part of the topic.
        topicParts = parts.slice(2);
        warnings.push({
          row: rowNum,
          message: `Format '${maybeFormat}' not recognized for ${platform}. Using default format '${format}'.`,
        });
      }
    } else {
      topicParts = parts.slice(2);
    }

    const topic = normalizeSpaces(topicParts.join(" "));
    if (!topic) {
      errors.push({ row: rowNum, message: "Missing topic." });
      continue;
    }

    const { date } = toIsoDateOrRaw(dateInput);
    items.push({ topic, date, platform, format });
  }

  // Duplicate warnings.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (a.platform !== b.platform) continue;
      if (a.date !== b.date) continue;
      const sim = topicSimilarity(a.topic, b.topic);
      if (sim >= 0.7) {
        warnings.push({
          message: `Potential duplicate: items ${i + 1} and ${j + 1} share ${Math.round(sim * 100)}% topic similarity on ${a.platform} (${a.date}).`,
        });
      }
    }
  }

  return { items, errors, warnings, summary: computeSummary(items) };
}

export function parseContentCalendar(params: { mode: ParseMode; input: string }): BatchCalendarParseResult {
  switch (params.mode) {
    case "csv":
      return parseContentCalendarFromCsv(params.input);
    case "json":
      return parseContentCalendarFromJson(params.input);
    case "text":
      return parseContentCalendarFromText(params.input);
    default:
      return { items: [], errors: [{ row: 1, message: "Unknown parse mode." }], warnings: [], summary: { platformDistribution: {}, estimatedCostUsd: 0 } };
  }
}

