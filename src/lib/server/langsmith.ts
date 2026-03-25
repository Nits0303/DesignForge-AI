import crypto from "crypto";

type RunType = "chain" | "llm" | "tool";

export type TraceContext = {
  requestId?: string;
  userId?: string;
  designId?: string | null;
  stage?: string;
};

type TraceRun = {
  id: string;
  finish: (params?: {
    outputs?: Record<string, unknown>;
    error?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

let cachedClientPromise: Promise<any | null> | null = null;

function isTracingEnabled(): boolean {
  return process.env.LANGSMITH_TRACING === "true" && Boolean(process.env.LANGSMITH_API_KEY?.trim());
}

async function getClient(): Promise<any | null> {
  if (!isTracingEnabled()) return null;
  if (!cachedClientPromise) {
    cachedClientPromise = (async () => {
      try {
        const mod = await import("langsmith");
        const ClientCtor = (mod as any).Client;
        if (!ClientCtor) return null;
        return new ClientCtor({
          apiKey: process.env.LANGSMITH_API_KEY,
          apiUrl: process.env.LANGSMITH_ENDPOINT || undefined,
        });
      } catch {
        return null;
      }
    })();
  }
  return cachedClientPromise;
}

export async function startTraceRun(params: {
  name: string;
  runType: RunType;
  inputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  trace?: TraceContext;
  parentRunId?: string;
}): Promise<TraceRun | null> {
  const client = await getClient();
  if (!client) return null;

  const id = crypto.randomUUID();
  const projectName = process.env.LANGSMITH_PROJECT?.trim() || "default";
  const extraMetadata = {
    ...(params.metadata ?? {}),
    ...(params.trace ?? {}),
  };

  try {
    await client.createRun({
      id,
      name: params.name,
      run_type: params.runType,
      project_name: projectName,
      start_time: Date.now(),
      inputs: params.inputs ?? {},
      extra: { metadata: extraMetadata },
      tags: params.tags ?? [],
      parent_run_id: params.parentRunId ?? undefined,
    });
  } catch {
    return null;
  }

  return {
    id,
    finish: async (finishParams) => {
      try {
        await client.updateRun(id, {
          end_time: Date.now(),
          outputs: finishParams?.outputs ?? {},
          error: finishParams?.error,
          extra: {
            metadata: {
              ...extraMetadata,
              ...(finishParams?.metadata ?? {}),
            },
          },
        });
      } catch {
        // Never break request flow due to tracing failures.
      }
    },
  };
}
