import { NextRequest } from "next/server";
import { getRequiredSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { fail, ok } from "@/lib/api/response";
import archiver from "archiver";
import { getStorageService } from "@/lib/storage";
import { sendEmail } from "@/lib/email/smtp";

export const runtime = "nodejs";

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function buildUserExportZip(userId: string) {
  const [designs, brandProfiles, prefs, genLogs] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        platform: string | null;
        format: string | null;
        createdAt: Date;
        originalPrompt: string;
        htmlContent: string;
      }>
    >`
      SELECT
        d."id" as "id",
        d."title" as "title",
        d."platform" as "platform",
        d."format" as "format",
        d."createdAt" as "createdAt",
        d."originalPrompt" as "originalPrompt",
        dv."htmlContent" as "htmlContent"
      FROM "Design" d
      JOIN "DesignVersion" dv
        ON dv."designId" = d."id"
       AND dv."versionNumber" = d."currentVersion"
      WHERE d."userId" = ${userId}
    `,
    prisma.brandProfile.findMany({
      where: { userId },
      take: 200,
    }),
    prisma.userPreference.findMany({ where: { userId } }),
    prisma.generationLog.findMany({ where: { userId } }),
  ]);

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  const zipPromise = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (d: any) => chunks.push(Buffer.from(d)));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
  });

  archive.append(
    `DesignForge AI export\nGenerated at: ${new Date().toISOString()}\nUser: ${userId}\n`,
    { name: "README.txt" }
  );
  archive.append(JSON.stringify({ preferences: prefs }, null, 2), { name: "preferences.json" });
  archive.append(JSON.stringify({ brandProfiles }, null, 2), { name: "brand_profiles.json" });
  const logs = genLogs as any[];
  const header = ["createdAt", "platform", "format", "revisionCount", "wasApproved", "costUsd", "estimatedCostUsd", "model"].join(",");
  const csvLines = logs.map((l) =>
    [
      l.createdAt ? new Date(l.createdAt).toISOString() : "",
      l.platform ?? "",
      l.format ?? "",
      l.revisionCount ?? 0,
      l.wasApproved == null ? "" : l.wasApproved,
      l.costUsd ?? "",
      l.estimatedCostUsd ?? "",
      l.model ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
  archive.append([header, ...csvLines].join("\n"), { name: "generation_history.csv" });

  for (const d of designs as any[]) {
    const fileBase = `${String(d.platform ?? "unknown").replace(/[^a-z0-9]+/gi, "_")}_${String(d.format ?? "unknown").replace(/[^a-z0-9]+/gi, "_")}_${d.id}`;
    archive.append(d.htmlContent ?? "", { name: `designs/${fileBase}.html` });
    archive.append(
      JSON.stringify(
        {
          id: d.id,
          title: d.title,
          platform: d.platform,
          format: d.format,
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
          originalPrompt: d.originalPrompt,
        },
        null,
        2
      ),
      { name: `designs/${fileBase}.json` }
    );
  }

  archive.finalize();
  return zipPromise;
}

async function queueUserExportEmail() {
  const session = await getRequiredSession();
  const userId = session.user.id;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return fail("NOT_FOUND", "User email not found", 404);
  const email = user.email;

  void (async () => {
    try {
      const zip = await buildUserExportZip(userId);
      const storage = getStorageService();
      const path = `exports/user/${userId}/designforge_user_export_${Date.now()}.zip`;
      await storage.upload(zip, path, "application/zip");
      const downloadUrl = await storage.getSignedUrl(path, 7 * 24 * 60 * 60);
      await sendEmail({
        to: email,
        subject: "Your DesignForge export is ready",
        html: `<div style="font-family: Inter, Arial, sans-serif; background:#0d1117; color:#fff; padding:20px;">
            <h3>Your export is ready</h3>
            <p>Download link (expires in 7 days): <a style="color:#93c5fd" href="${downloadUrl}">${downloadUrl}</a></p>
          </div>`,
      });
    } catch {
      // best effort background task
    }
  })();

  return ok({ queued: true, message: "Export started. You will receive an email with a download link shortly." }, 202);
}

/** POST — async export (email when ready). */
export async function POST(_req: NextRequest) {
  try {
    return await queueUserExportEmail();
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

/** GET — same async pipeline as POST (spec parity: GET /api/user/export-data). */
export async function GET(_req: NextRequest) {
  try {
    return await queueUserExportEmail();
  } catch (err: any) {
    if (err?.code === "UNAUTHORIZED" || err?.status === 401) return fail("UNAUTHORIZED", "Authentication required", 401);
    return fail("INTERNAL_ERROR", "Server error", 500);
  }
}

