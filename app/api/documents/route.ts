import { NextRequest, NextResponse } from "next/server";
import { processDocumentFile } from "@/lib/documents";
import { getDocumentsForTask, getDocumentUrl } from "@/lib/storage";
import { requireSession } from "@/lib/session";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File is too large (max 20MB)." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processDocumentFile(
      buffer,
      file.name,
      file.type || "application/octet-stream",
      "manual"
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to process that file." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
    }
    const docs = await getDocumentsForTask(taskId);
    const withUrls = await Promise.all(
      docs.map(async (d) => ({ ...d, url: await getDocumentUrl(d.storage_path) }))
    );
    return NextResponse.json({ documents: withUrls });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load documents." }, { status: 500 });
  }
}
