import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { taskUpdateSchema } from "@/lib/validations";
import { observeRequest, trackTaskOperation } from "@/lib/metrics";
import logger from "@/lib/logger";
import { emitToRealtime } from "@/lib/realtime";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const task = await prisma.task.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("PUT", "/api/tasks/:id", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = taskUpdateSchema.safeParse(body);

    if (!parsed.success) {
      observeRequest("PUT", "/api/tasks/:id", 400, (Date.now() - start) / 1000);
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const existing = await prisma.task.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      observeRequest("PUT", "/api/tasks/:id", 404, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { dueDate, ...rest } = parsed.data;

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate === null ? { dueDate: null } : dueDate ? { dueDate: new Date(dueDate) } : {}),
      },
    });

    trackTaskOperation("update", "success");
    logger.info({ taskId: id, userId: session.user.id }, "Task updated");
    observeRequest("PUT", "/api/tasks/:id", 200, (Date.now() - start) / 1000);
    emitToRealtime("task:updated", task);
    return NextResponse.json(task);
  } catch (err) {
    trackTaskOperation("update", "error");
    logger.error({ err, taskId: req.url }, "Failed to update task");
    observeRequest("PUT", "/api/tasks/:id", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("DELETE", "/api/tasks/:id", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.task.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      observeRequest("DELETE", "/api/tasks/:id", 404, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.task.delete({ where: { id } });

    trackTaskOperation("delete", "success");
    logger.info({ taskId: id, userId: session.user.id }, "Task deleted");
    observeRequest("DELETE", "/api/tasks/:id", 200, (Date.now() - start) / 1000);
    emitToRealtime("task:deleted", { id });
    return NextResponse.json({ success: true });
  } catch (err) {
    trackTaskOperation("delete", "error");
    logger.error({ err }, "Failed to delete task");
    observeRequest("DELETE", "/api/tasks/:id", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
