# Stage 2 - Phase 1 Learning Summary

This document explains the core concepts and technologies implemented in Phase 1 of the Task Manager microservices expansion. It covers Module 7 (Recurring Task Scheduler) and Module 1 (Notification Service). Each section includes real examples from your codebase.

---

## Table of Contents

1. [Microservices Architecture in a Monorepo](#microservices-architecture-in-a-monorepo)
2. [Kubernetes CronJobs](#kubernetes-cronjobs)
3. [Shared Prisma Schema Pattern](#shared-prisma-schema-pattern)
4. [The Prisma 7.8 `import.meta.url` Problem](#the-prisma-78-importmetaurl-problem)
5. [tsx as TypeScript Runtime](#tsx-as-typescript-runtime)
6. [Recurring Task Schema Design](#recurring-task-schema-design)
7. [Cron Expression Handling](#cron-expression-handling)
8. [API Design for Recurring Resources](#api-design-for-recurring-resources)
9. [Helm Chart Multi-Service Organization](#helm-chart-multi-service-organization)
10. [Docker Build Strategy for Monorepo Services](#docker-build-strategy-for-monorepo-services)
11. [Cluster Setup Automation](#cluster-setup-automation)
12. [Module-Level TypeScript Configuration](#module-level-typescript-configuration)
13. [Kubernetes Deployments for Microservices](#kubernetes-deployments-for-microservices)
14. [Internal Service-to-Service Communication](#internal-service-to-service-communication)
15. [Kubernetes Secrets for Service Credentials](#kubernetes-secrets-for-service-credentials)
16. [Health Checks: Liveness and Readiness Probes](#health-checks-liveness-and-readiness-probes)
17. [Fastify: HTTP Framework for Microservices](#fastify-http-framework-for-microservices)
18. [nodemailer and Graceful SMTP Degradation](#nodemailer-and-graceful-smtp-degradation)
19. [The Service Selector Label Bug](#the-service-selector-label-bug)
20. [The `--reuse-values` Gotcha](#the---reuse-values-gotcha)
21. [Notification Model Schema Design](#notification-model-schema-design)
22. [Key Patterns and Best Practices](#key-patterns-and-best-practices)
23. [Troubleshooting](#troubleshooting)

---

## Microservices Architecture in a Monorepo

### What Is a Monorepo?

A monorepo stores multiple services or packages in a single Git repository. Instead of separate repos for each microservice, everything lives together:

```
task-manager/
├── prisma/
│   └── schema.prisma              # Shared schema (single source of truth)
├── src/                           # Main Next.js app
├── services/                      # Microservices directory
│   ├── notification/              # Module 1 (implemented)
│   ├── file-service/              # Module 2 (future)
│   ├── analytics/                 # Module 3 (future)
│   ├── realtime/                  # Module 4 (future)
│   ├── search-sync/               # Module 5 (future)
│   ├── webhook/                   # Module 6 (future)
│   ├── scheduler/                 # Module 7 (implemented)
│   └── team-service/              # Module 8 (future)
├── helm-chart/
└── Dockerfile                     # Main app
```

### Why Monorepo for Microservices?

| Monorepo Advantages | Polyrepo (Separate Repos) |
|---------------------|---------------------------|
| Shared schema — one source of truth | Schema must be copied or synced |
| Atomic commits across services | Changes require coordinated commits |
| Shared tooling and configs | Each repo needs its own setup |
| Easy local development | Must clone and link multiple repos |
| Simplified dependency management | Dependency versions can drift |

### The Scheduler as First Microservice

The recurring task scheduler is the simplest possible microservice — it has no HTTP server, no external API, and no user interface. It's a **batch job**: connect to the database, process due items, exit.

```typescript
// services/scheduler/src/index.ts (simplified)
async function run() {
  const due = await prisma.recurringTask.findMany({
    where: { active: true, nextRun: { lte: new Date() } },
  });

  for (const template of due) {
    await prisma.task.create({ data: { ...template, status: "TODO" } });
    // Update nextRun based on cron expression...
  }

  await prisma.$disconnect();  // Clean exit
}

run().catch((err) => {
  console.error("[scheduler] Fatal error:", err);
  process.exit(1);
});
```

This pattern — query, process, exit — is the foundation for understanding all future microservices.

---

## Kubernetes CronJobs

### What Is a CronJob?

A Kubernetes **CronJob** is a workload type that runs on a schedule, similar to Linux `cron`. Unlike a Deployment (which runs continuously), a CronJob creates a Job at scheduled intervals, and each Job creates a Pod that runs to completion.

```
CronJob (schedule: */5 * * * *)
  └─ Job (created every 5 minutes)
       └─ Pod (runs scheduler script, then exits)
```

### CronJob vs Deployment

| Aspect | Deployment | CronJob |
|--------|------------|---------|
| Lifecycle | Runs forever | Runs on schedule, exits |
| Use case | Web server, API | Batch processing, cleanup, reports |
| Pod restart | Auto-restart on crash | `restartPolicy: OnFailure` or `Never` |
| Scaling | Horizontal scaling | One Pod per schedule trigger |

### Your CronJob Template

```yaml
# helm-chart/templates/scheduler/cronjob.yaml
{{- if .Values.scheduler.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "task-manager.fullname" . }}-scheduler
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  schedule: {{ .Values.scheduler.schedule | quote }}
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: {{ .Values.scheduler.successfulJobsHistoryLimit }}
  failedJobsHistoryLimit: {{ .Values.scheduler.failedJobsHistoryLimit }}
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: scheduler
              image: "{{ .Values.scheduler.image.repository }}:{{ .Values.scheduler.image.tag }}"
              imagePullPolicy: {{ .Values.scheduler.image.pullPolicy }}
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: {{ include "task-manager.fullname" . }}-secrets
                      key: database-url
              resources:
                {{- toYaml .Values.scheduler.resources | nindent 16 }}
{{- end }}
```

### Key CronJob Properties

**`schedule`**: Standard cron expression (5 fields):

```
*/5 * * * *     → Every 5 minutes
0 9 * * 1       → Every Monday at 9:00 AM
0 0 1 * *       → First day of every month at midnight
```

**`concurrencyPolicy: Forbid`**: Prevents overlapping runs. If the previous Job is still running when the next schedule triggers, the new one is skipped. This is critical for the scheduler — you don't want two instances creating duplicate tasks.

**`successfulJobsHistoryLimit: 3`**: Keeps the last 3 successful Jobs for debugging. Old Jobs are automatically cleaned up.

**`failedJobsHistoryLimit: 1`**: Keeps only the last failed Job. This prevents clutter from repeated failures.

**`restartPolicy: OnFailure`**: If the Pod fails (exit code != 0), Kubernetes restarts it. If it succeeds, the Pod stays as `Completed` until history cleanup.

### Triggering a Manual Run

```bash
# Create a one-time Job from the CronJob template
kubectl create job --from=cronjob/task-manager-scheduler -n task-manager manual-test-1

# Check status
kubectl get pods -n task-manager | grep manual-test

# View logs
kubectl logs -n task-manager job/manual-test-1
```

This is useful for testing without waiting for the next scheduled run.

---

## Shared Prisma Schema Pattern

### The Problem: Schema Duplication

In a microservices architecture, multiple services need access to the same database schema. The naive approach is to copy `schema.prisma` into each service:

```
services/scheduler/prisma/schema.prisma    ← Copy 1
services/notification/prisma/schema.prisma ← Copy 2
services/webhook/prisma/schema.prisma      ← Copy 3
```

This leads to:
- **Schema drift**: One service updates the schema, others don't
- **Merge conflicts**: Changes must be manually synced
- **Confusion**: Which copy is the "real" schema?

### The Solution: Single Source of Truth

The shared schema lives in one place:

```
task-manager/
├── prisma/
│   └── schema.prisma     ← THE schema (only copy)
├── src/                  ← Main app generates from here
└── services/
    └── scheduler/
        └── Dockerfile    ← Copies shared schema, generates fresh client
```

### How Each Service Uses the Shared Schema

During Docker build, each service:
1. Copies the shared `prisma/schema.prisma` into its build context
2. Runs `npx prisma generate` to create a TypeScript client
3. Uses the generated client at runtime

```dockerfile
# services/scheduler/Dockerfile (builder stage)
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/scheduler/prisma.config.ts ./
RUN npx prisma generate
```

**No generated files are committed to Git.** Each Docker build produces a fresh client, always in sync with the schema.

### The Scheduler's Minimal Prisma Config

The main app uses a `prisma.config.ts` that imports `dotenv/config`. The scheduler doesn't need `dotenv` (it gets `DATABASE_URL` from Kubernetes env vars), so it has its own minimal config:

```typescript
// services/scheduler/prisma.config.ts
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:5432/db",
  },
});
```

Note: `prisma generate` doesn't connect to the database — it only reads the schema to generate TypeScript types. The placeholder URL is harmless.

---

## The Prisma 7.8 `import.meta.url` Problem

### What Happened

Prisma 7.8 generates **TypeScript source files** (`.ts`), not compiled JavaScript. These files contain ESM-only syntax:

```typescript
// src/generated/prisma/client.ts (generated by Prisma 7.8)
import { fileURLToPath } from 'node:url'
globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))
```

`import.meta.url` is an **ES module feature** — it only works when the file is loaded as an ES module. It does NOT exist in CommonJS.

### Why `tsc` Breaks

When `tsc` compiles with `"module": "commonjs"`:

1. `import`/`export` → transformed to `require`/`exports` (CJS)
2. `import.meta.url` → **left as-is** (no CJS equivalent)
3. The compiled `.js` file contains both `exports.X = ...` (CJS) and `import.meta.url` (ESM)
4. Node.js 22 detects `import.meta` → loads file as ESM → `exports` is undefined → **crash**

```
ReferenceError: exports is not defined in ES module scope
    at file:///app/dist/generated/prisma/client.js:48:23
```

### Why the Main App Works

Next.js uses **Turbopack** (or webpack) which bundles everything at build time. The bundler resolves `import.meta.url` to a static value during compilation. Raw `tsc` + `node` cannot do this.

### Attempted Fixes (All Wrong)

| Attempt | Problem |
|---------|---------|
| `postbuild` script rewriting `import.meta.url` in compiled `.js` | Patches generated code — breaks on Prisma updates |
| Switch to ESM (`"module": "node16"`, `"type": "module"`) | Prisma generated files omit `.js` extensions in imports — Node.js ESM resolver fails |
| Copy pre-generated client from main app | Fragile relative paths; stale client if schema changes |

### The Correct Solution

Don't compile at all. Use `tsx` — a TypeScript executor that runs `.ts` files directly.

---

## tsx as TypeScript Runtime

### What Is tsx?

`tsx` is a TypeScript executor built on `esbuild`. It runs TypeScript files directly without a separate compilation step:

```bash
# Instead of:
tsc && node dist/index.js

# Use:
tsx src/index.ts
```

### Why tsx Solves the Prisma Problem

| Issue | How tsx Handles It |
|-------|-------------------|
| `import.meta.url` in generated files | `esbuild` resolves it at load time — valid ESM |
| Missing `.js` extensions in imports | `esbuild` resolves paths like a bundler — extensions optional |
| ESM/CJS interop (cron-parser is CJS) | `esbuild` handles the interop automatically |
| No compilation step needed | TypeScript is transpiled in-memory at startup |

### Scheduler package.json with tsx

```json
{
  "name": "scheduler-service",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "cron-parser": "^4.9.0",
    "tsx": "^4.19.0"
  }
}
```

Key points:
- `"type": "module"` — enables ESM mode for Node.js
- `tsx` is a **production dependency** (not devDep) — it runs in the Docker container
- `"typecheck": "tsc --noEmit"` — `tsc` is for IDE type-checking only, not compilation

### tsconfig.json for tsx Projects

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "noEmit": true
  }
}
```

- `"noEmit": true` — `tsc` never produces output files
- `"moduleResolution": "bundler"` — allows extensionless imports (matches `tsx`/`esbuild` behavior)

### Performance Tradeoff

`tsx` compiles TypeScript on every startup (~50-100ms overhead). For a CronJob that runs every 5 minutes, this is completely negligible. For a high-throughput web server, you'd want pre-compiled code.

---

## Recurring Task Schema Design

### The RecurringTask Model

```prisma
// prisma/schema.prisma
model RecurringTask {
  id          String       @id @default(cuid())
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  description String?
  priority    TaskPriority @default(MEDIUM)
  cron        String
  nextRun     DateTime
  lastRun     DateTime?
  active      Boolean      @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([active, nextRun])
}
```

### Field Design Rationale

**`cron` (String)**: Stores a standard 5-field cron expression like `"0 9 * * 1"` (every Monday 9 AM). Using raw cron strings gives maximum flexibility.

**`nextRun` (DateTime)**: When the scheduler should next create a task from this template. The scheduler queries `WHERE nextRun <= now()` to find due templates.

**`lastRun` (DateTime?)**: Nullable — records the last time a task was created. Useful for debugging and UI display.

**`active` (Boolean)**: Allows users to pause a recurring task without deleting it.

### Composite Index: `@@index([active, nextRun])`

This index optimizes the scheduler's main query:

```typescript
const due = await prisma.recurringTask.findMany({
  where: { active: true, nextRun: { lte: now } },
});
```

The composite index allows PostgreSQL to find active tasks with due `nextRun` values without scanning the entire table.

### Cascade Delete

```prisma
user User @relation(fields: [userId], references: [id], onDelete: Cascade)
```

When a user is deleted, all their recurring tasks are automatically deleted. This prevents orphaned records.

---

## Cron Expression Handling

### What Is cron-parser?

`cron-parser` is a Node.js library that parses cron expressions and computes date/time values:

```typescript
import cronParser from "cron-parser";

// Validate a cron expression
const interval = cronParser.parseExpression("0 9 * * 1");

// Get the next execution time
const nextRun = interval.next().toDate();
// → Mon Jun 16 2025 09:00:00 GMT+0000
```

### Cron Expression Format

Standard 5-field cron:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of the month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of the week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

Common patterns:

| Expression | Meaning |
|------------|---------|
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour at minute 0 |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 0 1 * *` | First day of every month at midnight |
| `*/30 9-17 * * 1-5` | Every 30 minutes during business hours on weekdays |

### Using cron-parser in the API

When creating a recurring task, the API validates the cron expression and computes the initial `nextRun`:

```typescript
// src/app/api/recurring/route.ts
try {
  cronParser.parseExpression(cron);
} catch {
  return NextResponse.json(
    { error: "Invalid cron expression" },
    { status: 400 }
  );
}

const interval = cronParser.parseExpression(cron);
const nextRun = interval.next().toDate();
```

### Using cron-parser in the Scheduler

When the scheduler processes a due template, it computes the next run time:

```typescript
// services/scheduler/src/index.ts
const interval = cronParser.parseExpression(template.cron, {
  currentDate: now,
});
const nextRun = interval.next().toDate();

await prisma.recurringTask.update({
  where: { id: template.id },
  data: { lastRun: now, nextRun },
});
```

The `currentDate: now` option ensures the next run is calculated from the current time, not from when the template was created.

---

## API Design for Recurring Resources

### CRUD Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/recurring` | List user's recurring tasks |
| `POST` | `/api/recurring` | Create a new recurring task |
| `PATCH` | `/api/recurring/[id]` | Update (title, cron, active, etc.) |
| `DELETE` | `/api/recurring/[id]` | Delete a recurring task |

### POST: Create with Validation

```typescript
// src/app/api/recurring/route.ts
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = recurringTaskCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Validate cron expression
  try {
    cronParser.parseExpression(parsed.data.cron);
  } catch {
    return NextResponse.json(
      { error: "Invalid cron expression" },
      { status: 400 }
    );
  }

  // Compute initial nextRun
  const interval = cronParser.parseExpression(parsed.data.cron);
  const nextRun = interval.next().toDate();

  const recurring = await prisma.recurringTask.create({
    data: { ...parsed.data, nextRun, userId: session.user.id },
  });

  return NextResponse.json(recurring, { status: 201 });
}
```

### PATCH: Recompute nextRun When Cron Changes

```typescript
// src/app/api/recurring/[id]/route.ts
if (parsed.data.cron && parsed.data.cron !== existing.cron) {
  const interval = cronParser.parseExpression(parsed.data.cron);
  data.nextRun = interval.next().toDate();
}
```

If the user changes the cron expression, the `nextRun` is recalculated so the new schedule takes effect immediately.

### Zod Validation Schemas

```typescript
// src/lib/validations.ts
export const recurringTaskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  cron: z.string().min(1, "Cron expression is required"),
});

export const recurringTaskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  cron: z.string().min(1).optional(),
  active: z.boolean().optional(),
});
```

Note that every field in the update schema is `.optional()` — PATCH allows partial updates.

---

## Helm Chart Multi-Service Organization

### Template Subdirectory Structure

As the Helm chart grows to support multiple services, templates are organized into subdirectories:

```
helm-chart/templates/
├── _helpers.tpl                  # Shared helper functions
├── secret.yaml                   # Shared secrets (all services use same DB)
├── task-manager/                 # Main app templates
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── servicemonitor.yaml
└── scheduler/                    # Scheduler service templates
    └── cronjob.yaml
```

### Why Subdirectories?

Without subdirectories, all templates are flat in `templates/`. As services are added (notification, webhook, analytics...), this becomes unmanageable. Subdirectories keep related templates together.

### Conditional Rendering with `{{- if }}`

Each service section in `values.yaml` has an `enabled` flag:

```yaml
# values.yaml
scheduler:
  enabled: true
  schedule: "*/5 * * * *"
  image:
    repository: ralf090102/scheduler-service
    pullPolicy: IfNotPresent
    tag: latest
```

The template uses this to conditionally render:

```yaml
{{- if .Values.scheduler.enabled }}
apiVersion: batch/v1
kind: CronJob
# ...
{{- end }}
```

This allows disabling individual services without removing templates.

### Shared Secrets

All services reference the same Kubernetes Secret for database access:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: {{ include "task-manager.fullname" . }}-secrets
        key: database-url
```

The Secret is created once (in `secret.yaml`) and shared across all services.

---

## Docker Build Strategy for Monorepo Services

### Build Context: The Entire `task-manager/`

For the scheduler to access the shared Prisma schema, the Docker build context is the `task-manager/` directory (not `services/scheduler/`):

```bash
minikube image build \
  -t ralf090102/scheduler-service:latest \
  -f services/scheduler/Dockerfile \
  .
```

- `.` — build context is `task-manager/`
- `-f services/scheduler/Dockerfile` — Dockerfile location

### Multi-Stage Dockerfile

```dockerfile
# Stage 1: Production dependencies
FROM node:22-slim AS deps
WORKDIR /app
COPY services/scheduler/package.json services/scheduler/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 2: Build (generate Prisma client)
FROM node:22-slim AS builder
WORKDIR /app
COPY services/scheduler/package.json services/scheduler/package-lock.json* ./
RUN npm ci
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/scheduler/prisma.config.ts ./
RUN npx prisma generate
COPY services/scheduler/tsconfig.json ./
COPY services/scheduler/src/ ./src/

# Stage 3: Production runner
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
```

### Stage Breakdown

| Stage | Purpose | What It Contains |
|-------|---------|-----------------|
| `deps` | Install production deps (incl. `tsx`) | `node_modules`, `package.json` |
| `builder` | Generate Prisma client from shared schema | `src/generated/prisma/`, `src/index.ts` |
| `runner` | Minimal runtime | `node_modules`, `package.json`, `src/` |

### Why `package.json` Is in the Runner

The `package.json` contains `"type": "module"`. Without it in the runner container, Node.js treats `.js` files as CommonJS, which breaks `tsx`'s ESM module resolution.

### .dockerignore

The root `.dockerignore` excludes `src/generated`:

```
src/generated
```

This is correct because:
- The **main app** generates Prisma client during Docker build (`npx prisma generate`)
- The **scheduler** copies `prisma/schema.prisma` and generates its own client during build
- Neither needs pre-generated files from the build context

---

## Cluster Setup Automation

### The setup-cluster.sh Script

A bash script that automates the full cluster setup:

```bash
# Full teardown + rebuild
./setup-cluster.sh

# Reuse existing cluster
./setup-cluster.sh --skip-recreate
```

### What the Script Does

| Step | Action | Purpose |
|------|--------|---------|
| 1 | Delete & recreate Minikube (or start existing) | Clean cluster state |
| 2 | Enable NGINX Ingress | Route HTTP traffic |
| 3 | Verify cluster health | Ensure ingress is ready |
| 4 | Create `services/` directories | Ensure structure exists |
| 5 | Build Docker image in Minikube | Image available to cluster |
| 6 | Deploy via Helm | Create K8s resources |
| 7 | Install monitoring stack | Prometheus + Grafana |
| 8 | Enable ServiceMonitor | Connect metrics pipeline |
| 9 | Verify | Check pods, metrics, scraping |

### Smart CRD Detection

The script checks if the ServiceMonitor CRD already exists:

```bash
if kubectl get crd servicemonitors.monitoring.coreos.com >/dev/null 2>&1; then
    # Monitoring already installed — deploy with monitoring enabled
else
    # Fresh cluster — deploy without monitoring, install it, then upgrade
fi
```

This makes the script idempotent — safe to re-run with `--skip-recreate`.

### Reading Secrets from .env

```bash
DATABASE_URL=$(grep -E '^\s*DATABASE_URL\s*=' "$ENV_FILE" | sed -E 's/.*=\s*"([^"]*)".*/\1/' | head -1)
NEXTAUTH_SECRET=$(grep -E '^\s*AUTH_SECRET\s*=' "$ENV_FILE" | sed -E 's/.*=\s*"([^"]*)".*/\1/' | head -1)
```

The script reads credentials from the `.env` file instead of hardcoding them.

---

## Module-Level TypeScript Configuration

### The Problem: Cross-Compilation

The main app's `tsconfig.json` uses `**/*.ts` in its `include` field. Without exclusion, `tsc` picks up the scheduler's source files and tries to type-check them with the main app's TypeScript settings (which don't match the scheduler's ESM/tsx setup).

### The Fix: Exclude `services/`

```json
// task-manager/tsconfig.json
{
  "compilerOptions": { ... },
  "include": ["**/*.ts", "**/*.tsx", ...],
  "exclude": ["node_modules", "services"]
}
```

Each service has its own `tsconfig.json` with settings appropriate for its module system and runtime.

---

## Kubernetes Deployments for Microservices

### From CronJob to Deployment

The scheduler (Module 7) uses a **CronJob** — it runs, does its work, and exits. The notification service (Module 1) is a **long-running HTTP server** — it must stay alive to accept incoming requests at any time. This requires a **Deployment**.

```
CronJob (scheduler):     Start → Process → Exit → (wait) → Start → Process → Exit ...
Deployment (notification): Start → Listen on port 3004 → (serve requests forever)
```

### Deployment Template

```yaml
# helm-chart/templates/notification/deployment.yaml
{{- if .Values.notification.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "task-manager.fullname" . }}-notification
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: notification
spec:
  replicas: 1
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: notification
  template:
    metadata:
      labels:
        {{- include "task-manager.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: notification
    spec:
      containers:
        - name: notification
          image: "{{ .Values.notification.image.repository }}:{{ .Values.notification.image.tag }}"
          ports:
            - name: http
              containerPort: 3004
          # ... env, probes, resources
{{- end }}
```

### Key Differences from the CronJob

| Aspect | CronJob (Scheduler) | Deployment (Notification) |
|--------|---------------------|--------------------------|
| Workload type | `batch/v1/CronJob` | `apps/v1/Deployment` |
| Lifecycle | Run on schedule, exit | Run continuously |
| Pod restart | `restartPolicy: OnFailure` | Managed by Deployment (always restart) |
| Probes | Not applicable | Liveness + Readiness required |
| Scaling | One pod per trigger | `replicas` field |
| Service | Not needed (no network) | ClusterIP Service required |

### The `app.kubernetes.io/component` Label

Every Deployment's pod template and Service selector includes a unique component label. This is **critical** — without it, the main app Service selector would match notification pods too (see [The Service Selector Label Bug](#the-service-selector-label-bug)).

---

## Internal Service-to-Service Communication

### ClusterIP Services

A **ClusterIP** Service gives a microservice a stable internal DNS name and IP address. It's only reachable from inside the cluster — no external access.

```
Main app (Next.js, port 3000)
    │
    │  HTTP POST http://task-manager-notification:3004/notify/due-soon
    │
    ▼
Notification Service (ClusterIP, port 3004)
    │
    ├──► PostgreSQL (Supabase)
    └──► SMTP Server (if configured)
```

### Service Template

```yaml
# helm-chart/templates/notification/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "task-manager.fullname" . }}-notification
spec:
  type: ClusterIP               # Internal only — no Ingress
  ports:
    - port: 3004                # Service port (what callers connect to)
      targetPort: http          # Container port name (resolves to 3004)
      name: http
  selector:
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/instance: task-manager
    app.kubernetes.io/component: notification
```

### DNS Resolution

Kubernetes has a built-in DNS server (CoreDNS). When the main app calls `http://task-manager-notification:3004/health`, CoreDNS resolves the service name to the ClusterIP:

```
task-manager-notification  →  10.100.79.245  (ClusterIP)
```

The ClusterIP then load-balances to one of the matching pods.

### Why No Ingress?

The notification service is **internal-only**. Users never access it directly — only the main app (or scheduler) calls it. Adding an Ingress would expose it to the internet, which is unnecessary and insecure.

```
Browser ──► NGINX Ingress ──► task-manager (port 3000)
                                   │
                                   ├──► task-manager-notification (port 3004)  [internal only]
                                   └──► PostgreSQL [external]
```

### Testing Internal Communication

Minikube's Docker images are slim (no `curl` or `wget`). Use Node.js's built-in `fetch`:

```bash
kubectl exec deployment/task-manager -n task-manager -- \
  node -e "fetch('http://task-manager-notification:3004/health').then(r=>r.text()).then(t=>console.log(t))"
# Output: {"status":"ok"}
```

---

## Kubernetes Secrets for Service Credentials

### What Are Secrets?

Kubernetes **Secrets** store sensitive data like passwords, API keys, and SMTP credentials. Unlike ConfigMaps (plaintext), Secrets are base64-encoded and can be restricted via RBAC.

### Notification Service Secrets

The notification service needs two types of credentials:
1. **DATABASE_URL** — shared with the main app (from `task-manager-secrets`)
2. **SMTP credentials** — unique to the notification service (from `task-manager-notification-secret`)

### Secret Template

```yaml
# helm-chart/templates/notification/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "task-manager.fullname" . }}-notification-secret
type: Opaque
data:
  smtpUser: {{ .Values.notification.smtp.user | b64enc | quote }}
  smtpPassword: {{ .Values.notification.smtp.password | b64enc | quote }}
```

The `b64enc` Helm function base64-encodes the values (Kubernetes requires base64 in Secrets).

### Injecting Secrets into Pods

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: task-manager-secrets           # Shared secret
        key: database-url
  - name: SMTP_USER
    valueFrom:
      secretKeyRef:
        name: task-manager-notification-secret  # Service-specific secret
        key: smtpUser
```

### Shared vs Service-Specific Secrets

| Secret | Used By | Contents |
|--------|---------|----------|
| `task-manager-secrets` | Main app, scheduler, notification | `database-url`, `nextauth-secret`, etc. |
| `task-manager-notification-secret` | Notification only | `smtpUser`, `smtpPassword` |

Shared secrets avoid duplication. Service-specific secrets keep each service's credentials isolated.

---

## Health Checks: Liveness and Readiness Probes

### Why Probes Matter for Long-Running Services

A CronJob runs and exits — if it fails, Kubernetes knows from the exit code. A Deployment runs forever — Kubernetes needs another way to know if the service is healthy.

### Two Types of Probes

**Liveness Probe**: "Is the pod alive?" If this fails, Kubernetes **restarts** the pod.

**Readiness Probe**: "Is the pod ready to serve traffic?" If this fails, Kubernetes **removes the pod from the Service** (stops sending requests to it) but doesn't restart it.

```
Pod states with probes:
  Starting → [Readiness fails] → Not in Service load balancer
           → [Readiness passes] → Receives traffic
           → [Liveness fails] → Restarted
```

### Probe Configuration

```yaml
livenessProbe:
  httpGet:
    path: /health        # Must return 200
    port: http           # Port name from container spec
  initialDelaySeconds: 10  # Wait 10s before first check
  periodSeconds: 30         # Check every 30s

readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 5   # Check sooner (5s)
  periodSeconds: 10         # Check more frequently (10s)
```

### The `/health` Endpoint

```typescript
// services/notification/src/index.ts
app.get("/health", async () => ({ status: "ok" }));
```

Fastify returns `{"status":"ok"}` with HTTP 200. This is enough for liveness/readiness — the probe only cares about the HTTP status code.

### Why `initialDelaySeconds` Matters

The service needs time to start (Fastify initialization, Prisma client connection). If the probe starts too early, it fails and Kubernetes might restart the pod in a crash loop:

```
CrashLoopBackOff:
  Start → Probe fails (too early) → Restart → Probe fails → Restart → ...
```

`initialDelaySeconds: 10` gives the service 10 seconds to boot before the first probe.

---

## Fastify: HTTP Framework for Microservices

### What Is Fastify?

**Fastify** is a high-performance Node.js web framework. It's lighter than Express and includes built-in JSON schema validation and structured logging (Pino).

### Why Fastify for Microservices?

| Feature | Express | Fastify |
|---------|---------|---------|
| Performance | Good | ~2x faster |
| Logging | Manual (morgan) | Built-in (Pino, JSON) |
| Schema validation | Manual (joi/zod) | Built-in (JSON Schema) |
| Plugin ecosystem | Large | Growing, focused |

### Notification Service with Fastify

```typescript
import Fastify from "fastify";

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
});

app.get("/health", async () => ({ status: "ok" }));

app.post("/notify/due-soon", async () => {
  // ... query tasks, send emails, create notifications
  return { notified: tasks.length };
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
```

### Structured JSON Logging

Fastify uses Pino by default. Every request is logged as structured JSON:

```json
{"level":30,"time":1781577018428,"msg":"incoming request","req":{"method":"GET","url":"/health"}}
{"level":30,"time":1781577018429,"msg":"request completed","res":{"statusCode":200},"responseTime":0.33}
```

This is machine-parseable — ideal for log aggregation (ELK, Loki, Datadog).

### `host: "0.0.0.0"` Is Critical

```typescript
await app.listen({ port: 3004, host: "0.0.0.0" });
```

If you use `localhost` or `127.0.0.1`, the service only accepts connections from itself. In Kubernetes, the Service routes traffic to the pod's IP — which is NOT localhost. `0.0.0.0` binds to all interfaces, allowing Kubernetes to forward traffic to the container.

---

## nodemailer and Graceful SMTP Degradation

### What Is nodemailer?

**nodemailer** is the standard Node.js library for sending emails via SMTP.

### Creating an SMTP Transporter

```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,       // e.g., "smtp.gmail.com"
  port: parseInt(process.env.SMTP_PORT || "587"),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});
```

### Graceful Degradation: No SMTP, No Problem

In development, SMTP credentials are typically empty. If the service crashes when `SMTP_HOST` is undefined, it can't even create in-app notifications. The solution: make the transporter optional.

```typescript
const smtpHost = process.env.SMTP_HOST;
const transporter = smtpHost
  ? nodemailer.createTransport({ host: smtpHost, /* ... */ })
  : null;

async function sendEmail(to: string, subject: string, text: string) {
  if (!transporter) {
    app.log.info({ to, subject }, "[notification] SMTP not configured, skipping email");
    return;
  }
  // ... send email
}
```

This way:
- **With SMTP**: Sends emails + creates in-app notifications
- **Without SMTP**: Skips emails + creates in-app notifications (logged for debugging)

The service always works, regardless of SMTP configuration.

---

## The Service Selector Label Bug

### What Happened

After deploying the notification service, accessing `http://task-manager.local/dashboard` returned:

```json
{"message":"Route GET:/dashboard not found","error":"Not Found","statusCode":404}
```

This is a **Fastify** error (from the notification service), not a Next.js error. The NGINX Ingress was routing traffic to the notification pod instead of the main app pod.

### Root Cause: Shared Labels

Both pods share the same base labels from `task-manager.selectorLabels`:

```
app.kubernetes.io/name: task-manager
app.kubernetes.io/instance: task-manager
```

The main app Service selector used ONLY these base labels:

```yaml
# task-manager service selector (BEFORE fix)
selector:
  app.kubernetes.io/name: task-manager       # ← matches BOTH pods!
  app.kubernetes.io/instance: task-manager    # ← matches BOTH pods!
```

Kubernetes Services route traffic to **any pod** matching the selector. Since the notification pod also had these labels, the Service load-balanced across both pods:

```
Incoming request → task-manager Service → 50% chance → main app pod (Next.js, port 3000) ✓
                                          50% chance → notification pod (Fastify, port 3004) ✗
```

Fastify received requests for `/dashboard` (a Next.js route) and returned 404.

### The Fix: Component Labels

Add a unique `app.kubernetes.io/component` label to each service's pod template AND service selector:

```yaml
# Main app (AFTER fix)
selector:
  app.kubernetes.io/name: task-manager
  app.kubernetes.io/instance: task-manager
  app.kubernetes.io/component: app          # ← NEW: only matches main app pods

# Notification service (already correct)
selector:
  app.kubernetes.io/name: task-manager
  app.kubernetes.io/instance: task-manager
  app.kubernetes.io/component: notification  # ← only matches notification pods
```

### Verifying the Fix

```bash
# Check which pods the Service routes to
kubectl get endpoints task-manager -n task-manager
# BEFORE fix: 10.244.0.73:3000, 10.244.0.74:3004  (two endpoints!)
# AFTER fix:  10.244.0.77:3000                     (one endpoint)
```

### The Rule

**Every service's Deployment pod template and Service selector must include a unique `app.kubernetes.io/component` label.** This prevents label collision when multiple services share base Helm labels.

---

## The `--reuse-values` Gotcha

### What Happened

After adding the `notification:` section to `values.yaml`, running:

```bash
helm upgrade task-manager ./helm-chart --namespace task-manager \
  --reuse-values --set notification.enabled=true
```

Failed with:

```
Error: nil pointer evaluating interface {}.user
```

### Root Cause

`--reuse-values` uses the **previous release's values**, NOT the current `values.yaml`. Since the previous release didn't have a `notification:` section, `notification.smtp.user` was nil — causing the template's `b64enc` function to fail.

```
values.yaml (has notification:)    ← NOT read by --reuse-values
previous release values           ← Used instead (no notification:)
```

### The Fix: Pass All New Keys via `--set`

On first deployment of a new service, ALL its values must be passed via `--set`:

```bash
helm upgrade task-manager ./helm-chart --namespace task-manager \
  --reuse-values \
  --set notification.enabled=true \
  --set notification.image.repository=ralf090102/notification-service \
  --set notification.image.tag=latest \
  --set notification.image.pullPolicy=Never \
  --set notification.smtp.host="" \
  --set notification.smtp.port="587" \
  --set notification.smtp.from="noreply@taskmanager.local" \
  --set notification.smtp.user="" \
  --set notification.smtp.password="" \
  --set notification.resources.limits.cpu=250m \
  --set notification.resources.limits.memory=256Mi \
  --set notification.resources.requests.cpu=100m \
  --set notification.resources.requests.memory=128Mi
```

After the first deploy, the values are **persisted** in the release. Subsequent upgrades only need `--reuse-values`:

```bash
helm upgrade task-manager ./helm-chart --namespace task-manager --reuse-values
```

### Alternative: `--reset-values`

`--reset-values` re-reads `values.yaml` from scratch. This picks up new keys automatically, but you must re-pass ALL overrides (secrets, image pull policies):

```bash
helm upgrade task-manager ./helm-chart --namespace task-manager \
  --reset-values \
  --set secrets.databaseUrl=<URL> \
  --set secrets.nextauthSecret=<SECRET> \
  --set image.pullPolicy=Never \
  # ... (all other overrides)
```

---

## Notification Model Schema Design

### The Notification Model

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

### Field Design Rationale

**`type` (String)**: Stores the notification category. Using a plain String (not an enum) allows adding new types without schema migrations.

**`message` (String)**: Pre-rendered text ready for display. The notification service computes the message at creation time, so the frontend just displays it — no template rendering needed.

**`read` (Boolean)**: Tracks whether the user has seen this notification. Used for badge counts ("3 unread notifications").

**`taskId` (String?)**: Nullable — links to a task if the notification is task-related. Allows the frontend to navigate to the task when the notification is clicked.

### Index Strategy

```prisma
@@index([userId])
```

The main query pattern is "get all notifications for user X, newest first":

```sql
SELECT * FROM "Notification" WHERE "userId" = ? ORDER BY "createdAt" DESC;
```

The index on `userId` makes this query fast even with millions of notifications.

### Cascade Delete

```prisma
user User @relation(fields: [userId], references: [id], onDelete: Cascade)
```

When a user is deleted, all their notifications are automatically cleaned up. No orphaned records.

### Dual Notification Strategy

The notification service creates **two types** of notifications simultaneously:

1. **In-app notification** — a `Notification` record in the database (displayed in the UI)
2. **Email notification** — sent via SMTP (if configured)

```typescript
// Both happen in the same endpoint:
await sendEmail(task.user.email, subject, text);           // Email (optional)
await prisma.notification.create({                          // In-app (always)
  data: { userId: task.userId, type: "due_soon", message, taskId: task.id },
});
```

This ensures users are always notified in-app, even if email is not configured.

---

## Key Patterns and Best Practices

### 1. Microservice Independence

Each service should be independently deployable. The scheduler can be rebuilt, redeployed, or rolled back without affecting the main app.

### 2. Shared Schema, Independent Clients

The Prisma schema is shared (one file), but each service generates its own client during Docker build. No service depends on another service's generated files.

### 3. tsx for Non-Bundled TypeScript

When a service runs outside a bundler (Next.js, webpack, esbuild), use `tsx` instead of `tsc + node`. This avoids Prisma 7.8's `import.meta.url` incompatibility with CJS compilation.

### 4. Idempotent Deployment Scripts

Use `helm upgrade --install` instead of `helm install`. This handles both fresh installs and upgrades with the same command.

### 5. Conditional Helm Templates

Use `{{- if .Values.scheduler.enabled }}` to allow toggling services without removing templates. This is essential when deploying to different environments (dev might have all services, prod might have a subset).

### 6. Concurrency Control for Batch Jobs

Always set `concurrencyPolicy: Forbid` on CronJobs that modify data. Without it, overlapping runs can create duplicate records.

### 7. Error Isolation in Batch Processing

```typescript
for (const template of due) {
  try {
    // Process template
  } catch (err) {
    console.error(`Failed to process template ${template.id}:`, err);
    // Continue to next template — don't fail the entire batch
  }
}
```

One failed template shouldn't prevent processing the rest.

### 8. Clean Exit

```typescript
await prisma.$disconnect();

run().catch((err) => {
  console.error("[scheduler] Fatal error:", err);
  process.exit(1);
});
```

Always disconnect from the database and exit with appropriate codes. Exit code 0 = success, 1 = failure (Kubernetes uses this to determine if the Pod succeeded).

---

## Troubleshooting

### Issue 1: `exports is not defined in ES module scope`

**Cause**: Prisma 7.8 generates `.ts` files with `import.meta.url`. When compiled with `tsc` to CommonJS, Node.js detects the ESM syntax and fails.

**Solution**: Use `tsx` instead of `tsc + node`. See the [tsx section](#tsx-as-typescript-runtime).

### Issue 2: `Cannot find module './generated/prisma/client.ts'`

**Cause**: The scheduler's source imports from `./generated/prisma/client.ts`, but the Prisma client hasn't been generated yet (it's generated during Docker build).

**Solution**: This error only occurs during local `npm run type-check` on the main app. Exclude `services/` in the main `tsconfig.json`:

```json
"exclude": ["node_modules", "services"]
```

### Issue 3: CronJob Pod stays in `Error` state

**Cause**: The Docker image can't be found or fails to start.

**Diagnosis**:
```bash
kubectl logs -n task-manager <pod-name>
kubectl describe pod -n task-manager <pod-name>
```

Common causes:
- `image.pullPolicy` not set to `Never` for local Minikube images
- Missing `DATABASE_URL` environment variable
- Prisma client not generated during Docker build

### Issue 4: `npm ci` fails in Docker build

**Cause**: No `package-lock.json` found.

**Solution**: Run `npm install` locally in the service directory first to generate the lock file:

```bash
cd services/scheduler
npm install
```

### Issue 5: Helm upgrade doesn't pick up new image

**Cause**: The image tag is `latest` and `pullPolicy` allows caching. Kubernetes doesn't know the image changed.

**Solution**: Restart the deployment or delete old pods:

```bash
kubectl rollout restart deployment/task-manager -n task-manager
```

For CronJobs, delete old Jobs and let the next schedule trigger create new ones:

```bash
kubectl delete jobs -n task-manager --all
```

### Issue 6: `Route GET:/dashboard not found` (Fastify 404)

**Cause**: The main app Service selector matches notification pods too (shared base labels). Traffic is load-balanced across both pods — Fastify returns 404 for Next.js routes.

**Diagnosis**:
```bash
# Check how many endpoints the Service has
kubectl get endpoints task-manager -n task-manager
# If you see TWO IPs, the selector is too broad
```

**Solution**: Add a unique `app.kubernetes.io/component` label to each service's Deployment pod template and Service selector. See [The Service Selector Label Bug](#the-service-selector-label-bug).

### Issue 7: `nil pointer evaluating interface {}.user`

**Cause**: `--reuse-values` uses the previous release's values, not the current `values.yaml`. New keys added to `values.yaml` (like `notification.smtp.user`) are nil.

**Solution**: Pass ALL new keys via `--set` on first deploy. See [The `--reuse-values` Gotcha](#the---reuse-values-gotcha).

### Issue 8: `InvalidImageName` on notification pod

**Cause**: Image repository/tag are empty because `--reuse-values` didn't pick up the new `notification.image` values from `values.yaml`.

**Diagnosis**:
```bash
kubectl describe pod -l app.kubernetes.io/component=notification -n task-manager | findstr Image
# Image:  :    ← Both repository and tag are empty
```

**Solution**: Pass image values via `--set` on first deploy:
```bash
--set notification.image.repository=ralf090102/notification-service
--set notification.image.tag=latest
```

### Issue 9: Cannot test internal service (no curl/wget)

**Cause**: Slim Docker images (`node:22-slim`) don't include `curl` or `wget`.

**Solution**: Use Node.js's built-in `fetch` API:
```bash
kubectl exec deployment/task-manager -n task-manager -- \
  node -e "fetch('http://task-manager-notification:3004/health').then(r=>r.text()).then(t=>console.log(t))"
```

---

## What You've Learned in Stage 2 - Phase 1

### Technologies Mastered:
- Microservices architecture in a monorepo
- Kubernetes CronJob workload type (Module 7)
- Kubernetes Deployment workload type (Module 1)
- ClusterIP Services for internal communication
- Kubernetes Secrets for SMTP credentials
- Health checks: liveness and readiness probes
- Shared Prisma schema across services
- `tsx` as a TypeScript runtime (vs `tsc` + `node`)
- `cron-parser` for schedule computation
- Fastify HTTP framework with structured logging
- `nodemailer` for SMTP email delivery
- Graceful service degradation (optional SMTP)
- Helm chart multi-service organization
- Docker builds with shared monorepo context
- Bash cluster setup automation

### Core Concepts:
- CronJob lifecycle (schedule → Job → Pod → exit)
- Deployment lifecycle (start → serve → restart on failure)
- ClusterIP DNS resolution for internal services
- `concurrencyPolicy: Forbid` for data safety
- ESM vs CommonJS module systems
- `import.meta.url` and why it breaks `tsc`
- Conditional Helm template rendering
- Prisma client generation during Docker build
- Idempotent deployment scripts
- Liveness vs Readiness probes
- Service label selectors and collision risks
- `--reuse-values` behavior and limitations

### Best Practices:
- Single source of truth for database schema
- Each service generates its own Prisma client
- Error isolation in batch processing
- Clean database disconnection on exit
- Module-level TypeScript configuration
- `.dockerignore` to optimize build context
- Unique `app.kubernetes.io/component` label per service
- Graceful degradation when external services (SMTP) are unavailable
- Pre-rendered notification messages for frontend simplicity
- Dual notification strategy (in-app + email)

### Troubleshooting Skills:
- Diagnosing ESM/CJS module conflicts
- Debugging CronJob pod failures
- Fixing TypeScript cross-compilation issues
- Manual CronJob triggering for testing
- Debugging Service selector label collisions (traffic routing to wrong pod)
- Testing internal service communication without curl/wget
- Fixing `--reuse-values` nil pointer errors for new Helm keys

---

## Next Steps: Phase 2

In Phase 2, you'll learn:
- StatefulSet for persistent storage (MinIO, Meilisearch)
- Headless Services for direct pod access
- File upload/download microservice
- S3-compatible object storage (MinIO)
- Full-text search indexing (Meilisearch)

This will expand the architecture with stateful workloads and data-heavy services.
