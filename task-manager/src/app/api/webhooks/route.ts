import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { webhookCreateSchema } from "@/lib/validations";
import crypto from "crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhooks = await prisma.webhook.findMany({
    where: { userId: session.user.id },
    include: {
      _count: { select: { deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    webhooks.map((w) => ({
      ...w,
      secret: undefined,
      deliveryCount: w._count.deliveries,
      _count: undefined,
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = webhookCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { url, events, active } = parsed.data;

  const webhook = await prisma.webhook.create({
    data: {
      url,
      events,
      active: active ?? true,
      secret: crypto.randomBytes(32).toString("hex"),
      userId: session.user.id,
    },
  });

  return NextResponse.json(
    { ...webhook, secret: undefined },
    { status: 201 }
  );
}
