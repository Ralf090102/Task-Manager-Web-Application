import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

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

const BUCKET_NAME = "task-attachments";

async function listTasks() {
  const tasks = await prisma.task.findMany({ take: 5, select: { id: true, title: true } });
  console.log("Tasks (up to 5):", JSON.stringify(tasks, null, 2));
}

async function listAttachments() {
  const attachments = await prisma.attachment.findMany({ take: 10 });
  console.log("Attachments (up to 10):", JSON.stringify(attachments, null, 2));
}

async function checkBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log(`Bucket "${BUCKET_NAME}" exists`);

    const objects = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET_NAME, MaxKeys: 20 })
    );
    const count = objects.KeyCount ?? 0;
    console.log(`  ${count} object(s) in bucket`);
    if (objects.Contents) {
      for (const obj of objects.Contents) {
        console.log(`    ${obj.Key}  (${obj.Size} bytes)`);
      }
    }
  } catch (err) {
    console.log(`Bucket "${BUCKET_NAME}" NOT found or error:`, (err as Error).message);
  }
}

const command = process.argv[2];

const commands: Record<string, () => Promise<void>> = {
  tasks: listTasks,
  attachments: listAttachments,
  bucket: checkBucket,
};

if (!command || !commands[command]) {
  console.log("Usage: npx tsx scripts/test.ts <command>");
  console.log("Commands:");
  console.log("  tasks       - List up to 5 tasks");
  console.log("  attachments - List up to 10 attachments");
  console.log("  bucket      - Check bucket status and list objects");
} else {
  await commands[command]();
}

await prisma.$disconnect();
