import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL || "";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!FILE_SERVICE_URL) {
    return NextResponse.json(
      { error: "File service not configured" },
      { status: 503 }
    );
  }

  const { id } = await params;

  const res = await fetch(`${FILE_SERVICE_URL}/download/${id}`, {
    headers: { "x-user-id": session.user.id },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Download failed" },
      { status: res.status }
    );
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const contentDisposition = res.headers.get("content-disposition") || "";
  const blob = await res.blob();

  return new NextResponse(blob, {
    headers: {
      "content-type": contentType,
      ...(contentDisposition && { "content-disposition": contentDisposition }),
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!FILE_SERVICE_URL) {
    return NextResponse.json(
      { error: "File service not configured" },
      { status: 503 }
    );
  }

  const { id } = await params;

  const res = await fetch(`${FILE_SERVICE_URL}/attachments/${id}`, {
    method: "DELETE",
    headers: { "x-user-id": session.user.id },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
