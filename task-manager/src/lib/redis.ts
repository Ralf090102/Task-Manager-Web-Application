import { createClient } from "redis";
import logger from "./logger";

let client: ReturnType<typeof createClient> | null = null;
let initialized = false;
let connectPromise: Promise<boolean> | null = null;

function getClient() {
  if (!process.env.REDIS_URL) return null;

  if (!initialized) {
    initialized = true;
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => {
      logger.warn({ err }, "Redis client error");
    });
  }

  return client;
}

async function ensureConnected(): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  if (c.isOpen) return true;

  if (!connectPromise) {
    connectPromise = c
      .connect()
      .then(() => {
        logger.info("Redis connected");
        connectPromise = null;
        return true;
      })
      .catch((err) => {
        logger.warn({ err }, "Redis connection failed — falling back to direct DB queries");
        connectPromise = null;
        return false;
      });
  }

  return connectPromise;
}

export async function getCache<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c || !(await ensureConnected())) return null;
  try {
    const data = await c.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
  const c = getClient();
  if (!c || !(await ensureConnected())) return;
  try {
    await c.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silent fail — cache is best-effort
  }
}

export async function invalidateCache(key: string): Promise<void> {
  const c = getClient();
  if (!c || !(await ensureConnected())) return;
  try {
    await c.del(key);
  } catch {
    // Silent fail
  }
}
