import { prisma } from "@/lib/db/prisma";
import { sendEmail, hasSmtpConfig } from "@/lib/email/smtp";

function startOfUtcDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function buildWeeklyHtml(args: {
  designsThisWeek: number;
  mostUsedPlatform: string;
  avgRevisions: number;
  avgRevisionsPrevWeek: number | null;
  totalCostUsd: number;
  dashboardUrl: string;
}) {
  const diff =
    args.avgRevisionsPrevWeek == null
      ? "N/A"
      : `${(args.avgRevisions - args.avgRevisionsPrevWeek).toFixed(2)} vs last week`;

  return `
  <div style="font-family: Inter, Arial, sans-serif; background:#0d1117; color:#ffffff; padding:24px;">
    <h2 style="margin:0 0 12px 0;">Your weekly DesignForge analytics</h2>
    <p style="margin:6px 0;">Designs generated: <strong>${args.designsThisWeek}</strong></p>
    <p style="margin:6px 0;">Most used platform: <strong>${args.mostUsedPlatform}</strong></p>
    <p style="margin:6px 0;">Average revisions: <strong>${args.avgRevisions.toFixed(2)}</strong> (${diff})</p>
    <p style="margin:6px 0;">Total AI cost this week: <strong>$${args.totalCostUsd.toFixed(2)}</strong></p>
    <a href="${args.dashboardUrl}" style="display:inline-block; margin-top:14px; background:#6366f1; color:#fff; text-decoration:none; padding:10px 14px; border-radius:8px;">
      View full analytics
    </a>
  </div>`;
}

export async function runWeeklyAnalyticsEmailJob(now = new Date()): Promise<{
  recordsProcessed: number;
  recordsUpdated: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const runDate = startOfUtcDay(now);
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const curStart = new Date(runDate.getTime() - oneWeekMs);
  const prevStart = new Date(runDate.getTime() - 2 * oneWeekMs);

  const prefRows = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT up."userId" as "userId"
    FROM "UserPreference" up
    WHERE up."preferenceKey" = 'weekly_email_enabled'
      AND up."preferenceValue"::text = 'true'
  `;
  const userIds = Array.from(new Set(prefRows.map((r) => r.userId))).filter(Boolean);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let processed = 0;

  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const chunk = userIds.slice(i, i + batchSize);
    const users = await prisma.user.findMany({
      where: { id: { in: chunk } },
      select: { id: true, email: true },
    });

    for (const u of users) {
      processed += 1;
      try {
        const [designsThisWeek, platformRows, revRows, prevRevRows, costRows] = await Promise.all([
          prisma.design.count({
            where: { userId: u.id, createdAt: { gte: curStart, lt: runDate } },
          }),
          prisma.$queryRaw<Array<{ platform: string; count: number }>>`
            SELECT COALESCE(d.platform::text, 'unknown') as "platform", COUNT(*)::int as "count"
            FROM "Design" d
            WHERE d."userId" = ${u.id}
              AND d."createdAt" >= ${curStart}
              AND d."createdAt" < ${runDate}
            GROUP BY 1
            ORDER BY "count" DESC
            LIMIT 1
          `,
          prisma.$queryRaw<Array<{ avg: number }>>`
            SELECT AVG(COALESCE(gl."revisionCount",0))::float as "avg"
            FROM "GenerationLog" gl
            WHERE gl."userId" = ${u.id}
              AND gl."createdAt" >= ${curStart}
              AND gl."createdAt" < ${runDate}
              AND gl."wasApproved" IS NOT NULL
          `,
          prisma.$queryRaw<Array<{ avg: number }>>`
            SELECT AVG(COALESCE(gl."revisionCount",0))::float as "avg"
            FROM "GenerationLog" gl
            WHERE gl."userId" = ${u.id}
              AND gl."createdAt" >= ${prevStart}
              AND gl."createdAt" < ${curStart}
              AND gl."wasApproved" IS NOT NULL
          `,
          prisma.$queryRaw<Array<{ total: number }>>`
            SELECT COALESCE(SUM(gl."costUsd"),0)::float as "total"
            FROM "GenerationLog" gl
            WHERE gl."userId" = ${u.id}
              AND gl."createdAt" >= ${curStart}
              AND gl."createdAt" < ${runDate}
              AND gl."costUsd" IS NOT NULL
          `,
        ]);

        if (!hasSmtpConfig()) {
          skipped += 1;
          continue;
        }

        const dashboardBase = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const html = buildWeeklyHtml({
          designsThisWeek,
          mostUsedPlatform: platformRows[0]?.platform ?? "N/A",
          avgRevisions: Number(revRows[0]?.avg ?? 0),
          avgRevisionsPrevWeek: prevRevRows[0]?.avg == null ? null : Number(prevRevRows[0].avg),
          totalCostUsd: Number(costRows[0]?.total ?? 0),
          dashboardUrl: `${dashboardBase}/analytics?period=7d`,
        });

        await sendEmail({
          to: u.email,
          subject: "Your weekly DesignForge analytics",
          html,
        });
        sent += 1;
      } catch {
        failed += 1;
      }
    }
  }

  const status = failed > 0 && sent > 0 ? "partial" : failed > 0 ? "failed" : "success";
  await prisma.learningBatchLog.create({
    data: {
      runDate,
      jobName: "weekly_email",
      status: status as any,
      recordsProcessed: processed,
      recordsUpdated: sent,
      durationMs: 0,
      errorMessage:
        !hasSmtpConfig() && processed > 0
          ? "SMTP not configured; skipped sending."
          : failed > 0
            ? `Failed for ${failed} users`
            : null,
      auditDetails: {
        sent,
        failed,
        skipped,
      },
    },
  });

  return {
    recordsProcessed: processed,
    recordsUpdated: sent,
    sent,
    failed,
    skipped,
  };
}

