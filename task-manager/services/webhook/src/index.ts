import Fastify from "fastify";
import crypto from "crypto";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const PORT = parseInt(process.env.PORT || "3003", 10);

const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || "5", 10);
const BACKOFF_INTERVALS = (process.env.BACKOFF_INTERVALS || "1,5,30,120,600")
  .split(",")
  .map((s) => parseInt(s.trim(), 10) * 1000);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "2000", 10);
const DELIVERY_TIMEOUT_MS = parseInt(
  process.env.DELIVERY_TIMEOUT_MS || "10000",
  10
);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
});

let shuttingDown = false;

interface TriggerBody {
  event: string;
  data: unknown;
  userId: string;
}

type DeliveryWithWebhook = {
  id: string;
  webhookId: string;
  event: string;
  payload: unknown;
  statusCode: number | null;
  response: string | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  status: string;
  createdAt: Date;
  webhook: {
    id: string;
    url: string;
    secret: string;
    events: string[];
    active: boolean;
  };
}

app.get("/health", async () => ({ status: "ok" }));

app.post("/trigger", async (req, reply) => {
  const { event, data, userId } = req.body as TriggerBody;

  if (!event || !userId) {
    return reply.status(400).send({ error: "event and userId are required" });
  }

  const webhooks = await prisma.webhook.findMany({
    where: { userId, active: true, events: { has: event } },
  });

  for (const webhook of webhooks) {
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: data as never,
        status: "pending",
        nextRetryAt: new Date(),
      },
    });
  }

  app.log.info(
    { event, queued: webhooks.length },
    "[webhook] Deliveries queued"
  );

  return { queued: webhooks.length };
});

async function deliver(delivery: DeliveryWithWebhook): Promise<void> {
  if (!delivery?.webhook) return;

  const body = JSON.stringify({
    event: delivery.event,
    timestamp: new Date().toISOString(),
    data: delivery.payload,
  });

  const signature = crypto
    .createHmac("sha256", delivery.webhook.secret)
    .update(body)
    .digest("hex");

  try {
    const response = await fetch(delivery.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": delivery.event,
        "X-Webhook-Signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    const responseText = await response.text();

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          statusCode: response.status,
          response: responseText.slice(0, 500),
          status: "delivered",
          deliveredAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      app.log.info(
        { deliveryId: delivery.id, statusCode: response.status },
        "[webhook] Delivered"
      );
    } else {
      throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 200)}`);
    }
  } catch (err) {
    const attempts = delivery.attempts + 1;
    const maxedOut = attempts >= MAX_ATTEMPTS;
    const backoffIndex = Math.min(attempts - 1, BACKOFF_INTERVALS.length - 1);
    const backoffMs = BACKOFF_INTERVALS[backoffIndex] ?? 600000;

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts,
        status: maxedOut ? "failed" : "pending",
        nextRetryAt: maxedOut ? null : new Date(Date.now() + backoffMs),
        response: err instanceof Error ? err.message.slice(0, 500) : String(err),
      },
    });

    if (maxedOut) {
      app.log.error(
        { deliveryId: delivery.id, attempts, err },
        "[webhook] Delivery permanently failed (dead letter)"
      );
    } else {
      app.log.warn(
        { deliveryId: delivery.id, attempts, nextRetryIn: backoffMs },
        "[webhook] Delivery failed, will retry"
      );
    }
  }
}

async function processDeliveries(): Promise<void> {
  app.log.info("[webhook] Background delivery worker started");

  while (!shuttingDown) {
    try {
      const pending = await prisma.webhookDelivery.findMany({
        where: {
          status: "pending",
          nextRetryAt: { lte: new Date() },
        },
        include: { webhook: true },
        take: 10,
      });

      for (const delivery of pending as unknown as DeliveryWithWebhook[]) {
        if (shuttingDown) break;
        await deliver(delivery);
      }
    } catch (err) {
      app.log.error({ err }, "[webhook] Worker loop error");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  app.log.info("[webhook] Background delivery worker stopped");
}

const start = async () => {
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    app.log.info(`[webhook] Service listening on port ${PORT}`);
    app.log.info(
      { MAX_ATTEMPTS, BACKOFF_INTERVALS, POLL_INTERVAL_MS, DELIVERY_TIMEOUT_MS },
      "[webhook] Configuration loaded"
    );

    processDeliveries();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

async function gracefulShutdown(signal: string) {
  app.log.info(`[webhook] ${signal} received, shutting down...`);
  shuttingDown = true;

  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS + 100));

  await app.close();
  await prisma.$disconnect();
  app.log.info("[webhook] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

start();
