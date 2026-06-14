# Project Initialization 2: Application Feature Expansion

This document proposes new **application features** for the Task Manager that naturally split into separate microservices. Each feature adds real product value while creating new containers to build, new Dockerfiles to write, and new Kubernetes resources (Deployments, StatefulSets, Services, CronJobs, PVCs) to manage.

The goal is to transform the single-pod monolith into a multi-service architecture deployed on Kubernetes — giving you hands-on practice with containerizing, deploying, and orchestrating multiple services.

---

## Current Architecture (Baseline)

```
                                          ┌─────────────────────┐
                           HTTP           │                     │
Browser ─────────────────► NGINX ──────►  │  task-manager       │ ───► PostgreSQL (Supabase)
                          Ingress         │  (Next.js monolith) │
                                          │  Port 3000          │
                                          └─────────────────────┘
                                                  │
                                          Prometheus scrapes
                                          /api/metrics (15s)
```

**What exists today:** One pod, one Docker image, one Helm deployment, external PostgreSQL, Prometheus + Grafana monitoring.

**What these modules add:** Separate microservices, each with its own Dockerfile, Helm templates, and K8s workload — a real multi-service cluster.

---

## Feature Overview

| Module | Feature | New Containers | New K8s Resources | Languages |
|--------|---------|---------------|-------------------|-----------|
| 1 | **Notification Service** | notification-service | Deployment, Service, Secret | Node.js |
| 2 | **File Attachments + MinIO** | file-service, MinIO | StatefulSet, PVC, Headless Service, Deployment | Node.js, Go (MinIO) |
| 3 | **Analytics & Reporting** | analytics-service | Deployment, Service, CronJob | Python (FastAPI) |
| 4 | **Real-time WebSocket Gateway** | realtime-service | Deployment, Service (sticky), ConfigMap | Node.js (Socket.io) |
| 5 | **Full-Text Search** | search-sync-service, Meilisearch | StatefulSet, PVC, Deployment | Node.js, Rust (Meilisearch) |
| 6 | **Webhook Delivery** | webhook-service | Deployment, ConfigMap | Node.js |
| 7 | **Recurring Task Scheduler** | scheduler-job | CronJob | Node.js |
| 8 | **Team & Workspace Management** | team-service | Deployment, Service, initContainer migrations | Node.js |

**Recommended implementation order:** 1 → 7 → 2 → 4 → 3 → 6 → 5 → 8

This order starts with the simplest additions (single new pod) and progressively introduces more complex K8s resources (StatefulSets, CronJobs, sticky services, multi-language containers).

---

## Target Architecture (After All Modules)

```
                                          ┌──────────────────────────┐
                                     HTTP │  task-manager (Next.js)  │
                        ┌──────────────►  │  Port 3000               │
                        │                 └──────────┬───────────────┘
                        │                            │
                        │               ┌────────────┼────────────┐
                        │               │            │            │
                        │               ▼            ▼            ▼
                        │     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
                        │     │  analytics   │ │ realtime │ │  team-svc    │
                        │     │  (FastAPI)   │ │ (Socket) │ │  (Node.js)   │
                        │     │  Port 8000   │ │ Port 3001│ │  Port 3002   │
                        │     └──────┬───────┘ └────┬─────┘ └──────┬───────┘
                        │            │              │              │
  Browser ──► NGINX ────┤            │              │              │
              Ingress   │            │              │              │
                        │            │              │              │
                        │     ┌──────┴───────┐      │              │
                        │     │  webhook-svc │      │              │
                        │     │  (Node.js)   │      │              │
                        │     │  Port 3003   │      │              │
                        │     └──────────────┘      │              │
                        │                           │              │
                        │     ┌──────────────────────────────────┐ │
                        │     │  notification-svc (Node.js)      │ │
                        │     │  Port 3004                       │◄┘
                        │     └──────────────────────────────────┘
                        │
                        │     ┌──────────────────┐    ┌───────────────────┐
                        └────►│  file-service    │───►│   MinIO (S3)      │
                              │  (Node.js)       │    │   StatefulSet     │
                              │  Port 3005       │    │   Port 9000/9001  │
                              └──────────────────┘    └───────────────────┘

                              ┌──────────────────┐    ┌───────────────────┐
                              │ search-sync-svc  │───►│  Meilisearch      │
                              │  (Node.js)       │    │  StatefulSet      │
                              │  Port 3006       │    │  Port 7700        │
                              └──────────────────┘    └───────────────────┘

                              ┌──────────────────┐
                              │ CronJob          │
                              │ scheduler-job    │
                              │ (runs every 1m)  │
                              └──────────────────┘

                                    All services
                                        │
                                        ▼
                               PostgreSQL (Supabase)
```

---

## Module 1: Notification Service

### What It Does
Sends email and in-app notifications when:
- A task is approaching its due date (24h, 1h before)
- A task is assigned to a user
- A task is completed

### Why a Separate Microservice
The main Next.js app should stay focused on serving web pages and API requests. Email sending involves SMTP timeouts, retry logic, and template rendering — all of which can block request handlers if done inline. A dedicated service decouples this and can be scaled independently.

### New K8s Resources
| Resource | Type | Purpose |
|----------|------|---------|
| `notification-deployment` | Deployment | Runs the notification service pod |
| `notification-service` | Service (ClusterIP) | Internal — main app calls it via HTTP |
| `notification-secret` | Secret | SMTP credentials, API key |

### Architecture
```
task-manager ──HTTP POST /notify──► notification-service ──SMTP──► Email Server
                                         │
                                         └──► PostgreSQL (reads tasks with due dates)
```

### Implementation Outline

**1. New directory:** `services/notification/`

**2. Node.js service** (`services/notification/src/index.ts`):
```typescript
import Fastify from "fastify";
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

// SMTP transporter from environment
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// POST /notify/due-soon — called by main app or cron
app.post("/notify/due-soon", async () => {
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
  const tasks = await prisma.task.findMany({
    where: { dueDate: { lte: soon, gte: new Date() }, status: { not: "COMPLETED" } },
    include: { user: true },
  });

  for (const task of tasks) {
    if (task.user.email) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: task.user.email,
        subject: `Task due soon: ${task.title}`,
        text: `Your task "${task.title}" is due on ${task.dueDate}`,
      });
    }
  }
  return { notified: tasks.length };
});

app.post("/notify/task-completed", async (req) => {
  const { taskId, title, userEmail } = req.body as any;
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: userEmail,
    subject: `Task completed: ${title}`,
    text: `Task "${title}" has been marked as completed.`,
  });
  return { sent: true };
});

app.listen({ port: 3004, host: "0.0.0.0" });
```

