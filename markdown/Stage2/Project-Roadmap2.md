# Task Manager Web Application - Agent Roadmap 2: Microservices Expansion

## Project Overview

**Goal**: Transform the single-pod Task Manager monolith into a production-grade microservices architecture deployed on Kubernetes — 8 new features, 13+ K8s workloads, 8+ custom Docker images, polyglot services (Node.js + Python).

**Current Status**: Phases 1-5 complete (full-stack app, Docker, CI/CD, K8s deployment, monitoring). Ready to expand.

**Prerequisite Reading**: `markdown/Stage2/Project-Initialization2.md` — contains detailed architecture, implementation code, and rationale for each module.

**Tech Stack Additions**:
- **Fastify** — Node.js HTTP framework for microservices (lighter than Express, built-in JSON schema validation)
- **Socket.io** — Real-time WebSocket communication
- **Python / FastAPI** — Polyglot analytics service
- **MinIO** — S3-compatible object storage (in-cluster)
- **Meilisearch** — Full-text search engine (in-cluster)
- **nodemailer** — SMTP email delivery
- **asyncpg** — async PostgreSQL client for Python
- **matplotlib** — Chart/report generation

## Prerequisites & Initial Setup

### Required Tools (in addition to existing setup)

```bash
# Python 3.12+ (for Module 3: Analytics)
python --version

# Minikube with more resources (multi-service cluster)
minikube delete
minikube start --driver=docker --cpus=4 --memory=8192 --kubernetes-version=v1.35.1

# Verify existing cluster
kubectl get pods -n task-manager
kubectl get pods -n monitoring
```

### Project Structure Evolution

```bash
# Current structure:
task-manager/
├── src/
├── prisma/
├── helm-chart/
└── Dockerfile

# After expansion:
task-manager/
├── src/                          # Main Next.js app (existing)
├── prisma/
│   └── schema.prisma             # Shared schema (grows with each module)
├── services/                     # NEW — microservices directory
│   ├── notification/             # Module 1
│   ├── file-service/             # Module 2
│   ├── analytics/                # Module 3
│   ├── realtime/                 # Module 4
│   ├── search-sync/              # Module 5
│   ├── webhook/                  # Module 6
│   ├── scheduler/                # Module 7
│   └── team-service/             # Module 8
├── helm-chart/
│   ├── templates/
│   │   ├── task-manager/         # Reorganized existing templates
│   │   ├── notification/
│   │   ├── minio/
│   │   ├── file-service/
│   │   ├── analytics/
│   │   ├── realtime/
│   │   ├── search/
│   │   ├── webhook/
│   │   ├── scheduler/
│   │   └── team-service/
│   ├── Chart.yaml                # Bump to v2.0.0
│   └── values.yaml               # New section per service
└── Dockerfile                    # Main app (existing)
```

### Implementation Order

| Phase | Modules | Complexity | New K8s Concepts |
|-------|---------|------------|-----------------|
| Phase 1 | Module 7 (Scheduler), Module 1 (Notification) | Low | CronJob, internal Services |
| Phase 2 | Module 2 (File+MinIO), Module 5 (Search) | Medium | StatefulSet, PVC, Headless Service |
| Phase 3 | Module 4 (WebSocket), Module 3 (Analytics), Module 6 (Webhook) | Medium-High | Sticky sessions, polyglot, background workers |
| Phase 4 | Module 8 (Team & Workspace) | High | Helm hooks, DB migration Jobs, RBAC |

---

## Phase 1: Simple Additions (Module 7 → Module 1)

### Objectives

- Learn the K8s CronJob workload type
- Build and deploy a standalone Node.js microservice
- Practice internal service-to-service communication
- Understand Secrets for sensitive configuration

---

### Step 1.1: Module 7 — Recurring Task Scheduler (CronJob)

#### 1.1.1 Prisma Schema Addition

```bash
# Add RecurringTask model to prisma/schema.prisma
```

```prisma
model RecurringTask {
  id          String       @id @default(cuid())
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  description String?
  priority    TaskPriority @default(MEDIUM)
  cron        String       // "0 9 * * 1" = every Monday 9 AM
  nextRun     DateTime
  lastRun     DateTime?
  active      Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([userId])
  @@index([active, nextRun])
}
```

```bash
# Push schema to database
cmd /c "npm run db:generate"
cmd /c "npm run db:push"
```

#### 1.1.2 Create Scheduler Service

```bash
# Create directory structure
mkdir task-manager\services\scheduler
mkdir task-manager\services\scheduler\src
```

Create `task-manager/services/scheduler/package.json`:
```json
{
  "name": "scheduler-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@prisma/client": "^7.8.0",
    "cron-parser": "^4.9.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "prisma": "^7.8.0"
  }
}
```

Create `task-manager/services/scheduler/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

Create `task-manager/services/scheduler/src/index.ts` (see `Project-Initialization2.md` Module 7 for full code):
```typescript
import { PrismaClient } from "@prisma/client";
import cronParser from "cron-parser";

const prisma = new PrismaClient();

async function run() {
  const now = new Date();
  const due = await prisma.recurringTask.findMany({
    where: { active: true, nextRun: { lte: now } },
  });

  console.log(`[scheduler] Found ${due.length} due recurring tasks`);

  for (const template of due) {
    await prisma.task.create({
      data: {
        title: template.title,
        description: template.description,
        priority: template.priority,
        status: "TODO",
        userId: template.userId,
      },
    });

    const interval = cronParser.parseExpression(template.cron, { currentDate: now });
    const nextRun = interval.next().toDate();

    await prisma.recurringTask.update({
      where: { id: template.id },
      data: { lastRun: now, nextRun },
    });

    console.log(`[scheduler] Created "${template.title}", next run: ${nextRun.toISOString()}`);
  }

  await prisma.$disconnect();
}

run().catch((err) => {
  console.error("[scheduler] Fatal:", err);
  process.exit(1);
});
```

#### 1.1.3 Dockerfile

Create `task-manager/services/scheduler/Dockerfile`:
```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src/ ./src/
COPY prisma/ ./prisma/
RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

#### 1.1.4 Build and Push Image

