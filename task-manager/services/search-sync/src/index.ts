import Fastify from "fastify";
import { Meilisearch } from "meilisearch";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const meili = new Meilisearch({
  host: process.env.MEILI_URL || "http://localhost:7700",
  apiKey: process.env.MEILI_MASTER_KEY,
});

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
});

const INDEX_NAME = "tasks";
const index = meili.index(INDEX_NAME);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function configureIndex(attempt = 1): Promise<void> {
  try {
    await index.updateSearchableAttributes(["title", "description"]);
    await index.updateFilterableAttributes(["status", "priority", "userId"]);
    app.log.info("[search-sync] Index configured (searchable + filterable attributes)");
  } catch (err) {
    if (attempt < 5) {
      const delay = 1000 * Math.pow(2, attempt);
      app.log.warn(
        { err, attempt, delay },
        "[search-sync] Index config failed, retrying..."
      );
      await sleep(delay);
      return configureIndex(attempt + 1);
    }
    app.log.error({ err }, `[search-sync] Index config failed after ${attempt} attempts`);
  }
}

app.get("/health", async () => ({ status: "ok" }));

app.post("/sync/task", async (req, reply) => {
  const task = req.body as Record<string, unknown>;

  if (!task || !task.id) {
    return reply.code(400).send({ error: "Task body with id is required" });
  }

  await index.addDocuments([
    {
      id: task.id,
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      userId: task.userId,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
    },
  ]);

  app.log.info({ taskId: task.id }, "[search-sync] Task indexed");
  return { indexed: true };
});

app.delete("/sync/task/:id", async (req) => {
  const { id } = req.params as { id: string };
  await index.deleteDocument(id);
  app.log.info({ taskId: id }, "[search-sync] Task removed from index");
  return { deleted: true };
});

app.post("/sync/all", async () => {
  const tasks = await prisma.task.findMany();

  if (tasks.length > 0) {
    await index.addDocuments(
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || "",
        status: t.status,
        priority: t.priority,
        userId: t.userId,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
      }))
    );
  }

  app.log.info({ count: tasks.length }, "[search-sync] Bulk reindex complete");
  return { reindexed: tasks.length };
});

const start = async () => {
  try {
    await app.listen({ port: 3006, host: "0.0.0.0" });
    app.log.info("[search-sync] Service listening on port 3006");
    await configureIndex();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
