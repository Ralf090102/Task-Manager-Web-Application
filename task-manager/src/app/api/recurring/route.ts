import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { recurringTaskCreateSchema } from "@/lib/validations";
import { observeRequest, trackTaskOperation } from "@/lib/metrics";
import logger from "@/lib/logger";
import cronParser from "cron-parser";

export async function GET() {
  const start = Date.now();
  try {
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("GET", "/api/recurring", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recurring = await prisma.recurringTask.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    observeRequest("GET", "/api/recurring", 200, (Date.now() - start) / 1000);
    return NextResponse.json(recurring);
  } catch {
    observeRequest("GET", "/api/recurring", 500, (Date.now() - start) / 1000);
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
      observeRequest("POST", "/api/recurring", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = recurringTaskCreateSchema.safeParse(body);

    if (!parsed.success) {
      observeRequest("POST", "/api/recurring", 400, (Date.now() - start) / 1000);
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { title, description, priority, cron } = parsed.data;

    try {
      cronParser.parseExpression(cron);
    } catch {
      observeRequest("POST", "/api/recurring", 400, (Date.now() - start) / 1000);
      return NextResponse.json(
        { error: "Invalid cron expression" },
        { status: 400 }
      );
    }

    const interval = cronParser.parseExpression(cron);
    const nextRun = interval.next().toDate();

    const recurring = await prisma.recurringTask.create({
      data: {
        title,
        description,
        priority: priority || "MEDIUM",
        cron,
        nextRun,
        userId: session.user.id,
      },
    });

    trackTaskOperation("create", "success");
    logger.info(
      { recurringTaskId: recurring.id, userId: session.user.id },
      "Recurring task created"
    );
    observeRequest("POST", "/api/recurring", 201, (Date.now() - start) / 1000);
    return NextResponse.json(recurring, { status: 201 });
  } catch (err) {
    trackTaskOperation("create", "error");
    logger.error({ err }, "Failed to create recurring task");
    observeRequest("POST", "/api/recurring", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