```bash
# Build inside Minikube's Docker daemon
minikube image build -t ralf090102/scheduler-service:latest ^
  -f task-manager\services\scheduler\Dockerfile ^
  task-manager\services\scheduler

# Or push to Docker Hub
docker build -t ralf090102/scheduler-service:latest ^
  task-manager\services\scheduler
docker push ralf090102/scheduler-service:latest
```

#### 1.1.5 Helm Template

Create `task-manager/helm-chart/templates/scheduler/cronjob.yaml`:
```yaml
{{- if .Values.scheduler.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: task-scheduler
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  schedule: "{{ .Values.scheduler.schedule | default "* * * * *" }}"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: scheduler
              image: "{{ .Values.scheduler.image.repository }}:{{ .Values.scheduler.image.tag }}"
              imagePullPolicy: {{ .Values.scheduler.image.pullPolicy | default "IfNotPresent" }}
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: {{ include "task-manager.fullname" . }}-secret
                      key: databaseUrl
{{- end }}
```

Add to `task-manager/helm-chart/values.yaml`:
```yaml
scheduler:
  enabled: false
  image:
    repository: ralf090102/scheduler-service
    pullPolicy: IfNotPresent
    tag: latest
  schedule: "* * * * *"
```

#### 1.1.6 API Endpoints (Main App)

Create `task-manager/src/app/api/recurring/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const recurringSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  cron: z.string().min(1),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const recurring = await prisma.recurringTask.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(recurring);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = recurringSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  }

  const { title, description, priority, cron } = parsed.data;

  // Calculate next run from cron expression
  const cronParser = require("cron-parser");
  const interval = cronParser.parseExpression(cron);
  const nextRun = interval.next().toDate();

  const recurring = await prisma.recurringTask.create({
    data: {
      title,
      description,
      priority: priority || "MEDIUM",
      cron,
      nextRun,
      userId: session.user.id,
    },
  });

  return NextResponse.json(recurring, { status: 201 });
}
```

#### 1.1.7 Deploy and Verify

```bash
# Install cron-parser in main app
cd task-manager
cmd /c "npm install cron-parser"

# Enable scheduler in Helm
helm upgrade task-manager ./task-manager/helm-chart ^
  --namespace task-manager ^
  --reuse-values ^
  --set scheduler.enabled=true ^
  --set scheduler.image.pullPolicy=Never

# Verify CronJob
kubectl get cronjob -n task-manager

# Wait for first run (within 1 minute)
kubectl get jobs -n task-manager

# Check logs
kubectl logs job/task-scheduler-<random-id> -n task-manager

# Verify tasks were created
kubectl port-forward svc/task-manager 3000:3000 -n task-manager
# Then check the task list in browser
```

#### Verification & Quality Gates

```bash
# CronJob schedule correct
kubectl get cronjob task-scheduler -n task-manager -o jsonpath='{.spec.schedule}'
# Expected: * * * * *

# Job completed successfully
kubectl get jobs -n task-manager
# Expected: COMPLETIONS: 1/1

# No overlapping runs
kubectl get pods -n task-manager -l job-name=task-scheduler-<id>
# Expected: STATUS: Completed

# Scheduler logs show task creation
kubectl logs job/task-scheduler-<id> -n task-manager
# Expected: [scheduler] Created "Weekly Review", next run: ...
```

---

### Step 1.2: Module 1 — Notification Service

#### 1.2.1 Prisma Schema Addition

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

  @@index([userId])
}
```

```bash
cmd /c "npm run db:generate"
cmd /c "npm run db:push"
```

#### 1.2.2 Create Notification Service

```bash
mkdir task-manager\services\notification
mkdir task-manager\services\notification\src
```

Create `task-manager/services/notification/package.json`:
```json
{
  "name": "notification-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@prisma/client": "^7.8.0",
    "fastify": "^4.26.0",
    "nodemailer": "^6.9.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/nodemailer": "^6.4.0",
    "prisma": "^7.8.0"
  }
}
```

Create `task-manager/services/notification/src/index.ts` (see `Project-Initialization2.md` Module 1 for full code):
```typescript
import Fastify from "fastify";
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = Fastify({ logger: true });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

app.get("/health", async () => ({ status: "ok" }));

