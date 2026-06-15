import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import cronParser from "cron-parser";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function run() {
  const now = new Date();

  const due = await prisma.recurringTask.findMany({
    where: { active: true, nextRun: { lte: now } },
  });

  console.log(`[scheduler] Found ${due.length} due recurring tasks`);

  for (const template of due) {
    try {
      await prisma.task.create({
        data: {
          title: template.title,
          description: template.description,
          priority: template.priority,
          status: "TODO",
          userId: template.userId,
        },
      });

      const interval = cronParser.parseExpression(template.cron, {
        currentDate: now,
      });
      const nextRun = interval.next().toDate();

      await prisma.recurringTask.update({
        where: { id: template.id },
        data: { lastRun: now, nextRun },
      });

      console.log(
        `[scheduler] Created "${template.title}" for user ${template.userId}, next run: ${nextRun.toISOString()}`
      );
    } catch (err) {
      console.error(
        `[scheduler] Failed to process template ${template.id}:`,
        err
      );
    }
  }

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("[scheduler] Fatal error:", err);
  process.exit(1);
});
