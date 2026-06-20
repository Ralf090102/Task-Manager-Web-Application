import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { taskCreateSchema } from "@/lib/validations";
import { observeRequest, trackTaskOperation } from "@/lib/metrics";
import logger from "@/lib/logger";
import { emitToRealtime } from "@/lib/realtime";

export async function GET() {
  const start = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("GET", "/api/tasks", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    trackTaskOperation("list", "success");
    observeRequest("GET", "/api/tasks", 200, (Date.now() - start) / 1000);
    return NextResponse.json(tasks);
  } catch {
    trackTaskOperation("list", "error");
    observeRequest("GET", "/api/tasks", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const start = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("POST", "/api/tasks", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = taskCreateSchema.safeParse(body);

    if (!parsed.success) {
      observeRequest("POST", "/api/tasks", 400, (Date.now() - start) / 1000);
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { title, description, status, priority, dueDate } = parsed.data;

    const task = await prisma.task.create({
      data: {
        title,
        description,
        status: status || "TODO",
        priority: priority || "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        userId: session.user.id,
      },
    });

    trackTaskOperation("create", "success");
    logger.info({ taskId: task.id, userId: session.user.id }, "Task created");
    observeRequest("POST", "/api/tasks", 201, (Date.now() - start) / 1000);
    emitToRealtime("task:created", task);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    trackTaskOperation("create", "error");
    logger.error({ err }, "Failed to create task");
    observeRequest("POST", "/api/tasks", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
