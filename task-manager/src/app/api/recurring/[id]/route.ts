import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { recurringTaskUpdateSchema } from "@/lib/validations";
import { observeRequest } from "@/lib/metrics";
import logger from "@/lib/logger";
import cronParser from "cron-parser";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("PATCH", "/api/recurring", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = recurringTaskUpdateSchema.safeParse(body);

    if (!parsed.success) {
      observeRequest("PATCH", "/api/recurring", 400, (Date.now() - start) / 1000);
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const existing = await prisma.recurringTask.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      observeRequest("PATCH", "/api/recurring", 404, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = { ...parsed.data };

    if (parsed.data.cron && parsed.data.cron !== existing.cron) {
      try {
        cronParser.parseExpression(parsed.data.cron);
      } catch {
        observeRequest("PATCH", "/api/recurring", 400, (Date.now() - start) / 1000);
        return NextResponse.json(
          { error: "Invalid cron expression" },
          { status: 400 }
        );
      }
      const interval = cronParser.parseExpression(parsed.data.cron);
      data.nextRun = interval.next().toDate();
    }

    const updated = await prisma.recurringTask.update({
      where: { id },
      data,
    });

    logger.info(
      { recurringTaskId: id, userId: session.user.id },
      "Recurring task updated"
    );
    observeRequest("PATCH", "/api/recurring", 200, (Date.now() - start) / 1000);
    return NextResponse.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update recurring task");
    observeRequest("PATCH", "/api/recurring", 500, (Date.now() - start) / 1000);
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
      observeRequest("DELETE", "/api/recurring", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.recurringTask.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      observeRequest("DELETE", "/api/recurring", 404, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.recurringTask.delete({ where: { id } });

    logger.info(
      { recurringTaskId: id, userId: session.user.id },
      "Recurring task deleted"
    );
    observeRequest("DELETE", "/api/recurring", 200, (Date.now() - start) / 1000);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to delete recurring task");
    observeRequest("DELETE", "/api/recurring", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
