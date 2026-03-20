import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const path = pathSegments.join("/");
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const baseDir = process.env.LOCAL_STORAGE_PATH ?? "./storage";
  const fullPath = join(process.cwd(), baseDir, path);

  try {
    const buf = await readFile(fullPath);
    const ext = path.split(".").pop() ?? "";
    const mime = MIME[ext] ?? "application/octet-stream";
    return new NextResponse(buf, {
      headers: { "Content-Type": mime },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