app.post("/notify/due-soon", async () => {
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
  const { title, userEmail } = req.body as any;
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

#### 1.2.3 Dockerfile

Create `task-manager/services/notification/Dockerfile` (same multi-stage pattern as scheduler):
```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src/ ./src/
COPY prisma/ ./prisma/
RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "dist/index.js"]
```

#### 1.2.4 Helm Templates

Create `task-manager/helm-chart/templates/notification/deployment.yaml`:
```yaml
{{- if .Values.notification.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: notification
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: notification
  template:
    metadata:
      labels:
        app.kubernetes.io/component: notification
    spec:
      containers:
        - name: notification
          image: "{{ .Values.notification.image.repository }}:{{ .Values.notification.image.tag }}"
          imagePullPolicy: {{ .Values.notification.image.pullPolicy }}
          ports:
            - containerPort: 3004
              name: http
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secret
                  key: databaseUrl
            - name: SMTP_HOST
              value: {{ .Values.notification.smtp.host | quote }}
            - name: SMTP_PORT
              value: {{ .Values.notification.smtp.port | quote }}
            - name: SMTP_USER
              valueFrom:
                secretKeyRef:
                  name: notification-secret
                  key: smtpUser
            - name: SMTP_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: notification-secret
                  key: smtpPassword
            - name: SMTP_FROM
              value: {{ .Values.notification.smtp.from | quote }}
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            {{- toYaml .Values.notification.resources | default .Values.resources | nindent 12 }}
{{- end }}
```

Create `task-manager/helm-chart/templates/notification/service.yaml`:
```yaml
{{- if .Values.notification.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: notification-service
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  type: ClusterIP
  ports:
    - port: 3004
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app.kubernetes.io/component: notification
{{- end }}
```

Create `task-manager/helm-chart/templates/notification/secret.yaml`:
```yaml
{{- if .Values.notification.enabled }}
apiVersion: v1
kind: Secret
metadata:
  name: notification-secret
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
type: Opaque
data:
  smtpUser: {{ .Values.notification.smtp.user | b64enc | quote }}
  smtpPassword: {{ .Values.notification.smtp.password | b64enc | quote }}
{{- end }}
```

Add to `values.yaml`:
```yaml
notification:
  enabled: false
  image:
    repository: ralf090102/notification-service
    pullPolicy: IfNotPresent
    tag: latest
  smtp:
    host: "smtp.gmail.com"
    port: "587"
    from: "noreply@taskmanager.local"
    user: ""
    password: ""
```

#### 1.2.5 Deploy and Verify

```bash
# Build image
minikube image build -t ralf090102/notification-service:latest ^
  -f task-manager\services\notification\Dockerfile ^
  task-manager\services\notification

# Deploy
helm upgrade task-manager ./task-manager/helm-chart ^
  --namespace task-manager ^
  --reuse-values ^
  --set notification.enabled=true ^
  --set notification.image.pullPolicy=Never ^
  --set notification.smtp.user=your-email@gmail.com ^
  --set notification.smtp.password=your-app-password

# Verify
kubectl get deployment notification-service -n task-manager
kubectl get svc notification-service -n task-manager

# Test health endpoint
kubectl exec -it deployment/task-manager -n task-manager -- ^
  curl http://notification-service:3004/health
# Expected: {"status":"ok"}
```

#### Verification & Quality Gates

```bash
# Pod running
kubectl get pods -n task-manager -l app.kubernetes.io/component=notification
# Expected: Running

# Health check passing
kubectl describe pod -l app.kubernetes.io/component=notification -n task-manager | findstr "Liveness Readiness"
# Expected: ok

# Service resolves internally
kubectl exec deployment/task-manager -n task-manager -- ^
  nslookup notification-service
# Expected: Address: 10.x.x.x

# Secret created
kubectl get secret notification-secret -n task-manager
# Expected: Opaque, 2 data entries
```

### Phase 1 Best Practices

- Always add `/health` endpoints to microservices for liveness/readiness probes
- Use `concurrencyPolicy: Forbid` on CronJobs to prevent overlapping executions
- Services that don't need external access should be ClusterIP only (no Ingress)
- Share the Prisma schema across services via file copy in Dockerfile
- Each service gets its own `package.json` — only install what it needs

### Phase 1 Common Pitfalls

- Missing Prisma client generation in the scheduler Dockerfile (schema needs to be copied)
- Forgetting to add `AUTH_TRUST_HOST` or `DATABASE_URL` env vars
- CronJob schedule using wrong timezone (K8s uses UTC by default)
- Notification service started without valid SMTP credentials → health check passes but delivery fails

---

## Phase 2: Stateful Services (Module 2 → Module 5)

### Objectives

- Learn StatefulSet workload — stable identity + persistent storage
- Understand PVCs and `volumeClaimTemplates`
- Deploy third-party stateful applications (MinIO, Meilisearch)
- Practice data synchronization patterns

---

### Step 2.1: Module 2 — File Attachments + MinIO

#### 2.1.1 Prisma Schema Addition

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

```bash
cmd /c "npm run db:generate"
cmd /c "npm run db:push"
```

#### 2.1.2 Create File Service

```bash
mkdir task-manager\services\file-service
mkdir task-manager\services\file-service\src
```

Create `task-manager/services/file-service/package.json`:
```json
{
  "name": "file-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@prisma/client": "^7.8.0",
    "fastify": "^4.26.0",
    "@fastify/multipart": "^8.1.0",
    "@aws-sdk/client-s3": "^3.500.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "prisma": "^7.8.0"
  }
}
```

Create `task-manager/services/file-service/src/index.ts` (see `Project-Initialization2.md` Module 2 for full code).

#### 2.1.3 Helm Templates

**MinIO StatefulSet** (`templates/minio/statefulset.yaml`):
```yaml
{{- if .Values.minio.enabled }}
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: minio
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: minio
spec:
  serviceName: minio-headless
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: minio
  template:
    metadata:
      labels:
        app.kubernetes.io/component: minio
    spec:
      containers:
        - name: minio
          image: "minio/minio:latest"
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
            - containerPort: 9000
              name: api
            - containerPort: 9001
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
            storage: {{ .Values.minio.persistence.size | default "10Gi" }}
{{- end }}
```

**MinIO Headless Service** (`templates/minio/headless-service.yaml`):
```yaml
{{- if .Values.minio.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: minio-headless
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  clusterIP: None
  ports:
    - port: 9000
      name: api
    - port: 9001
      name: console
  selector:
    app.kubernetes.io/component: minio
{{- end }}
```

**MinIO ClusterIP Service** (`templates/minio/service.yaml`):
```yaml
{{- if .Values.minio.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: minio
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  type: ClusterIP
  ports:
    - port: 9000
      name: api
    - port: 9001
      name: console
  selector:
    app.kubernetes.io/component: minio
{{- end }}
```

**MinIO Secret** (`templates/minio/secret.yaml`):
```yaml
{{- if .Values.minio.enabled }}
apiVersion: v1
kind: Secret
metadata:
  name: minio-secret
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
type: Opaque
data:
  accessKey: {{ .Values.minio.accessKey | default "minioadmin" | b64enc | quote }}
  secretKey: {{ .Values.minio.secretKey | default "minioadmin" | b64enc | quote }}
{{- end }}
```

**File Service Deployment + Service** — follow the same pattern as notification service (port 3005, env: `MINIO_ENDPOINT=http://minio:9000`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`).

Add to `values.yaml`:
```yaml
minio:
  enabled: false
  persistence:
    size: 10Gi
  accessKey: "minioadmin"
  secretKey: "minioadmin"

fileService:
  enabled: false
  image:
    repository: ralf090102/file-service
    pullPolicy: IfNotPresent
    tag: latest
```

#### 2.1.4 Deploy and Verify

```bash
# Build file-service image
minikube image build -t ralf090102/file-service:latest ^
  -f task-manager\services\file-service\Dockerfile ^
  task-manager\services\file-service

# Deploy MinIO + file-service
helm upgrade task-manager ./task-manager/helm-chart ^
  --namespace task-manager ^
  --reuse-values ^
  --set minio.enabled=true ^
  --set fileService.enabled=true ^
  --set fileService.image.pullPolicy=Never

# Verify StatefulSet (stable identity: minio-0)
kubectl get statefulset minio -n task-manager
kubectl get pod minio-0 -n task-manager

# Verify PVC created
kubectl get pvc -n task-manager
# Expected: data-minio-0, 10Gi, Bound

# Access MinIO console
kubectl port-forward svc/minio 9001:9001 -n task-manager
# Open http://localhost:9001 → login with minioadmin/minioadmin

# Create the bucket (via console or mc CLI)
kubectl exec -it deployment/file-service -n task-manager -- sh -c ^
  "wget -qO- http://minio:9000/minio/health/live"
# Expected: empty 200 OK response
```

#### Verification & Quality Gates

```bash
# StatefulSet pod has stable name
kubectl get pods -n task-manager -l app.kubernetes.io/component=minio
# Expected: minio-0 (not minio-<random>)

# PVC bound
kubectl get pvc data-minio-0 -n task-manager
# Expected: STATUS: Bound, CAPACITY: 10Gi

# Headless service resolves to pod IP
kubectl exec deployment/file-service -n task-manager -- nslookup minio-0.minio-headless
# Expected: Address: 10.x.x.x

# File upload works
kubectl exec deployment/task-manager -n task-manager -- ^
  curl -X POST -H "Content-Type: multipart/form-data" ^
  -F "file=@/etc/hostname" ^
  http://file-service:3005/upload
# Expected: JSON response with attachment metadata
```

---

### Step 2.2: Module 5 — Full-Text Search with Meilisearch

#### 2.2.1 Create Search Sync Service

```bash
mkdir task-manager\services\search-sync
mkdir task-manager\services\search-sync\src
```

Create `task-manager/services/search-sync/src/index.ts` (see `Project-Initialization2.md` Module 5 for full code).

Create `task-manager/services/search-sync/package.json`:
```json
{
  "name": "search-sync-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@prisma/client": "^7.8.0",
    "fastify": "^4.26.0",
    "meilisearch": "^0.41.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "prisma": "^7.8.0"
  }
}
```

#### 2.2.2 Helm Templates

**Meilisearch StatefulSet** (`templates/search/meilisearch-statefulset.yaml`):
```yaml
{{- if .Values.meilisearch.enabled }}
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: meilisearch
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: meilisearch
spec:
  serviceName: meilisearch-headless
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: meilisearch
  template:
    metadata:
      labels:
        app.kubernetes.io/component: meilisearch
    spec:
      containers:
        - name: meilisearch
          image: "getmeili/meilisearch:v1.6"
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
              name: http
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
            storage: {{ .Values.meilisearch.persistence.size | default "5Gi" }}
{{- end }}
```

Create headless service, ClusterIP service, and secret following the MinIO pattern.

Add to `values.yaml`:
```yaml
meilisearch:
  enabled: false
  persistence:
    size: 5Gi
  masterKey: "meili-master-key-change-me"

searchSync:
  enabled: false
  image:
    repository: ralf090102/search-sync-service
    pullPolicy: IfNotPresent
    tag: latest
```

#### 2.2.3 Main App Search Endpoint

```bash
# Install meilisearch client in main app
cd task-manager
cmd /c "npm install meilisearch"
```

Create `task-manager/src/app/api/tasks/search/route.ts` (see `Project-Initialization2.md` Module 5 for full code).

#### 2.2.4 Deploy and Verify

```bash
# Build search-sync image
minikube image build -t ralf090102/search-sync-service:latest ^
  -f task-manager\services\search-sync\Dockerfile ^
  task-manager\services\search-sync

# Deploy
helm upgrade task-manager ./task-manager/helm-chart ^
  --namespace task-manager ^
  --reuse-values ^
  --set meilisearch.enabled=true ^
  --set searchSync.enabled=true ^
  --set searchSync.image.pullPolicy=Never

# Verify Meilisearch is running
kubectl get statefulset meilisearch -n task-manager
kubectl get pod meilisearch-0 -n task-manager

# Check Meilisearch health
kubectl exec deployment/task-manager -n task-manager -- ^
  curl -s http://meilisearch:7700/health
# Expected: {"status":"available"}

# Full reindex (initial sync)
kubectl exec deployment/search-sync-service -n task-manager -- ^
  curl -X POST http://localhost:3006/sync/all
# Expected: {"reindexed": N}

# Search query
kubectl exec deployment/task-manager -n task-manager -- ^
  curl -s "http://meilisearch:7700/indexes/tasks/search" ^
  -H "Authorization: Bearer meili-master-key-change-me" ^
  -d '{"q": "test"}'
# Expected: Search results JSON
```

### Phase 2 Best Practices

- StatefulSet `serviceName` must point to a **headless service** (`clusterIP: None`)
- Use `volumeClaimTemplates` (not separate PVCs) for StatefulSet storage
- Third-party images should be pinned to a specific version (not `:latest`)
- Initialize search index with a bulk sync, then switch to incremental event-driven sync
- MinIO buckets must be created before first upload — use an initContainer or manual setup

### Phase 2 Common Pitfalls

- Missing headless service → StatefulSet pod DNS resolution fails (`minio-0.minio-headless` won't resolve)
- PVC stuck in `Pending` → Minikube default StorageClass should auto-provision, but check with `kubectl get sc`
- Meilisearch master key not set in production mode → server refuses to start
- File upload size limit — Fastify multipart defaults may be too small for large files

---

## Phase 3: Complex Services (Module 4 → Module 3 → Module 6)

### Objectives

- Deploy a WebSocket service with sticky sessions
- Build a polyglot Python microservice
- Implement a background worker pattern with retry logic
- Practice cross-service event emission

---

### Step 3.1: Module 4 — Real-time WebSocket Gateway

#### 3.1.1 Create Realtime Service

```bash
mkdir task-manager\services\realtime
mkdir task-manager\services\realtime\src
```

Create `task-manager/services/realtime/package.json`:
```json
{
  "name": "realtime-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "socket.io": "^4.7.0",
    "redis": "^4.6.0",
    "@socket.io/redis-adapter": "^8.2.0",
    "jose": "^5.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0"
  }
}
```

Create `task-manager/services/realtime/src/index.ts` (see `Project-Initialization2.md` Module 4 for full code).

#### 3.1.2 Dockerfile

```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

#### 3.1.3 Helm Templates

**Realtime Service with Sticky Sessions** (`templates/realtime/service.yaml`):
```yaml
{{- if .Values.realtime.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: realtime-service
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  type: ClusterIP
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800
  ports:
    - port: 3001
      targetPort: 3001
      protocol: TCP
      name: websocket
  selector:
    app.kubernetes.io/component: realtime
{{- end }}
```

**Realtime Deployment** (`templates/realtime/deployment.yaml`):
```yaml
{{- if .Values.realtime.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: realtime-service
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: realtime
spec:
  replicas: {{ .Values.realtime.replicaCount | default 1 }}
  selector:
    matchLabels:
      app.kubernetes.io/component: realtime
  template:
    metadata:
      labels:
        app.kubernetes.io/component: realtime
    spec:
      containers:
        - name: realtime
          image: "{{ .Values.realtime.image.repository }}:{{ .Values.realtime.image.tag }}"
          imagePullPolicy: {{ .Values.realtime.image.pullPolicy }}
          ports:
            - containerPort: 3001
              name: websocket
          env:
            - name: CORS_ORIGIN
              value: {{ .Values.realtime.corsOrigin | default "*" | quote }}
            - name: NEXTAUTH_SECRET
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secret
                  key: nextauthSecret
            {{- if .Values.realtime.redisUrl }}
            - name: REDIS_URL
              value: {{ .Values.realtime.redisUrl | quote }}
            {{- end }}
          resources:
            {{- toYaml .Values.realtime.resources | default .Values.resources | nindent 12 }}
{{- end }}
```

Add to `values.yaml`:
```yaml
realtime:
  enabled: false
  replicaCount: 1
  image:
    repository: ralf090102/realtime-service
    pullPolicy: IfNotPresent
    tag: latest
  corsOrigin: "http://task-manager.local"
  redisUrl: ""
```

#### 3.1.4 NGINX Ingress WebSocket Configuration

Update `task-manager/helm-chart/templates/ingress.yaml` to add WebSocket annotations:
```yaml
annotations:
  nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
  nginx.org/websocket-services: "realtime-service"
```

Or add a separate Ingress for `/ws` path routing to the realtime service.

#### 3.1.5 Deploy and Verify

```bash
# Build image
minikube image build -t ralf090102/realtime-service:latest ^
  -f task-manager\services\realtime\Dockerfile ^
  task-manager\services\realtime

# Deploy
helm upgrade task-manager ./task-manager/helm-chart ^
  --namespace task-manager ^
  --reuse-values ^
  --set realtime.enabled=true ^
  --set realtime.image.pullPolicy=Never

# Verify
kubectl get deployment realtime-service -n task-manager
kubectl get svc realtime-service -n task-manager

# Check session affinity
kubectl get svc realtime-service -n task-manager -o jsonpath='{.spec.sessionAffinity}'
# Expected: ClientIP

# Test WebSocket connection (requires wscat)
npm install -g wscat
kubectl port-forward svc/realtime-service 3001:3001 -n task-manager
# In another terminal:
wscat -c ws://localhost:3001
# Expected: Connected
```

---

### Step 3.2: Module 3 — Analytics & Reporting Service (Python)

#### 3.2.1 Create Analytics Service

```bash
mkdir task-manager\services\analytics
mkdir task-manager\services\analytics\scripts
```

Create `task-manager/services/analytics/requirements.txt`:
```text
fastapi==0.109.0
uvicorn[standard]==0.27.0
asyncpg==0.29.0
httpx==0.26.0
matplotlib==3.8.0
```

Create `task-manager/services/analytics/main.py` (see `Project-Initialization2.md` Module 3 for full code).

Create `task-manager/services/analytics/scripts/weekly_report.py` (see Project-Initialization2.md Module 3 for full code).

#### 3.2.2 Dockerfile (Python)

Create `task-manager/services/analytics/Dockerfile`:
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
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### 3.2.3 Helm Templates

**Analytics Deployment** (`templates/analytics/deployment.yaml`):
```yaml
{{- if .Values.analytics.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-service
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: analytics
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/component: analytics
  template:
    metadata:
      labels:
        app.kubernetes.io/component: analytics
    spec:
      containers:
        - name: analytics
          image: "{{ .Values.analytics.image.repository }}:{{ .Values.analytics.image.tag }}"
          imagePullPolicy: {{ .Values.analytics.image.pullPolicy }}
          ports:
            - containerPort: 8000
              name: http
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secret
                  key: databaseUrl
            {{- if .Values.notification.enabled }}
            - name: NOTIFICATION_URL
              value: "http://notification-service:3004"
            {{- end }}
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 15
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
{{- end }}
```

**Analytics CronJob** (`templates/analytics/cronjob.yaml`):
```yaml
{{- if .Values.analytics.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: weekly-report
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  schedule: "{{ .Values.analytics.cronSchedule | default "0 9 * * 1" }}"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report-generator
              image: "{{ .Values.analytics.image.repository }}:{{ .Values.analytics.image.tag }}"
              imagePullPolicy: {{ .Values.analytics.image.pullPolicy }}
              command: ["python", "-m", "scripts.weekly_report"]
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: {{ include "task-manager.fullname" . }}-secret
                      key: databaseUrl
                - name: NOTIFICATION_URL
                  value: "http://notification-service:3004"
{{- end }}
```

Add to `values.yaml`:
```yaml
analytics:
  enabled: false
  image:
    repository: ralf090102/analytics-service
    pullPolicy: IfNotPresent
    tag: latest
  cronSchedule: "0 9 * * 1"
```

#### 3.2.3 Deploy and Verify

```bash
# Build Python image
minikube image build -t ralf090102/analytics-service:latest ^
  -f task-manager\services\analytics\Dockerfile ^
  task-manager\services\analytics

# Deploy
helm upgrade task-manager ./task-manager/helm-chart ^
  --namespace task-manager ^
  --reuse-values ^
  --set analytics.enabled=true ^
  --set analytics.image.pullPolicy=Never

# Verify
kubectl get deployment analytics-service -n task-manager
kubectl get cronjob weekly-report -n task-manager

# Test analytics endpoint
kubectl exec deployment/task-manager -n task-manager -- ^
  curl -s http://analytics-service:8000/health
# Expected: {"status":"ok"}

# Test stats endpoint (replace user-id with a real cuid)
kubectl exec deployment/task-manager -n task-manager -- ^
  curl -s http://analytics-service:8000/stats/summary/<user-id>
# Expected: JSON with statusCounts, completionRate, dailyHistory

# Trigger weekly report manually
kubectl create job --from=cronjob/weekly-report manual-report -n task-manager
kubectl logs job/manual-report -n task-manager
# Expected: Report generation logs
```

---

### Step 3.3: Module 6 — Webhook Delivery Service

#### 3.3.1 Prisma Schema Addition

```prisma
model Webhook {
  id          String            @id @default(cuid())
  userId      String
  user        User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  url         String
  events      String[]
  secret      String
  active      Boolean           @default(true)
  deliveries  WebhookDelivery[]
  createdAt   DateTime          @default(now())
}

model WebhookDelivery {
  id          String   @id @default(cuid())
  webhookId   String
  webhook     Webhook  @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  event       String
  payload     Json
  statusCode  Int?
  response    String?
  attempts    Int      @default(0)
  maxAttempts Int      @default(5)
  nextRetryAt DateTime?
  deliveredAt DateTime?
  status      String   @default("pending")
  createdAt   DateTime @default(now())

  @@index([webhookId])
  @@index([status])
  @@index([nextRetryAt])
}
```

```bash
cmd /c "npm run db:generate"
cmd /c "npm run db:push"
```

#### 3.3.2 Create Webhook Service

```bash
mkdir task-manager\services\webhook
mkdir task-manager\services\webhook\src
```

Create `task-manager/services/webhook/package.json`:
```json
{
  "name": "webhook-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@prisma/client": "^7.8.0",
    "fastify": "^4.26.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "prisma": "^7.8.0"
  }
}
```

Create `task-manager/services/webhook/src/index.ts` (see `Project-Initialization2.md` Module 6 for full code — includes background delivery loop with exponential backoff).

#### 3.3.3 Helm Templates

**Webhook ConfigMap** (`templates/webhook/configmap.yaml`):
```yaml
{{- if .Values.webhook.enabled }}
apiVersion: v1
kind: ConfigMap
metadata:
  name: webhook-config
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
data:
  MAX_ATTEMPTS: "{{ .Values.webhook.retry.maxAttempts | default 5 }}"
  BACKOFF_INTERVALS: "{{ join "," (.Values.webhook.retry.intervals | default (list 1 5 30 120 600)) }}"
  POLL_INTERVAL_MS: "2000"
  DELIVERY_TIMEOUT_MS: "10000"
{{- end }}
```

**Webhook Deployment** — follows same pattern as notification (port 3003, with ConfigMap env and graceful shutdown).

Add to `values.yaml`:
```yaml
webhook:
  enabled: false
  image:
    repository: ralf090102/webhook-service
    pullPolicy: IfNotPresent
    tag: latest
  retry:
    maxAttempts: 5
    intervals: [1, 5, 30, 120, 600]
```

#### 3.3.4 Main App Integration

Add to `task-manager/src/app/api/tasks/route.ts` (after task creation):
```typescript
// Fire webhook event (fire-and-forget, don't block response)
fetch("http://webhook-service:3003/trigger", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "task.created",
    task,
    userId: session.user.id,
  }),
}).catch(() => {}); // Silent fail — webhook service handles retries
```

Similarly add for PUT (`task.updated`) and DELETE (`task.deleted`).

#### 3.3.5 Deploy and Verify

```bash
# Build image
minikube image build -t ralf090102/webhook-service:latest ^
  -f task-manager\services\webhook\Dockerfile ^
  task-manager\services\webhook

# Deploy
helm upgrade task-manager ./task-manager/helm-chart ^
  --namespace task-manager ^
  --reuse-values ^
  --set webhook.enabled=true ^
  --set webhook.image.pullPolicy=Never

# Verify
kubectl get deployment webhook-service -n task-manager

# Test trigger endpoint
kubectl exec deployment/task-manager -n task-manager -- ^
  curl -X POST http://webhook-service:3003/trigger ^
  -H "Content-Type: application/json" ^
  -d '{"event":"task.created","task":{"id":"test","title":"Test"},"userId":"test"}'
# Expected: {"queued": 0} (no webhooks registered yet)

# Check ConfigMap
kubectl get configmap webhook-config -n task-manager -o yaml
# Expected: MAX_ATTEMPTS: "5", BACKOFF_INTERVALS: "1,5,30,120,600"
```

### Phase 3 Best Practices

- WebSocket services need `sessionAffinity: ClientIP` — connections must persist on one pod
- Python containers should set `PYTHONUNBUFFERED=1` for real-time log output
- Background workers should handle `SIGTERM` for graceful shutdown (finish in-flight work before pod dies)
- Webhook triggers from the main app should be fire-and-forget (don't block the response waiting for webhook service)
- Use ConfigMaps for non-sensitive configuration (retry intervals, timeouts) — allows changes without rebuilding images

### Phase 3 Common Pitfalls

- NGINX Ingress drops WebSocket connections without proper annotations (`proxy-read-timeout`)
- Python Docker image missing `PYTHONUNBUFFERED=1` → no logs visible via `kubectl logs`
- Webhook service background loop blocks SIGTERM → pod takes 30s to terminate (default grace period)
- Analytics service using synchronous DB driver (psycopg2) instead of async (asyncpg) → blocks event loop

---

## Phase 4: Major Feature (Module 8)

### Objectives

- Redesign the data model for multi-user collaboration
- Implement role-based access control
- Run database migrations as Helm hooks
- Build a team management microservice
- Add Kanban-style board UI to the frontend

---

### Step 4.1: Module 8 — Team & Workspace Management

#### 4.1.1 Prisma Schema Changes

This is the largest schema change — add Team, Member, Board, and Activity models, plus modify Task with optional board/assignee relations.

See `Project-Initialization2.md` Module 8 for the complete schema additions.

```bash
cmd /c "npm run db:generate"
cmd /c "npm run db:push"
```

#### 4.1.2 Create Team Service

```bash
mkdir task-manager\services\team-service
mkdir task-manager\services\team-service\src
```

Create `task-manager/services/team-service/package.json`:
```json
{
  "name": "team-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@prisma/client": "^7.8.0",
    "fastify": "^4.26.0",
    "jose": "^5.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "prisma": "^7.8.0"
  }
}
```

Create `task-manager/services/team-service/src/index.ts` (see `Project-Initialization2.md` Module 8 for full code — includes JWT auth middleware, team CRUD, member management with RBAC, board CRUD, and activity feed).

#### 4.1.3 Dockerfile

Same multi-stage Node.js pattern (port 3002).

#### 4.1.4 Helm Templates

**DB Migration Helm Hook** (`templates/team-service/db-migration-job.yaml`):
```yaml
{{- if .Values.teamService.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          command: ["npx", "prisma", "db", "push", "--accept-data-loss"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secret
                  key: databaseUrl
{{- end }}
```

**Team Service Deployment** — follows same pattern (port 3002, env: `DATABASE_URL`, `NEXTAUTH_SECRET` for JWT verification).

Add to `values.yaml`:
```yaml
teamService:
  enabled: false
  image:
    repository: ralf090102/team-service
    pullPolicy: IfNotPresent
    tag: latest
```

#### 4.1.5 Deploy and Verify

```bash
# Build team-service image
minikube image build -t ralf090102/team-service:latest ^
  -f task-manager\services\team-service\Dockerfile ^
  task-manager\services\team-service

# Deploy (migration Job runs first via Helm hook)
helm upgrade task-manager ./task-manager/helm-chart ^
  --namespace task-manager ^
  --reuse-values ^
  --set teamService.enabled=true ^
  --set teamService.image.pullPolicy=Never

# Check migration Job ran
kubectl get jobs -n task-manager
# Expected: db-migration completed

# Check team-service
kubectl get deployment team-service -n task-manager
kubectl get svc team-service -n task-manager

# Test team creation
kubectl exec deployment/task-manager -n task-manager -- ^
  curl -X POST http://team-service:3002/teams ^
  -H "Authorization: Bearer <jwt-token>" ^
  -H "Content-Type: application/json" ^
  -d '{"name":"Engineering Team"}'
# Expected: JSON with team id, slug, members
```

#### 4.1.6 Frontend Additions

- Team switcher component in sidebar (personal vs. team boards)
- Team management page (`/teams/[id]`) — invite members, manage roles
- Board view (`/boards/[id]`) — Kanban columns for TODO / IN_PROGRESS / COMPLETED
- Activity feed component

### Phase 4 Best Practices

- Use Helm hooks (`pre-upgrade`, `pre-install`) for database migrations — ensures schema is ready before new code runs
- Set `helm.sh/hook-weight: "-5"` so migrations run before other pre-upgrade hooks
- JWT verification between services should share the same `NEXTAUTH_SECRET`
- Role-based access control belongs in the service layer, not just the frontend
- Activity feed should use database indexes on `(teamId, createdAt)` for efficient queries

### Phase 4 Common Pitfalls

- Helm hook Job not deleted between releases → `helm.sh/hook-delete-policy: before-hook-creation` is essential
- Team service can't verify NextAuth JWTs → must share the same secret, and use `jose` library for JWT verification
- Schema migration fails on existing data → use `prisma db push --accept-data-loss` carefully, or use proper migrations
- Tasks lose user association when moved to a team board → ensure `userId` stays required, `boardId` is optional

---

## CI/CD Pipeline Evolution

### Multi-Image Docker Build

Update `.github/workflows/ci.yml` to build all service images:

```yaml
docker:
  name: Docker Build & Push
  runs-on: ubuntu-latest
  needs: [quality, security]
  if: github.event_name != 'pull_request'
  strategy:
    matrix:
      service:
        - task-manager-app
        - notification-service
        - file-service
        - analytics-service
        - realtime-service
        - search-sync-service
        - webhook-service
        - scheduler-service
        - team-service
  steps:
    - uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Log in to Docker Hub
      uses: docker/login-action@v3
      with:
        username: ${{ secrets.DOCKER_USERNAME }}
        password: ${{ secrets.DOCKER_PASSWORD }}

    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: ./task-manager/services/${{ matrix.service }}
        file: ./task-manager/services/${{ matrix.service }}/Dockerfile
        push: true
        tags: ralf090102/${{ matrix.service }}:latest
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

### Required GitHub Secrets (additions)

```text
SMTP_USER: Email account for notification service
SMTP_PASSWORD: App password for SMTP
MEILI_MASTER_KEY: Meilisearch master key
MINIO_ACCESS_KEY: MinIO admin user
MINIO_SECRET_KEY: MinIO admin password
```

---

## Helm Upgrade Strategy

After implementing each module, deploy using incremental Helm upgrades:

```bash
# Phase 1: Enable scheduler + notification
helm upgrade task-manager ./task-manager/helm-chart -n task-manager \
  --reuse-values \
  --set scheduler.enabled=true \
  --set scheduler.image.pullPolicy=Never \
  --set notification.enabled=true \
  --set notification.image.pullPolicy=Never \
  --set notification.smtp.user=$SMTP_USER \
  --set notification.smtp.password=$SMTP_PASSWORD

# Phase 2: Add MinIO + search
helm upgrade task-manager ./task-manager/helm-chart -n task-manager \
  --reuse-values \
  --set minio.enabled=true \
  --set fileService.enabled=true \
  --set fileService.image.pullPolicy=Never \
  --set meilisearch.enabled=true \
  --set searchSync.enabled=true \
  --set searchSync.image.pullPolicy=Never

# Phase 3: Add realtime + analytics + webhook
helm upgrade task-manager ./task-manager/helm-chart -n task-manager \
  --reuse-values \
  --set realtime.enabled=true \
  --set realtime.image.pullPolicy=Never \
  --set analytics.enabled=true \
  --set analytics.image.pullPolicy=Never \
  --set webhook.enabled=true \
  --set webhook.image.pullPolicy=Never

# Phase 4: Add team-service (triggers DB migration hook)
helm upgrade task-manager ./task-manager/helm-chart -n task-manager \
  --reuse-values \
  --set teamService.enabled=true \
  --set teamService.image.pullPolicy=Never
```

---

## Cluster Verification (After All Phases)

```bash
# All workloads running
kubectl get all -n task-manager

# Expected resources:
# - 8 Deployments (task-manager, notification, file, analytics, realtime, search-sync, webhook, team)
# - 2 StatefulSets (minio, meilisearch)
# - 2 CronJobs (scheduler, weekly-report)
# - 1 Job (db-migration, Helm hook)
# - 10+ Services
# - 2+ PVCs
# - 5+ Secrets
# - 3+ ConfigMaps

# Check PVCs
kubectl get pvc -n task-manager

# Check all pods are healthy
kubectl get pods -n task-manager --field-selector=status.phase!=Running

# Check CronJob history
kubectl get jobs -n task-manager

# View cluster-wide resource usage
kubectl top pods -n task-manager
kubectl top nodes

# Prometheus is scraping all services
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
# Open http://localhost:9090 → Status → Targets
# Expected: All task-manager endpoints are UP
```

---

## Best Practices & Common Pitfalls

### Microservices Best Practices

1. **Independent deployability**
   - Each service has its own Docker image, Helm template, and `values.yaml` section
   - Enable/disable via `values.yaml` without affecting other services
2. **Shared database, independent clients**
   - All services connect to the same PostgreSQL (Supabase)
   - Each service manages its own Prisma client and connection pool
   - Schema is shared — coordinated via `prisma/schema.prisma` in main app
3. **Health checks for every service**
   - Every HTTP service exposes `/health` (200 OK)
   - CronJobs don't need health checks (they run and exit)
4. **Internal service communication**
   - Services call each other via ClusterIP DNS: `http://notification-service:3004`
   - No service (except task-manager) needs an Ingress
5. **Polyglot container standardization**
   - Node.js services: `node:22-slim`, multi-stage build, TypeScript compiled in builder stage
   - Python services: `python:3.12-slim`, pip installed to `/root/.local`, `PYTHONUNBUFFERED=1`
6. **Graceful shutdown**
   - Background workers (webhook service) must handle SIGTERM
   - Fastify's `app.close()` drains in-flight requests
   - Default termination grace period is 30s

### Common Pitfalls

- **Missing Prisma client in service Dockerfile** — each service needs `npx prisma generate` during build
- **Port mismatch between Helm service and container** — Service `targetPort` must match container port
- **CronJob schedule in UTC** — K8s CronJobs run in UTC, not local timezone
- **StatefulSet without headless service** — `serviceName` field must reference a `clusterIP: None` service
- **Helm `--reuse-values` missing new keys** — New `values.yaml` keys require explicit `--set` or `-f values.yaml`
- **Python service missing `PYTHONUNBUFFERED=1`** — Logs won't appear in `kubectl logs` output
- **WebSocket connections killed by Ingress timeout** — Must set `proxy-read-timeout` annotation to a high value
- **Webhook deliveries stuck on pending** — Background worker loop may have crashed; check pod logs

---

## Resume-Worthy Skills Checklist (Additions)

### Microservices Architecture

- Building, deploying, and orchestrating 8+ microservices on Kubernetes
- Polyglot services (Node.js + Python) in the same cluster
- Event-driven communication (webhooks, notifications, real-time updates)
- Background worker pattern with retry logic and dead letter queues
- Data synchronization patterns (database → search index)

### Advanced Kubernetes

- StatefulSet with persistent volumes (MinIO, Meilisearch)
- CronJob for scheduled workloads (task scheduler, weekly reports)
- Sticky sessions (session affinity) for WebSocket connections
- Helm hooks for database migrations (pre-upgrade Job)
- ConfigMaps for runtime configuration (webhook retry policies)
- Internal service communication (ClusterIP DNS)

### Advanced Containerization

- Multi-language Docker builds (Node.js multi-stage, Python multi-stage)
- Service-specific Dockerfiles with minimal dependencies
- Multi-image CI/CD pipeline with matrix strategy
- Docker Hub repository management for 8+ images

### Advanced Helm

- Chart with 30+ templates organized by service
- Conditional deployment (enable/disable per service)
- Helm hook lifecycle management (pre-install, pre-upgrade)
- values.yaml evolution from single-service to multi-service

### Real-World Application Features

- Real-time collaboration (WebSocket gateway with presence)
- Full-text search (typo-tolerant, instant results)
- File management (S3-compatible object storage)
- Productivity analytics (aggregation queries, chart generation)
- Webhook system (HMAC-signed, retry with backoff)
- Recurring task automation (cron-driven job execution)
- Team collaboration (RBAC, shared boards, activity feed)

---

## Important Notes

- **Incremental deployment**: Enable one module at a time via `values.yaml` — verify each works before adding the next
- **Resource constraints**: Minikube with 4 CPU / 8GB RAM is the minimum for running 10+ pods simultaneously
- **Shared schema**: All services use the same Prisma schema — the main app is the source of truth for `schema.prisma`
- **Docker image management**: Build each service image separately; tag them consistently (`:latest` for dev, `:vX.Y.Z` for production)
- **Monitoring**: Each new HTTP service should expose `/api/metrics` or `/metrics` for Prometheus scraping (add ServiceMonitors)
- **Security**: Internal services trust each other (no mTLS), but should verify JWTs when handling user-specific operations

---

**Remember**: The goal is to transform a single-pod monolith into a production-grade microservices cluster. Focus on understanding how each K8s workload type works, how services communicate internally, and how to manage complexity with Helm. Each module builds on the previous one — don't skip phases.
