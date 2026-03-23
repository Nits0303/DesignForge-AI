import { prisma } from "@/lib/db/prisma";
import { withTimeout } from "@/lib/analytics/timeout";

export type AdminSystemLogRow = {
  id: string;
  runDate: string;
  jobName: string;
  status: "success" | "failed" | "partial";
  recordsProcessed: number;
  recordsUpdated: number;
  durationMs: number;
  errorMessage: string | null;
  auditDetails: any;
};

export async function getAdminSystemLogs(params: { page?: number; pageSize?: number } = {}): Promise<{
  logs: AdminSystemLogRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const [total, rows] = await Promise.all([
    withTimeout(prisma.learningBatchLog.count(), 10_000),
    withTimeout(
      prisma.learningBatchLog.findMany({
        orderBy: { runDate: "desc", createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      10_000
    ),
  ]);

  return {
    logs: rows.map((r) => ({
      id: r.id,
      runDate: r.runDate.toISOString().slice(0, 10),
      jobName: r.jobName,
      status: r.status,
      recordsProcessed: r.recordsProcessed,
      recordsUpdated: r.recordsUpdated,
      durationMs: r.durationMs,
      errorMessage: r.errorMessage,
      auditDetails: r.auditDetails,
    })),
    total,
    page,
    pageSize,
  };
}

