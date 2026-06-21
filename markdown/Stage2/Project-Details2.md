# Stage 2 - Phase 1, 2 & 3 Learning Summary

This document explains the core concepts and technologies implemented in Phases 1-3 of the Task Manager microservices expansion. It covers Module 7 (Recurring Task Scheduler), Module 1 (Notification Service), Module 2 (File Service + MinIO), Module 5 (Search Sync + Meilisearch), Module 4 (Real-time WebSocket Gateway), and Module 3 (Analytics & Reporting Service). Each section includes real examples from your codebase.

---

## Table of Contents

### Phase 1: Scheduler + Notification

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

### Phase 2: File Service + MinIO + Meilisearch

24. [Kubernetes StatefulSet](#kubernetes-statefulset)
25. [PersistentVolumeClaims and volumeClaimTemplates](#persistentvolumeclaims-and-volumeclaimtemplates)
26. [Headless Service (clusterIP: None)](#headless-service-clusterip-none)
27. [MinIO: S3-Compatible Object Storage](#minio-s3-compatible-object-storage)
28. [AWS SDK v3 S3 Client](#aws-sdk-v3-s3-client)
29. [The initContainer Pattern for Service Dependencies](#the-initcontainer-pattern-for-service-dependencies)
30. [Exponential Backoff Retry Logic](#exponential-backoff-retry-logic)
31. [Testing ESM Services from PowerShell](#testing-esm-services-from-powershell)
32. [Docker Build OOM and the base/builder/runner Pattern](#docker-build-oom-and-the-basebuilder-pattern)
33. [The `minikube image load` Workflow](#the-minikube-image-load-workflow)
34. [File Service API Design](#file-service-api-design)
35. [AWS SDK v3 Response Body Handling](#aws-sdk-v3-response-body-handling)
36. [Meilisearch: Full-Text Search Engine](#meilisearch-full-text-search-engine)
37. [Meilisearch JavaScript Client](#meilisearch-javascript-client)
38. [Search Sync Service Architecture](#search-sync-service-architecture)
39. [Primary Key Inference Bug](#primary-key-inference-bug)
40. [Searchable vs Filterable Attributes](#searchable-vs-filterable-attributes)
41. [Bulk Reindex vs Incremental Sync](#bulk-reindex-vs-incremental-sync)
42. [Main App Search Endpoint Design](#main-app-search-endpoint-design)
43. [Phase 2 Key Patterns and Best Practices](#phase-2-key-patterns-and-best-practices)
44. [Phase 2 Troubleshooting](#phase-2-troubleshooting)

### Phase 3: Real-time WebSocket + Analytics

45. [WebSocket Protocol and Socket.io](#websocket-protocol-and-socketio)
46. [Socket.io Server Architecture](#socketio-server-architecture)
47. [JWT Authentication for WebSocket Connections](#jwt-authentication-for-websocket-connections)
48. [The `jose` Library and NextAuth JWT Decryption](#the-jose-library-and-nextauth-jwt-decryption)
49. [NGINX Ingress WebSocket Routing](#nginx-ingress-websocket-routing)
50. [Kubernetes Service Session Affinity](#kubernetes-service-session-affinity)
51. [Fire-and-Forget Event Emission Pattern](#fire-and-forget-event-emission-pattern)
52. [Frontend Socket.io Client Integration](#frontend-socketio-client-integration)
53. [Polyglot Microservices: Python + Node.js](#polyglot-microservices-python--nodejs)
54. [FastAPI Framework and ASGI](#fastapi-framework-and-asgi)
55. [asyncpg with PgBouncer Compatibility](#asyncpg-with-pgbouncer-compatibility)
56. [DATABASE_URL Cleaning for Connection Poolers](#database_url-cleaning-for-connection-poolers)
57. [Python Docker Multi-Stage Build](#python-docker-multi-stage-build)
58. [matplotlib Chart Generation in Headless Mode](#matplotlib-chart-generation-in-headless-mode)
59. [Kubernetes CronJob for Batch Reporting](#kubernetes-cronjob-for-batch-reporting)
60. [Analytics API Proxy Pattern](#analytics-api-proxy-pattern)
61. [Dashboard Widget Integration](#dashboard-widget-integration)
62. [Graceful Degradation for Optional Services](#graceful-degradation-for-optional-services)
63. [Phase 3 Key Patterns and Best Practices](#phase-3-key-patterns-and-best-practices)
64. [Phase 3 Troubleshooting](#phase-3-troubleshooting)

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
│   ├── file-service/              # Module 2 (implemented)
│   ├── analytics/                 # Module 3 (implemented)
│   ├── realtime/                  # Module 4 (implemented)
│   ├── search-sync/               # Module 5 (implemented)
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

## Next Steps: Phase 3

Phase 3 continues below with **real-time WebSocket communication** (Module 4) and **polyglot Python analytics** (Module 3). You'll learn:

- WebSocket protocol and Socket.io rooms/broadcasting (Module 4)
- JWT-based authentication for WebSocket connections
- NGINX Ingress WebSocket routing with sticky sessions
- Fire-and-forget event emission from the main app to the realtime gateway
- Frontend Socket.io client with live task board updates
- Python/FastAPI as the first polyglot service (Module 3)
- asyncpg with PgBouncer compatibility
- matplotlib chart generation in headless (server) mode
- CronJob for weekly report generation

See the Phase 3 sections below starting at [WebSocket Protocol and Socket.io](#websocket-protocol-and-socketio).

---

# Stage 2 - Phase 2 Learning Summary

Phase 2 introduces **stateful workloads** — services that own persistent data and require stable identity. This includes MinIO (S3-compatible object storage for file attachments) and Meilisearch (full-text search engine for task search). Both use StatefulSets with persistent volumes.

---

## Table of Contents (Phase 2)

24. [Kubernetes StatefulSet](#kubernetes-statefulset)
25. [PersistentVolumeClaims and volumeClaimTemplates](#persistentvolumeclaims-and-volumeclaimtemplates)
26. [Headless Service (clusterIP: None)](#headless-service-clusterip-none)
27. [MinIO: S3-Compatible Object Storage](#minio-s3-compatible-object-storage)
28. [AWS SDK v3 S3 Client](#aws-sdk-v3-s3-client)
29. [The initContainer Pattern for Service Dependencies](#the-initcontainer-pattern-for-service-dependencies)
30. [Exponential Backoff Retry Logic](#exponential-backoff-retry-logic)
31. [Testing ESM Services from PowerShell](#testing-esm-services-from-powershell)
32. [Docker Build OOM and the base/builder/runner Pattern](#docker-build-oom-and-the-basebuilder-pattern)
33. [The `minikube image load` Workflow](#the-minikube-image-load-workflow)
34. [File Service API Design](#file-service-api-design)
35. [AWS SDK v3 Response Body Handling](#aws-sdk-v3-response-body-handling)
36. [Meilisearch: Full-Text Search Engine](#meilisearch-full-text-search-engine)
37. [Meilisearch JavaScript Client](#meilisearch-javascript-client)
38. [Search Sync Service Architecture](#search-sync-service-architecture)
39. [Primary Key Inference Bug](#primary-key-inference-bug)
40. [Searchable vs Filterable Attributes](#searchable-vs-filterable-attributes)
41. [Bulk Reindex vs Incremental Sync](#bulk-reindex-vs-incremental-sync)
42. [Main App Search Endpoint Design](#main-app-search-endpoint-design)
43. [Phase 2 Key Patterns and Best Practices](#phase-2-key-patterns-and-best-practices)
44. [Phase 2 Troubleshooting](#phase-2-troubleshooting)

---

## Kubernetes StatefulSet

### Deployment vs StatefulSet

In Phase 1, all services used **Deployments** — stateless workloads where pods are interchangeable. Phase 2 introduces **StatefulSets** for services that own persistent data.

| Aspect | Deployment | StatefulSet |
|--------|------------|-------------|
| Pod names | Random (`minio-7f4b97b8cd-j6l2j`) | Sequential & stable (`minio-0`) |
| Pod identity | Interchangeable | Unique & persistent |
| Storage | Ephemeral (lost on restart) | Persistent (PVC per pod) |
| Startup order | Random/parallel | Ordered (`minio-0` → `minio-1`) |
| DNS name | Service name only | `minio-0.minio-headless` (per pod) |
| Use case | Web servers, APIs | Databases, storage engines |

### Why MinIO Needs a StatefulSet

MinIO is an **S3-compatible storage engine** — it stores files on disk. If the pod restarts, the files must survive. A Deployment would lose all data on restart because pods get new ephemeral storage. A StatefulSet binds each pod to a **PersistentVolumeClaim (PVC)** that persists across restarts.

### StatefulSet Template

```yaml
# helm-chart/templates/minio/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "task-manager.fullname" . }}-minio
spec:
  serviceName: {{ include "task-manager.fullname" . }}-minio-headless  # Required: headless service
  replicas: 1
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: minio
  template:
    metadata:
      labels:
        {{- include "task-manager.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: minio
    spec:
      containers:
        - name: minio
          image: "{{ .Values.minio.image.repository }}:{{ .Values.minio.image.tag }}"
          args: ["server", "/data", "--console-address", ":9001"]
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:           # Auto-creates a PVC per pod
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.minio.persistence.size }}
```

### Key StatefulSet Properties

**`serviceName`**: Must reference a **headless service** (clusterIP: None). This gives each pod a unique DNS name: `minio-0.minio-headless`.

**`volumeClaimTemplates`**: Automatically creates a PVC for each pod. The PVC name follows the pattern `<volumeclaim-name>-<pod-name>` (e.g., `data-minio-0`).

**Stable identity**: The pod is always named `minio-0`. If it crashes, Kubernetes recreates the same pod name with the same PVC. Data survives.

---

## PersistentVolumeClaims and volumeClaimTemplates

### What Is a PVC?

A **PersistentVolumeClaim (PVC)** is a request for storage. It asks Kubernetes: "I need 10GB of storage that I can read and write." Kubernetes finds a matching **PersistentVolume (PV)** and binds it.

```
Pod → PVC (request) → PV (actual storage) → Physical disk
```

### How StatefulSet Creates PVCs

Instead of manually creating PVCs, StatefulSet uses `volumeClaimTemplates`. Each pod gets its own PVC automatically:

```yaml
volumeClaimTemplates:
  - metadata:
      name: data           # Template name
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi
```

This creates:
- Pod `minio-0` → PVC `data-minio-0` (10Gi)
- Pod `minio-1` → PVC `data-minio-1` (10Gi) (if scaled)

### Verifying PVCs

```bash
kubectl get pvc -n task-manager
# NAME              STATUS   VOLUME                               CAPACITY   ACCESS MODES
# data-minio-0      Bound    pvc-2f106816-ce59-41d7-...           10Gi       RWO
```

**STATUS: Bound** means Kubernetes found storage and connected it. If it says **Pending**, no StorageClass is available (Minikube includes `standard` by default).

### `ReadWriteOnce` Explained

`accessModes` controls how the volume can be mounted:

| Mode | Meaning |
|------|---------|
| `ReadWriteOnce` | One node can read/write (most common) |
| `ReadOnlyMany` | Multiple nodes can read |
| `ReadWriteMany` | Multiple nodes can read/write (requires special storage) |

MinIO uses `ReadWriteOnce` because only one pod accesses the data.

### Data Persistence Across Restarts

When Minikube is stopped and restarted:
- The PVC still exists (stored in Minikube's Docker volume)
- The data (including auto-created buckets) survives
- On restart, MinIO reconnects to the same PVC

---

## Headless Service (clusterIP: None)

### What Is a Headless Service?

A standard Service has a ClusterIP — it load-balances across pods. A **headless service** has `clusterIP: None` — it doesn't load-balance. Instead, it returns the **individual pod IPs** via DNS.

```yaml
# helm-chart/templates/minio/headless-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "task-manager.fullname" . }}-minio-headless
spec:
  clusterIP: None          # ← This makes it headless
  ports:
    - port: 9000
      name: api
    - port: 9001
      name: console
  selector:
    app.kubernetes.io/component: minio
```

### Why StatefulSets Need Headless Services

StatefulSet pods have stable identities that rely on DNS:

```
DNS lookup: minio-0.minio-headless
Result:     10.244.0.211  (pod's individual IP)
```

This allows:
- Direct pod-to-pod communication (for clustered databases)
- Stable DNS names that don't change on restart
- StatefulSet's `serviceName` field to function

### Two Services for MinIO

MinIO has **two** services:

| Service | Type | Purpose |
|---------|------|---------|
| `task-manager-minio` | ClusterIP (normal) | Load-balanced access for file-service |
| `task-manager-minio-headless` | Headless (clusterIP: None) | Required by StatefulSet for DNS |

The file-service connects to `task-manager-minio:9000` (the normal ClusterIP service). The headless service exists solely to satisfy the StatefulSet requirement.

---

## MinIO: S3-Compatible Object Storage

### What Is MinIO?

**MinIO** is an open-source object storage server that implements the **S3 API**. It's like having Amazon S3 running inside your Kubernetes cluster — no cloud account needed.

```
File service → S3 API (PutObject, GetObject) → MinIO → Files on disk (PVC)
```

### Why S3-Compatible?

The S3 API is the **de facto standard** for object storage. By using S3-compatible storage:
- Code works with MinIO locally and AWS S3 in production (just change the endpoint)
- The `@aws-sdk/client-s3` npm package works out of the box
- No vendor lock-in

### MinIO Architecture in K8s

```
┌──────────────────────────────────────────────────┐
│                  Kubernetes Cluster               │
│                                                   │
│  file-service pod                                 │
│  └─ S3Client → http://task-manager-minio:9000    │
│                    │                              │
│                    ▼                              │
│  minio-0 (StatefulSet)                            │
│  ├─ Port 9000: S3 API                             │
│  ├─ Port 9001: Web Console                        │
│  └─ /data → PVC (10Gi persistent)                 │
│                                                   │
│  Services:                                        │
│  ├─ task-manager-minio (ClusterIP)                │
│  └─ task-manager-minio-headless (Headless)        │
└──────────────────────────────────────────────────┘
```

### MinIO Health Endpoints

MinIO exposes health endpoints used by Kubernetes probes and initContainers:

```
/minio/health/live   → Is MinIO running? (200/503)
/minio/health/ready  → Is MinIO ready to serve? (200/503)
```

These are used in:
- **Liveness probe**: Restart pod if MinIO is stuck
- **Readiness probe**: Remove from Service if not ready
- **initContainer**: Block file-service startup until MinIO is ready

---

## AWS SDK v3 S3 Client

### What Is @aws-sdk/client-s3?

The official AWS SDK v3 package for JavaScript. It provides a `S3Client` class that sends commands to any S3-compatible storage.

### Configuring the S3 Client

```typescript
import { S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
  region: "us-east-1",                    // Required by SDK, ignored by MinIO
  forcePathStyle: true,                   // Use path-style URLs (MinIO requirement)
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin",
  },
});
```

**`forcePathStyle: true`**: AWS S3 uses virtual-host-style URLs (`bucket.s3.amazonaws.com`). MinIO uses path-style URLs (`minio:9000/bucket`). This flag tells the SDK to use path style.

### Key S3 Commands Used

| Command | Purpose |
|---------|---------|
| `HeadBucketCommand` | Check if a bucket exists |
| `CreateBucketCommand` | Create a new bucket |
| `PutObjectCommand` | Upload a file |
| `GetObjectCommand` | Download a file |
| `DeleteObjectCommand` | Delete a file |

---

## The initContainer Pattern for Service Dependencies

### The Startup Race Condition

When MinIO and file-service start simultaneously:
1. Kubernetes schedules both pods at the same time
2. file-service starts and immediately tries to create the S3 bucket
3. MinIO hasn't finished starting yet → `ECONNREFUSED`
4. Bucket creation fails silently → uploads fail later

### The Solution: initContainer

An **initContainer** runs before the main container. Kubernetes won't start the main container until all initContainers complete successfully.

```yaml
spec:
  initContainers:
    - name: wait-for-minio
      image: busybox:1.35
      command:
        - sh
        - -c
        - 'until wget -q -O /dev/null http://task-manager-minio:9000/minio/health/live; do echo "waiting for minio"; sleep 2; done'
  containers:
    - name: file-service
      # ... main container
```

### How It Works

1. Pod starts
2. initContainer `wait-for-minio` runs
3. It polls MinIO's health endpoint every 2 seconds
4. When MinIO responds with 200, the loop exits
5. initContainer completes
6. Kubernetes starts the main `file-service` container
7. file-service can now safely create the bucket

### Why busybox?

The file-service image (`node:22-slim`) doesn't have `wget`. `busybox:1.35` is a tiny (~1.2MB) image that includes `wget`. It's the standard choice for initContainers.

### initContainer Logs

```bash
kubectl logs deployment/task-manager-file-service -n task-manager -c wait-for-minio
# Output:
# waiting for minio
# waiting for minio
# waiting for minio
# (empty line when wget succeeds and initContainer exits)
```

---

## Exponential Backoff Retry Logic

### Why Code-Level Retry Is Also Needed

The initContainer prevents the startup race condition. But MinIO could also become unreachable at runtime (network issues, restarts). The `ensureBucket()` function should retry on failure.

### Implementation

```typescript
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureBucket(attempt = 1): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    app.log.info(`[file-service] Bucket "${BUCKET_NAME}" already exists`);
    return;
  } catch {
    // Bucket doesn't exist (or MinIO unreachable) — try to create it
  }

  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
    app.log.info(`[file-service] Created bucket "${BUCKET_NAME}"`);
  } catch (err) {
    if (attempt < 5) {
      const delay = 1000 * Math.pow(2, attempt);  // 2s, 4s, 8s, 16s
      app.log.warn({ err, attempt, delay }, `[file-service] Bucket creation failed, retrying...`);
      await sleep(delay);
      return ensureBucket(attempt + 1);  // Recursive retry
    }
    app.log.error({ err }, `[file-service] Failed to create bucket after ${attempt} attempts`);
  }
}
```

### Exponential Backoff Explained

| Attempt | Delay | Formula |
|---------|-------|---------|
| 1 | 2s | `1000 * 2^1` |
| 2 | 4s | `1000 * 2^2` |
| 3 | 8s | `1000 * 2^3` |
| 4 | 16s | `1000 * 2^4` |
| 5 | (give up) | — |

Each retry waits twice as long. This prevents hammering a recovering service with requests.

---

## Testing ESM Services from PowerShell

### The Problem

Microservices use ES modules (`import`) with the `tsx` runtime. Testing from PowerShell via `kubectl exec` has three challenges:
1. `node -e "..."` runs in CommonJS context — `import` syntax fails
2. PowerShell interprets `$` in JavaScript (e.g., `$disconnect`)
3. Nested quoting across PowerShell → kubectl → sh → node is error-prone

### Method 1: Test Scripts (Recommended)

Each service has `scripts/test.ts` with reusable debug commands:

```bash
kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts bucket
kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts tasks
kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts attachments
```

The test script uses `import` statements naturally — tsx handles ESM resolution.

### Method 2: tsx + base64 (for ad-hoc one-liners)

Encode the script as base64 to avoid all escaping issues:

```powershell
$script = 'import { PrismaClient } from "./src/generated/prisma/client.ts"; console.log("hello")'
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx -e "eval(Buffer.from('$encoded','base64').toString())"
```

**Important**: `eval()` runs in CommonJS context even with `--input-type=module`. Always wrap in an async IIFE if using `await`:

```powershell
$script = '(async () => { const res = await fetch("http://localhost:3005/health"); console.log(await res.json()); })();'
```

### Why tsx Works But node Doesn't

| Issue | `node -e` | `npx tsx -e` |
|-------|-----------|--------------|
| `import` syntax | Fails (CJS context) | Works (ESM via esbuild) |
| `.ts` file imports | Fails (no TS support) | Works (in-memory transpile) |
| `import.meta.url` | Fails (CJS only) | Works (resolved by esbuild) |

---

## Docker Build OOM and the base/builder/runner Pattern

### The Problem

Minikube's Docker daemon has limited memory (~7GB shared with the host). Building images with large dependency trees (e.g., `@aws-sdk/client-s3` has 50+ sub-packages) can exhaust memory during `npm ci`:

```
npm error Exit handler never called!
npm error This is an error with npm itself.
```

This is npm being killed by the Linux OOM killer — not a code bug.

### The Root Cause: Parallel Stage Builds

The original Dockerfile had two stages that both run `npm ci`:

```dockerfile
# Stage 1 (deps): runs npm ci --omit=dev
# Stage 2 (builder): runs npm ci (full)
# Docker runs these IN PARALLEL → double memory usage
```

Docker BuildKit parallelizes independent stages. Two simultaneous `npm ci` calls can exceed available memory.

### The Solution: Single Base Stage

Restructure the Dockerfile so `npm ci` runs once in a `base` stage, then `builder` and `runner` extend it:

```dockerfile
FROM node:22-slim AS base
WORKDIR /app
COPY services/file-service/package.json services/file-service/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM base AS builder
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/file-service/prisma.config.ts ./
RUN npx prisma generate
COPY services/file-service/tsconfig.json ./
COPY services/file-service/src/ ./src/
COPY services/file-service/scripts/ ./scripts/

FROM base AS runner
RUN npm prune --omit=dev
ENV NODE_ENV=production
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/scripts/ ./scripts/
CMD ["npx", "tsx", "src/index.ts"]
```

| Stage | Extends | Purpose |
|-------|---------|---------|
| `base` | — | Single `npm ci` (all deps) |
| `builder` | `base` | Adds Prisma generate + src copy |
| `runner` | `base` | Prunes dev deps, copies from builder |

Single `npm ci` → sequential → no OOM.

### Additional Improvements

- `--mount=type=cache,target=/root/.npm` — caches npm downloads between builds
- `--no-audit --no-fund` — skips npm's audit and funding checks (reduces overhead)
- `npm prune --omit=dev` in runner — removes TypeScript, @types/* (dev deps not needed at runtime)

---

## The `minikube image load` Workflow

### When Minikube Build Fails

If `minikube image build` fails (OOM, timeout), use Docker Desktop to build and then load the image into Minikube:

```bash
# 1. Build with Docker Desktop (has more memory than Minikube's daemon)
docker build -t ralf090102/file-service:latest -f services/file-service/Dockerfile .

# 2. Load into Minikube
minikube image load ralf090102/file-service:latest

# 3. Force-remove old image before loading updates (CRITICAL!)
minikube ssh "docker rmi -f ralf090102/file-service:latest"
minikube image load ralf090102/file-service:latest

# 4. Restart the deployment
kubectl rollout restart deployment/task-manager-file-service -n task-manager
```

### Why Force-Remove Is Needed

`minikube image load` doesn't overwrite images with the same tag. If `ralf090102/file-service:latest` already exists in Minikube, loading a new image with the same tag silently keeps the **old** image. The pod continues running old code.

```bash
# Without force-remove: pod runs OLD code despite loading new image
# With force-remove: pod picks up the NEW image after restart
```

### Verifying the Image Updated

```bash
# Check the code in the running container
kubectl exec deployment/task-manager-file-service -n task-manager -c file-service -- cat src/index.ts | grep "transformToByteArray"
```

---

## File Service API Design

### Endpoints

| Method | Route | Headers | Purpose |
|--------|-------|---------|---------|
| `GET` | `/health` | — | Health check (liveness/readiness) |
| `POST` | `/upload` | `x-task-id` | Upload a file (multipart/form-data) |
| `GET` | `/download/:id` | — | Download a file by attachment ID |
| `GET` | `/attachments/:taskId` | — | List attachments for a task |
| `DELETE` | `/attachments/:id` | — | Delete an attachment |

### Upload Flow

```
Client → POST /upload (multipart, x-task-id header)
  │
  ├── file-service receives file via @fastify/multipart
  ├── Uploads to MinIO: bucket/taskId/filename
  ├── Creates Attachment record in PostgreSQL
  └── Returns: { id, taskId, filename, mimeType, size, storageKey, createdAt }
```

### Dual Storage Strategy

Each file is stored in **two** places:
1. **MinIO** — the actual file bytes (`storageKey: "taskId/filename"`)
2. **PostgreSQL** — metadata record (filename, mimeType, size, storageKey)

This separates the large binary data (MinIO) from queryable metadata (PostgreSQL).

### Attachment Schema

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

**`storageKey`**: The MinIO object key (`taskId/filename`). Used to retrieve the file from MinIO.

**Cascade Delete**: When a task is deleted, its attachment record is deleted. (Note: the MinIO object must be deleted separately via the file-service API.)

---

## AWS SDK v3 Response Body Handling

### The Problem

AWS SDK v3's `GetObjectCommand` returns the body as a `ChecksumStream`, not a standard web `ReadableStream`. Common approaches fail:

| Approach | Error |
|----------|-------|
| `reply.send(response.body)` | Empty response (Fastify can't serialize the stream) |
| `Readable.fromWeb(response.body)` | `ERR_INVALID_ARG_TYPE: Received undefined` (property is `Body`, not `body`) |
| `Readable.fromWeb(response.Body)` | `ERR_INVALID_ARG_TYPE: Received an instance of ChecksumStream` (not a web ReadableStream) |

### The Solution: `transformToByteArray()`

The AWS SDK v3 `Body` object has built-in transform methods:

```typescript
const bytes = await response.Body!.transformToByteArray();
return reply.send(Buffer.from(bytes));
```

| Method | Returns | Use Case |
|--------|---------|----------|
| `transformToByteArray()` | `Promise<Uint8Array>` | Binary files (images, PDFs) |
| `transformToString()` | `Promise<string>` | Text files |
| `transformToWebStream()` | `ReadableStream` | Streaming (advanced) |

For a general-purpose download endpoint, `transformToByteArray()` + `Buffer.from()` works for both text and binary files.

### Note on `Body` vs `body`

AWS SDK v3 uses **capital `B`**: `response.Body`, not `response.body`. The lowercase version returns `undefined`.

---

## Meilisearch: Full-Text Search Engine

### What Is Meilisearch?

**Meilisearch** is an open-source, lightning-fast search engine. It provides typo-tolerant full-text search with near-instant results (<50ms). Unlike Elasticsearch (which is complex and resource-heavy), Meilisearch is a single binary that's easy to deploy.

```
User searches "lock" → Main app → Meilisearch → Returns matching tasks in <50ms
```

### Why Meilisearch Over PostgreSQL Full-Text Search?

| Aspect | PostgreSQL FTS | Meilisearch |
|--------|----------------|-------------|
| Typo tolerance | Manual (fuzzy, trigrams) | Built-in (Levenshtein) |
| Ranking/relevance | Manual (ts_rank) | Built-in (custom ranking rules) |
| Speed on large datasets | Good (with GIN indexes) | Excellent (in-memory index) |
| Setup complexity | Low (already have PG) | Medium (separate service) |
| Index updates | Real-time (triggers) | Async (task queue) |

For a task manager with thousands of tasks, Meilisearch provides significantly better search relevance and speed than PostgreSQL FTS.

### Meilisearch Architecture in K8s

```
┌────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                       │
│                                                             │
│  Main app (Next.js)                                        │
│  ├─ GET /api/tasks/search?q=... → queries Meilisearch     │
│  │                                                          │
│  └─ MEILI_URL=http://task-manager-meilisearch:7700         │
│                                                             │
│  search-sync pod                                           │
│  ├─ POST /sync/all     → reads PostgreSQL, writes to Meili│
│  ├─ POST /sync/task    → indexes single task (incremental)│
│  └─ initContainer waits for Meilisearch health             │
│                                                             │
│  meilisearch-0 (StatefulSet)                               │
│  ├─ Port 7700: Search API                                  │
│  ├─ MEILI_ENV=production (requires master key)             │
│  └─ /meili_data → PVC (5Gi persistent)                     │
│                                                             │
│  Services:                                                 │
│  ├─ task-manager-meilisearch (ClusterIP, port 7700)       │
│  └─ task-manager-meilisearch-headless (Headless)          │
└────────────────────────────────────────────────────────────┘
```

### Production Mode and Master Key

Meilisearch has two modes:
- **Development** (`MEILI_ENV=development`): No master key required, all routes public
- **Production** (`MEILI_ENV=production`): **Master key required** (min 16 bytes), generates derived API keys

In Kubernetes, we run production mode for security. The master key is stored in a Kubernetes Secret:

```yaml
env:
  - name: MEILI_MASTER_KEY
    valueFrom:
      secretKeyRef:
        name: task-manager-meilisearch-secret
        key: masterKey
  - name: MEILI_ENV
    value: production
```

All API requests must include `Authorization: Bearer <master-key>`.

### Meilisearch Health Endpoint

```
GET /health → {"status":"available"}
```

Used by:
- **Liveness/Readiness probes**: Restart or remove pod if unhealthy
- **initContainer**: Block search-sync startup until Meilisearch is ready

---

## Meilisearch JavaScript Client

### The `meilisearch` npm Package

The official JS client provides a typed API for all Meilisearch operations:

```typescript
import { Meilisearch } from "meilisearch";

const client = new Meilisearch({
  host: process.env.MEILI_URL || "http://localhost:7700",
  apiKey: process.env.MEILI_MASTER_KEY,
});
```

**Note on class name**: The current package exports `Meilisearch` (lowercase 's'). The older export name `MeiliSearch` (capital 'S') was removed in recent versions. Always verify with:
```bash
node -e "const m = require('meilisearch'); console.log(typeof m.Meilisearch)"
```

### Key Operations

| Operation | Method | Returns |
|-----------|--------|---------|
| Create index | `client.createIndex("tasks", { primaryKey: "id" })` | `EnqueuedTask` |
| Add documents | `index.addDocuments(docs, { primaryKey: "id" })` | `EnqueuedTask` |
| Search | `index.search("query", { filter: [...] })` | `SearchResult` |
| Delete document | `index.deleteDocument(id)` | `EnqueuedTask` |
| Update settings | `index.updateSearchableAttributes([...])` | `EnqueuedTask` |
| Get stats | `index.getStats()` | `{ numberOfDocuments, ... }` |

### Async Task Model

Meilisearch operations are **asynchronous** — they return a task UID and are processed via an internal queue. The operation might not complete immediately:

```typescript
const task = await index.addDocuments(documents);
console.log(task.taskUid); // e.g., 2
// Documents may not be searchable YET — they're queued
```

This is why the `configureIndex` function on startup waits for tasks:

```typescript
const task = await meili.createIndex(INDEX_NAME, { primaryKey: "id" });
await index.waitForTask(task.taskUid, { timeOutMs: 5000 });
```

`waitForTask` polls the task status until it completes (or times out).

### Search with Filters

```typescript
const results = await index.search("lock", {
  filter: ['status = "TODO"', 'userId = "abc123"'],
  limit: 50,
});
```

Meilisearch's filter syntax:
- String values must be in **double quotes**: `status = "TODO"`
- Numeric comparisons: `priority > 3`
- AND: `status = "TODO" AND priority = "HIGH"`
- Array of filters: `['status = "TODO"', 'userId = "abc"']` (implicit AND)

---

## Search Sync Service Architecture

### The Sync Pattern

The search-sync service bridges PostgreSQL (source of truth) and Meilisearch (search index). It runs as a Fastify HTTP server on port 3006.

```
PostgreSQL ──→ search-sync service ──→ Meilisearch index
(source of truth)    (port 3006)          (search index)
```

### Why a Separate Sync Service?

| Approach | Problem |
|----------|---------|
| Main app writes to both PG and Meilisearch | Couples search logic to every CRUD endpoint |
| Main app queries Meilisearch directly | ✅ This is what we do (read side is simple) |
| Separate sync service handles writes | ✅ Decouples sync logic, can be scaled independently |

The search-sync service handles **writes** (indexing). The main app handles **reads** (searching). This separation means:
- The main app doesn't need the meilisearch sync logic
- The sync service can be restarted without affecting the main app
- Bulk reindex can be triggered independently

### Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/health` | Health check (liveness/readiness) |
| `POST` | `/sync/task` | Index a single task (called after create/update) |
| `DELETE` | `/sync/task/:id` | Remove a task from the index (called after delete) |
| `POST` | `/sync/all` | Full reindex from PostgreSQL (initial sync or rebuild) |

### Startup Configuration

On startup, the service configures the Meilisearch index:

```typescript
async function configureIndex(attempt = 1): Promise<void> {
  try {
    // Create index with explicit primary key
    try {
      const task = await meili.createIndex(INDEX_NAME, { primaryKey: "id" });
      await index.waitForTask(task.taskUid, { timeOutMs: 5000 });
    } catch {
      // Index already exists — skip
    }

    // Configure searchable and filterable attributes
    await index.updateSearchableAttributes(["title", "description"]);
    await index.updateFilterableAttributes(["status", "priority", "userId"]);
  } catch (err) {
    // Exponential backoff retry (same pattern as file-service bucket creation)
  }
}
```

This runs after the server starts listening, with the initContainer ensuring Meilisearch is already healthy.

---

## Primary Key Inference Bug

### What Happened

After the first bulk reindex (`POST /sync/all`), the index showed **0 documents** despite the response saying `{"reindexed": 3}`.

### Diagnosis

Checking the Meilisearch task queue revealed the document addition task had **failed**:

```json
{
  "uid": 2,
  "status": "failed",
  "error": {
    "message": "The primary key inference failed as the engine found 2 fields ending with `id` in their names: 'id' and 'userId'. Please specify the primary key manually using the `primaryKey` query parameter.",
    "code": "index_primary_key_multiple_candidates_found"
  }
}
```

### Root Cause

Meilisearch automatically infers the primary key by looking for fields ending with `id`. Our task documents have **two** such fields:

```
{ "id": "cmoh59n41...", "userId": "cmoh12ab3..." }
     ↑                              ↑
     candidate 1                   candidate 2
```

When multiple candidates exist, Meilisearch can't decide and fails the document addition.

### The Fix: Explicit Primary Key

Two places needed fixing:

**1. Index creation** — Pass `primaryKey` when creating the index:

```typescript
await meili.createIndex("tasks", { primaryKey: "id" });
```

**2. Document addition** — Pass `primaryKey` as a safety net:

```typescript
await index.addDocuments(documents, { primaryKey: "id" });
```

After fixing, the existing broken index must be **deleted** (primary key can't be changed on an index with failed documents):

```bash
DELETE /indexes/tasks   # Remove broken index
# Then restart search-sync to recreate it properly
```

### Lesson

When your data model has multiple fields ending with "id" (common in relational schemas: `id`, `userId`, `taskId`, `categoryId`), **always** set the primary key explicitly. Don't rely on inference.

---

## Searchable vs Filterable Attributes

### What Are Searchable Attributes?

**Searchable** attributes are the fields Meilisearch indexes for full-text search. When a user types a query, Meilisearch searches these fields:

```typescript
await index.updateSearchableAttributes(["title", "description"]);
```

- User searches "meeting" → Meilisearch matches tasks where `title` or `description` contains "meeting"
- Non-searchable fields (`id`, `userId`, `status`, `priority`, `dueDate`, `createdAt`) are **not** text-searched

### What Are Filterable Attributes?

**Filterable** attributes can be used in filter expressions. Meilisearch builds a filter index for these fields:

```typescript
await index.updateFilterableAttributes(["status", "priority", "userId"]);
```

- `filter: 'status = "TODO"'` → works (status is filterable)
- `filter: 'title = "meeting"'` → **error** (title is not filterable)

### Why Not Make Everything Both?

Every filterable attribute adds overhead to the index (Meilisearch builds separate data structures for filtering). Making everything filterable wastes memory and slows down indexing. Only mark fields that users actually filter by:

| Field | Searchable? | Filterable? | Why? |
|-------|-------------|-------------|------|
| `title` | ✅ | ❌ | Users search by text, not filter by exact title |
| `description` | ✅ | ❌ | Same as title |
| `status` | ❌ | ✅ | Users filter by status (TODO, COMPLETED), don't search "TODO" as text |
| `priority` | ❌ | ✅ | Users filter by priority |
| `userId` | ❌ | ✅ | **Security**: every search is scoped to the user's own tasks |
| `id` | ❌ | ❌ | Primary key, not searched or filtered |

### The `userId` Security Filter

The most critical filterable attribute is `userId`. Every search query includes it:

```typescript
const filters = [`userId = "${session.user.id}"`];
```

This ensures users can **only see their own tasks** in search results. Without this filter, a search would return all users' tasks — a data leak.

---

## Bulk Reindex vs Incremental Sync

### Two Sync Strategies

| Strategy | Endpoint | When to Use |
|----------|----------|-------------|
| **Bulk reindex** | `POST /sync/all` | Initial setup, after schema changes, after data corruption |
| **Incremental sync** | `POST /sync/task` | After each task create/update |
| **Delete from index** | `DELETE /sync/task/:id` | After each task delete |

### Bulk Reindex (`POST /sync/all`)

Reads ALL tasks from PostgreSQL and adds them to the index in one operation:

```typescript
app.post("/sync/all", async () => {
  const tasks = await prisma.task.findMany();
  await index.addDocuments(
    tasks.map((t) => ({
      id: t.id, title: t.title, description: t.description || "",
      status: t.status, priority: t.priority, userId: t.userId,
      dueDate: t.dueDate, createdAt: t.createdAt,
    })),
    { primaryKey: "id" }
  );
  return { reindexed: tasks.length };
});
```

**When to use**:
- First deployment (empty index)
- After Meilisearch data loss (PVC deleted)
- Periodic consistency check

**Cost**: For 1000 tasks, the operation takes ~1-2 seconds. For 1 million tasks, it could take minutes.

### Incremental Sync (`POST /sync/task`)

Indexes a single task. Intended to be called by the main app after task CRUD operations:

```typescript
app.post("/sync/task", async (req) => {
  const task = req.body;
  await index.addDocuments([{ ...task }], { primaryKey: "id" });
  return { indexed: true };
});
```

**Future integration**: The main app's task CRUD endpoints (`POST /api/tasks`, `PATCH /api/tasks/[id]`, `DELETE /api/tasks/[id]`) would call the search-sync service after successful database operations. This is fire-and-forget — if the sync fails, the database change still succeeded.

### Async Nature of Meilisearch Indexing

Both bulk and incremental operations return immediately — Meilisearch queues the work:

```json
// Response from POST /sync/all
{"reindexed": 3}

// But index stats might show 0 documents for a few seconds:
{"numberOfDocuments": 0, "isIndexing": true}
```

After 1-3 seconds, the task completes:

```json
{"numberOfDocuments": 3, "isIndexing": false}
```

This is why health checks should verify `isIndexing: false` before running tests.

---

## Main App Search Endpoint Design

### The Search Route

The main app queries Meilisearch directly — no need to go through the search-sync service for reads:

```typescript
// src/app/api/tasks/search/route.ts
import { Meilisearch } from "meilisearch";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.MEILI_URL) {
    return NextResponse.json(
      { error: "Search service not configured" },
      { status: 503 }
    );
  }

  const meili = new Meilisearch({
    host: process.env.MEILI_URL,
    apiKey: process.env.MEILI_MASTER_KEY,
  });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");

  const filters = [`userId = "${session.user.id}"`];
  if (status) filters.push(`status = "${status}"`);
  if (priority) filters.push(`priority = "${priority}"`);

  const results = await meili.index("tasks").search(q, {
    filter: filters,
    limit: 50,
  });

  return NextResponse.json(results);
}
```

### Key Design Decisions

**1. Auth-scoped search**: The `userId` filter is always applied from the session, never from user input. Users can only search their own tasks.

**2. Graceful degradation**: If `MEILI_URL` is not set (search service not deployed), the endpoint returns 503 instead of crashing. The rest of the app works normally.

**3. Optional filters**: `status` and `priority` are optional query params. Users can search with or without filters:
```
GET /api/tasks/search?q=meeting                    → all tasks containing "meeting"
GET /api/tasks/search?q=meeting&status=TODO        → TODO tasks containing "meeting"
GET /api/tasks/search?q=&status=TODO&priority=HIGH → all HIGH priority TODO tasks
```

**4. Limit 50**: Prevents returning excessively large result sets. For pagination, Meilisearch supports `offset` and `limit` parameters.

### Conditional Environment Variables

The main app deployment template only injects `MEILI_URL` and `MEILI_MASTER_KEY` when Meilisearch is enabled:

```yaml
{{- if .Values.meilisearch.enabled }}
- name: MEILI_URL
  value: "http://{{ include "task-manager.fullname" . }}-meilisearch:7700"
- name: MEILI_MASTER_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "task-manager.fullname" . }}-meilisearch-secret
      key: masterKey
{{- end }}
```

This means the search endpoint returns 503 (not configured) on deployments without Meilisearch — the app degrades gracefully.

---

## Phase 2 Key Patterns and Best Practices

### 1. StatefulSet for Persistent Data

Any service that owns data (database, storage engine, search index) should use a StatefulSet, not a Deployment. This ensures data survives pod restarts.

### 2. Headless Service Is Required

StatefulSet's `serviceName` field must reference a headless service. Without it, pods can't get stable DNS names and the StatefulSet won't function.

### 3. initContainer for Startup Ordering

When a service depends on another, use an initContainer to wait for the dependency's health endpoint. This is the Kubernetes-native way to handle startup ordering.

### 4. Code-Level Retry as Safety Net

initContainers handle startup, but runtime failures need code-level retry. Use exponential backoff to avoid overwhelming a recovering service.

### 5. Dual Storage (Object + Metadata)

Store large files in object storage (MinIO/S3) and keep only metadata in the relational database. This keeps the database fast and leverages each storage system's strengths.

### 6. Docker Build Memory Management

Use a single `base` stage with one `npm ci` call to avoid parallel builds exhausting Docker daemon memory. Add `--mount=type=cache` for faster rebuilds.

### 7. Force-Remove Before Image Load

When updating images via `minikube image load`, always `docker rmi -f` the old image first. Otherwise Minikube keeps the stale image and pods run old code.

### 8. Explicit Primary Key for Search Indexes

When your data has multiple fields ending with "id" (e.g., `id`, `userId`, `taskId`), always set the primary key explicitly when creating the Meilisearch index. Don't rely on inference.

### 9. Auth-Scoped Search Filters

Every search query must include a `userId` filter derived from the session, not from user input. This is a security boundary — without it, users could see other users' data.

### 10. Separate Read and Write Paths for Search

The main app queries the search engine directly (reads), while a separate sync service handles indexing (writes). This decouples search logic from CRUD endpoints and allows independent scaling.

### 11. Async Task Awareness

Meilisearch operations are asynchronous — they return immediately but process via a task queue. Always account for indexing delay when verifying results. Use `waitForTask()` when immediate consistency is needed.

---

## Phase 2 Troubleshooting

### Issue 10: `npm error Exit handler never called!` during Docker build

**Cause**: npm is killed by OOM in Minikube's Docker daemon (limited memory). Two parallel `npm ci` stages double memory usage.

**Solution**: Restructure Dockerfile to single `base` stage (sequential `npm ci`). Or build with Docker Desktop and load into Minikube. See [Docker Build OOM](#docker-build-oom-and-the-basebuilder-pattern).

### Issue 11: Bucket creation fails (`ECONNREFUSED`) on startup

**Cause**: file-service starts before MinIO is ready. No initContainer or retry logic.

**Solution**: Add initContainer that waits for MinIO health endpoint. Also add exponential backoff retry in `ensureBucket()`. See [initContainer Pattern](#the-initcontainer-pattern-for-service-dependencies).

### Issue 12: Download returns empty content or 500 error

**Cause**: AWS SDK v3 returns `ChecksumStream` for `Body`, which Fastify can't send directly.

**Solution**: Use `response.Body!.transformToByteArray()` to convert to bytes, then `Buffer.from()`. See [AWS SDK v3 Response Body Handling](#aws-sdk-v3-response-body-handling).

### Issue 13: Pod runs old code after image rebuild

**Cause**: `minikube image load` doesn't overwrite images with the same tag. The old image persists.

**Solution**: Force-remove the old image before loading:
```bash
minikube ssh "docker rmi -f ralf090102/file-service:latest"
minikube image load ralf090102/file-service:latest
kubectl rollout restart deployment/task-manager-file-service -n task-manager
```

### Issue 14: `Cannot use import statement outside a module`

**Cause**: Testing ESM service code via `node -e` runs in CommonJS context. `import` syntax fails.

**Solution**: Use `npx tsx -e` instead of `node -e`. Or use test scripts via `npx tsx scripts/test.ts`. See [Testing ESM Services](#testing-esm-services-from-powershell).

### Issue 15: `await is only valid in async functions` (tsx eval)

**Cause**: `eval()` inside `tsx -e` runs in CommonJS context, even with `--input-type=module`. Top-level `await` fails.

**Solution**: Wrap the script in an async IIFE: `(async () => { ... })();`

### Issue 16: Prometheus 404 on `/api/metrics` for file-service

**Cause**: The ServiceMonitor targets the main app only, but Prometheus may try to scrape all services. The file-service doesn't have a `/api/metrics` endpoint.

**Solution**: This is harmless (404 logged in file-service logs). The ServiceMonitor correctly targets only the main app via label selectors.

### Issue 17: Meilisearch documents not indexing (0 documents despite reindex)

**Cause**: Meilisearch's primary key inference failed because multiple fields end with "id" (`id` and `userId`). The document addition task silently fails.

**Diagnosis**:
```bash
# Check task queue for failed tasks
kubectl exec deployment/task-manager -n task-manager -- node -e "
  fetch('http://task-manager-meilisearch:7700/tasks?limit=5', {
    headers: { Authorization: 'Bearer meili-master-key-change-me' }
  }).then(r=>r.json()).then(t=>console.log(JSON.stringify(t.results.map(r=>({uid:r.uid,status:r.status,type:r.type})),null,2)))
"
# Look for status: "failed"
```

**Solution**: Delete the broken index and recreate with explicit `primaryKey: "id"`:
```bash
# Delete index
kubectl exec deployment/task-manager -n task-manager -- node -e "
  fetch('http://task-manager-meilisearch:7700/indexes/tasks', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer meili-master-key-change-me' }
  }).then(r=>r.json()).then(t=>console.log(t))
"

# Restart search-sync (recreates index with correct primary key)
kubectl rollout restart deployment/task-manager-search-sync -n task-manager

# Wait for pod, then trigger reindex
kubectl exec deployment/task-manager -n task-manager -- node -e "
  fetch('http://task-manager-search-sync:3006/sync/all', {method:'POST'}).then(r=>r.json()).then(t=>console.log(t))
"
```

See [Primary Key Inference Bug](#primary-key-inference-bug).

### Issue 18: `MeiliSearch is not defined` (wrong class name)

**Cause**: The npm package renamed the export from `MeiliSearch` (capital S) to `Meilisearch` (lowercase s) in recent versions. Code using the old name fails.

**Solution**: Use `Meilisearch` (lowercase s):
```typescript
import { Meilisearch } from "meilisearch";  // ✅ Correct
// import { MeiliSearch } from "meilisearch"; // ❌ Old name, undefined
```

Verify the export name:
```bash
node -e "const m = require('meilisearch'); console.log(typeof m.Meilisearch)"
```

### Issue 19: Meilisearch refuses to start (`MEILI_ENV=production` without master key)

**Cause**: Production mode requires a master key of at least 16 bytes. If the secret is empty or too short, Meilisearch exits on startup.

**Diagnosis**:
```bash
kubectl logs -n task-manager meilisearch-0 | grep -i "master"
# Error: You must provide a master key...
```

**Solution**: Ensure the master key is at least 16 bytes in the Helm values or Secret:
```bash
--set meilisearch.masterKey="meili-master-key-change-me"
```

### Issue 20: `npx tsx scripts/test.ts` OOMs in search-sync pod (exit code 137)

**Cause**: The search-sync pod has limited resources (256Mi memory). Running `npx tsx` (which downloads/resolves TypeScript) exceeds the memory limit.

**Solution**: Use Node.js `fetch()` directly from the main app pod instead of test scripts in resource-limited pods. Or use base64-encoded eval:
```bash
$script = "fetch('http://task-manager-meilisearch:7700/indexes/tasks/stats',{headers:{Authorization:'Bearer meili-master-key-change-me'}}).then(r=>r.json()).then(t=>console.log(JSON.stringify(t)))"
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
kubectl exec deployment/task-manager -n task-manager -- node -e "eval(Buffer.from('$encoded','base64').toString())"
```

---

## What You've Learned in Stage 2 - Phase 2

### Technologies Mastered:
- Kubernetes StatefulSet workload type
- PersistentVolumeClaims (PVC) and `volumeClaimTemplates`
- Headless Services (`clusterIP: None`)
- MinIO S3-compatible object storage
- AWS SDK v3 S3 Client (`@aws-sdk/client-s3`)
- `@fastify/multipart` for file uploads
- Meilisearch full-text search engine
- Meilisearch JavaScript client (`meilisearch` npm package)
- Search index configuration (searchable/filterable attributes)
- initContainer pattern for service dependencies
- Exponential backoff retry logic
- ESM testing patterns (tsx + base64, test scripts)
- Docker build memory optimization (base/builder/runner pattern)
- `minikube image load` workflow with force-removal
- AWS SDK v3 response body handling (`transformToByteArray`)

### Core Concepts:
- StatefulSet vs Deployment (stable identity, persistent storage)
- PVC lifecycle (Pending → Bound, survives restarts)
- Headless service DNS (per-pod names: `minio-0.minio-headless`)
- S3 API compatibility (MinIO as local S3 replacement)
- Object storage vs relational storage (files in MinIO, metadata in PostgreSQL)
- Full-text search vs relational queries (Meilisearch vs PostgreSQL)
- Searchable vs filterable attributes (what users search vs filter by)
- Primary key inference and its limitations
- Async task model (Meilisearch queues operations)
- Bulk reindex vs incremental sync strategies
- Read/write separation for search (main app reads, sync service writes)
- Startup ordering via initContainers
- Code-level retry as runtime safety net
- Docker daemon memory limits and OOM kills
- Image caching and the stale-image problem

### Best Practices:
- Use StatefulSet for any service that owns persistent data
- Always pair StatefulSet with a headless service
- Use initContainer + code retry for dependent service startup
- Store file bytes in object storage, metadata in database
- Single `npm ci` in Docker base stage (avoid parallel OOM)
- Force-remove old images before loading new ones into Minikube
- Use `transformToByteArray()` for AWS SDK v3 response bodies
- Test scripts in each service for reliable kubectl debugging
- Always set primary key explicitly when multiple fields end with "id"
- Scope search queries by userId (security boundary)
- Separate search reads (main app) from search writes (sync service)
- Graceful degradation when search service is not deployed

### Troubleshooting Skills:
- Diagnosing Docker build OOM errors
- Debugging startup race conditions between services
- Fixing AWS SDK v3 stream handling issues
- Resolving stale Minikube images
- Testing ESM services without curl/wget
- Debugging Meilisearch failed task queue
- Fixing primary key inference failures
- Handling Meilisearch async indexing delays
- Querying Meilisearch REST API via base64-encoded Node.js

---

# Stage 2 - Phase 3 Learning Summary

Phase 3 introduces **real-time communication** and **polyglot services**. Module 4 is a WebSocket gateway built with Socket.io that pushes live task updates to the browser. Module 3 is a Python analytics service (the first non-Node.js microservice) that computes productivity statistics and generates weekly chart reports.

This phase teaches you WebSocket protocols, Socket.io rooms/broadcasting, NGINX Ingress WebSocket routing, sticky sessions, JWT decryption, Python/FastAPI, asyncpg with PgBouncer, matplotlib in headless mode, and the analytics API proxy pattern.

---

## Table of Contents (Phase 3)

45. [WebSocket Protocol and Socket.io](#websocket-protocol-and-socketio)
46. [Socket.io Server Architecture](#socketio-server-architecture)
47. [JWT Authentication for WebSocket Connections](#jwt-authentication-for-websocket-connections)
48. [The `jose` Library and NextAuth JWT Decryption](#the-jose-library-and-nextauth-jwt-decryption)
49. [NGINX Ingress WebSocket Routing](#nginx-ingress-websocket-routing)
50. [Kubernetes Service Session Affinity](#kubernetes-service-session-affinity)
51. [Fire-and-Forget Event Emission Pattern](#fire-and-forget-event-emission-pattern)
52. [Frontend Socket.io Client Integration](#frontend-socketio-client-integration)
53. [Polyglot Microservices: Python + Node.js](#polyglot-microservices-python--nodejs)
54. [FastAPI Framework and ASGI](#fastapi-framework-and-asgi)
55. [asyncpg with PgBouncer Compatibility](#asyncpg-with-pgbouncer-compatibility)
56. [DATABASE_URL Cleaning for Connection Poolers](#database_url-cleaning-for-connection-poolers)
57. [Python Docker Multi-Stage Build](#python-docker-multi-stage-build)
58. [matplotlib Chart Generation in Headless Mode](#matplotlib-chart-generation-in-headless-mode)
59. [Kubernetes CronJob for Batch Reporting](#kubernetes-cronjob-for-batch-reporting)
60. [Analytics API Proxy Pattern](#analytics-api-proxy-pattern)
61. [Dashboard Widget Integration](#dashboard-widget-integration)
62. [Graceful Degradation for Optional Services](#graceful-degradation-for-optional-services)
63. [Phase 3 Key Patterns and Best Practices](#phase-3-key-patterns-and-best-practices)
64. [Phase 3 Troubleshooting](#phase-3-troubleshooting)

---

## WebSocket Protocol and Socket.io

### HTTP vs WebSocket

All previous services communicated via **HTTP** — request/response. The client asks, the server answers, the connection closes. This works for most things, but it's **one-directional**: the server can't push data to the browser unless the browser asks first.

**WebSocket** is a different protocol that provides a **persistent, bidirectional** connection:

| Aspect | HTTP | WebSocket |
|--------|------|-----------|
| Connection | Short-lived (request → response → close) | Long-lived (stays open) |
| Direction | Client → Server only | Bidirectional (both ways) |
| Protocol | `http://` / `https://` | `ws://` / `wss://` |
| Overhead | Headers on every request | Handshake once, then lightweight frames |
| Use case | API calls, page loads | Live updates, chat, notifications |

### How WebSocket Works

1. The browser sends an HTTP request with an `Upgrade: websocket` header
2. The server responds with `101 Switching Protocols`
3. The connection is now a WebSocket — both sides can send frames at any time
4. The connection stays open until either side closes it

```
Browser                         Server
  |--- HTTP GET /socket.io/ ------>|   (Upgrade: websocket)
  |<--- 101 Switching Protocols ---|
  |                                |
  |<===== WebSocket frame (task) ==|   (server pushes)
  |=== WebSocket frame (ping) ====>|   (client pushes)
  |                                |
  |<--- WebSocket frame -----------|   (server pushes again)
```

### Why Socket.io Instead of Raw `ws`?

**Socket.io** is a library built on top of WebSocket. It adds:

- **Auto-reconnect**: If the connection drops, Socket.io automatically reconnects
- **Fallback transport**: If WebSocket isn't available (e.g., corporate proxy), it falls back to HTTP long-polling
- **Rooms**: Group connected clients (e.g., all users viewing the same board)
- **Broadcasting**: Send a message to all clients in a room with one call
- **Event-based API**: Named events instead of raw data frames
- **Acknowledgements**: Confirm receipt of messages

| Raw WebSocket (`ws`) | Socket.io |
|----------------------|-----------|
| Manual reconnection logic | Auto-reconnect built in |
| No rooms — you track clients yourself | `socket.join("board")` built in |
| Raw binary/text frames | Named events: `socket.emit("task:created", data)` |
| No fallback | Falls back to long-polling |
| Lower overhead | Slightly more overhead (negligible) |

For this project, Socket.io's rooms and auto-reconnect make it the right choice.

### Socket.io Server Setup

```typescript
// services/realtime/src/index.ts
import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer(/* ... HTTP handlers ... */);

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
  },
  path: "/socket.io/",  // Must match the NGINX Ingress path
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[realtime] Socket.io server listening on port ${PORT}`);
});
```

**Key point**: Socket.io creates its own HTTP server internally. We create a raw `httpServer` first, attach our own HTTP route handlers (`/health`, `/emit`), then hand it to Socket.io. Socket.io listens on the same port — HTTP requests go to our handlers, WebSocket upgrades go to Socket.io.

---

## Socket.io Server Architecture

### Rooms and Broadcasting

A **room** is a named group of connected sockets. Any socket can join a room, and you can broadcast events to everyone in a room:

```typescript
io.on("connection", (socket) => {
  // Every authenticated user joins the shared board room
  socket.join("board");

  // Also joins their personal room (for targeted messages)
  socket.join(`user:${userId}`);

  // Broadcast to everyone in the board room EXCEPT sender
  socket.on("task:created", (data) => {
    socket.to("board").emit("task:created", data);
  });
});
```

| Method | Recipients |
|--------|-----------|
| `socket.emit(event, data)` | Only this socket |
| `socket.to("board").emit(...)` | Everyone in "board" EXCEPT this socket |
| `io.to("board").emit(...)` | Everyone in "board" INCLUDING this socket |
| `io.emit(...)` | ALL connected sockets |

### The Internal `/emit` Endpoint

The realtime service also has a regular HTTP endpoint — `POST /emit`. This is how the **main Next.js app** pushes events to connected browsers:

```typescript
// POST /emit — internal endpoint (not for browsers)
if (req.url === "/emit" && req.method === "POST") {
  const { event, room, data } = JSON.parse(body);
  if (room) {
    io.to(room).emit(event, data);
  } else {
    io.emit(event, data);
  }
  sendJson(res, 200, { emitted: true, event, room: room || "broadcast" });
}
```

**Flow**:
```
User creates task → Next.js API route → POST /emit to realtime →
realtime broadcasts to all browsers in "board" room → browsers refresh
```

### The `/health` Endpoint

```typescript
if (req.url === "/health" && req.method === "GET") {
  sendJson(res, 200, {
    status: "ok",
    connections: io.engine.clientsCount,  // Active WebSocket count
  });
}
```

This is used by Kubernetes liveness/readiness probes. The `clientsCount` is useful for debugging — you can see how many browsers are connected at any time.

### Connection Lifecycle

```typescript
io.on("connection", (socket) => {
  const userId = socket.data.userId;
  console.log(`[realtime] User connected: ${userId} (${socket.id})`);

  socket.join(`user:${userId}`);
  socket.join("board");

  // Handle events from this client...

  socket.on("disconnect", (reason) => {
    console.log(`[realtime] User disconnected: ${userId} (${reason})`);
    socket.to("board").emit("presence:offline", { userId });
  });
});
```

Each client gets:
1. **Joined to `board`** — receives all task events
2. **Joined to `user:<id>`** — receives personal notifications
3. **Presence tracking** — other clients know when this user is online/offline

### No Database Access

The realtime service is a **pure relay** — it doesn't read from or write to PostgreSQL. No Prisma, no database connection. This makes it:
- Fast (no DB round-trips)
- Stateless (can scale horizontally — connections are the only state)
- Simple (less code, fewer failure modes)

```dockerfile
# services/realtime/Dockerfile — notice: NO prisma generate
FROM node:22-slim AS base
COPY services/realtime/package.json services/realtime/package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM base AS runner
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3001
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
```

Compare this to other services (notification, file-service) that include `COPY prisma/schema.prisma` and `RUN npx prisma generate`. The realtime Dockerfile is simpler because it has no database dependency.

---

## JWT Authentication for WebSocket Connections

### The Problem: Authenticating WebSocket Connections

HTTP APIs authenticate via headers (`Authorization: Bearer ...`). But WebSocket connections start as an HTTP handshake and then upgrade — you can't easily add headers to the upgrade request from a browser.

Socket.io solves this with the **handshake auth** pattern: the client sends credentials in the `auth` field during the initial connection:

```typescript
// Frontend (browser)
const socket = io({
  path: "/socket.io/",
  auth: { token: jwtToken }   // Sent during handshake
});
```

### Server-Side Authentication Middleware

Socket.io provides middleware to intercept connections before they're accepted:

```typescript
// services/realtime/src/index.ts
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("No token provided"));
    }

    // Decrypt the JWT to verify identity
    const { payload } = await jwtDecrypt(token, secret);
    const userId = payload.id;

    if (!userId) {
      return next(new Error("Invalid token: no user id"));
    }

    // Store userId on the socket for later use
    socket.data.userId = userId;
    next();  // Accept the connection
  } catch {
    next(new Error("Invalid token"));  // Reject the connection
  }
});
```

**How it works**:
1. Browser calls `io({ auth: { token } })` — Socket.io includes the token in the handshake
2. Server middleware runs `jwtDecrypt(token, secret)` — if valid, extracts `userId`
3. `next()` accepts the connection; `next(new Error(...))` rejects it
4. The `userId` is stored on `socket.data` for use in all event handlers

### Why Not Just Send the Session Cookie?

The browser's session cookie (`authjs.session-token`) is sent automatically with HTTP requests. But:

1. **WebSocket cross-origin**: If the Socket.io server is on a different origin (different port), cookies may not be sent
2. **Explicit is better**: Passing the token explicitly in `auth` is clearer and works across origins
3. **Socket.io design**: The `auth` field is the recommended way to pass credentials

In this project, the token **is** the session cookie value — fetched via the `/api/ws-token` endpoint and passed as the `auth.token` field.

---

## The `jose` Library and NextAuth JWT Decryption

### NextAuth v5 JWT Strategy

NextAuth v5 uses **JWT session strategy** by default. The session cookie contains an **encrypted JWT** — not just signed, but encrypted. This means:

- **Signed JWT** (`jws`): Anyone can read the payload, only the server can sign it
- **Encrypted JWT** (`jwe`): Nobody can read the payload without the secret key

NextAuth uses encryption because the JWT contains the user ID and other sensitive data. The encryption key is derived from `NEXTAUTH_SECRET`.

### The `jose` Library

`jose` is a JavaScript library for JWT operations (sign, verify, encrypt, decrypt). NextAuth v5 uses it internally. We use `jose` directly in the realtime service to decrypt the same JWT:

```typescript
import { jwtDecrypt } from "jose";

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const secret = new TextEncoder().encode(NEXTAUTH_SECRET);

const { payload } = await jwtDecrypt(token, secret);
const userId = payload.id;  // Custom ID we injected via NextAuth callbacks
```

### Why `TextEncoder`?

`jwtDecrypt` expects the key as a `Uint8Array` (raw bytes), not a string. `TextEncoder().encode()` converts a string to UTF-8 bytes:

```typescript
const secret = new TextEncoder().encode(NEXTAUTH_SECRET);
// "my-secret" → Uint8Array [109, 121, 45, 115, 101, 99, ...]
```

### Why This Works

Both NextAuth and the realtime service share the same `NEXTAUTH_SECRET` environment variable. In Kubernetes, this is injected from the same Secret:

```yaml
# helm-chart/templates/realtime/deployment.yaml
env:
  - name: NEXTAUTH_SECRET
    valueFrom:
      secretKeyRef:
        name: {{ include "task-manager.fullname" . }}-secrets
        key: nextauth-secret
```

The main app uses this secret to **encrypt** the JWT. The realtime service uses the same secret to **decrypt** it. Neither service ever passes the user ID in plaintext — the encrypted JWT is the trust boundary.

### The Custom `id` Field

NextAuth's default JWT payload contains `sub` (subject) but not `id`. In this project, we inject a custom `id` field via NextAuth callbacks:

```typescript
// src/lib/auth.ts (callbacks.jwt)
async jwt({ token, user }) {
  if (user) token.id = user.id;  // Inject user ID into JWT
  return token;
}
```

This is why the realtime service reads `payload.id` instead of `payload.sub`.

---

## NGINX Ingress WebSocket Routing

### The Challenge

The realtime service runs on port 3001 inside the cluster. The browser connects to `ws://task-manager.local/socket.io/`. NGINX Ingress must:

1. Route `/socket.io/` requests to the realtime service (not the main app)
2. Support the WebSocket protocol upgrade (`Upgrade: websocket`)
3. Keep the connection open for a long time (not timeout after 60 seconds)

### Path-Baseded Routing

The Ingress uses **multiple path rules** — `/socket.io` goes to realtime, everything else goes to the main app:

```yaml
# helm-chart/templates/task-manager/ingress.yaml
spec:
  rules:
    - host: {{ .host | quote }}
      http:
        paths:
          # WebSocket route — must come first (longest-prefix match)
          {{- if $.Values.realtime.enabled }}
          - path: /socket.io
            pathType: Prefix
            backend:
              service:
                name: {{ include "task-manager.fullname" $ }}-realtime
                port:
                  number: 3001
          {{- end }}
          # Default route — everything else goes to the main app
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "task-manager.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
```

**How NGINX routes**: NGINX uses **longest-prefix match**. A request to `/socket.io/?EIO=4&transport=polling` matches `/socket.io` (Prefix) before it matches `/` (Prefix). So WebSocket traffic goes to realtime, everything else goes to the main app.

### WebSocket Timeout Annotations

By default, NGINX Ingress closes idle connections after 60 seconds. WebSocket connections are long-lived (minutes to hours), so we increase the timeout:

```yaml
{{- if .Values.realtime.enabled }}
annotations:
  nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
{{- end }}
```

| Annotation | Default | Our Value | Effect |
|-----------|---------|-----------|--------|
| `proxy-read-timeout` | 60s | 3600s (1 hour) | How long NGINX waits for data from the backend |
| `proxy-send-timeout` | 60s | 3600s (1 hour) | How long NGINX waits when sending data to the backend |

Without these, you'd see WebSocket connections silently dropped after 60 seconds of inactivity.

### NGINX WebSocket Support

NGINX Ingress Controller automatically detects WebSocket upgrade requests and adds the necessary headers (`Connection: Upgrade`, `Upgrade: websocket`). You don't need to configure this manually — it's built into the NGINX Ingress Controller.

### Conditional Rendering

The WebSocket path and annotations are only added when `realtime.enabled` is true in Helm values. This means you can deploy without the realtime service and the Ingress works normally for the main app.

---

## Kubernetes Service Session Affinity

### The Problem with Multiple Replicas

If the realtime service has multiple replicas, the Service load-balances connections. But WebSocket connections are **stateful** — a specific socket is connected to a specific pod. If a subsequent HTTP request (like Socket.io's polling fallback) goes to a different pod, it fails.

```
Browser → Service → Pod A (WebSocket connection established)
Browser → Service → Pod B (polling request — Pod B doesn't know about this client!)
```

### Solution: Session Affinity (Sticky Sessions)

Kubernetes Services support **sessionAffinity: ClientIP** — all requests from the same client IP go to the same pod:

```yaml
# helm-chart/templates/realtime/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "task-manager.fullname" . }}-realtime
spec:
  type: ClusterIP
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800  # 3 hours
  ports:
    - port: 3001
      targetPort: ws
      name: ws
  selector:
    {{- include "task-manager.selectorLabels" . | nindent 4 }}
    app.kubernetes.io/component: realtime
```

| Setting | Value | Meaning |
|---------|-------|---------|
| `sessionAffinity` | `ClientIP` | Route same client to same pod |
| `timeoutSeconds` | `10800` (3 hours) | How long to remember the affinity |

### How ClientIP Affinity Works

1. Browser connects from IP `10.0.0.5`
2. Service routes to Pod A
3. Kubernetes remembers: `10.0.0.5 → Pod A`
4. Next request from `10.0.0.5` → goes to Pod A (not randomized)
5. After 3 hours of inactivity, the mapping expires

### Why 10800 Seconds (3 Hours)?

The default `timeoutSeconds` is 10800 (3 hours). This is appropriate because WebSocket connections can be long-lived. If you set it too short, a user who leaves their browser open but idle might get routed to a different pod when they interact again.

### When You Don't Need Sticky Sessions

Services without state — like the main Next.js app or the analytics service — don't need session affinity. Any pod can handle any request because they're all stateless. Only the realtime service needs sticky sessions because WebSocket connections are stateful.

---

## Fire-and-Forget Event Emission Pattern

### The Problem: Main App → Realtime Communication

When a user creates, updates, or deletes a task, the main Next.js app needs to tell the realtime service to broadcast the event to all connected browsers. But:

1. The task operation should **not fail** if the realtime service is down
2. The user should **not wait** for the broadcast to complete
3. The main app should **not crash** if the realtime service is unreachable

### The Solution: Fire-and-Forget

```typescript
// src/lib/realtime.ts
const REALTIME_URL = process.env.REALTIME_URL;

export async function emitToRealtime(
  event: string,
  data: unknown,
  room?: string
): Promise<void> {
  if (!REALTIME_URL) return;  // Realtime not configured — skip silently

  try {
    await fetch(`${REALTIME_URL}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data, room: room ?? "board" }),
    });
  } catch {
    // Silent fail — realtime is a best-effort enhancement
  }
}
```

**Key design decisions**:

| Decision | Rationale |
|----------|-----------|
| `if (!REALTIME_URL) return` | Graceful degradation when realtime is not deployed |
| `try/catch` with empty `catch` | Never throw — realtime failure shouldn't break task operations |
| `room ?? "board"` | Default to the shared board room |
| No retry logic | If it fails, the user will just refresh manually — not critical |

### Usage in API Routes

```typescript
// src/app/api/tasks/route.ts (after creating a task)
import { emitToRealtime } from "@/lib/realtime";

export async function POST(request: NextRequest) {
  // ... create task in database ...
  const task = await prisma.task.create({ data });

  // Fire-and-forget: tell realtime to broadcast
  await emitToRealtime("task:created", task);

  return NextResponse.json(task);
}
```

The `await` is technically there (JavaScript requires it for async functions), but the operation is so fast (a single HTTP POST to an internal service) that it's effectively non-blocking. And even if it fails, the `catch` swallows the error silently.

### Why Not Use a Message Queue?

In a larger system, you'd use a message queue (RabbitMQ, Redis Pub/Sub, Kafka) for reliable event delivery. But for this project:

- **Simplicity**: Direct HTTP POST is simpler than setting up a message broker
- **Acceptable failure**: If a real-time update is missed, the user just refreshes — no data loss
- **Small scale**: One realtime pod, one main app — no need for pub/sub scaling

---

## Frontend Socket.io Client Integration

### The Connection Flow

```
1. Browser loads dashboard page
2. React component fetches /api/ws-token → gets JWT token
3. Socket.io client connects with the token
4. Server validates token, accepts connection
5. Client listens for events → refreshes task list on changes
```

### The `/api/ws-token` Endpoint

The frontend needs the NextAuth JWT to authenticate with the realtime service. This endpoint returns it:

```typescript
// src/app/api/ws-token/route.ts
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const token =
    cookieStore.get("authjs.session-token")?.value ||
    cookieStore.get("__Secure-authjs.session-token")?.value;

  if (!token) {
    return NextResponse.json({ error: "No session token" }, { status: 401 });
  }

  return NextResponse.json({ token });
}
```

**Why this endpoint exists**: The session cookie is `HttpOnly` — JavaScript can't read it directly. This endpoint reads it server-side and returns it as JSON. The frontend then passes it to Socket.io as the `auth.token`.

**Security**: The endpoint checks authentication first (`auth()`) — only logged-in users get a token. The token is the same encrypted JWT that's in the cookie, so it's equally secure.

### The TaskList Client Component

```typescript
// src/components/TaskList.tsx
import { io } from "socket.io-client";

export default function TaskList({ initialTasks }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [live, setLive] = useState(false);
  const refreshRef = useRef(refreshTasks);

  useEffect(() => {
    let socket: ReturnType<typeof io> | null = null;

    async function connect() {
      try {
        // 1. Get the JWT token
        const res = await fetch("/api/ws-token");
        if (!res.ok) return;
        const { token } = await res.json();

        // 2. Connect to Socket.io with the token
        socket = io({ path: "/socket.io/", auth: { token } });

        // 3. Listen for events
        socket.on("connect", () => setLive(true));
        socket.on("disconnect", () => setLive(false));
        socket.on("task:created", () => refreshRef.current());
        socket.on("task:updated", () => refreshRef.current());
        socket.on("task:deleted", () => refreshRef.current());
      } catch {
        // Real-time is optional — fail silently
      }
    }

    connect();

    // 4. Cleanup on unmount
    return () => { socket?.disconnect(); };
  }, []);
}
```

### Key Patterns

**`refreshRef` instead of `refreshTasks` directly**: The `useEffect` has `[]` deps (runs once). If it referenced `refreshTasks` directly, it would capture a stale closure. Using a ref ensures the latest `refreshTasks` is always called:

```typescript
const refreshRef = useRef(refreshTasks);
useEffect(() => { refreshRef.current = refreshTasks; }, [refreshTasks]);
```

**`io({ path: "/socket.io/" })`**: Socket.io client connects to the **same origin** as the page (no URL needed). The `path` must match the server-side `path: "/socket.io/"` and the NGINX Ingress `/socket.io` route.

**The "Live" badge**: When `live` is true (socket connected), the UI shows a badge:

```tsx
{live && (
  <span className="... bg-green-100 text-green-700 ...">
    Live
  </span>
)}
```

**Cleanup**: The `return () => socket?.disconnect()` ensures the socket is closed when the component unmounts (e.g., navigating away from the dashboard). Without this, you'd get memory leaks and zombie connections.

### `socket.io-client` Package

The frontend uses the `socket.io-client` package (separate from the server-side `socket.io`):

```json
// package.json
"dependencies": {
  "socket.io-client": "^4.7.0"
}
```

```typescript
import { io } from "socket.io-client";  // Client import
```

The client handles:
- Connection establishment (HTTP polling → WebSocket upgrade)
- Auto-reconnection (exponential backoff)
- Event buffering (queues events sent while disconnected)

---

## Polyglot Microservices: Python + Node.js

### What Is a Polyglot Architecture?

A **polyglot** microservices architecture uses multiple programming languages across services. Each service is written in the language best suited for its task:

| Service | Language | Why |
|---------|----------|-----|
| Main app (Next.js) | TypeScript | Rich UI ecosystem, SSR |
| Scheduler | TypeScript | Shared Prisma schema |
| Notification | TypeScript | Shared Prisma schema |
| File service | TypeScript | Shared Prisma schema |
| Search sync | TypeScript | Shared Prisma schema |
| Realtime | TypeScript | Socket.io ecosystem |
| **Analytics** | **Python** | **Data analysis ecosystem (pandas, matplotlib, numpy)** |

### Why Python for Analytics?

Python is the dominant language for data analysis and scientific computing:

- **matplotlib**: The standard charting library (bar charts, line graphs, heatmaps)
- **pandas**: Data manipulation (not used here, but available)
- **numpy**: Numerical computing (dependency of matplotlib)
- **FastAPI**: Modern, fast async web framework
- **asyncpg**: High-performance async PostgreSQL driver

In Node.js, chart generation requires headless browser rendering (Puppeteer) or limited libraries. In Python, `matplotlib.savefig()` generates charts in 3 lines of code.

### The Shared Database as Contract

The analytics service doesn't share TypeScript types with the main app. Instead, they share a **database schema** — both services connect to the same PostgreSQL database:

```
Node.js (Prisma) → PostgreSQL ← Python (asyncpg)
     ↓                              ↓
   Task model                   Raw SQL queries
   (type-safe)                  (no type safety)
```

**Pros**: Each service uses its native ORM/driver. No cross-language type definitions.
**Cons**: No compile-time type checking in Python. If the schema changes, the Python service doesn't know until runtime.

### Schema Awareness Without Prisma

The Python service writes raw SQL with knowledge of the Prisma schema:

```python
# Prisma uses quoted table/column names by default
await conn.fetch(
    'SELECT status, COUNT(*) as count '
    'FROM "Task" WHERE "userId" = $1 GROUP BY status',
    user_id,
)
```

Note the **double-quoted identifiers**: `"Task"`, `"userId"`. Prisma generates these quoted names in PostgreSQL. The Python service must match them exactly.

### Monorepo Structure for Polyglot

```
task-manager/
├── services/
│   ├── scheduler/          # Node.js (package.json, tsconfig.json)
│   ├── notification/       # Node.js
│   ├── analytics/          # Python (requirements.txt, no tsconfig)
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   ├── scripts/
│   │   │   └── weekly_report.py
│   │   └── Dockerfile
│   └── realtime/           # Node.js
├── prisma/
│   └── schema.prisma       # Shared (Node.js services generate Prisma client,
│                           # Python service uses raw SQL against same tables)
```

Each Python service has:
- `requirements.txt` (instead of `package.json`)
- `Dockerfile` (uses `python:3.12-slim` base image)
- No `tsconfig.json`, no Prisma config

---

## FastAPI Framework and ASGI

### What Is FastAPI?

**FastAPI** is a modern Python web framework (like Express for Python). It's built on top of **Starlette** (ASGI toolkit) and uses Python type hints for automatic validation and documentation.

```python
from fastapi import FastAPI

app = FastAPI(title="Task Analytics")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/stats/summary/{user_id}")
async def get_summary(user_id: str):
    # user_id is automatically parsed as a string from the URL path
    ...
    return {"statusCounts": {...}, "completionRate": 92.5}
```

### FastAPI vs Flask vs Express

| Feature | FastAPI | Flask | Express (Node.js) |
|---------|---------|-------|-------------------|
| Language | Python | Python | JavaScript |
| Async support | Native (`async def`) | Limited (needs extensions) | Native |
| Type hints | Yes (auto-validation) | No | No |
| Auto OpenAPI docs | Yes (`/docs`) | Needs extension | Needs extension |
| Performance | High (ASGI) | Medium (WSGI) | High |
| WebSocket support | Yes | Needs extension | Via `ws`/`socket.io` |

### ASGI vs WSGI

Python has two web server interfaces:

| Aspect | WSGI (old) | ASGI (new) |
|--------|-----------|------------|
| Full name | Web Server Gateway Interface | Asynchronous Server Gateway Interface |
| Async | No (synchronous) | Yes |
| WebSocket | No | Yes |
| Server | Gunicorn, uWSGI | Uvicorn, Daphne |
| Frameworks | Flask, Django (traditional) | FastAPI, Starlette |

The analytics service uses **Uvicorn** as the ASGI server:

```dockerfile
# Dockerfile CMD
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- `main:app` — the `app` object in `main.py`
- `--host 0.0.0.0` — listen on all interfaces (required for containers)
- `--port 8000` — listen on port 8000

### The Lifespan Context Manager

FastAPI uses a **lifespan** context manager for startup/shutdown logic:

```python
from contextlib import asynccontextmanager

db_pool: asyncpg.Pool | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    # --- STARTUP ---
    db_url = clean_db_url(os.environ["DATABASE_URL"])
    db_pool = await asyncpg.create_pool(
        db_url, min_size=1, max_size=5, statement_cache_size=0
    )
    print("[analytics] DB pool created")

    yield  # App runs here

    # --- SHUTDOWN ---
    if db_pool:
        await db_pool.close()
        print("[analytics] DB pool closed")

app = FastAPI(title="Task Analytics", lifespan=lifespan)
```

This is equivalent to:
- **Startup**: Create a database connection pool (reused across requests)
- **Shutdown**: Close the pool cleanly

The pool is stored in a `global` variable — all route handlers access the same pool.

### Automatic OpenAPI Documentation

FastAPI automatically generates interactive API docs at `/docs` (Swagger UI) and `/redoc` (ReDoc). No extra code needed — it reads type hints and docstrings. This is a major advantage over Express/Flask.

---

## asyncpg with PgBouncer Compatibility

### What Is asyncpg?

**asyncpg** is a high-performance async PostgreSQL client for Python. It's significantly faster than `psycopg2` (the traditional Python PostgreSQL driver) because:

- **Async from the ground up**: No blocking calls, integrates with `asyncio`
- **Direct binary protocol**: Talks PostgreSQL's wire protocol directly (no libpq C library)
- **Prepared statements**: Caches query plans for repeat executions

```python
import asyncpg

# Create a connection pool (reused across requests)
db_pool = await asyncpg.create_pool(db_url, min_size=1, max_size=5)

# Use a connection from the pool
async with db_pool.acquire() as conn:
    rows = await conn.fetch(
        'SELECT * FROM "Task" WHERE "userId" = $1', user_id
    )
```

### The PgBouncer Problem

**PgBouncer** is a PostgreSQL connection pooler (used by Supabase). It multiplexes many client connections over a few server connections. But it has a limitation: **it doesn't support prepared statements**.

asyncpg uses prepared statements by default — it prepares each query once and reuses the plan. With PgBouncer, this fails because different clients might share the same server connection, and prepared statements are per-connection.

**The error you'd see without the fix**:
```
asyncpg.exceptions.InvalidSQLStatementNameError: prepared statement "__asyncpg_..." does not exist
```

### The Fix: `statement_cache_size=0`

Setting `statement_cache_size=0` disables asyncpg's prepared statement cache:

```python
db_pool = await asyncpg.create_pool(
    db_url,
    min_size=1,
    max_size=5,
    statement_cache_size=0,  # ← THE FIX: disable prepared statements
)
```

| Setting | Default | Our Value | Effect |
|---------|---------|-----------|--------|
| `statement_cache_size` | 100 | 0 | Disables query plan caching |

With this setting, asyncpg sends each query as a simple query (no `PREPARE`/`EXECUTE`), which is compatible with PgBouncer's transaction-level pooling.

### Connection Pool Sizing

```python
asyncpg.create_pool(db_url, min_size=1, max_size=5)
```

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `min_size` | 1 | Keep one connection warm (no cold-start latency) |
| `max_size` | 5 | Handle up to 5 concurrent requests (sufficient for internal service) |

---

## DATABASE_URL Cleaning for Connection Poolers

### The Problem

Supabase provides a `DATABASE_URL` that includes PgBouncer-specific query parameters:

```
postgresql://user:pass@db.xxx.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1
```

These query parameters (`?pgbouncer=true&connection_limit=1`) are understood by PgBouncer and some drivers (like Prisma), but **not by asyncpg**. If you pass this URL directly to `asyncpg.create_pool()`, it may fail or behave unexpectedly.

### The Fix: Strip Query Parameters

```python
def clean_db_url(url: str) -> str:
    if "?" in url:
        return url.split("?")[0]
    return url

# Before: postgresql://user:pass@host:6543/postgres?pgbouncer=true&connection_limit=1
# After:  postgresql://user:pass@host:6543/postgres
db_url = clean_db_url(os.environ["DATABASE_URL"])
```

This strips everything after `?`, leaving a clean connection string that asyncpg can parse.

### Why Not Just Use a Different URL?

In Kubernetes, the `DATABASE_URL` environment variable is injected from a shared Secret:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: task-manager-secrets
        key: database-url
```

All services share the same Secret. The Node.js services (Prisma) need the PgBouncer parameters; the Python service (asyncpg) doesn't. So the Python service strips them at runtime.

### Same Pattern in the CronJob Script

The weekly report script uses the same cleaning logic:

```python
# services/analytics/scripts/weekly_report.py
def clean_db_url(url: str) -> str:
    if "?" in url:
        return url.split("?")[0]
    return url

conn = await asyncpg.connect(clean_db_url(DB_URL), statement_cache_size=0)
```

This is a simple function, duplicated in both files. In a larger Python codebase, you'd extract it to a shared module.

---

## Python Docker Multi-Stage Build

### The Pattern

Python Dockerfiles use a different multi-stage pattern than Node.js:

```dockerfile
# services/analytics/Dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY services/analytics/requirements.txt ./
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY services/analytics/main.py ./
COPY services/analytics/scripts/ ./scripts/
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### How It Works

| Stage | Purpose | Key Command |
|-------|---------|-------------|
| `builder` | Install Python packages to `/root/.local` | `pip install --user` |
| Final | Copy installed packages + source code | `COPY --from=builder /root/.local` |

### `pip install --user` — The Key Trick

The `--user` flag installs packages to `~/.local/` (user-level, not system-level):

```bash
# Without --user: packages go to /usr/local/lib/python3.12/site-packages/ (system-wide)
# With --user:    packages go to /root/.local/lib/python3.12/site-packages/ (user-level)
```

This is important because:
1. **Isolation**: User packages are in a known location (`/root/.local`)
2. **Copyability**: We can `COPY --from=builder /root/.local` to the final image
3. **Clean separation**: System Python stays clean; only user packages are copied

### `PATH` Update

The `--user` flag installs executables (like `uvicorn`) to `/root/.local/bin/`. We need to add this to `PATH`:

```dockerfile
ENV PATH=/root/.local/bin:$PATH
```

Without this, `CMD ["uvicorn", ...]` would fail because `uvicorn` wouldn't be found.

### `PYTHONUNBUFFERED=1`

```dockerfile
ENV PYTHONUNBUFFERED=1
```

Python buffers stdout by default — print statements may not appear in `kubectl logs` immediately. `PYTHONUNBUFFERED=1` disables buffering, so logs appear in real-time.

**This is critical in Kubernetes**: Without it, you might see no logs for minutes, then a flood of buffered output. With it, logs stream immediately — essential for debugging.

### `requirements.txt`

```
fastapi
uvicorn[standard]
asyncpg
matplotlib
```

- `fastapi` — web framework
- `uvicorn[standard]` — ASGI server (the `[standard]` extra includes `httptools` and `uvloop` for performance)
- `asyncpg` — PostgreSQL driver
- `matplotlib` — chart generation (heavy dependency — needs numpy, etc.)

### Comparison with Node.js Dockerfiles

| Aspect | Node.js Services | Python Service |
|--------|-----------------|----------------|
| Base image | `node:22-slim` | `python:3.12-slim` |
| Dependencies | `package.json` → `npm ci` | `requirements.txt` → `pip install` |
| Runtime | `npx tsx src/index.ts` | `uvicorn main:app` |
| Build context | `task-manager/` (for prisma schema) | `task-manager/` (for consistency) |
| Multi-stage | base → builder → runner | builder → final |
| Dev dependency pruning | `npm prune --omit=dev` | `--user` only installs production deps |

---

## matplotlib Chart Generation in Headless Mode

### The Problem: No Display Server

`matplotlib` was designed for interactive use — it opens a window to display charts. In a Docker container (or any headless server), there's no X Window System (display server). If you try to create a chart, matplotlib crashes:

```
_tkinter.TclError: no display name and no $DISPLAY environment variable
```

### The Fix: `matplotlib.use("Agg")`

The **Agg backend** is a non-interactive backend that renders to a file (or in-memory buffer) without a display:

```python
import matplotlib
matplotlib.use("Agg")  # MUST be before importing pyplot!
import matplotlib.pyplot as plt
```

**Critical ordering**: `matplotlib.use("Agg")` must be called **before** `import matplotlib.pyplot`. If you import `pyplot` first, it may already select a different backend.

### Generating a Chart

```python
fig, ax = plt.subplots(figsize=(10, 5))
ax.bar(days, counts, color="#3b82f6")
ax.set_title(f"Weekly Task Creation — {user['name']}")
ax.set_ylabel("Tasks Created")
ax.set_xlabel("Date")
fig.tight_layout()

# Save to in-memory buffer (no file on disk needed)
buf = io.BytesIO()
fig.savefig(buf, format="png", dpi=150)
plt.close(fig)  # Free memory!
```

### `io.BytesIO` for In-Memory Images

Instead of writing to a file on disk (which would need persistent storage), we write to a **BytesIO buffer** — an in-memory file-like object:

```python
import io

buf = io.BytesIO()
fig.savefig(buf, format="png", dpi=150)
chart_bytes = buf.getvalue()  # Raw PNG bytes
```

In this project, the chart isn't actually stored or sent anywhere — it's generated to prove the capability. In a production system, you'd upload it to S3/MinIO or send it via email.

### `plt.close(fig)` — Memory Management

```python
plt.close(fig)  # IMPORTANT: free the figure's memory
```

matplotlib holds figures in memory until explicitly closed. In a loop (generating charts for many users), this would cause an OOM (Out of Memory) error. `plt.close(fig)` releases the memory after each chart.

---

## Kubernetes CronJob for Batch Reporting

### The Weekly Report Concept

Every Monday at 9 AM UTC, the analytics CronJob:
1. Queries all users
2. For each user, counts tasks created in the last 7 days
3. Generates a matplotlib bar chart
4. Creates an in-app `Notification` record with the summary

```yaml
# helm-chart/templates/analytics/cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: {{ include "task-manager.fullname" . }}-weekly-report
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
              command: ["python", "-m", "scripts.weekly_report"]
              env:
                - name: DATABASE_URL
                  valueFrom:
                    secretKeyRef:
                      name: {{ include "task-manager.fullname" . }}-secrets
                      key: database-url
                - name: PYTHONUNBUFFERED
                  value: "1"
```

### Cron Schedule Format

```
0 9 * * 1
│ │ │ │ │
│ │ │ │ └── Day of week (0=Sunday, 1=Monday, ..., 7=Sunday)
│ │ │ └──── Month (1-12)
│ │ └────── Day of month (1-31)
│ └──────── Hour (0-23)
└────────── Minute (0-59)
```

`0 9 * * 1` = Every Monday at 9:00 AM UTC.

### `python -m scripts.weekly_report`

The `command` overrides the Dockerfile's `CMD`. Instead of starting the FastAPI server (`uvicorn`), it runs the weekly report script:

```bash
python -m scripts.weekly_report
```

`-m` tells Python to run the module `scripts.weekly_report` (the file `scripts/weekly_report.py`). This is the Pythonic way to run a script that's part of a package.

### The Report Script

```python
# services/analytics/scripts/weekly_report.py
async def generate_reports():
    conn = await asyncpg.connect(clean_db_url(DB_URL), statement_cache_size=0)

    users = await conn.fetch('SELECT id, email, name FROM "User" WHERE email IS NOT NULL')

    for user in users:
        tasks = await conn.fetch(
            'SELECT DATE("createdAt") as day, COUNT(*) as count '
            'FROM "Task" WHERE "userId" = $1 '
            'AND "createdAt" > NOW() - INTERVAL \'7 days\' '
            'GROUP BY day ORDER BY day',
            user["id"],
        )

        if not tasks:
            continue

        # Generate chart...
        fig, ax = plt.subplots(figsize=(10, 5))
        ax.bar(days, counts, color="#3b82f6")
        # ...

        # Create notification in the database
        await conn.execute(
            'INSERT INTO "Notification" ("id", "userId", "type", "message", "read", "createdAt") '
            'VALUES ($1, $2, $3, $4, false, NOW())',
            f"weekly-report-{user['id']}-{asyncio.get_event_loop().time()}",
            user["id"],
            "weekly_report",
            f"Weekly summary: {sum(counts)} tasks created in the last 7 days.",
        )

    await conn.close()
    print(f"[weekly-report] Done — {reports_generated} reports generated")
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `concurrencyPolicy: Forbid` | Don't run two reports simultaneously (data safety) |
| `restartPolicy: OnFailure` | Retry once if the script crashes (not `Always` — it's a batch job, not a server) |
| `successfulJobsHistoryLimit: 3` | Keep last 3 successful runs for debugging |
| `failedJobsHistoryLimit: 5` | Keep last 5 failures for investigation |
| Single connection (not pool) | Batch job — one connection is sufficient |
| Skip users with no tasks | Don't create notifications for inactive users |

### Reusing the Same Docker Image

The CronJob uses the **same Docker image** as the analytics Deployment. It just overrides the `command` to run the report script instead of the FastAPI server. This is efficient — one image, two workloads.

### Manual Trigger

```bash
kubectl create job --from=cronjob/task-manager-weekly-report manual-report -n task-manager
kubectl logs job/manual-report -n task-manager
```

`--from=cronjob/...` creates a one-time Job using the CronJob's template. Useful for testing without waiting for Monday.

---

## Analytics API Proxy Pattern

### The Architecture

```
Browser → /api/stats (Next.js) → /stats/summary/{id} + /stats/productivity/{id} (Python)
                ↑ auth()                      ↑ no auth (internal only)
```

The browser never talks to the Python service directly. Instead:

1. Browser calls `/api/stats` on the Next.js app
2. Next.js verifies the user's session (`auth()`)
3. Next.js extracts the user ID and forwards it to the Python service
4. Python service returns raw stats (no authentication — it's internal)
5. Next.js returns the combined data to the browser

### Why a Proxy?

| Without Proxy | With Proxy |
|---------------|------------|
| Browser calls Python directly | Browser calls Next.js |
| Python service exposed to internet | Python service is internal-only (ClusterIP) |
| Python must authenticate users | Next.js handles auth (already has NextAuth) |
| CORS issues (cross-origin) | Same-origin (no CORS) |
| User can query other users' stats | User can only see their own stats |

### The Proxy Implementation

```typescript
// src/app/api/stats/route.ts
export async function GET() {
  // 1. Authenticate
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Check if analytics service is configured
  const analyticsUrl = process.env.ANALYTICS_URL;
  if (!analyticsUrl) {
    return NextResponse.json(
      { error: "Analytics service not configured" },
      { status: 503 }
    );
  }

  // 3. Fetch from analytics service (parallel requests)
  try {
    const [summaryRes, productivityRes] = await Promise.all([
      fetch(`${analyticsUrl}/stats/summary/${session.user.id}`),
      fetch(`${analyticsUrl}/stats/productivity/${session.user.id}`),
    ]);

    const summary = await summaryRes.json();
    const productivity = await productivityRes.json();

    return NextResponse.json({ summary, productivity });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 502 }
    );
  }
}
```

### `Promise.all` for Parallel Fetches

The proxy makes **two requests** to the analytics service (summary + productivity). Using `Promise.all` runs them in parallel:

```typescript
const [summaryRes, productivityRes] = await Promise.all([
  fetch(`${analyticsUrl}/stats/summary/${session.user.id}`),
  fetch(`${analyticsUrl}/stats/productivity/${session.user.id}`),
]);
```

If these were sequential (`await` one, then the other), the total time would be `t1 + t2`. With `Promise.all`, it's `max(t1, t2)` — roughly twice as fast.

### Security Boundary

The user ID is injected server-side:

```typescript
fetch(`${analyticsUrl}/stats/summary/${session.user.id}`)
//                                    ^^^^^^^^^^^^^^^^
//                                    From session, not from request
```

The browser never controls which user ID is queried. Even if a malicious user modifies the fetch URL, they can't query another user's stats because the ID comes from the authenticated session.

---

## Dashboard Widget Integration

### The StatsWidget Component

```typescript
// src/components/StatsWidget.tsx
"use client";

import { useEffect, useState } from "react";

export default function StatsWidget() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          setData(await res.json());
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading analytics...</div>;
  if (error || !data?.summary) return null;  // Hide widget if analytics unavailable

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total Tasks */}
      {/* Completed Tasks */}
      {/* Completion Rate */}
      {/* By Priority breakdown */}
    </div>
  );
}
```

### Three UI States

| State | Condition | What Shows |
|-------|-----------|------------|
| Loading | `loading === true` | "Loading analytics..." placeholder |
| Error | `error === true \|\| !data?.summary` | `null` (widget hidden — analytics not deployed) |
| Success | `data.summary` exists | Grid of stat cards |

### Graceful Absence

```typescript
if (error || !data?.summary) {
  return null;  // Render nothing
}
```

If the analytics service is not deployed (no `ANALYTICS_URL`), `/api/stats` returns 503, `error` becomes true, and the widget simply doesn't render. The dashboard works fine without it — analytics is an enhancement, not a requirement.

### Responsive Grid Layout

```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
```

| Screen Size | Columns |
|-------------|---------|
| Mobile (< 640px) | 1 column |
| Small (≥ 640px) | 2 columns |
| Large (≥ 1024px) | 4 columns |

This uses Tailwind CSS v4 responsive prefixes: `sm:` and `lg:`.

### Data Structure

```typescript
interface StatsData {
  summary: {
    statusCounts: Record<string, number>;     // { "TODO": 5, "COMPLETED": 10 }
    completionRate: number;                    // 66.7
    totalTasks: number;                        // 15
    completedTasks: number;                    // 10
    dailyHistory: { date: string; count: number }[];  // Last 30 days
  } | null;
  productivity: {
    byPriority: {
      priority: string;      // "HIGH"
      total: number;         // 5
      completed: number;     // 3
      rate: number;          // 60.0
    }[];
  } | null;
}
```

The `| null` on `summary` and `productivity` allows partial data — if one endpoint fails, the other might still work.

---

## Graceful Degradation for Optional Services

### The Philosophy

All microservices in this project are **optional** — the main app works without any of them. Each service is behind a feature flag (`enabled` in Helm values) and the main app checks for the service's URL before using it.

### Pattern: Conditional URL Check

Every integration follows the same pattern:

```typescript
// Realtime
const REALTIME_URL = process.env.REALTIME_URL;
if (!REALTIME_URL) return;  // Skip silently

// Analytics
const analyticsUrl = process.env.ANALYTICS_URL;
if (!analyticsUrl) {
  return NextResponse.json({ error: "Not configured" }, { status: 503 });
}
```

### Pattern: Silent Failure

```typescript
// Realtime — fire-and-forget
try {
  await fetch(`${REALTIME_URL}/emit`, { ... });
} catch {
  // Silent fail — realtime is a best-effort enhancement
}
```

### Pattern: Conditional UI

```typescript
// StatsWidget — returns null if analytics unavailable
if (error || !data?.summary) return null;
```

### Pattern: Conditional Helm Rendering

In Kubernetes, services are only deployed when enabled:

```yaml
{{- if .Values.realtime.enabled }}
apiVersion: apps/v1
kind: Deployment
# ...
{{- end }}
```

And environment variables are only injected when the dependency is enabled:

```yaml
{{- if .Values.realtime.enabled }}
- name: REALTIME_URL
  value: "http://{{ include "task-manager.fullname" . }}-realtime:3001"
{{- end }}
```

### Why This Matters

| Without Graceful Degradation | With Graceful Degradation |
|------------------------------|--------------------------|
| Main app crashes if a service is down | Main app works — just missing a feature |
| Must deploy all services at once | Deploy incrementally (one service at a time) |
| One failure cascades to all users | Failures are isolated per feature |
| Hard to develop locally | Develop with only the services you need |

This is a **core microservices principle**: services should be independent. A failure in one service should not bring down the entire system.

---

## Phase 3 Key Patterns and Best Practices

### Key Patterns:
- WebSocket as bidirectional, persistent communication channel
- Socket.io rooms for targeted event broadcasting
- Handshake-based WebSocket authentication (`auth` field)
- JWT decryption across services (shared `NEXTAUTH_SECRET`)
- NGINX Ingress longest-prefix match for path routing
- NGINX WebSocket timeout configuration (`proxy-read/send-timeout: 3600`)
- Kubernetes `sessionAffinity: ClientIP` for stateful connections
- Fire-and-forget inter-service communication (best-effort)
- Frontend Socket.io client with auto-reconnect
- Polyglot services sharing a database (not types)
- Python `pip install --user` for clean Docker multi-stage builds
- ASGI (async) vs WSGI (sync) server models
- `statement_cache_size=0` for asyncpg + PgBouncer compatibility
- DATABASE_URL cleaning for driver compatibility
- matplotlib headless rendering (`Agg` backend + `BytesIO`)
- Same Docker image for server + CronJob (override `command`)
- API proxy pattern for auth-scoped service access
- `Promise.all` for parallel internal API calls
- Graceful degradation for all optional services

### Best Practices:
- Use Socket.io over raw WebSocket for rooms, reconnection, and fallback
- Store user identity on `socket.data` during auth middleware
- Share `NEXTAUTH_SECRET` across all services that need JWT verification
- Set NGINX WebSocket timeouts to match your max expected session duration
- Use `sessionAffinity: ClientIP` only for stateful services (WebSocket)
- Make real-time updates fire-and-forget (never block on them)
- Use refs in React to avoid stale closures in socket event handlers
- Clean up socket connections on component unmount
- Choose the right language per service (Python for analytics, Node.js for I/O)
- Use `PYTHONUNBUFFERED=1` in all Python containers for real-time logs
- Call `plt.close(fig)` after each chart to prevent memory leaks
- Override CronJob `command` to reuse the same image for batch jobs
- Proxy all external service access through the authenticated main app
- Return `null` from UI widgets when their backing service is unavailable
- Check for service URLs (`if (!URL) return`) before making internal calls

---

## Phase 3 Troubleshooting

### WebSocket Not Connecting

**Symptom**: Frontend shows "Live" badge never appears, `socket.on("connect")` never fires.

**Diagnosis**:
```bash
# Check if realtime pod is running
kubectl get pods -n task-manager -l app.kubernetes.io/component=realtime

# Check realtime logs
kubectl logs deployment/task-manager-realtime -n task-manager

# Check if /socket.io path is in the Ingress
kubectl get ingress -n task-manager -o yaml | grep socket.io
```

**Common causes**:
- `realtime.enabled` is false in Helm values (path not in Ingress)
- `NEXTAUTH_SECRET` mismatch between main app and realtime (JWT decryption fails)
- NGINX timeout annotations not set (connection dropped after 60s)

### JWT Decryption Fails

**Symptom**: Realtime logs show "Invalid token" for every connection attempt.

**Diagnosis**:
```bash
# Compare secrets
kubectl exec deployment/task-manager -n task-manager -- printenv NEXTAUTH_SECRET
kubectl exec deployment/task-manager-realtime -n task-manager -- printenv NEXTAUTH_SECRET
```

**Fix**: Both must be identical. If different, update the realtime deployment:
```bash
helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values
```

### Python Service Crash on Startup

**Symptom**: Analytics pod crashes immediately, `CrashLoopBackOff`.

**Diagnosis**:
```bash
kubectl logs deployment/task-manager-analytics -n task-manager
```

**Common causes**:
- `DATABASE_URL` not set (check Secret)
- asyncpg can't connect (check network, pgbouncer URL)
- `PYTHONUNBUFFERED` not set (no logs visible — can't diagnose)

### asyncpg "prepared statement does not exist"

**Symptom**: Analytics requests fail with `InvalidSQLStatementNameError`.

**Cause**: Forgot `statement_cache_size=0` — asyncpg uses prepared statements that PgBouncer doesn't support.

**Fix**: Ensure `statement_cache_size=0` in both `create_pool()` and `connect()` calls.

### CronJob Not Running

**Symptom**: Weekly report never generates.

**Diagnosis**:
```bash
# Check CronJob exists
kubectl get cronjob -n task-manager

# Check job history
kubectl get jobs -n task-manager

# Trigger manually to test
kubectl create job --from=cronjob/task-manager-weekly-report manual-report -n task-manager
kubectl logs job/manual-report -n task-manager
```

**Common causes**:
- `analytics.enabled` is false (CronJob not deployed)
- Timezone difference (schedule is in UTC — `0 9 * * 1` is 9 AM UTC, not local time)

### matplotlib "no display name"

**Symptom**: Weekly report crashes with `TclError: no display name`.

**Cause**: Forgot `matplotlib.use("Agg")` before importing `pyplot`.

**Fix**: Ensure the import order:
```python
import matplotlib
matplotlib.use("Agg")  # MUST be first
import matplotlib.pyplot as plt
```

### Realtime Events Not Reaching Browser

**Symptom**: Task created/updated but browser doesn't update until manual refresh.

**Diagnosis**:
1. Check realtime pod received the `/emit` POST:
```bash
kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-realtime:3001/emit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'test:event',room:'board',data:{hello:'world'}})}).then(r=>r.json()).then(j=>console.log(j))"
```

2. Check `REALTIME_URL` is set on the main app:
```bash
kubectl exec deployment/task-manager -n task-manager -- printenv REALTIME_URL
```

3. Check browser console for socket errors

**Common causes**:
- `REALTIME_URL` not injected (conditional Helm block not rendered)
- `emitToRealtime` swallowing errors silently (by design — check logs manually)
- Socket disconnected (check "Live" badge)

---

## What You've Learned in Stage 2 - Phase 3

### Technologies Mastered:
- WebSocket protocol (bidirectional, persistent connections)
- Socket.io (rooms, broadcasting, auto-reconnect, event-based API)
- `socket.io-client` (frontend WebSocket library)
- `jose` library (JWT encryption/decryption)
- NextAuth JWT session encryption (JWE format)
- NGINX Ingress WebSocket routing (path-based, timeout annotations)
- Kubernetes `sessionAffinity: ClientIP` (sticky sessions)
- Fire-and-forget inter-service communication
- Python 3.12 / FastAPI (polyglot web framework)
- Uvicorn ASGI server
- asyncpg (async PostgreSQL driver)
- PgBouncer prepared statement compatibility
- matplotlib headless rendering (`Agg` backend)
- `io.BytesIO` for in-memory image generation
- Python Docker multi-stage builds (`pip install --user`)
- Kubernetes CronJob for batch reporting
- API proxy pattern (auth-scoped service access)
- `Promise.all` for parallel API calls

### Core Concepts:
- HTTP vs WebSocket (request/response vs persistent bidirectional)
- Socket.io rooms (named groups for targeted broadcasting)
- WebSocket authentication (handshake `auth` field vs HTTP headers)
- Encrypted JWT (JWE) vs signed JWT (JWS)
- Shared secret as trust boundary between services
- NGINX longest-prefix match (path routing priority)
- Session affinity for stateful connections (WebSocket sticky sessions)
- Fire-and-forget as a reliability trade-off (simplicity > guaranteed delivery)
- Polyglot architecture (right language for the job)
- Shared database as cross-language contract (not shared types)
- ASGI vs WSGI (async vs sync Python web servers)
- Connection poolers and prepared statement incompatibility
- Headless rendering (no display server needed)
- Docker image reuse across workloads (server + CronJob)
- API proxy as security boundary (user can't bypass auth)
- Graceful degradation (all services are optional)

### Best Practices:
- Use Socket.io rooms instead of manual client tracking
- Share `NEXTAUTH_SECRET` across all services for JWT verification
- Set NGINX WebSocket timeouts to match session duration
- Only use `sessionAffinity` for stateful services
- Never block on real-time updates (fire-and-forget)
- Use refs in React to avoid stale closures in long-lived socket handlers
- Clean up socket connections on component unmount
- Choose Python for data analysis (matplotlib, pandas ecosystem)
- Always set `PYTHONUNBUFFERED=1` in Python containers
- Use `statement_cache_size=0` with asyncpg + PgBouncer
- Call `plt.close(fig)` after each chart in loops
- Reuse Docker images across workloads (override command)
- Proxy external service access through authenticated main app
- Return `null` from widgets when backing service is unavailable
- Check for service URLs before making internal calls

### Troubleshooting Skills:
- Debugging WebSocket connection failures
- Diagnosing JWT decryption mismatches across services
- Fixing asyncpg/PgBouncer prepared statement errors
- Resolving matplotlib headless rendering crashes
- Debugging CronJob execution (manual triggering, log inspection)
- Tracing event flow (main app → /emit → socket → browser)
- Diagnosing NGINX WebSocket routing issues
- Debugging Python service startup failures in Kubernetes