**3. Dockerfile** (`services/notification/Dockerfile`):
```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "dist/index.js"]
```

**4. Helm templates:**
- `templates/notification-deployment.yaml` — Deployment with env from `notification-secret`
- `templates/notification-service.yaml` — ClusterIP Service on port 3004
- `templates/notification-secret.yaml` — SMTP credentials

**5. Prisma schema addition** (optional, for in-app notifications):
```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String   // "due_soon", "task_completed", "task_assigned"
  message   String
  read      Boolean  @default(false)
  taskId    String?
  createdAt DateTime @default(now())
}
```

### K8s Concepts You'll Learn
- **Internal Service communication** — Services that are never exposed externally (no Ingress)
- **Secret management** — SMTP credentials injected as environment variables
- **Health checks for background services** — `/health` endpoint for liveness/readiness probes
- **Independent scaling** — Scale notification pods separately from the web app

### Estimated Complexity: Low
One new container, straightforward HTTP service, no stateful resources.

---

## Module 2: File Attachments + MinIO (Object Storage)

### What It Does
Allows users to attach files (images, PDFs, documents) to tasks. Files are stored in MinIO (S3-compatible object storage) running inside the Kubernetes cluster.

### Why a Separate Microservice
File handling (upload validation, virus scanning potential, image resizing, streaming downloads) is I/O-intensive and benefits from isolation. MinIO as in-cluster storage gives you hands-on experience with StatefulSets and persistent volumes — core K8s concepts.

### New K8s Resources
| Resource | Type | Purpose |
|----------|------|---------|
| `minio-statefulset` | StatefulSet | MinIO server with persistent storage |
| `minio-pvc` | PersistentVolumeClaim | 10Gi persistent disk for files |
| `minio-service` | Headless Service | Stable network identity for StatefulSet |
| `minio-console-service` | Service (NodePort) | MinIO web console (optional) |
| `file-deployment` | Deployment | File upload/download service |
| `file-service` | Service (ClusterIP) | Internal API for the main app |
| `file-secret` | Secret | MinIO access/secret keys |

### Architecture
```
Browser ──► NGINX ──► task-manager ──► file-service ──► MinIO (StatefulSet)
                              │              │               │
                              │              │          ┌────┴────┐
                              │              │          │  PVC    │
                              │              │          │ (10Gi)  │
                              └──────────────┘          └─────────┘
                                 PostgreSQL
                              (file metadata)
```

### Implementation Outline

**1. MinIO in Kubernetes** (`templates/minio-statefulset.yaml`):
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: minio
spec:
  serviceName: minio-headless
  replicas: 1
  selector:
    matchLabels:
      app: minio
  template:
    metadata:
      labels:
        app: minio
    spec:
      containers:
        - name: minio
          image: minio/minio:latest
          args: ["server", "/data", "--console-address", ":9001"]
          env:
            - name: MINIO_ROOT_USER
              valueFrom:
                secretKeyRef:
                  name: minio-secret
                  key: accessKey
            - name: MINIO_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: minio-secret
                  key: secretKey
          ports:
            - containerPort: 9000  # S3 API
              name: api
            - containerPort: 9001  # Web console
              name: console
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

**2. File service** (`services/file-service/src/index.ts`):
```typescript
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT, // http://minio:9000
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
});

const prisma = new PrismaClient();
const app = Fastify();
app.register(multipart);

// POST /upload — multipart file upload
app.post("/upload", async (req, reply) => {
  const data = await req.file();
  const buffer = await data.toBuffer();
  const key = `${req.headers["x-task-id"]}/${data.filename}`;

  await s3.send(new PutObjectCommand({
    Bucket: "task-attachments",
    Key: key,
    Body: buffer,
    ContentType: data.mimetype,
  }));

  const attachment = await prisma.attachment.create({
    data: {
      taskId: req.headers["x-task-id"] as string,
      filename: data.filename,
      mimeType: data.mimetype,
      size: buffer.length,
      storageKey: key,
    },
  });

  return attachment;
});

// GET /download/:id — stream file back
app.get("/download/:id", async (req, reply) => {
  const { id } = req.params as any;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return reply.code(404).send({ error: "Not found" });

  const response = await s3.send(new GetObjectCommand({
    Bucket: "task-attachments",
    Key: attachment.storageKey,
  }));

  reply.header("Content-Type", attachment.mimeType);
  reply.header("Content-Disposition", `attachment; filename="${attachment.filename}"`);
  return reply.send(response.body);
});

app.listen({ port: 3005, host: "0.0.0.0" });
```

**3. Prisma schema addition:**
```prisma
model Attachment {
  id         String   @id @default(cuid())
  taskId     String
  task       Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  filename   String
  mimeType   String
  size       Int
  storageKey String
  createdAt  DateTime @default(now())

  @@index([taskId])
}
```

**4. Dockerfile** for file-service (same pattern as notification service).

### K8s Concepts You'll Learn
- **StatefulSet** — Stable pod identity + persistent storage (unlike Deployments, pods get sticky names: `minio-0`)
- **PersistentVolumeClaim (PVC)** — Requesting disk storage from the cluster; survives pod restarts
- **volumeClaimTemplates** — StatefulSet-specific: each replica gets its own PVC
- **Headless Service** — A Service with `clusterIP: None`, gives direct DNS to individual pods (`minio-0.minio-headless`)
- **S3-compatible API** — MinIO speaks the same protocol as AWS S3; the SDK works identically
- **Streaming responses** — Pipes large files without loading them entirely into memory

### Estimated Complexity: Medium
Two new containers (MinIO prebuilt, file-service custom), stateful storage, PVC management, multipart upload handling.

---

## Module 3: Analytics & Reporting Service (Python)

### What It Does
Provides productivity analytics:
- Tasks completed per day/week/month
- Average time to completion
- Productivity score by priority level
- Weekly PDF summary report emailed to users

### Why a Separate Microservice
Analytics queries are heavy (aggregations, joins, scans) and can slow down the main app's database connections. Using a different language (Python) demonstrates polyglot microservices — a common real-world pattern where different services use the best tool for the job. Python's data ecosystem (pandas, matplotlib) makes report generation natural.

### New K8s Resources
| Resource | Type | Purpose |
|----------|------|---------|
| `analytics-deployment` | Deployment | FastAPI analytics service |
| `analytics-service` | Service (ClusterIP) | API endpoints for the frontend |
| `analytics-cronjob` | CronJob | Weekly report generation job |
| `analytics-configmap` | ConfigMap | Report templates, schedule config |

