/**
 * Google Gemini (Gemini 2.5 Flash) adapter — same call sites as Anthropic (Haiku/Sonnet/Opus).
 * Enabled when GEMINI_API_KEY is set; primary path for local testing without ANTHROPIC_API_KEY.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Messages } from "@anthropic-ai/sdk/resources";
import { AI_MODELS, AI_PRICING } from "@/constants/models";
import { logAIUsage } from "@/lib/ai/usageLogger";

/** Override via GEMINI_MODEL (e.g. preview build). Default: Gemini 2.5 Flash. */
export function getGeminiLlmModelId(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

/**
 * When true, LLM calls use Gemini (`GEMINI_API_KEY`).
 * If `ANTHROPIC_API_KEY` is set, Anthropic is used instead (production path).
 */
export function isGeminiPrimaryLlm(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim()) && !process.env.ANTHROPIC_API_KEY?.trim();
}

function geminiPricing() {
  return AI_PRICING.GEMINI_FLASH;
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const p = geminiPricing();
  const costInput = (inputTokens / 1_000_000) * p.inputPerMTokens;
  const costOutput = (outputTokens / 1_000_000) * p.outputPerMTokens;
  return Number((costInput + costOutput).toFixed(6));
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

function toGeminiParts(content: AnthropicContentBlock[] | unknown): Array<
  { text: string } | { inlineData: { mimeType: string; data: string } }
> {
  if (!Array.isArray(content)) return [];
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const block of content as AnthropicContentBlock[]) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push({ text: block.text });
    } else if (block.type === "image" && (block as any).source?.type === "base64") {
      const src = (block as any).source;
      parts.push({
        inlineData: {
          mimeType: src.media_type || "image/jpeg",
          data: src.data,
        },
      });
    }
  }
  return parts;
}

/** Maps Anthropic-style chat messages to Gemini `contents` (roles: user | model). */
export function buildGeminiContentsFromAnthropicMessages(
  messages: { role: "user" | "assistant"; content: AnthropicContentBlock[] }[]
): { role: "user" | "model"; parts: ReturnType<typeof toGeminiParts> }[] {
  const out: { role: "user" | "model"; parts: ReturnType<typeof toGeminiParts> }[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const parts = toGeminiParts(m.content);
    if (parts.length === 0) continue;
    out.push({ role, parts });
  }
  return out;
}

function getGenAI(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(key);
}

/** Pull HTTP status + message from @google/generative-ai errors (GoogleGenerativeAIFetchError, etc.). */
function getGeminiErrorDetails(err: unknown): { status?: number; text: string } {
  const e = err as Record<string, unknown> & { message?: string };
  const status = typeof e?.status === "number" ? e.status : undefined;
  let text = String(e?.message ?? err ?? "Unknown error");
  const details = e?.errorDetails;
  if (Array.isArray(details)) {
    for (const d of details as { message?: string }[]) {
      if (d?.message && !text.includes(d.message)) text += ` ${d.message}`;
    }
  }
  if (text.length > 600) text = `${text.slice(0, 600)}…`;
  return { status, text };
}

/**
 * Maps Google errors to a user-facing message and app error code.
 * See: https://ai.google.dev/gemini-api/docs/troubleshooting
 */
export function interpretGeminiFailure(err: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const { status, text } = getGeminiErrorDetails(err);
  const lower = text.toLowerCase();
  const modelId = getGeminiLlmModelId();

  const isRate =
    status === 429 ||
    status === 503 ||
    /resource_exhausted|resourceexhausted|rate limit|quota|too many requests/i.test(lower);

  if (isRate) {
    return {
      code: "AI_RATE_LIMIT_EXCEEDED",
      message:
        "Gemini rate limit or quota reached (free tier is small). Wait a few minutes, try again, or check quota in Google AI Studio.",
      retryable: true,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: "AI_AUTH_FAILED",
      message:
        "Gemini rejected the API key (401/403). Create a key in Google AI Studio, enable the Generative Language API for the project, and set GEMINI_API_KEY in .env — then restart the dev server.",
      retryable: false,
    };
  }

  if (status === 404 || /not found|unknown model|invalid model/i.test(lower)) {
    return {
      code: "AI_MODEL_NOT_FOUND",
      message: `Model "${modelId}" was not found. Set GEMINI_MODEL to a valid id (e.g. gemini-2.0-flash) or remove it to use the default.`,
      retryable: false,
    };
  }

  if (status === 400 || /invalid|malformed|api key not valid/i.test(lower)) {
    return {
      code: "AI_BAD_REQUEST",
      message: text.includes("API key") ? text : `Gemini request failed: ${text}`,
      retryable: false,
    };
  }

  const isNetwork =
    /fetch failed|failed to fetch|networkerror|econnreset|enotfound|eai_again|timed out|timeout|dns/i.test(
      lower
    );
  if (isNetwork) {
    return {
      code: "AI_NETWORK_ERROR",
      message:
        "Network error while reaching Gemini. Check internet/VPN/proxy/firewall and allow generativelanguage.googleapis.com, then retry.",
      retryable: true,
    };
  }

  if (process.env.AI_DEBUG === "true") {
    console.error("[Gemini]", { status, text, err });
  }

  return {
    code: "AI_SERVICE_UNAVAILABLE",
    message: `Gemini error${status != null ? ` (${status})` : ""}: ${text}`,
    retryable: true,
  };
}

