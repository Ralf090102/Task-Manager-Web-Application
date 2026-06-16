# Stage 2 - Phase 1 Learning Summary

This document explains the core concepts and technologies implemented in Phase 1 of the Task Manager microservices expansion (Module 7: Recurring Task Scheduler). Each section includes real examples from your codebase.

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
13. [Key Patterns and Best Practices](#key-patterns-and-best-practices)
14. [Troubleshooting](#troubleshooting)

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
│   ├── notification/              # Module 1 (future)
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

---

## What You've Learned in Stage 2 - Phase 1

### Technologies Mastered:
- Microservices architecture in a monorepo
- Kubernetes CronJob workload type
- Shared Prisma schema across services
- `tsx` as a TypeScript runtime (vs `tsc` + `node`)
- `cron-parser` for schedule computation
- Helm chart multi-service organization
- Docker builds with shared monorepo context
- Bash cluster setup automation

### Core Concepts:
- CronJob lifecycle (schedule → Job → Pod → exit)
- `concurrencyPolicy: Forbid` for data safety
- ESM vs CommonJS module systems
- `import.meta.url` and why it breaks `tsc`
- Conditional Helm template rendering
- Prisma client generation during Docker build
- Idempotent deployment scripts

### Best Practices:
- Single source of truth for database schema
- Each service generates its own Prisma client
- Error isolation in batch processing
- Clean database disconnection on exit
- Module-level TypeScript configuration
- `.dockerignore` to optimize build context

### Troubleshooting Skills:
- Diagnosing ESM/CJS module conflicts
- Debugging CronJob pod failures
- Fixing TypeScript cross-compilation issues
- Manual CronJob triggering for testing

---

## Next Steps: Phase 2

In Phase 2, you'll learn:
- StatefulSet for persistent storage (MinIO, Meilisearch)
- Headless Services for direct pod access
- File upload/download microservice
- S3-compatible object storage (MinIO)
- Full-text search indexing (Meilisearch)

This will expand the architecture with stateful workloads and data-heavy services.