### Architecture
```
task-manager ──HTTP GET /stats──► analytics-service (FastAPI)
  (frontend)                          │
                                      ├──► PostgreSQL (read queries)
                                      │
                              CronJob (weekly)
                                      │
                                      ├──► Generate PDF (matplotlib)
                                      └──► Send via notification-service
```

### Implementation Outline

**1. New directory:** `services/analytics/` (Python project)

**2. FastAPI service** (`services/analytics/main.py`):
```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncpg
import os

app = FastAPI(title="Task Analytics")

DB_URL = os.environ.get("DATABASE_URL")

@app.on_event("startup")
async def startup():
    app.state.pool = await asyncpg.create_pool(DB_URL, min_size=2, max_size=10)

@app.get("/stats/summary/{user_id}")
async def get_summary(user_id: str):
    async with app.state.pool.acquire() as conn:
        # Tasks by status
        status_counts = await conn.fetch(
            """SELECT status, COUNT(*) as count
               FROM "Task" WHERE "userId" = $1 GROUP BY status""",
            user_id
        )

        # Completion rate
        total = await conn.fetchval(
            'SELECT COUNT(*) FROM "Task" WHERE "userId" = $1', user_id
        )
        completed = await conn.fetchval(
            'SELECT COUNT(*) FROM "Task" WHERE "userId" = $1 AND status = $2',
            user_id, "COMPLETED"
        )

        # Avg tasks per day (last 30 days)
        daily = await conn.fetch(
            """SELECT DATE("createdAt") as day, COUNT(*) as count
               FROM "Task" WHERE "userId" = $1
               AND "createdAt" > NOW() - INTERVAL '30 days'
               GROUP BY day ORDER BY day""",
            user_id
        )

    return {
        "statusCounts": {row["status"]: row["count"] for row in status_counts},
        "completionRate": (completed / total * 100) if total > 0 else 0,
        "dailyHistory": [{"date": str(row["day"]), "count": row["count"]} for row in daily],
    }

@app.get("/stats/productivity/{user_id}")
async def get_productivity(user_id: str):
    async with app.state.pool.acquire() as conn:
        by_priority = await conn.fetch(
            """SELECT priority,
                      COUNT(*) as total,
                      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed
               FROM "Task" WHERE "userId" = $1
               GROUP BY priority""",
            user_id
        )
    return {
        "byPriority": [
            {
                "priority": row["priority"],
                "total": row["total"],
                "completed": row["completed"],
                "rate": (row["completed"] / row["total"] * 100) if row["total"] > 0 else 0
            }
            for row in by_priority
        ]
    }

@app.get("/health")
async def health():
    return {"status": "ok"}
```

**3. Dockerfile** (`services/analytics/Dockerfile`):
```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**4. Weekly report CronJob** (`templates/analytics-cronjob.yaml`):
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: weekly-report
spec:
  schedule: "0 9 * * 1"   # Every Monday at 9:00 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: report-generator
              image: ralf090102/analytics-service:latest
              command: ["python", "-m", "scripts.weekly_report"]
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: task-manager-secret
                      key: databaseUrl
                - name: NOTIFICATION_URL
                  value: "http://notification-service:3004"
          restartPolicy: OnFailure
```

**5. Python report generator** (`services/analytics/scripts/weekly_report.py`):
```python
import asyncio
import asyncpg
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import os
import io
import httpx

async def generate_and_send():
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])

    # Get all users
    users = await conn.fetch('SELECT id, email, name FROM "User" WHERE email IS NOT NULL')

    for user in users:
        # Generate productivity chart
        tasks = await conn.fetch(
            """SELECT DATE("createdAt") as day, COUNT(*) as count
               FROM "Task" WHERE "userId" = $1
               AND "createdAt" > NOW() - INTERVAL '7 days'
               GROUP BY day ORDER BY day""",
            user["id"]
        )

        if not tasks:
            continue

        days = [str(t["day"]) for t in tasks]
        counts = [t["count"] for t in tasks]

        fig, ax = plt.subplots(figsize=(10, 5))
        ax.bar(days, counts, color="#3b82f6")
        ax.set_title(f"Weekly Task Creation — {user['name']}")
        ax.set_ylabel("Tasks Created")
        fig.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150)
        plt.close(fig)

        # Send to notification service (which emails it)
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{os.environ['NOTIFICATION_URL']}/notify/weekly-report",
                json={
                    "userEmail": user["email"],
                    "userName": user["name"],
                    "totalTasks": sum(counts),
                }
            )

    await conn.close()

asyncio.run(generate_and_send())
```

### K8s Concepts You'll Learn
- **Polyglot microservices** — Different containers running different languages (Node.js + Python)
- **CronJob** — K8s workload that runs on a schedule (cron syntax), creates a Job per run
- **ConfigMap** — Non-sensitive configuration data (report schedules, template paths)
- **Connection pooling** — Each service manages its own DB pool independently
- **Job lifecycle** — `successfulJobsHistoryLimit`, `failedJobsHistoryLimit`, `concurrencyPolicy`

### Estimated Complexity: Medium
New language (Python), new container, CronJob scheduling, matplotlib chart generation, cross-service HTTP calls.

---

## Module 4: Real-time WebSocket Gateway

### What It Does
Adds real-time features to the task manager:
- Live task board — tasks update instantly when another user changes them
- Presence indicators — see who's currently viewing the board
- Live notifications push — new tasks appear without page refresh

### Why a Separate Microservice
WebSockets are long-lived connections that hold resources differently than HTTP request/response cycles. Mixing them into the Next.js server can cause scaling issues (each connection holds memory). A dedicated Socket.io service handles WebSocket connections efficiently and can be scaled horizontally with a Redis adapter.

### New K8s Resources
| Resource | Type | Purpose |
|----------|------|---------|
| `realtime-deployment` | Deployment | Socket.io server |
| `realtime-service` | Service (ClusterIP, sticky) | WebSocket traffic with session affinity |
| `realtime-configmap` | ConfigMap | CORS origins, Redis adapter config |

### Architecture
```
Browser ◄──── WebSocket ────► NGINX ──► realtime-service (Socket.io)
    │                                       │
    │                                       ├──► Redis (pub/sub adapter for scaling)
    │                                       │       (Module B from Project-Expansion.md)
    │                                       │
    └── HTTP (page loads, API) ──► task-manager ──► PostgreSQL
```

