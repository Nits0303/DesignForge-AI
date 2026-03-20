import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export default async function ExportsHistoryPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const { id } = params;

  const design = await prisma.design.findFirst({
    where: { id, userId },
    include: {
      assets: {
        where: { assetType: "preview" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { fileUrl: true },
      },
    },
  });

  if (!design) return null;

  const exports = await prisma.export.findMany({
    where: { designId: design.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      format: true,
      versionNumber: true,
      fileUrl: true,
      figmaUrl: true,
      fileSizeBytes: true,
      createdAt: true,
    },
  });

  const previewUrl = design.assets[0]?.fileUrl ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="h-24 w-32 overflow-hidden rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Design thumbnail" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">
              Generating…
            </div>
          )}
        </div>
        <div>
          <div className="text-sm font-semibold">{design.title}</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))]">
            {design.platform} • {design.format}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))]">
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Exported</th>
              <th className="px-3 py-2">Download</th>
            </tr>
          </thead>
          <tbody>
            {exports.length ? (
              exports.map((e) => (
                <tr key={e.id} className="border-b border-[hsl(var(--border))]">
                  <td className="px-3 py-2 font-semibold">{e.format}</td>
                  <td className="px-3 py-2">v{e.versionNumber}</td>
                  <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                    {typeof e.fileSizeBytes === "number" ? `${(e.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB` : "—"}
                  </td>
                  <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={e.figmaUrl ?? e.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--surface-elevated))] px-2 py-1 hover:bg-[hsl(var(--surface))]"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[hsl(var(--muted-foreground))]">
                  No exports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

