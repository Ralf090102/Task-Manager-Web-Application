import { Queue } from "bullmq";
import IORedis from "ioredis";
import logger from "./logger";

const QUEUE_NAME = "task-events";

let connection: IORedis | null = null;
let queue: Queue | null = null;

function getQueue(): Queue | null {
  if (!process.env.REDIS_URL) return null;

  if (!queue) {
    connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    connection.on("error", (err) => {
      logger.warn({ err }, "Queue Redis connection error");
    });
    queue = new Queue(QUEUE_NAME, { connection });
    logger.info("BullMQ queue initialized");
  }

  return queue;
}

type JobName = "search.index" | "search.remove";

export async function enqueueTaskEvent(
  name: JobName,
  data: Record<string, unknown>
): Promise<void> {
  const q = getQueue();
  if (!q) return;

  try {
    await q.add(name, data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    logger.info({ job: name, data }, "job enqueued");
  } catch (err) {
    logger.warn({ err, job: name }, "failed to enqueue job — fire-and-forget fallback");
  }
}