### Implementation Outline

**1. Socket.io service** (`services/realtime/src/index.ts`):
```typescript
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || "*", methods: ["GET", "POST"] },
});

// Redis adapter for multi-pod scaling
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));

// Auth middleware — verify JWT from NextAuth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  // Verify JWT...
  if (!token) return next(new Error("Unauthorized"));
  (socket as any).userId = verifyJwt(token);
  next();
});

io.on("connection", (socket) => {
  const userId = (socket as any).userId;

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Join task board room
  socket.on("board:join", () => socket.join("board"));

  // Broadcast task changes to board room
  socket.on("task:updated", (data) => {
    socket.to("board").emit("task:updated", data);
  });

  socket.on("task:created", (data) => {
    socket.to("board").emit("task:created", data);
  });

  // Presence
  socket.on("presence:ping", () => {
    socket.to("board").emit("presence:online", { userId });
  });

  socket.on("disconnect", () => {
    socket.to("board").emit("presence:offline", { userId });
  });
});

httpServer.listen(3001);
```

**2. Main app integration** — Next.js API routes emit events to the realtime service after task mutations:
```typescript
// After task create/update/delete in route handlers:
await fetch("http://realtime-service:3001/emit", {
  method: "POST",
  body: JSON.stringify({ event: "task:created", room: "board", data: task }),
});
```

**3. Frontend client** (`src/lib/socket.ts`):
```typescript
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_WS_URL || "/ws", {
      auth: { token },
    });
  }
  return socket;
}
```

**4. Helm Service with session affinity:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: realtime-service
spec:
  type: ClusterIP
  sessionAffinity: ClientIP          # Sticky sessions for WebSocket
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800           # 3 hours
  ports:
    - port: 3001
      targetPort: 3001
  selector:
    app: realtime-service
```

### K8s Concepts You'll Learn
- **Session affinity (sticky sessions)** — Route the same client to the same pod (WebSocket connections must persist on one pod)
- **Long-lived connections** — Different scaling characteristics than HTTP (connection count matters, not request rate)
- **WebSocket through Ingress** — NGINX Ingress annotation for WebSocket upgrade (`nginx.ingress.kubernetes.io/websocket-services`)
- **Redis pub/sub adapter** — Multiple Socket.io pods share state via Redis (connects to Module B from Expansion doc)
- **Cross-service event emission** — One service notifying another via internal HTTP

### Estimated Complexity: Medium-High
WebSocket lifecycle, JWT auth on socket connections, frontend integration, Ingress WebSocket config, Redis adapter dependency.

---

## Module 5: Full-Text Search with Meilisearch

### What It Does
Adds instant search across all tasks:
- Search by title, description
- Filter by status, priority, date range
- Typo-tolerant fuzzy matching
- Search results in under 50ms even with thousands of tasks

### Why a Separate Microservice
PostgreSQL full-text search works but isn't optimized for typo tolerance, relevance ranking, or instant-as-you-type results. Meilisearch is a dedicated search engine (written in Rust, very fast) that indexes your data and provides a search API. Running it as a StatefulSet in K8s gives you persistent indexed data.

### New K8s Resources
| Resource | Type | Purpose |
|----------|------|---------|
| `meilisearch-statefulset` | StatefulSet | Search engine with persistent index |
| `meilisearch-pvc` | PersistentVolumeClaim | 5Gi for index data |
| `meilisearch-service` | Headless Service | Stable DNS for StatefulSet |
| `search-sync-deployment` | Deployment | Syncs DB changes to search index |
| `search-sync-service` | Service (ClusterIP) | Internal API |

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│  Initial Sync (initContainer)                                │
│  PostgreSQL ──► search-sync-service ──► Meilisearch index    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Continuous Sync (event-driven)                              │
│  task-manager ──POST /sync──► search-sync-service ──► Meili  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Search Query                                                │
│  Browser ──► task-manager ──► Meilisearch ──► results        │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Outline

**1. Meilisearch StatefulSet** (`templates/meilisearch-statefulset.yaml`):
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: meilisearch
spec:
  serviceName: meilisearch-headless
  replicas: 1
  selector:
    matchLabels:
      app: meilisearch
  template:
    metadata:
      labels:
        app: meilisearch
    spec:
      containers:
        - name: meilisearch
          image: getmeili/meilisearch:v1.6
          env:
            - name: MEILI_MASTER_KEY
              valueFrom:
                secretKeyRef:
                  name: search-secret
                  key: masterKey
            - name: MEILI_ENV
              value: production
          ports:
            - containerPort: 7700
          volumeMounts:
            - name: data
              mountPath: /meili_data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
```

**2. Search sync service** (`services/search-sync/src/index.ts`):
```typescript
import Fastify from "fastify";
import { MeiliSearch } from "meilisearch";
import { PrismaClient } from "@prisma/client";

const meili = new MeiliSearch({
  host: process.env.MEILI_URL || "http://meilisearch:7700",
  apiKey: process.env.MEILI_MASTER_KEY,
});

const prisma = new PrismaClient();
const app = Fastify();

const index = meili.index("tasks");

// Configure searchable attributes on startup
await index.updateSearchableAttributes(["title", "description"]);
await index.updateFilterableAttributes(["status", "priority", "userId"]);

// POST /sync/task — index a single task (called after create/update)
app.post("/sync/task", async (req) => {
  const task = req.body;
  await index.addDocuments([{
    id: task.id,
    title: task.title,
    description: task.description || "",
    status: task.status,
    priority: task.priority,
    userId: task.userId,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
  }]);
  return { indexed: true };
});

// DELETE /sync/task/:id — remove from index (called after delete)
app.delete("/sync/task/:id", async (req) => {
  const { id } = req.params as any;
  await index.deleteDocument(id);
  return { deleted: true };
});

// POST /sync/all — full reindex (called by initContainer or manually)
app.post("/sync/all", async () => {
  const tasks = await prisma.task.findMany();
  await index.addDocuments(tasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description || "",
    status: t.status,
    priority: t.priority,
    userId: t.userId,
  })));
  return { reindexed: tasks.length };
});

app.listen({ port: 3006, host: "0.0.0.0" });
```

**3. Main app search endpoint** (`src/app/api/tasks/search/route.ts`):
```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MeiliSearch } from "meilisearch";

const meili = new MeiliSearch({
  host: process.env.MEILI_URL!,
  apiKey: process.env.MEILI_MASTER_KEY!,
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");

  const results = await meili.index("tasks").search(q, {
    filter: [
      `userId = ${session.user.id}`,
      ...(status ? [`status = ${status}`] : []),
      ...(priority ? [`priority = ${priority}`] : []),
    ],
    limit: 50,
  });

  return NextResponse.json(results);
}
```