function throwInterpretedGeminiError(err: unknown): never {
  const { code, message } = interpretGeminiFailure(err);
  const e = new Error(message) as Error & { code?: string; cause?: unknown };
  e.code = code;
  e.cause = err;
  throw e;
}

export async function callGeminiAsAnthropicMessage(
  params: {
    model: string;
    system?: string;
    max_tokens: number;
    messages: any;
  },
  opts: { userId: string; designId?: string | null }
): Promise<Messages.Message> {
  const genAI = getGenAI();
  const modelId = getGeminiLlmModelId();
  const genModel = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: params.system,
    generationConfig: {
      maxOutputTokens: params.max_tokens,
    },
  });

  const contents = buildGeminiContentsFromAnthropicMessages(
    params.messages as { role: "user" | "assistant"; content: AnthropicContentBlock[] }[]
  );

  const result = await genModel.generateContent({ contents });
  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const costUsd = estimateCostUsd(inputTokens, outputTokens);

  await logAIUsage({
    model: modelId,
    userId: opts.userId,
    designId: opts.designId ?? undefined,
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd,
  });

  return {
    id: "gemini",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: modelId,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as Messages.Message;
}

export async function callGeminiWithRetry(
  params: {
    model: (typeof AI_MODELS)[keyof typeof AI_MODELS] | string;
    system?: string;
    max_tokens: number;
    messages: any;
    /** Anthropic-only; ignored by Gemini. */
    metadata?: unknown;
  },
  opts: { userId: string; designId?: string | null }
): Promise<Messages.Message> {
  const delays = [1000, 3000, 9000, 20000];

  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await callGeminiAsAnthropicMessage(
        {
          model: String(params.model),
          system: params.system,
          max_tokens: params.max_tokens,
          messages: params.messages as any,
        },
        opts
      );
    } catch (err: unknown) {
      const interp = interpretGeminiFailure(err);
      const shouldRetryAttempt = interp.retryable && attempt < delays.length - 1;
      if (shouldRetryAttempt) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        continue;
      }
      const structured = new Error(interp.message) as Error & { code?: string; cause?: unknown };
      structured.code = interp.code;
      structured.cause = err;
      throw structured;
    }
  }

  throw new Error("Gemini request failed after retries");
}

/** Stream HTML/text deltas; returns usage in Anthropic-compatible shape for persistence. */
export async function streamGeminiGeneration(args: {
  system: string;
  max_tokens: number;
  messages: any[];
  userId: string;
  designId?: string | null;
  onText: (delta: string) => void;
}): Promise<{
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}> {
  const genAI = getGenAI();
  const modelId = getGeminiLlmModelId();
  const genModel = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: args.system,
    generationConfig: { maxOutputTokens: args.max_tokens },
  });

  const contents = buildGeminiContentsFromAnthropicMessages(
    args.messages as { role: "user" | "assistant"; content: AnthropicContentBlock[] }[]
  );

  try {
    const result = await genModel.generateContentStream({ contents });
    for await (const chunk of result.stream) {
      let t = "";
      try {
        t = chunk.text();
      } catch {
        // Some chunks have no text (e.g. only metadata).
      }
      if (t) args.onText(t);
    }

    const response = await result.response;
    const usageMeta = response.usageMetadata;
    const inputTokens = usageMeta?.promptTokenCount ?? 0;
    const outputTokens = usageMeta?.candidatesTokenCount ?? 0;
    const costUsd = estimateCostUsd(inputTokens, outputTokens);

    await logAIUsage({
      model: modelId,
      userId: args.userId,
      designId: args.designId ?? undefined,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd,
    });

    return {
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    };
  } catch (err: unknown) {
    throwInterpretedGeminiError(err);
  }
}
