import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL || "";

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const res = await fetch(
    `${FILE_SERVICE_URL}/attachments/${taskId}`,
    { headers: { "x-user-id": session.user.id } }
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const formData = await req.formData();

  const res = await fetch(`${FILE_SERVICE_URL}/upload`, {
    method: "POST",
    headers: {
      "x-task-id": taskId,
      "x-user-id": session.user.id,
    },
    body: formData,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