### K8s Concepts You'll Learn
- **StatefulSet with prebuilt image** — Using a third-party Docker image (Meilisearch) as a stateful workload
- **Data synchronization patterns** — Initial bulk sync (initContainer) + incremental sync (event-driven)
- **initContainer** — A container that runs before the main container starts (useful for initial reindexing)
- **Search-aside pattern** — Database is source of truth, search index is a derived projection
- **Persistent index** — Index survives pod restarts via PVC (rebuilding from scratch is expensive)

### Estimated Complexity: Medium
Two new containers, data sync logic, search API integration, Meilisearch configuration.

---

## Module 6: Webhook Delivery Service

### What It Does
Allows users to register webhook URLs that receive HTTP POST callbacks when tasks are created, updated, or deleted. Features:
- User-configurable webhook endpoints
- Retry with exponential backoff (1s, 5s, 30s, 2m, 10m)
- Delivery history log with response status codes
- Dead letter queue for permanently failed deliveries
- HMAC signature for payload verification

### Why a Separate Microservice
Webhook delivery involves calling external services that may be slow, unavailable, or return errors. This requires retry logic, timeout handling, and delivery tracking — all of which belong in a dedicated background processor, not in the request path of the main app.

### New K8s Resources
| Resource | Type | Purpose |
|----------|------|---------|
| `webhook-deployment` | Deployment | Webhook processing service |
| `webhook-service` | Service (ClusterIP) | Internal API for event registration |
| `webhook-configmap` | ConfigMap | Retry policy, timeouts, max attempts |

### Architecture
```
task-manager                         webhook-service
  POST /api/tasks (create)             ┌──────────────────────────┐
        │                              │ 1. Receive event          │
        ├─POST /webhooks/trigger───►  │ 2. Look up webhooks       │
        │                              │ 3. Queue deliveries       │
        │                              │ 4. HTTP POST to endpoints │
        │                              │ 5. Retry on failure       │
        │                              │    (exponential backoff)  │
        │                              │ 6. Log delivery result    │
        │                              │ 7. Dead letter on 5x fail │
        │                              └──────────────────────────┘
        │                                           │
        └──► PostgreSQL                               ├─► External URL 1
             (webhooks + delivery log)               ├─► External URL 2
                                                    └─► External URL 3
```

### Implementation Outline

**1. Prisma schema additions:**
```prisma
model Webhook {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  url         String
  events      String[] // ["task.created", "task.updated", "task.deleted"]
  secret      String   // HMAC signing secret
  active      Boolean  @default(true)
  deliveries  WebhookDelivery[]
  createdAt   DateTime @default(now())
}

model WebhookDelivery {
  id          String   @id @default(cuid())
  webhookId   String
  webhook     Webhook  @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  event       String
  payload     Json
  statusCode  Int?     // HTTP response code (null = not yet attempted)
  response    String?  // Response body (truncated)
  attempts    Int      @default(0)
  maxAttempts Int      @default(5)
  nextRetryAt DateTime?
  deliveredAt DateTime?
  status      String   @default("pending") // pending, delivered, failed
  createdAt   DateTime @default(now())

  @@index([webhookId])
  @@index([status])
  @@index([nextRetryAt])
}
```

**2. Webhook service** (`services/webhook/src/index.ts`):
```typescript
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const app = Fastify();

// POST /trigger — called by main app after task mutations
app.post("/trigger", async (req) => {
  const { event, task, userId } = req.body as any;

  // Find active webhooks for this user that listen to this event
  const webhooks = await prisma.webhook.findMany({
    where: { userId, active: true, events: { has: event } },
  });

  // Create delivery records
  for (const webhook of webhooks) {
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: task,
        status: "pending",
        nextRetryAt: new Date(),
      },
    });
  }

  return { queued: webhooks.length };
});

// Background worker — processes pending deliveries
async function processDeliveries() {
  while (true) {
    const pending = await prisma.webhookDelivery.findMany({
      where: {
        status: "pending",
        nextRetryAt: { lte: new Date() },
      },
      include: { webhook: true },
      take: 10,
    });

    for (const delivery of pending) {
      const body = JSON.stringify({
        event: delivery.event,
        timestamp: new Date().toISOString(),
        data: delivery.payload,
      });

      // HMAC signature for verification
      const signature = crypto
        .createHmac("sha256", delivery.webhook.secret)
        .update(body)
        .digest("hex");

      try {
        const response = await fetch(delivery.webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Event": delivery.event,
            "X-Webhook-Signature": `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (response.ok) {
          await prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              statusCode: response.status,
              status: "delivered",
              deliveredAt: new Date(),
              attempts: { increment: 1 },
            },
          });
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        const attempts = delivery.attempts + 1;
        const maxedOut = attempts >= delivery.maxAttempts;

        // Exponential backoff: 1s, 5s, 30s, 2m, 10m
        const backoff = [1000, 5000, 30000, 120000, 600000][attempts - 1] || 600000;

        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            statusCode: null,
            attempts,
            status: maxedOut ? "failed" : "pending",
            nextRetryAt: maxedOut ? null : new Date(Date.now() + backoff),
          },
        });
      }
    }

    await new Promise((r) => setTimeout(r, 2000)); // Poll every 2s
  }
}

