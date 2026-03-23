export class AnalyticsTimeoutError extends Error {
  code = "ANALYTICS_TIMEOUT";
  status = 504;
  constructor(message = "Analytics query timed out") {
    super(message);
    this.name = "AnalyticsTimeoutError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new AnalyticsTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

