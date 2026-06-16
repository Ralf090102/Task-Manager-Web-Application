import Fastify from "fastify";
import nodemailer from "nodemailer";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
});

const smtpHost = process.env.SMTP_HOST;
const transporter = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || "587"),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    })
  : null;

async function sendEmail(to: string, subject: string, text: string) {
  if (!transporter) {
    app.log.info({ to, subject }, "[notification] SMTP not configured, skipping email");
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@taskmanager.local",
      to,
      subject,
      text,
    });
    app.log.info({ to, subject }, "[notification] Email sent");
  } catch (err) {
    app.log.error({ err, to, subject }, "[notification] Failed to send email");
  }
}

app.get("/health", async () => ({ status: "ok" }));

app.post("/notify/due-soon", async () => {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { lte: soon, gte: now },
      status: { not: "COMPLETED" },
    },
    include: { user: true },
  });

  let notified = 0;
  for (const task of tasks) {
    if (task.user.email) {
      await sendEmail(
        task.user.email,
        `Task due soon: ${task.title}`,
        `Your task "${task.title}" is due on ${task.dueDate?.toISOString()}`
      );
    }

    await prisma.notification.create({
      data: {
        userId: task.userId,
        type: "due_soon",
        message: `Task "${task.title}" is due on ${task.dueDate?.toISOString()}`,
        taskId: task.id,
      },
    });
    notified++;
  }

  app.log.info(`[notification] Processed ${notified} due-soon tasks`);
  return { notified };
});

app.post("/notify/task-completed", async (req) => {
  const { taskId, title, userEmail, userId } = req.body as {
    taskId: string;
    title: string;
    userEmail: string;
    userId: string;
  };

  if (userEmail) {
    await sendEmail(
      userEmail,
      `Task completed: ${title}`,
      `Task "${title}" has been marked as completed.`
    );
  }

  await prisma.notification.create({
    data: {
      userId,
      type: "task_completed",
      message: `Task "${title}" has been completed.`,
      taskId,
    },
  });

  return { sent: true };
});

const start = async () => {
  try {
    await app.listen({ port: 3004, host: "0.0.0.0" });
    app.log.info("[notification] Service listening on port 3004");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
