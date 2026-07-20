import { Worker, Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const QUEUE_NAME = "task-events";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const searchSyncUrl = process.env.SEARCH_SYNC_URL || "http://localhost:3006";

function log(level: string, msg: string, data?: unknown) {
  const entry: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    msg,
  };
  if (data) entry.data = data;
  console.log(JSON.stringify(entry));
}

log("info", "worker starting", {
  redis: process.env.REDIS_URL ? "configured" : "default",
  searchSync: searchSyncUrl,
});

async function syncTaskToSearch(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    log("warn", "task not found for search index", { taskId });
    return;
  }

  const res = await fetch(`${searchSyncUrl}/sync/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: task.id,
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      userId: task.userId,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
    }),
  });

  if (!res.ok) {
    throw new Error(`search-sync returned ${res.status}: ${await res.text()}`);
  }
  log("info", "task indexed in meilisearch", { taskId, title: task.title });
}

async function removeTaskFromSearch(taskId: string): Promise<void> {
  const res = await fetch(`${searchSyncUrl}/sync/task/${taskId}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    throw new Error(`search-sync delete returned ${res.status}: ${await res.text()}`);
  }
  log("info", "task removed from meilisearch", { taskId });
}

async function checkOverdueTasks(): Promise<void> {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      status: { not: "COMPLETED" },
    },
  });

  let notified = 0;
  for (const task of tasks) {
    const existing = await prisma.notification.findFirst({
      where: {
        taskId: task.id,
        type: "task_overdue",
      },
    });

    if (existing) continue;

    await prisma.notification.create({
      data: {
        userId: task.userId,
        type: "task_overdue",
        message: `Task "${task.title}" is overdue (due ${task.dueDate?.toISOString()})`,
        taskId: task.id,
      },
    });
    notified++;
  }

  log("info", "overdue check complete", { total: tasks.length, notified });
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    log("info", `processing job: ${job.name}`, { id: job.id, data: job.data });

    switch (job.name) {
      case "search.index":
        await syncTaskToSearch(job.data.taskId);
        break;
      case "search.remove":
        await removeTaskFromSearch(job.data.taskId);
        break;
      case "task.overdue.check":
        await checkOverdueTasks();
        break;
      default:
        log("warn", `unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  log("info", `job completed: ${job.name}`, { id: job.id });
});

worker.on("failed", (job, err) => {
  log("error", `job failed: ${job?.name}`, {
    id: job?.id,
    attempts: job?.attemptsMade,
    error: err.message,
  });
});

worker.on("error", (err) => {
  log("error", "worker error", { error: err.message });
});

log("info", `worker listening on queue "${QUEUE_NAME}"`);

const queue = new Queue(QUEUE_NAME, { connection });

async function setupRepeatableJobs() {
  const repeatableJobs = await queue.getRepeatableJobs();
  const hasOverdueJob = repeatableJobs.some((j) => j.name === "task.overdue.check");

  if (!hasOverdueJob) {
    await queue.add(
      "task.overdue.check",
      {},
      {
        repeat: { pattern: "0 * * * *" },
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );
    log("info", "registered repeatable job: task.overdue.check (hourly)");
  } else {
    log("info", "repeatable job already registered: task.overdue.check");
  }
}

setupRepeatableJobs().catch((err) => {
  log("error", "failed to setup repeatable jobs", { error: err.message });
});

const queueEvents = new QueueEvents(QUEUE_NAME, { connection });

queueEvents.on("failed", ({ jobId, failedReason }) => {
  log("error", "queue event: job failed", { jobId, reason: failedReason });
});

async function shutdown(signal: string) {
  log("info", `received ${signal}, shutting down...`);
  await worker.close();
  await queue.close();
  await queueEvents.close();
  await connection.quit();
  await prisma.$disconnect();
  log("info", "shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