processDeliveries(); // Start background worker
app.listen({ port: 3003, host: "0.0.0.0" });
```

**3. Main app integration** — Called after task mutations:
```typescript
// After creating/updating/deleting a task:
await fetch("http://webhook-service:3003/trigger", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "task.created", // or task.updated, task.deleted
    task,
    userId: session.user.id,
  }),
});
```

### K8s Concepts You'll Learn
- **Background worker pattern** — A pod that runs an infinite processing loop (not an HTTP server only)
- **ConfigMap for policy** — Retry intervals, max attempts, timeouts configurable without rebuilding the image
- **Graceful shutdown** — Handling SIGTERM to finish in-flight deliveries before the pod terminates
- **Observability** — Delivery success rate metrics, retry count histograms (extends prom-client)
- **Dead letter handling** — Persistent storage of failed deliveries for manual inspection/replay

### Estimated Complexity: Medium
Background processing loop, retry logic, HMAC signing, delivery tracking, external HTTP calls with timeout.

---

## Module 7: Recurring Task Scheduler (K8s CronJob)

### What It Does
Allows users to define recurring task templates that automatically create tasks on a schedule:
- "Create a 'Weekly Review' task every Monday at 9:00 AM"
- "Create a 'Daily Standup' task every weekday at 8:30 AM"
- "Create a 'Monthly Report' task on the 1st of every month"

### Why a K8s CronJob
This is the textbook use case for K8s CronJob — a workload that runs on a schedule, does its work, and exits. No need for a long-running pod. The CronJob wakes up, checks which recurring templates are due, creates tasks, and goes back to sleep.

### New K8s Resources
| Resource | Type | Purpose |
|----------|------|---------|
| `scheduler-cronjob` | CronJob | Runs every minute, checks for due tasks |

### Architecture
```
┌──────────────────────────────────────────────────────────┐
│  K8s CronJob: scheduler                                  │
│  Schedule: * * * * * (every minute)                      │
│                                                          │
│  Each run:                                               │
│    1. Query RecurringTask where nextRun <= now           │
│    2. For each due template:                             │
│       a. Create Task from template                       │
│       b. Update nextRun based on cron expression         │
│       c. Log creation                                    │
│    3. Exit                                               │
└──────────────────────────────────────────────────────────┘
         │
         └──► PostgreSQL (read templates, create tasks)
```

### Implementation Outline

**1. Prisma schema addition:**
```prisma
model RecurringTask {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  description String?
  priority    TaskPriority @default(MEDIUM)
  cron        String   // "0 9 * * 1" = every Monday 9 AM
  nextRun     DateTime
  lastRun     DateTime?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
  @@index([active, nextRun])
}
```

**2. Scheduler script** (`services/scheduler/src/index.ts`):
```typescript
import { PrismaClient } from "@prisma/client";
import cronParser from "cron-parser";

const prisma = new PrismaClient();

async function run() {
  const now = new Date();

  // Find all active recurring tasks that are due
  const due = await prisma.recurringTask.findMany({
    where: { active: true, nextRun: { lte: now } },
  });

  console.log(`[scheduler] Found ${due.length} due recurring tasks`);

  for (const template of due) {
    // Create the actual task
    await prisma.task.create({
      data: {
        title: template.title,
        description: template.description,
        priority: template.priority,
        status: "TODO",
        userId: template.userId,
      },
    });

    // Calculate next run time from cron expression
    const interval = cronParser.parseExpression(template.cron, { currentDate: now });
    const nextRun = interval.next().toDate();

    await prisma.recurringTask.update({
      where: { id: template.id },
      data: { lastRun: now, nextRun },
    });

    console.log(`[scheduler] Created task "${template.title}" for user ${template.userId}, next run: ${nextRun}`);
  }

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("[scheduler] Fatal error:", err);
  process.exit(1);
});
```

**3. Dockerfile** (`services/scheduler/Dockerfile`):
```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

**4. Helm CronJob template** (`templates/scheduler-cronjob.yaml`):
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: task-scheduler
spec:
  schedule: "* * * * *"           # Every minute
  concurrencyPolicy: Forbid       # Don't overlap runs
  successfulJobsHistoryLimit: 3   # Keep last 3 successful runs
  failedJobsHistoryLimit: 5       # Keep last 5 failures for debugging
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: scheduler
              image: ralf090102/scheduler-service:latest
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: task-manager-secret
                      key: databaseUrl
          restartPolicy: OnFailure
```

**5. API endpoints** (added to main app, `src/app/api/recurring/route.ts`):
- `GET /api/recurring` — List user's recurring task templates
- `POST /api/recurring` — Create a new recurring task template
- `PUT /api/recurring/[id]` — Update template (pause, change schedule)
- `DELETE /api/recurring/[id]` — Delete template

### K8s Concepts You'll Learn
- **CronJob workload** — The fourth K8s workload type (after Deployment, StatefulSet, DaemonSet)
- **concurrencyPolicy** — `Forbid` (skip if previous still running), `Allow` (overlap), `Replace` (kill previous, start new)
- **Job history limits** — Controlling how many completed/failed Jobs remain in the cluster
- **restartPolicy: OnFailure** — Jobs use different restart policies than Deployments
- **Exit codes** — The script runs, does its work, and exits cleanly (exit 0) or fails (exit 1)
- **Cron syntax in K8s** — Same as standard cron but with an optional 6th field for seconds

### Estimated Complexity: Low
Small script, one Dockerfile, one Helm template. The simplicity is the point — it's a clean introduction to CronJobs.

---

## Module 8: Team & Workspace Management

### What It Does
Transforms the single-user task manager into a multi-user collaboration platform:
- **Teams** — Groups of users who share task boards
- **Boards** — Collections of tasks visible to all team members
- **Roles** — Admin (manage team, boards, members), Member (create/edit tasks), Viewer (read-only)
- **Task assignment** — Assign tasks to specific team members
- **Activity feed** — Who did what and when

### Why This Is the Biggest Module
This changes the core data model. Tasks go from belonging to a user to optionally belonging to a team board. Authentication needs role-based access control. This is the module where the app goes from "personal todo list" to "team collaboration tool" — and justifies the microservice split for team management.

### New K8s Resources
| Resource | Type | Purpose |
|----------|------|---------|
| `team-deployment` | Deployment | Team/workspace management service |
| `team-service` | Service (ClusterIP) | Internal API for team operations |
| `db-migration-job` | Job | Runs Prisma migrations on deploy (initContainer or Helm hook) |

### Architecture
```
                         ┌────────────────────────────────────────────┐
                         │              task-manager (Next.js)         │
                         │                                            │
