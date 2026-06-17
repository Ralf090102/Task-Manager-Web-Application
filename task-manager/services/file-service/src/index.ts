import Fastify from "fastify";
import multipart from "@fastify/multipart";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const BUCKET_NAME = "task-attachments";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin",
  },
});

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
});

await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 },
});

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    app.log.info(`[file-service] Bucket "${BUCKET_NAME}" already exists`);
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      app.log.info(`[file-service] Created bucket "${BUCKET_NAME}"`);
    } catch (err) {
      app.log.error({ err }, `[file-service] Failed to create bucket`);
    }
  }
}

app.get("/health", async () => ({ status: "ok" }));

app.post("/upload", async (req, reply) => {
  const taskId = req.headers["x-task-id"] as string;
  if (!taskId) {
    return reply.code(400).send({ error: "x-task-id header is required" });
  }

  const data = await req.file();
  if (!data) {
    return reply.code(400).send({ error: "No file uploaded" });
  }

  const buffer = await data.toBuffer();
  const storageKey = `${taskId}/${data.filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: data.mimetype,
    })
  );

  const attachment = await prisma.attachment.create({
    data: {
      taskId,
      filename: data.filename,
      mimeType: data.mimetype,
      size: buffer.length,
      storageKey,
    },
  });

  app.log.info(
    { taskId, filename: data.filename, size: buffer.length },
    "[file-service] File uploaded"
  );
  return attachment;
});

app.get("/download/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const attachment = await prisma.attachment.findUnique({ where: { id } });

  if (!attachment) {
    return reply.code(404).send({ error: "Attachment not found" });
  }

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: attachment.storageKey,
    })
  );

  reply.header("Content-Type", attachment.mimeType);
  reply.header(
    "Content-Disposition",
    `attachment; filename="${attachment.filename}"`
  );
  return reply.send(response.body);
});

app.get("/attachments/:taskId", async (req) => {
  const { taskId } = req.params as { taskId: string };
  return prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });
});

app.delete("/attachments/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const attachment = await prisma.attachment.findUnique({ where: { id } });

  if (!attachment) {
    return reply.code(404).send({ error: "Attachment not found" });
  }

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: attachment.storageKey,
    })
  );

  await prisma.attachment.delete({ where: { id } });

  app.log.info({ id, filename: attachment.filename }, "[file-service] File deleted");
  return { deleted: true };
});

const start = async () => {
  try {
    await app.listen({ port: 3005, host: "0.0.0.0" });
    app.log.info("[file-service] Service listening on port 3005");
    await ensureBucket();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
