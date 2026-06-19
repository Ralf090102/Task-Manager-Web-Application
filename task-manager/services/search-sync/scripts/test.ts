import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { Meilisearch } from "meilisearch";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const meili = new Meilisearch({
  host: process.env.MEILI_URL || "http://localhost:7700",
  apiKey: process.env.MEILI_MASTER_KEY,
});

const index = meili.index("tasks");

async function checkHealth() {
  try {
    const resp = await fetch(`${process.env.MEILI_URL || "http://localhost:7700"}/health`);
    const body = await resp.json() as Record<string, string>;
    console.log("Meilisearch health:", JSON.stringify(body));
  } catch (err) {
    console.log("Meilisearch unreachable:", (err as Error).message);
  }
}

async function checkIndex() {
  try {
    const stats = await index.getStats();
    console.log("Index stats:", JSON.stringify(stats, null, 2));
  } catch (err) {
    console.log("Index stats error:", (err as Error).message);
  }
}

async function searchTest() {
  try {
    const results = await index.search("", { limit: 5 });
    console.log(`Search results (first 5 of ${results.estimatedTotalHits}):`);
    for (const hit of results.hits) {
      console.log(`  ${hit.id} | ${hit.title} | status=${hit.status} | priority=${hit.priority}`);
    }
  } catch (err) {
    console.log("Search error:", (err as Error).message);
  }
}

async function listTasks() {
  const tasks = await prisma.task.findMany({ take: 5, select: { id: true, title: true, status: true } });
  console.log("DB Tasks (up to 5):", JSON.stringify(tasks, null, 2));
}

const command = process.argv[2];

const commands: Record<string, () => Promise<void>> = {
  health: checkHealth,
  index: checkIndex,
  search: searchTest,
  tasks: listTasks,
};

if (!command || !commands[command]) {
  console.log("Usage: npx tsx scripts/test.ts <command>");
  console.log("Commands:");
  console.log("  health  - Check Meilisearch /health endpoint");
  console.log("  index   - Show index stats (document count, etc.)");
  console.log("  search  - Search test (first 5 documents)");
  console.log("  tasks   - List up to 5 tasks from database");
} else {
  await commands[command]();
}

await prisma.$disconnect();