Browser ──► NGINX ─────►│  /dashboard/*     ► Frontend pages          │
              Ingress    │  /api/tasks/*     ► Task CRUD (existing)   │
                         │  /api/auth/*      ► Auth (existing)        │
                         │  /api/teams/*     ► Proxy to team-service  │
                         └──────┬──────────────────┬──────────────────┘
                                │                  │
                                ▼                  ▼
                    ┌──────────────────┐  ┌──────────────────┐
                    │  PostgreSQL      │  │  team-service    │
                    │  (shared DB)     │  │  (Node.js)       │
                    │                  │  │  Port 3002       │
                    │  - User          │  │                  │
                    │  - Task          │  │  /teams CRUD     │
                    │  - Team (NEW)    │  │  /boards CRUD    │
                    │  - Board (NEW)   │  │  /members CRUD   │
                    │  - Member (NEW)  │  │  /activity feed  │
                    │  - Activity(NEW) │  │                  │
                    └──────────────────┘  └──────────────────┘
```

### Implementation Outline

**1. Prisma schema additions:**
```prisma
model Team {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  owner_id  String
  owner     User     @relation("TeamOwner", fields: [ownerId], references: [id])
  members   Member[]
  boards    Board[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerId])
}

enum MemberRole {
  ADMIN
  MEMBER
  VIEWER
}

model Member {
  id       String     @id @default(cuid())
  teamId   String
  team     Team       @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId   String
  user     User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  role     MemberRole @default(MEMBER)
  joinedAt DateTime   @default(now())

  @@unique([teamId, userId])
  @@index([userId])
}

model Board {
  id        String   @id @default(cuid())
  teamId    String
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  name      String
  color     String   @default("#3b82f6")
  tasks     Task[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([teamId])
}

enum ActivityType {
  TASK_CREATED
  TASK_UPDATED
  TASK_COMPLETED
  TASK_DELETED
  TASK_ASSIGNED
  MEMBER_JOINED
  MEMBER_LEFT
  BOARD_CREATED
}

model Activity {
  id        String       @id @default(cuid())
  teamId    String
  team      Team         @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId    String
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      ActivityType
  taskId    String?
  metadata  Json?
  createdAt DateTime     @default(now())

  @@index([teamId, createdAt])
}
```

**2. Update Task model** (add optional board assignment):
```prisma
model Task {
  // ... existing fields ...
  boardId   String?    // null = personal task, set = team board task
  board     Board?     @relation(fields: [boardId], references: [id], onDelete: SetNull)
  assigneeId String?   // null = unassigned
  assignee  User?      @relation("TaskAssignee", fields: [assigneeId], references: [id])

  @@index([boardId])
  @@index([assigneeId])
}
```

**3. Team service** (`services/team-service/src/index.ts`):
```typescript
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

// Auth middleware — verify JWT and extract userId
app.addHook("onRequest", async (req, reply) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return reply.code(401).send({ error: "No token" });
  try {
    (req as any).userId = verifyJwt(token);
  } catch {
    return reply.code(401).send({ error: "Invalid token" });
  }
});

// POST /teams — create a team
app.post("/teams", async (req) => {
  const userId = (req as any).userId;
  const { name } = req.body as any;
  const slug = name.toLowerCase().replace(/\s+/g, "-");

  const team = await prisma.team.create({
    data: {
      name,
      slug,
      ownerId: userId,
      members: { create: { userId, role: "ADMIN" } },
    },
    include: { members: true },
  });
  return team;
});

// GET /teams — list user's teams
app.get("/teams", async (req) => {
  const userId = (req as any).userId;
  return prisma.team.findMany({
    where: { members: { some: { userId } } },
    include: { _count: { select: { members: true, boards: true } } },
  });
});

// POST /teams/:id/invite — invite a user (by email)
app.post("/teams/:id/invite", async (req, reply) => {
  const userId = (req as any).userId;
  const { id } = req.params as any;
  const { email, role } = req.body as any;

  // Verify requester is admin
  const membership = await prisma.member.findUnique({
    where: { teamId_userId: { teamId: id, userId } },
  });
  if (!membership || membership.role !== "ADMIN") {
    return reply.code(403).send({ error: "Only admins can invite" });
  }

  const invitee = await prisma.user.findUnique({ where: { email } });
  if (!invitee) return reply.code(404).send({ error: "User not found" });

  return prisma.member.create({
    data: { teamId: id, userId: invitee.id, role: role || "MEMBER" },
  });
});

// POST /teams/:id/boards — create a board
app.post("/teams/:id/boards", async (req) => {
  const userId = (req as any).userId;
  const { id } = req.params as any;
  const { name, color } = req.body as any;

  // Verify membership
  const member = await prisma.member.findUnique({
    where: { teamId_userId: { teamId: id, userId } },
  });
  if (!member) throw new Error("Not a member");

  return prisma.board.create({ data: { teamId: id, name, color } });
});

// GET /teams/:id/activity — activity feed
app.get("/teams/:id/activity", async (req) => {
  const { id } = req.params as any;
  return prisma.activity.findMany({
    where: { teamId: id },
    include: { user: { select: { name: true, image: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
});

app.listen({ port: 3002, host: "0.0.0.0" });
```

**4. Helm migration Job** (`templates/db-migration-job.yaml`):
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  annotations:
    "helm.sh/hook": pre-upgrade          # Runs before deployment upgrade
    "helm.sh/hook-weight": "-5"          # Runs before other pre-upgrade hooks
    "helm.sh/hook-delete-policy": before-hook-creation
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: ralf090102/task-manager-app:latest
          command: ["npx", "prisma", "db", "push", "--accept-data-loss"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: task-manager-secret
                  key: databaseUrl
      restartPolicy: OnFailure
```

**5. Frontend additions:**
- Team switcher in the sidebar (personal vs. team boards)
- Team management page (invite members, manage roles)
- Board view (Kanban-style columns for TODO / IN_PROGRESS / COMPLETED)
- Activity feed component

### K8s Concepts You'll Learn
- **Helm hooks** — `helm.sh/hook` annotations that run Jobs at specific lifecycle points (pre-install, pre-upgrade, post-install)
- **Database migrations in K8s** — Running schema changes as Jobs before deploying new code
- **Shared database across services** — Multiple pods connecting to the same PostgreSQL with different access patterns
- **Role-based access control** — Application-level RBAC enforced by the team-service
- **Service-to-service authentication** — JWT verification between the main app and team-service

### Estimated Complexity: High
Schema changes, new service with complex business logic, role-based access control, frontend changes for team/board UI, migration Job management, activity feed.

---

## Implementation Strategy

### Phase 1: Simple Additions (1 pod each)
Start here to get comfortable with multi-service deployments:

1. **Module 7: Recurring Task Scheduler** — Simplest K8s resource (CronJob), smallest script
2. **Module 1: Notification Service** — One Deployment, one Service, one Secret

### Phase 2: Stateful Services
Move to services that need persistent storage:

3. **Module 2: File Attachments + MinIO** — StatefulSet, PVC, headless Service
4. **Module 5: Full-Text Search** — StatefulSet, data sync, initContainer

### Phase 3: Complex Services
Tackle services with more architectural complexity:

5. **Module 4: Real-time WebSocket Gateway** — Sticky sessions, long-lived connections
6. **Module 3: Analytics & Reporting** — Python polyglot, CronJob for reports
7. **Module 6: Webhook Delivery** — Background workers, retry logic, dead letters

### Phase 4: Major Feature
8. **Module 8: Team & Workspace Management** — Schema changes, new service, Helm hooks, frontend rework

---

## Cluster Resource Summary

After all modules, your cluster will have:

| Workload | Type | Replicas | Container | Language |
|----------|------|----------|-----------|----------|
| task-manager | Deployment | 1 | ralf090102/task-manager-app | Node.js (Next.js) |
| notification-service | Deployment | 1 | ralf090102/notification-service | Node.js |
| file-service | Deployment | 1 | ralf090102/file-service | Node.js |
| analytics-service | Deployment | 1 | ralf090102/analytics-service | Python |
| realtime-service | Deployment | 1+ | ralf090102/realtime-service | Node.js |
| search-sync-service | Deployment | 1 | ralf090102/search-sync-service | Node.js |
| webhook-service | Deployment | 1 | ralf090102/webhook-service | Node.js |
| team-service | Deployment | 1 | ralf090102/team-service | Node.js |
| MinIO | StatefulSet | 1 | minio/minio | Go |
| Meilisearch | StatefulSet | 1 | getmeili/meilisearch | Rust |
| task-scheduler | CronJob | — | ralf090102/scheduler-service | Node.js |
| weekly-report | CronJob | — | ralf090102/analytics-service | Python |
| db-migration | Job (Helm hook) | — | ralf090102/task-manager-app | Node.js |

**Total: 8 Deployments, 2 StatefulSets, 2 CronJobs, 1 Helm-hook Job = 13 K8s workloads**

Plus 10+ Services, 4+ PVCs, 5+ Secrets, 3+ ConfigMaps.

---

## Helm Chart Evolution

The Helm chart will grow from the current single-deployment structure to:

```
helm-chart/
├── Chart.yaml                          # Bump to v2.0.0 (breaking changes)
├── values.yaml                         # New sections for each service
├── templates/
│   ├── _helpers.tpl                    # Shared helpers
│   ├── task-manager/                   # Existing app
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── ingress.yaml
│   │   └── servicemonitor.yaml
│   ├── notification/                   # Module 1
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── secret.yaml
│   ├── minio/                          # Module 2
│   │   ├── statefulset.yaml
│   │   ├── headless-service.yaml
│   │   ├── pvc.yaml
│   │   └── secret.yaml
│   ├── file-service/                   # Module 2
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── analytics/                      # Module 3
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── cronjob.yaml
│   │   └── configmap.yaml
│   ├── realtime/                       # Module 4
│   │   ├── deployment.yaml
│   │   ├── service.yaml                # sessionAffinity: ClientIP
│   │   └── configmap.yaml
│   ├── search/                         # Module 5
│   │   ├── meilisearch-statefulset.yaml
│   │   ├── sync-deployment.yaml
│   │   ├── service.yaml
│   │   ├── pvc.yaml
│   │   └── secret.yaml
│   ├── webhook/                        # Module 6
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── configmap.yaml
│   ├── scheduler/                      # Module 7
│   │   └── cronjob.yaml
│   ├── team-service/                   # Module 8
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── db-migration-job.yaml       # Helm hook
│   └── secret.yaml                     # Shared DB secret
```

### values.yaml Growth

```yaml
# Existing
taskManager:
  replicaCount: 1
  image: { repository: ralf090102/task-manager-app, tag: latest }
  resources: { ... }

# Module 1
notification:
  enabled: false
  image: { repository: ralf090102/notification-service, tag: latest }
  smtp:
    host: ""
    port: "587"
    from: ""
  existingSecret: ""  # or provide values to create secret

# Module 2
minio:
  enabled: false
  persistence: { size: 10Gi }
  existingSecret: ""

fileService:
  enabled: false
  image: { repository: ralf090102/file-service, tag: latest }

# Module 3
analytics:
  enabled: false
  image: { repository: ralf090102/analytics-service, tag: latest }
  cronSchedule: "0 9 * * 1"

# Module 4
realtime:
  enabled: false
  image: { repository: ralf090102/realtime-service, tag: latest }
  redisUrl: ""  # depends on Expansion Module B

# Module 5
meilisearch:
  enabled: false
  persistence: { size: 5Gi }
  existingSecret: ""

searchSync:
  enabled: false
  image: { repository: ralf090102/search-sync-service, tag: latest }

# Module 6
webhook:
  enabled: false
  image: { repository: ralf090102/webhook-service, tag: latest }
  retry: { maxAttempts: 5, intervals: [1, 5, 30, 120, 600] }

# Module 7
scheduler:
  enabled: false
  image: { repository: ralf090102/scheduler-service, tag: latest }
  schedule: "* * * * *"

# Module 8
teamService:
  enabled: false
  image: { repository: ralf090102/team-service, tag: latest }
```

Each module can be enabled/disabled independently via `values.yaml`, allowing incremental rollout.

---

## CI/CD Pipeline Updates

The GitHub Actions workflow (`.github/workflows/ci.yml`) will need to evolve:

**Current:** Build + push 1 image (`task-manager-app`)

**After expansion:** Build + push 8+ images

```yaml
# Strategy 1: Matrix build (parallel)
docker:
  strategy:
    matrix:
      service:
        - task-manager
        - notification-service
        - file-service
        - analytics-service
        - realtime-service
        - search-sync-service
        - webhook-service
        - scheduler-service
        - team-service
  steps:
    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: ./task-manager/services/${{ matrix.service }}
        push: true
        tags: ralf090102/${{ matrix.service }}:latest

# Strategy 2: Only build changed services (path filtering)
paths:
  - "task-manager/services/notification/**"  # triggers notification-service build only
```

---

## What You'll Have at the End

A production-grade microservices architecture with:

- **13 Kubernetes workloads** (Deployments, StatefulSets, CronJobs, Jobs)
- **8+ custom Docker images** built from scratch
- **Multiple languages** (Node.js, Python, plus Rust/Go from third-party images)
- **Persistent storage** (PVCs for MinIO and Meilisearch)
- **Scheduled tasks** (CronJobs for recurring tasks and weekly reports)
- **Real-time communication** (WebSocket gateway)
- **Event-driven architecture** (webhooks, notifications)
- **Polyglot services** (Node.js + Python)
- **Shared database with independent clients** (each service manages its own connection pool)
- **Helm chart with 30+ templates** organized by service
- **CI/CD pipeline building 8+ images** in parallel

This is a resume-worthy microservices deployment that demonstrates deep understanding of containerization, Kubernetes orchestration, Helm packaging, and distributed system design.
