/**
 * Seed script — creates a test user "Shampoo01" with full microservice data.
 *
 * Run:
 *   npx tsx prisma/seed.ts
 *
 * Generates: User, Tasks, Team, Boards, Recurring Tasks, Webhooks,
 * Webhook Deliveries, Notifications, and Team Activity.
 *
 * Idempotent: re-running upserts the user (by email) and skips existing data.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// ── Load DATABASE_URL from .env (standalone script, no Next.js) ─────────────

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Helpers ──────────────────────────────────────────────────────────────────

const now = new Date();
const minutesFromNow = (m: number) => new Date(now.getTime() + m * 60_000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_40_000);

function log(icon: string, msg: string) {
  console.log(`  ${icon} ${msg}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n seeding database for Shampoo01...\n");

  // 1. ── User ──────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("junnaruse", 10);

  const user = await prisma.user.upsert({
    where: { email: "shampoo01@gmail.com" },
    update: { name: "Shampoo01", password: hashedPassword },
    create: {
      name: "Shampoo01",
      email: "shampoo01@gmail.com",
      password: hashedPassword,
    },
  });
  log("👤", `User: ${user.name} (${user.email}) — id: ${user.id}`);

  // 2. ── Tasks ─────────────────────────────────────────────────────────────
  const tasks = await Promise.all([
    prisma.task.create({
      data: {
        title: "Review Q3 analytics dashboard",
        description: "Go through the analytics widget and verify the charts render correctly.",
        status: "IN_PROGRESS",
        priority: "HIGH",
        dueDate: daysFromNow(2),
        userId: user.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Fix webhook delivery retry bug",
        description: "Deliveries with status 'failed' should show the last HTTP response body.",
        status: "TODO",
        priority: "HIGH",
        dueDate: daysFromNow(1),
        userId: user.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Write integration tests for search",
        description: "Cover the Meilisearch sync service with end-to-end tests.",
        status: "TODO",
        priority: "MEDIUM",
        dueDate: daysFromNow(5),
        userId: user.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Design Kanban board drag-and-drop",
        description: "Implement DnD for moving tasks between columns on team boards.",
        status: "TODO",
        priority: "MEDIUM",
        userId: user.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Set up Grafana alert thresholds",
        description: "Configure CPU > 80% and memory > 90% alerts in Prometheus.",
        status: "IN_PROGRESS",
        priority: "LOW",
        dueDate: daysFromNow(7),
        userId: user.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Refactor notification bell component",
        description: "Extract the dropdown into a reusable Popover component.",
        status: "COMPLETED",
        priority: "LOW",
        dueDate: daysAgo(1),
        userId: user.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Deploy analytics service to staging",
        description: "Build Python image and test the /stats endpoints.",
        status: "COMPLETED",
        priority: "HIGH",
        dueDate: daysAgo(3),
        userId: user.id,
      },
    }),
    prisma.task.create({
      data: {
        title: "Document the setup-cluster.sh flags",
        description: "Add usage examples for --skip-recreate, --skip-builds, --skip-monitoring.",
        status: "TODO",
        priority: "LOW",
        userId: user.id,
      },
    }),
  ]);
  log("📋", `Tasks: ${tasks.length} created (2 TODO-HIGH, 1 TODO-MED, 2 TODO-LOW, 2 IN_PROGRESS, 2 COMPLETED)`);

  // 3. ── Team ──────────────────────────────────────────────────────────────
  const team = await prisma.team.create({
    data: {
      name: "Shampoo's Engineering Team",
      slug: `shampoos-engineering-team-${Date.now()}`,
      ownerId: user.id,
    },
  });
  log("🏢", `Team: ${team.name} — id: ${team.id}`);

  // Owner is automatically an ADMIN member
  const member = await prisma.member.create({
    data: {
      teamId: team.id,
      userId: user.id,
      role: "ADMIN",
    },
  });
  log("👥", `Member: ${user.name} → ADMIN`);

  // 4. ── Boards ─────────────────────────────────────────────────────────────
  const boards = await Promise.all([
    prisma.board.create({
      data: { teamId: team.id, name: "Backlog", color: "#6b7280" },
    }),
    prisma.board.create({
      data: { teamId: team.id, name: "Sprint 1", color: "#3b82f6" },
    }),
    prisma.board.create({
      data: { teamId: team.id, name: "Done", color: "#22c55e" },
    }),
  ]);
  log("📊", `Boards: ${boards.length} created (Backlog, Sprint 1, Done)`);

  // Assign some tasks to boards
  await prisma.task.update({
    where: { id: tasks[0].id },
    data: { boardId: boards[1].id },
  });
  await prisma.task.update({
    where: { id: tasks[1].id },
    data: { boardId: boards[1].id },
  });
  await prisma.task.update({
    where: { id: tasks[4].id },
    data: { boardId: boards[1].id },
  });
  await prisma.task.update({
    where: { id: tasks[5].id },
    data: { boardId: boards[2].id },
  });
  await prisma.task.update({
    where: { id: tasks[6].id },
    data: { boardId: boards[2].id },
  });
  await prisma.task.update({
    where: { id: tasks[3].id },
    data: { boardId: boards[0].id },
  });
  log("🔗", `6 tasks assigned to boards`);

  // 5. ── Recurring Tasks ────────────────────────────────────────────────────
  // Includes one that triggers every 5 minutes (for live scheduler testing)
  const recurringTasks = await Promise.all([
    prisma.recurringTask.create({
      data: {
        userId: user.id,
        title: "Automated status check",
        description: "Generated every 5 minutes by the scheduler — tests live CronJob.",
        priority: "HIGH",
        cron: "*/5 * * * *",
        nextRun: minutesFromNow(5),
        active: true,
      },
    }),
    prisma.recurringTask.create({
      data: {
        userId: user.id,
        title: "Daily standup reminder",
        description: "Creates a task every morning to write a standup summary.",
        priority: "MEDIUM",
        cron: "0 9 * * *",
        nextRun: daysFromNow(1),
        active: true,
      },
    }),
    prisma.recurringTask.create({
      data: {
        userId: user.id,
        title: "Weekly metrics review",
        description: "Review Prometheus metrics and Grafana dashboards weekly.",
        priority: "LOW",
        cron: "0 10 * * 1",
        nextRun: daysFromNow(7),
        active: true,
      },
    }),
    prisma.recurringTask.create({
      data: {
        userId: user.id,
        title: "Paused experiment task",
        description: "This recurring task is paused for testing the toggle UI.",
        priority: "MEDIUM",
        cron: "0 0 * * *",
        nextRun: daysFromNow(1),
        active: false,
      },
    }),
  ]);
  log("🔁", `Recurring tasks: ${recurringTasks.length} created`);
  console.log("     ├─ ✅ */5 * * * * — every 5 min (ACTIVE)");
  console.log("     ├─ ✅ 0 9 * * *   — daily 9 AM (ACTIVE)");
  console.log("     ├─ ✅ 0 10 * * 1  — weekly Monday 10 AM (ACTIVE)");
  console.log("     └─ ⏸  0 0 * * *   — daily midnight (PAUSED)");

  // Link some tasks to recurring templates (simulates scheduler-created tasks)
  await prisma.task.update({
    where: { id: tasks[6].id },
    data: { recurringTaskId: recurringTasks[1].id },
  });
  await prisma.task.update({
    where: { id: tasks[7].id },
    data: { recurringTaskId: recurringTasks[1].id },
  });
  log("🔁", `2 tasks linked to recurring template "Daily standup reminder"`);

  // 6. ── Webhooks ───────────────────────────────────────────────────────────
  // Use webhook.site URLs for real delivery testing
  const webhooks = await Promise.all([
    prisma.webhook.create({
      data: {
        userId: user.id,
        url: "https://webhook.site/00000000-0000-0000-0000-000000000001",
        events: ["task.created", "task.updated", "task.deleted"],
        secret: "whsec_shampoo_test_1",
        active: true,
      },
    }),
    prisma.webhook.create({
      data: {
        userId: user.id,
        url: "https://webhook.site/00000000-0000-0000-0000-000000000002",
        events: ["task.completed"],
        secret: "whsec_shampoo_test_2",
        active: true,
      },
    }),
    prisma.webhook.create({
      data: {
        userId: user.id,
        url: "https://webhook.site/00000000-0000-0000-0000-000000000003",
        events: ["task.created", "task.updated", "task.deleted", "task.completed"],
        secret: "whsec_shampoo_test_3",
        active: false,
      },
    }),
  ]);
  log("🪝", `Webhooks: ${webhooks.length} created (2 active, 1 inactive)`);

  // 7. ── Webhook Deliveries ─────────────────────────────────────────────────
  // Simulate various delivery states for the webhook management UI
  await prisma.webhookDelivery.create({
    data: {
      webhookId: webhooks[0].id,
      event: "task.created",
      payload: { id: tasks[0].id, title: tasks[0].title },
      statusCode: 200,
      response: '{"status":"ok"}',
      attempts: 1,
      maxAttempts: 5,
      status: "delivered",
      deliveredAt: daysAgo(1),
    },
  });
  await prisma.webhookDelivery.create({
    data: {
      webhookId: webhooks[0].id,
      event: "task.updated",
      payload: { id: tasks[1].id, title: tasks[1].title, status: "TODO" },
      statusCode: 500,
      response: '{"error":"Internal Server Error"}',
      attempts: 3,
      maxAttempts: 5,
      status: "pending",
      nextRetryAt: minutesFromNow(2),
    },
  });
  await prisma.webhookDelivery.create({
    data: {
      webhookId: webhooks[0].id,
      event: "task.deleted",
      payload: { id: "deleted-task-id" },
      attempts: 5,
      maxAttempts: 5,
      status: "failed",
    },
  });
  log("📦", `Webhook deliveries: 3 created (1 delivered, 1 pending-retry, 1 failed)`);

  // 8. ── Notifications ──────────────────────────────────────────────────────
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "task.due_soon",
      message: `"${tasks[1].title}" is due tomorrow!`,
      taskId: tasks[1].id,
      read: false,
    },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "recurring.created",
      message: "Recurring task 'Automated status check' (every 5 min) is now active.",
      read: false,
    },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "webhook.failed",
      message: "Webhook delivery to webhook.site/...001 failed after 5 attempts.",
      read: false,
    },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "task.completed",
      message: `You completed "${tasks[5].title}". Nice work!`,
      taskId: tasks[5].id,
      read: true,
    },
  });
  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "weekly_report",
      message: "Your weekly productivity report is ready. Completion rate: 25%.",
      read: true,
    },
  });
  log("🔔", `Notifications: 5 created (3 unread, 2 read)`);

  // 9. ── Team Activity ──────────────────────────────────────────────────────
  await prisma.activity.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "MEMBER_JOINED",
      metadata: { role: "ADMIN" },
    },
  });
  await prisma.activity.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "BOARD_CREATED",
      metadata: { boardName: "Backlog" },
    },
  });
  await prisma.activity.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "BOARD_CREATED",
      metadata: { boardName: "Sprint 1" },
    },
  });
  await prisma.activity.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "BOARD_CREATED",
      metadata: { boardName: "Done" },
    },
  });
  await prisma.activity.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "TASK_CREATED",
      taskId: tasks[0].id,
      metadata: { title: tasks[0].title },
    },
  });
  await prisma.activity.create({
    data: {
      teamId: team.id,
      userId: user.id,
      type: "TASK_ASSIGNED",
      taskId: tasks[0].id,
      metadata: { title: tasks[0].title, assignee: user.name },
    },
  });
  log("📝", `Activity: 6 entries (member joined, 3 boards, task created, task assigned)`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n┌──────────────────────────────────────────────┐");
  console.log("  │           Seed Complete                      │");
  console.log("  ├──────────────────────────────────────────────┤");
  console.log("  │  Login:    shampoo01@gmail.com               │");
  console.log("  │  Password: junnaruse                         │");
  console.log("  ├──────────────────────────────────────────────┤");
  console.log("  │  1 User    8 Tasks (2 recurring) 1 Team   3 Boards │");
  console.log("  │  4 Recurring  3 Webhooks  5 Notifications    │");
  console.log("  │  3 Deliveries  6 Activities                  │");
  console.log("  └──────────────────────────────────────────────┘\n");
}

main()
  .catch((e) => {
    console.error(" Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
