# Level 6: Microservices Architecture

**Duration:** 10 hours  
**Goal:** Understand how 8 microservices work individually and together, and why this project split a monolith into separate services

---

## Table of Contents

1. [What Are Microservices?](#1-what-are-microservices)
2. [The Monolith-to-Microservices Journey](#2-the-monolith-to-microservices-journey)
3. [The Shared Schema Pattern](#3-the-shared-schema-pattern)
4. [Anatomy of a Microservice](#4-anatomy-of-a-microservice)
5. [Communication Patterns](#5-communication-patterns)
6. [The Scheduler: Run-Once Pattern](#6-the-scheduler-run-once-pattern)
7. [The Notification Service: Graceful Degradation](#7-the-notification-service-graceful-degradation)
8. [The File Service: External Storage Integration](#8-the-file-service-external-storage-integration)
9. [The Search Sync Service: Data Pipeline](#9-the-search-sync-service-data-pipeline)
10. [The Realtime Service: Statelessness](#10-the-realtime-service-statelessness)
11. [The Analytics Service: Polyglot Microservices](#11-the-analytics-service-polyglot-microservices)
12. [The Webhook Service: Background Workers](#12-the-webhook-service-background-workers)
13. [The Team Service: RBAC + Complexity](#13-the-team-service-rbac--complexity)
14. [The Service Dependency Graph](#14-the-service-dependency-graph)
15. [Hands-On Exercises](#15-hands-on-exercises)
16. [What You've Learned](#16-what-youve-learned)

---



## 1. What Are Microservices?



### The Monolith: Everything in One Box

In Levels 1 and 2, the Task Manager started as a **monolith** — a single Next.js application that does everything:

```
┌──────────────────────────────────────────────────────┐
│                    MONOLITH                          │
│                   (Next.js app)                      │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐    │
│  │  UI     │  │  API     │  │  Business Logic   │    │
│  │  Pages  │  │  Routes  │  │  - Task CRUD      │    │
│  │         │  │          │  │  - Notifications  │    │
│  │         │  │          │  │  - Search         │    │
│  │         │  │          │  │  - Recurring      │    │
│  │         │  │          │  │  - File Upload    │    │
│  │         │  │          │  │  - Analytics      │    │
│  │         │  │          │  │  - Webhooks       │    │
│  │         │  │          │  │  - Realtime       │    │
│  └─────────┘  └──────────┘  └───────────────────┘    │
│                       │                              │
│                       ▼                              │
│              ┌──────────────┐                        │
│              │  PostgreSQL  │                        │
│              └──────────────┘                        │
└──────────────────────────────────────────────────────┘

One codebase. One deployment. One process.
Everything shares the same memory, same database connection pool,
same event loop.
```

This works great — until it doesn't.

### When the Monolith Breaks Down

```
Problem 1: The search feature (Meilisearch) crashes
  -> Takes down the ENTIRE app
  -> Users can't even see their tasks

Problem 2: Webhook delivery needs a retry loop (polling every 2s)
  -> Blocks the Next.js event loop
  -> Every request becomes slow

Problem 3: Analytics needs Python (matplotlib, pandas)
  -> Can't run Python inside a Node.js app
  -> Would need a separate process anyway

Problem 4: The scheduler needs to run on a cron schedule
  -> Next.js is a web server, not a job runner
  -> Cron logic mixed with HTTP handlers

Problem 5: Team wants to scale only the file upload service
  -> Can't scale one feature independently
  -> Must scale the entire app (wasteful)
```



### The Microservices Solution

Split the monolith into **independent services**, each with a single responsibility:

```
┌──────────────────────────────────────────────────────────────────┐
│                     MICROSERVICES ARCHITECTURE                   │
│                                                                  │
│  ┌──────────────┐                                                │
│  │  Main App    │  Next.js — UI, auth, API routes                │
│  │  (:3000)     │  Talks to ALL microservices via HTTP           │
│  └──────┬───────┘                                                │
│         │                                                        │
│    ┌────┼────┬────────┬────────┬────────┬────────┬────────┐      │
│    ▼    ▼    ▼        ▼        ▼        ▼        ▼        ▼      │
│  ┌────┐┌──────┐┌─────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐   │
│  │Sched││Notif││File ││Search││Real- ││Analyt││Web-  ││Team  │   │
│  │uler ││     ││Svc  ││Sync  ││time  ││ics   ││hook  ││Svc   │   │
│  │Cron ││:3004││:3005││:3006 ││:3001 ││:8000 ││:3003 ││:3002 │   │
│  │Job  ││     ││     ││      ││      ││Python││      ││      │   │
│  └─────┘└─────┘└─────┘└──────┘└──────┘└──────┘└──────┘└──────┘   │
│    │      │     │      │           │      │      │      │        │
│    └──────┴─────┴──────┴───────────┴──────┴──────┴──────┘        │
│                            │                                     │
│                    ┌───────┴───────┐                             │
│                    │  PostgreSQL   │  (shared database)          │
│                    └───────────────┘                             │
│                                                                  │
│  Each service:                                                   │
│  - Has its own process (crash = isolated)                        │
│  - Has its own Docker image                                      │
│  - Can be scaled independently                                   │
│  - Can use a different language (Python analytics)               │
│  - Can be deployed/restarted without affecting others            │
└──────────────────────────────────────────────────────────────────┘
```



### Monolith vs Microservices: The Trade-offs

```
                      Monolith                    Microservices
                      ─────────                   ─────────────

Complexity            Low (one codebase)          High (8+ codebases)
Deployment            One command                 Helm chart with 11 services
Scaling               Scale everything            Scale what you need
Failure isolation     One crash = all down        One crash = one feature down
Technology choice     One language/framework      Any language per service
Development speed     Fast at first               Slower (network calls)
Team scaling          Everyone in one repo        Teams own services
Operational overhead  Low                         High (monitoring, networking)
Data sharing          Direct function calls       HTTP calls or shared DB
```

**Key insight:** Microservices don't eliminate complexity — they *move* it. The code gets simpler (each service does one thing), but the infrastructure gets more complex (networking, deployment, monitoring). Levels 3-5 taught you the infrastructure. This level teaches you the code.

### When to Use Microservices (and When Not To)

```
Use microservices when:
  - Different features need different technologies (Python for ML, Node for API)
  - Different features need different scaling (file upload gets 10x traffic)
  - A background task would block the main event loop (webhook retries)
  - A scheduled task doesn't fit a web server model (cron scheduler)
  - Teams need to work independently (team A deploys without team B)

 DON'T use microservices when:
  - The app is small (a CRUD app with 3 endpoints doesn't need 8 services)
  - You don't have container orchestration (Kubernetes) deployed yet
  - Your team is small and can't manage 8 deployments
  - The features don't have different scaling/technology needs
```

This project uses microservices as a **learning exercise** — a simple task manager would normally be a monolith. But the patterns you learn here apply to real-world systems with millions of users.

---



## 2. The Monolith-to-Microservices Journey

This project didn't start with 8 microservices. It evolved in phases. Understanding the evolution helps you understand *why* each service exists.

### Phase 1: The Monolith (Levels 1-2)

```
┌─────────────────────────────────────────┐
│            Next.js Monolith             │
│                                         │
│  - Task CRUD (API routes)               │
│  - Authentication (NextAuth)            │
│  - Dashboard UI                         │
│  - Direct database access (Prisma)      │
│                                         │
│  Everything runs in ONE Node.js process │
└──────────────────┬──────────────────────┘
                   │
            PostgreSQL (Supabase)
```

The monolith handled everything. No Docker, no Kubernetes, no microservices. Just `npm run dev` and a database URL.

### Phase 2: Adding Infrastructure (Levels 3-5)

```
                    Docker Container
                   ┌────────────────────┐
                   │  Next.js Monolith  │
                   │  (standalone build)│
                   └────────┬───────────┘
                            │
                    Kubernetes Cluster
                   ┌────────┴──────────┐
                   │  PostgreSQL       │
                   │  (Supabase)       │
                   └───────────────────┘
```

The monolith was containerized, deployed to Kubernetes, and managed with Helm. But it was still ONE service doing everything.

### Phase 3: Extracting Microservices (This Level)

Services were extracted one at a time, each solving a specific problem the monolith couldn't handle well:

```
Extraction Order (by phase):

Phase 3.1 (Core scheduling + notifications):
  ├── Module 7: Scheduler ─── "We need recurring tasks on a cron schedule"
  ├── Module 1: Notification ─ "Email/in-app notifications shouldn't block the API"
  ├── Module 2: File Service ─ "File uploads need S3-compatible storage (MinIO)"
  └── Module 5: Search Sync ── "Full-text search needs Meilisearch indexing"

Phase 3.2 (Real-time + integrations):
  ├── Module 4: Realtime ───── "Live updates need WebSockets (Socket.io)"
  ├── Module 3: Analytics ──── "Reporting needs Python (matplotlib + asyncpg)"
  └── Module 6: Webhook ────── "External integrations need retry logic (background worker)"

Phase 3.3 (Collaboration):
  └── Module 8: Team Service ─ "Multi-user teams need RBAC + Kanban boards"
```



### The 8 Services at a Glance


| #   | Service          | Language   | Framework     | Port | DB             | Why It's Separate                          |
| --- | ---------------- | ---------- | ------------- | ---- | -------------- | ------------------------------------------ |
| 1   | **Scheduler**    | TypeScript | None (script) | N/A  | Prisma         | Cron schedule, not a web server            |
| 2   | **Notification** | TypeScript | Fastify       | 3004 | Prisma         | Email sending is slow, shouldn't block API |
| 3   | **File Service** | TypeScript | Fastify       | 3005 | Prisma + S3    | Needs external storage (MinIO)             |
| 4   | **Search Sync**  | TypeScript | Fastify       | 3006 | Prisma + Meili | Syncs PostgreSQL to Meilisearch            |
| 5   | **Realtime**     | TypeScript | Socket.io     | 3001 | None           | WebSocket server (different protocol)      |
| 6   | **Analytics**    | **Python** | FastAPI       | 8000 | asyncpg        | Needs Python libraries (matplotlib)        |
| 7   | **Webhook**      | TypeScript | Fastify       | 3003 | Prisma         | Background polling worker (2s loop)        |
| 8   | **Team Service** | TypeScript | Fastify       | 3002 | Prisma         | Complex RBAC logic, own domain model       |




### What the Main App Still Does

After extracting 8 services, the main Next.js app is NOT just a UI. It's also the **API gateway** — the only service that users talk to directly:

```
Browser
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│  Main App (Next.js :3000)                                │
│                                                          │
│  - Renders UI (React pages)                              │
│  - Handles authentication (NextAuth)                     │
│  - Proxies requests to microservices                     │
│  - Emits events to realtime/webhook after mutations      │
│  - Searches Meilisearch directly                         │
│                                                          │
│  The main app is the ONLY service with an Ingress.       │
│  All other services are ClusterIP-only (internal).       │
└──────────────────────────────────────────────────────────┘
```

This is called the **API Gateway pattern** — one public-facing service that routes to internal services. It's the most common microservices topology.

### What Was NOT Extracted

Not everything became a microservice. Some things stayed in the monolith because they don't benefit from separation:

```
Stayed in main app:
  - Task CRUD (API routes directly query PostgreSQL via Prisma)
  - Authentication (NextAuth handles login, sessions, JWT)
  - Recurring task configuration (UI + API for creating templates)
  - Webhook configuration (UI + API for registering URLs)
  - Search query (calls Meilisearch directly, no need for a proxy)
  - Stats widget UI (calls analytics service, but renders results itself)

Why stay? These are simple database reads/writes that don't need
background processing, external dependencies, or a different language.
```

---



## 3. The Shared Schema Pattern



### The Problem: Schema Duplication

In a microservices architecture, each service typically owns its own database. But this project has **7 services reading the same PostgreSQL database**. They all need to know the table structure.

Without a shared schema, you'd have this nightmare:

```
Each service maintains its own copy of the schema:

services/scheduler/prisma/schema.prisma     <- defines Task, RecurringTask
services/notification/prisma/schema.prisma  <- defines Task, Notification
services/file-service/prisma/schema.prisma  <- defines Task, Attachment
services/webhook/prisma/schema.prisma       <- defines Task, Webhook, WebhookDelivery
services/team-service/prisma/schema.prisma  <- defines Task, Team, Member, Board

Problems:
  - Add a column to Task? Edit 5 files.
  - Rename a field? Edit 5 files. Miss one? Runtime crash.
  - Schema drift: service A thinks Task has "priority", service B doesn't
  - No single source of truth
```



### The Solution: One Schema, Copied at Build Time

This project uses a **shared schema pattern**: one `schema.prisma` file, copied into each service's Docker image during the build:

```
task-manager/
├── prisma/
│   └── schema.prisma          ← THE source of truth (single file)
│
├── src/                        ← Main app uses it directly
│   └── generated/prisma/      ← Generated client (gitignored)
│
└── services/
    ├── scheduler/
    │   └── Dockerfile          ← COPIES schema at build time
    ├── notification/
    │   └── Dockerfile          ← COPIES schema at build time
    ├── webhook/
    │   └── Dockerfile          ← COPIES schema at build time
    └── ... (each service)
```



### How the Copy Works (Docker Build)

Each service's Dockerfile copies the schema from the shared location:

```dockerfile
# services/notification/Dockerfile (simplified)

FROM node:22-slim AS base
WORKDIR /app
COPY services/notification/package.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
# ── THIS IS THE KEY LINE ──
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/notification/prisma.config.ts ./
# Generate a FRESH Prisma client from the shared schema
RUN npx prisma generate
COPY services/notification/src/ ./src/

FROM base AS runner
RUN npm prune --omit=dev
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
```

```
Build flow:

  prisma/schema.prisma (shared)
         │
         ▼ (Docker COPY)
  /app/prisma/schema.prisma (inside builder stage)
         │
         ▼ (npx prisma generate)
  /app/src/generated/prisma/ (fresh client)
         │
         ▼ (copied to runner stage)
  Running container has its own Prisma client
  generated from the SAME schema as the main app
```



### Why Not Share a Generated Client?

You might wonder: why not generate the Prisma client once and share the generated files?

```
Option A (what we do): Copy schema, generate fresh per service
  pro: Each service gets a clean, compatible client
  pro: No git conflicts from generated files
  pro: Prisma 7.8 generates .ts files (ESM), needs tsx runtime
  con: Slower Docker builds (prisma generate runs per service)

Option B (NOT used): Share generated client files
  con: Prisma 7.8 generates .ts files with import.meta.url (ESM)
  con: Generated files are gitignored (won't sync between services)
  con: Version mismatches if one service updates but another doesn't
  con: Prisma adapter (PrismaPg) needs to be configured per-service
```



### The Prisma Client Initialization Pattern

Every database-connected service initializes Prisma the same way:

```typescript
// Every service's src/index.ts starts with:

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });
```

```
Why the adapter pattern?

  PostgreSQL connection string
         │
         ▼
  PrismaPg adapter           ← Handles the actual TCP connection
         │                      to PostgreSQL (Supabase)
         ▼
  PrismaClient               ← Your code calls prisma.task.findMany()
         │                      etc.
         ▼
  PostgreSQL (Supabase)
```

The adapter pattern (Prisma 7.8+) replaces the old engine-based connection. Each service creates its own connection pool to the same database.

### Which Models Does Each Service Use?

Even though all services share the full schema, each only uses the models relevant to its job:

```
schema.prisma has ~12 models. Each service uses a subset:

Scheduler:       RecurringTask, Task, Notification
Notification:    Task, Notification
File Service:    Task, Attachment
Search Sync:     Task
Realtime:        (no database access — no Prisma)
Analytics:       Task (via asyncpg, not Prisma)
Webhook:         Webhook, WebhookDelivery, Task, Notification
Team Service:    Team, Member, Board, Activity, Task
Main App:        ALL models (it's the gateway)
```

**Trade-off:** Each service "knows about" models it doesn't use (they're in the generated client). This is acceptable because:

1. The schema is a build-time artifact, not a runtime dependency
2. Services don't *query* models they don't need — unused code is tree-shaken
3. The alternative (per-service schemas) causes drift and maintenance burden



### The Analytics Exception: asyncpg Instead of Prisma

The analytics service is Python, not TypeScript. It can't use Prisma at all. Instead, it uses `asyncpg` (raw SQL driver) and queries the same database:

```python
# services/analytics/main.py (simplified)

import asyncpg

async def get_stats(user_id: str):
    pool = await asyncpg.create_pool(
        dsn=clean_db_url(process.env.DATABASE_URL),
        min_size=1, max_size=5,
        statement_cache_size=0,  # pgbouncer compatibility
    )
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            'SELECT status, COUNT(*) FROM "Task" '
            'WHERE "userId" = $1 GROUP BY status',
            user_id
        )
    return rows
```

This service reads the schema differently (raw SQL instead of Prisma's type-safe client), but accesses the same tables. The table name `"Task"` (PascalCase) comes from Prisma's default naming convention.

---



## 4. Anatomy of a Microservice

Before diving into individual services, let's look at the **common structure** they all share. Every Node.js microservice in this project follows the same skeleton.

### The Standard Directory Layout

```
services/notification/          ← Each service is a self-contained package
├── package.json                ← Own dependencies, own version
├── package-lock.json           ← Locked dependency tree
├── tsconfig.json               ← TypeScript config (moduleResolution: "bundler")
├── prisma.config.ts            ← Prisma config pointing to shared schema
├── .gitignore                  ← Ignores generated/, node_modules/
├── Dockerfile                  ← Multi-stage build (copy schema, generate, run)
├── scripts/
│   └── test.ts                 ← Debug commands (run via tsx in pod)
└── src/
    └── index.ts                ← The entire service (entry point)
```



### package.json — Each Service is Independent

```jsonc
// services/notification/package.json
{
  "name": "notification-service",
  "private": true,
  "type": "module",             // ES modules (import/export, not require)
  "scripts": {
    "start": "tsx src/index.ts" // tsx = TypeScript executor (no compilation step)
  },
  "dependencies": {
    "fastify": "^5.0.0",        // HTTP framework
    "@prisma/adapter-pg": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "nodemailer": "^6.9.0",     // Email sending
    "tsx": "^4.0.0"             // TypeScript runtime
  }
}
```

**Key points:**

- `"type": "module"` — uses ES module syntax (`import`/`export`), not CommonJS (`require`)
- `tsx` — runs TypeScript directly without compiling first. This is required because Prisma 7.8 generates `.ts` files with `import.meta.url` (ESM syntax incompatible with CJS compilation)
- Each service has its OWN `package.json` with only the dependencies IT needs



### tsconfig.json — Minimal TypeScript Config

```jsonc
// services/notification/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",  // Required for tsx + ESM
    "strict": true,
    "noEmit": true                  // tsx runs directly, no .js output
  }
}
```

`noEmit: true` means TypeScript is only used for type-checking. The actual execution is handled by `tsx`, which transpiles on the fly.

### prisma.config.ts — Pointing to the Shared Schema

```typescript
// services/notification/prisma.config.ts
export default {
  schema: "./prisma/schema.prisma",  // Copied from shared location during Docker build
  // No output path — Prisma 7.8 generates to ./src/generated/prisma/
};
```

This tiny file tells Prisma where to find the schema. The schema itself is copied during the Docker build, not committed to the service directory.

### src/index.ts — The Service Entry Point

Every Node.js microservice follows this pattern:

```typescript
// services/notification/src/index.ts (structure overview)

// 1. IMPORTS
import Fastify from "fastify";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";
import nodemailer from "nodemailer";

// 2. DATABASE SETUP
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// 3. EXTERNAL SERVICE SETUP (if needed)
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({ /* SMTP config */ })
  : null;  // graceful degradation — null if no SMTP

// 4. HTTP SERVER
const app = Fastify({ logger: true });

// 5. HEALTH CHECK (every service has this)
app.get("/health", async () => ({ status: "ok" }));

// 6. BUSINESS ENDPOINTS
app.post("/notify/due-soon", async (request, reply) => {
  // Find due tasks, send emails, create notifications
});

// 7. STARTUP
const start = async () => {
  try {
    await app.listen({ port: 3004, host: "0.0.0.0" });
    console.log("Notification service listening on :3004");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```



### The Three Variations

While all services share this skeleton, there are three important variations:

**Variation 1: The Scheduler (no HTTP server)**

```typescript
// services/scheduler/src/index.ts — NO Fastify, NO listen()

async function run() {
  // Query database for due recurring tasks
  // Create tasks from templates
  // Update nextRun dates
  await prisma.$disconnect();  // Clean up
  process.exit(0);              // Exit — K8s CronJob expects completion
}

run();
```

The scheduler isn't a server. It's a script that runs, does its job, and exits.

**Variation 2: The Realtime Service (no Fastify, no Prisma)**

```typescript
// services/realtime/src/index.ts — uses raw http + Socket.io

import http from "http";
import { Server } from "socket.io";
import { jwtDecrypt } from "jose";

const server = http.createServer();  // Raw Node.js HTTP
const io = new Server(server, { /* Socket.io config */ });

// NO Prisma — this service doesn't touch the database
// Auth: decrypts NextAuth JWT to identify users
```

Realtime is the outlier — different framework, no database access, different protocol (WebSocket).

**Variation 3: The Webhook Service (HTTP server + background worker)**

```typescript
// services/webhook/src/index.ts — Fastify PLUS a background loop

const app = Fastify();

// HTTP endpoints (like other services)
app.get("/health", ...);
app.post("/trigger", ...);

// BUT ALSO: a background worker running alongside the server
async function processDeliveries() {
  while (!shuttingDown) {
    // Poll database for pending webhook deliveries
    // Attempt delivery with HMAC signing + retry logic
    await sleep(POLL_INTERVAL_MS);
  }
}

// Both start simultaneously
app.listen({ port: 3003 });
processDeliveries();  // Runs in parallel with the HTTP server
```

The webhook service is the only one that runs a background worker alongside its HTTP server.

### The Dockerfile Pattern

All Node.js services use the same 3-stage Dockerfile (from Level 3):

```
Stage 1: base       → Install dependencies (npm ci)
Stage 2: builder    → Copy schema, generate Prisma, copy source
Stage 3: runner     → Production image (pruned deps + source from builder)
```

The analytics service (Python) uses a different Dockerfile:

```
Stage 1: builder    → pip install dependencies
Stage 2: final      → Production image with Python + app code
```



### The /health Endpoint Convention

Every long-running service exposes `GET /health`:

```
Notification:  GET /health  →  { "status": "ok" }
File Service:  GET /health  →  { "status": "ok" }
Search Sync:   GET /health  →  { "status": "ok" }
Realtime:      GET /health  →  { "status": "ok", "connections": 3 }
Analytics:     GET /health  →  { "status": "ok" }
Webhook:       GET /health  →  { "status": "ok" }
Team Service:  GET /health  →  { "status": "ok" }
```

Kubernetes readiness probes call this endpoint. If it returns non-200, the pod is marked "not ready" and traffic stops flowing to it. The scheduler has no `/health` because it's a CronJob — nobody checks if it's healthy, it just runs and exits.

---



## 5. Communication Patterns

How do 9 services (main app + 8 microservices) talk to each other? This project uses three distinct communication patterns.

### Pattern 1: Fire-and-Forget (Async, One-Way)

The most common pattern. The main app sends an HTTP POST to a microservice and **doesn't wait for the result**:

```typescript
// src/lib/realtime.ts (simplified)

export async function emitToRealtime(event: string, data: any) {
  try {
    await fetch(`${process.env.REALTIME_URL}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, room: "board", data }),
    });
  } catch {
    // Silently fail — realtime is best-effort
    // The task was still saved to the database
  }
}
```

```
User creates a task:
  1. POST /api/tasks (main app)
  2. Main app saves task to PostgreSQL          ← MUST succeed
  3. Main app calls emitToRealtime()            ← best-effort, don't wait
  4. Main app calls triggerWebhook()            ← best-effort, don't wait
  5. Main app calls searchSync()                ← best-effort, don't wait
  6. Main app returns 201 Created to user       ← user doesn't know about 3-5

If step 3 fails (realtime service down):
  - Task is still saved (step 2 succeeded)
  - User doesn't see real-time update (minor)
  - Page refresh will show the task (reads from DB)
  - No data loss, just a delayed UI update
```

**When to use:** Non-critical side effects (notifications, real-time updates, search indexing). The core operation (database write) has already succeeded.

**Who uses it:** Realtime, Webhook, Search Sync, Notification

### Pattern 2: Synchronous Proxy (Wait for Response)

The main app calls a microservice and **waits for the result** before responding to the user:

```typescript
// src/app/api/tasks/search/route.ts (simplified)

export async function GET(request: Request) {
  const { q, status, priority } = params;

  // Call search service SYNCHRONOUSLY — user is waiting
  const response = await fetch(
    `${process.env.MEILI_URL}/indexes/tasks/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MEILI_MASTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, filter: { status, priority, userId } }),
    }
  );

  const results = await response.json();
  return Response.json(results);  // User sees search results
}
```

```
User searches for "meeting":
  1. GET /api/tasks/search?q=meeting (main app)
  2. Main app calls Meilisearch directly        ← MUST succeed (user is waiting)
  3. Meilisearch returns matching documents
  4. Main app returns results to user

If step 2 fails (Meilisearch down):
  - User sees an error: "Search unavailable"
  - No fallback (the database can't do full-text search)
```

**When to use:** When the user needs the result to proceed. The main app is a proxy — it doesn't do the work itself, it forwards the request and returns the response.

**Who uses it:** Search (Meilisearch queries), Analytics (stats endpoints), Team Service (team/board operations), File Service (file download)

### Pattern 3: Scheduled (No User Request)

Some services run on their own schedule, independent of user actions:

```
Scheduler (CronJob every 5 minutes):
  1. K8s creates a Pod at the scheduled time
  2. Scheduler queries PostgreSQL for due RecurringTasks
  3. Creates Task records from templates
  4. Updates nextRun dates
  5. Pod exits

Analytics Weekly Report (CronJob every Monday 9 AM UTC):
  1. K8s creates a Pod
  2. Queries PostgreSQL for weekly stats
  3. Generates matplotlib charts
  4. Creates in-app Notification records
  5. Pod exits

Webhook Delivery Worker (continuous, every 2s):
  1. Polls WebhookDelivery table for pending records
  2. Attempts HTTP POST to registered URLs
  3. Retries with exponential backoff on failure
  4. Marks as failed after 5 attempts (dead letter)
```

**When to use:** Background work that doesn't need user interaction. Scheduled tasks, cleanup jobs, delivery workers.

**Who uses it:** Scheduler, Analytics (weekly report), Webhook (background worker)

### The Communication Map

```
                    ┌──────────────────────────────────────────────┐
                    │              MAIN APP (:3000)                │
                    │         (API Gateway — only public service)  │
                    └──────┬──────┬──────┬──────┬──────┬───────────┘
                           │      │      │      │      │
          ┌────────────────┘      │      │      │      └──────────────┐
          │   fire-and-forget     │      │      │           sync proxy│
          ▼                       ▼      │      ▼                      ▼
  ┌───────────────┐  ┌───────────────┐  │  ┌──────────┐    ┌───────────────┐
  │  Realtime     │  │  Webhook      │  │  │Meilisearch│   │  Team Service │
  │  (:3001)      │  │  (:3003)      │  │  │  (:7700)  │   │  (:3002)      │
  │  fire-forget  │  │  fire-forget  │  │  │  sync     │   │  sync proxy   │
  └───────────────┘  └───────────────┘  │  └──────────┘    └───────────────┘
                                        │
          ┌─────────────────────────────┘
          │   fire-and-forget (after task mutations)
          ▼
  ┌───────────────┐          ┌───────────────┐
  │  Search Sync  │          │  Notification │
  │  (:3006)      │          │  (:3004)      │
  │  fire-forget  │          │  fire-forget  │
  └───────────────┘          └───────────────┘

  NOT called by main app (autonomous):
  ┌───────────────┐          ┌───────────────┐
  │  Scheduler    │          │  Analytics    │
  │  (CronJob)    │          │  (:8000)      │
  │  scheduled    │          │  sync (stats) │
  │  reads DB     │          │  + CronJob    │
  └───────────────┘          └───────────────┘
```



### Why Not Use Message Queues?

In larger systems, fire-and-forget often uses a message broker (RabbitMQ, Kafka, Redis Pub/Sub) instead of direct HTTP calls:

```
This project (direct HTTP):          Enterprise (message queue):

Main app                             Main app
  → POST notification:3004             → publish to "notifications" topic
  → POST search-sync:3006                (returns immediately)
  → POST realtime:3001
                                     Message broker (RabbitMQ/Kafka)
If notification is down:               → routes to notification service
  → POST fails silently                  (retries automatically)
  → Event is LOST                      → routes to search-sync service
                                       → routes to realtime service
                                     If notification is down:
                                       → Message queued, delivered later
                                       → ZERO data loss
```

This project uses direct HTTP because:

1. It's simpler (no additional infrastructure to deploy)
2. The fire-and-forget events are non-critical (task is already in the database)
3. A page refresh recovers from missed real-time events

In production with millions of users, you'd add Kafka or RabbitMQ for guaranteed delivery.

---



## 6. The Scheduler: Run-Once Pattern

The simplest microservice. No HTTP server, no framework, no port. Just a script that runs and exits.

### What It Does

```
Every 5 minutes (K8s CronJob schedule):
  1. Query RecurringTask records where active = true AND nextRun <= now
  2. For each due template:
     a. Parse the cron expression to find the next run time
     b. Create a new Task from the template
     c. Update the template's lastRun and nextRun
     d. Create a Notification ("New task created from recurring template")
  3. Disconnect from database
  4. Exit (process.exit(0))
```



### The Code

```typescript
// services/scheduler/src/index.ts (simplified)

import cronParser from "cron-parser";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function run() {
  const now = new Date();

  // Find all recurring tasks that are due
  const dueTasks = await prisma.recurringTask.findMany({
    where: { active: true, nextRun: { lte: now } },
  });

  console.log(`[scheduler] Found ${dueTasks.length} due recurring tasks`);

  for (const template of dueTasks) {
    try {
      // Calculate next run time from cron expression
      const interval = cronParser.parseExpression(template.cronExpression);
      const nextRun = interval.next().toDate();

      // Create the actual task
      await prisma.task.create({
        data: {
          title: template.title,
          description: template.description,
          priority: template.priority,
          status: "TODO",
          userId: template.userId,
          dueDate: template.dueDate,
        },
      });

      // Update the template
      await prisma.recurringTask.update({
        where: { id: template.id },
        data: { lastRun: now, nextRun },
      });

      console.log(`[scheduler] Created task from template: ${template.title}`);
    } catch (err) {
      // ONE failed template doesn't stop others
      console.error(`[scheduler] Error for template ${template.id}:`, err);
    }
  }

  await prisma.$disconnect();
  process.exit(0);
}

run();
```



### Why It's a Separate Service

```
Can't this run inside Next.js?

Option 1: Use a cron library inside Next.js (node-cron)
  Problem: Next.js runs multiple instances (replicas)
  → Each instance would try to create the same task
  → Duplicate tasks!

Option 2: Use a K8s CronJob (what we do)
  → K8s ensures exactly ONE Pod runs at a time
  → concurrencyPolicy: Forbid prevents overlapping runs
  → If the Pod fails, K8s can retry
  → Clean separation: web server vs batch job
```



### K8s CronJob Configuration

```yaml
# helm-chart/templates/scheduler/cronjob.yaml (simplified)
apiVersion: batch/v1
kind: CronJob
metadata:
  name: task-manager-scheduler
spec:
  schedule: "*/5 * * * *"          # Every 5 minutes
  concurrencyPolicy: Forbid          # Don't overlap runs
  successfulJobsHistoryLimit: 3      # Keep last 3 successful Pods
  failedJobsHistoryLimit: 1          # Keep last 1 failed Pod
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: scheduler
              image: ralf090102/scheduler-service:latest
              command: ["npx", "tsx", "src/index.ts"]
```

**No Service resource** — the scheduler has no network endpoint. Nobody calls it. K8s creates it on schedule, it runs, it exits.

### Error Handling Philosophy

```
Template 1: cron = "*/5 * * * *"  → succeeds
Template 2: cron = "INVALID"       → throws error
Template 3: cron = "0 9 * * *"    → succeeds

Without per-template try/catch:
  Template 1 succeeds
  Template 2 crashes the script
  Template 3 NEVER RUNS ← bad

With per-template try/catch (what we do):
  Template 1 succeeds
  Template 2 fails (logged, continues)
  Template 3 succeeds ← correct
```

---



## 7. The Notification Service: Graceful Degradation

A Fastify HTTP service that sends emails and creates in-app notifications. The key pattern here is **graceful degradation** — it works even when SMTP is not configured.

### What It Does

```
Two endpoints:

POST /notify/due-soon
  1. Query tasks due within 24 hours (not completed)
  2. For each task:
     a. Send email to the task owner (if SMTP configured)
     b. Create in-app Notification in the database (always)

POST /notify/task-completed
  1. Send "task completed" email (if SMTP configured)
  2. Create in-app Notification (always)
```



### The Graceful Degradation Pattern

```typescript
// services/notification/src/index.ts (simplified)

import nodemailer from "nodemailer";

// If SMTP_HOST is set, create a real transporter
// If SMTP_HOST is empty, transporter is null
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || "587"),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    })
  : null;

// Helper: sends email ONLY if transporter exists
async function sendEmail(to: string, subject: string, text: string) {
  if (!transporter) {
    console.log("[notification] SMTP not configured — skipping email");
    return;  // Silent skip, not an error
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
  });
}
```

```
With SMTP configured:
  POST /notify/due-soon
    → Email sent to user@example.com
    → Notification created in database
    → User gets both email AND in-app notification

Without SMTP (graceful degradation):
  POST /notify/due-soon
    → [notification] SMTP not configured — skipping email
    → Notification created in database  ← STILL WORKS
    → User gets in-app notification only
```

**Why this matters:** In development (Docker Compose, Minikube), you don't have an SMTP server. The notification service still works — it creates database records you can see in the UI. In production, you'd configure SMTP and emails start flowing.

### How the Main App Calls It

```typescript
// Main app — fire-and-forget pattern

// After a task is completed:
await fetch(`${process.env.NOTIFICATION_URL}/notify/task-completed`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    taskId: task.id,
    title: task.title,
    userEmail: user.email,
    userId: user.id,
  }),
});
```

The main app doesn't wait for the email to actually send. It fires the request and moves on. The notification service handles the rest asynchronously.

### SMTP Secret in Helm

```yaml
# helm-chart/templates/notification/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: task-manager-notification-secret
type: Opaque
stringData:
  SMTP_HOST: "{{ .Values.notification.smtp.host }}"
  SMTP_PORT: "{{ .Values.notification.smtp.port }}"
  SMTP_FROM: "{{ .Values.notification.smtp.from }}"
  SMTP_USER: "{{ .Values.notification.smtp.user }}"
  SMTP_PASSWORD: "{{ .Values.notification.smtp.password }}"
```

When deploying to Minikube without SMTP:

```bash
--set notification.smtp.host=""  # Empty = graceful degradation
```

---



## 8. The File Service: External Storage Integration

A Fastify service that handles file uploads/downloads using S3-compatible storage (MinIO). This service demonstrates integration with an **external dependency** (object storage) alongside the database.

### What It Does

```
Endpoints:

POST /upload
  - Multipart form data (file + x-task-id header)
  - 50MB max file size
  - Stores file in MinIO (S3 bucket)
  - Creates Attachment record in PostgreSQL
  - Returns { id, filename, size, mimeType }

GET /download/:id
  - Streams file from MinIO with correct Content-Type
  - Browser downloads the file

GET /attachments/:taskId
  - Lists all attachments for a task

DELETE /attachments/:id
  - Deletes file from MinIO
  - Deletes Attachment record from PostgreSQL
```



### The Dual Storage Pattern

The file service writes to TWO storage systems:

```
Upload request:
  │
  ├──→ MinIO (S3)             ← Binary file data (images, PDFs, etc.)
  │     Bucket: task-attachments
  │     Key: {taskId}/{filename}
  │
  └──→ PostgreSQL             ← Metadata (filename, size, mime type)
        Table: Attachment
        Fields: id, taskId, filename, mimeType, size, storageKey
```

```
Why two stores?

  MinIO (binary):   Fast streaming, handles large files, S3-compatible API
  PostgreSQL (meta): Queryable, joins with Task, indexed searches

  You can't efficiently query "show me all attachments for task X"
  from an S3 bucket. But you CAN query the Attachment table and
  then stream each file from MinIO.
```



### S3 Client Configuration for MinIO

```typescript
// services/file-service/src/index.ts (simplified)

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// MinIO is S3-compatible but needs forcePathStyle
const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,  // http://task-manager-minio:9000
  region: "us-east-1",                    // Required by SDK but ignored by MinIO
  forcePathStyle: true,                   // CRITICAL for MinIO
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
});
```

```
AWS S3 URL format:    https://bucket.s3.amazonaws.com/key
MinIO URL format:     http://minio:9000/bucket/key  (path-style)

forcePathStyle: true tells the SDK to use MinIO's URL format
instead of AWS's virtual-hosted-style format.
```



### Bucket Auto-Creation with Retry

MinIO might not be ready when the file service starts. The service retries bucket creation with exponential backoff:

```typescript
async function ensureBucket() {
  const maxAttempts = 5;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: "task-attachments" }));
      console.log("[file-service] Bucket created");
      return;
    } catch (err) {
      if (err.name === "BucketAlreadyOwnedByYou") {
        console.log("[file-service] Bucket already exists");
        return;
      }
      console.log(`[file-service] Bucket attempt ${i + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      // 1s, 2s, 4s, 8s, 16s backoff
    }
  }
  throw new Error("Failed to create bucket after 5 attempts");
}

ensureBucket().then(() => {
  app.listen({ port: 3005, host: "0.0.0.0" });
});
```

This is a **defense-in-depth** strategy:

1. K8s initContainer waits for MinIO health endpoint before starting file-service
2. File-service itself retries bucket creation if MinIO is briefly unavailable



### File Upload Flow

```
1. Browser sends multipart form to main app
   POST /api/tasks/[id]/attachments (with file)

2. Main app forwards to file service:
   POST file-service:3005/upload
   Header: x-task-id: abc123
   Body: multipart (file bytes)

3. File service:
   a. Parse multipart data (Fastify @fastify/multipart)
   b. Generate storage key: "abc123/report.pdf"
   c. Upload to MinIO: PutObjectCommand({ Bucket, Key, Body })
   d. Create Attachment record: prisma.attachment.create({ ... })
   e. Return { id, filename, size, mimeType }

4. Main app returns response to browser
```

---



## 9. The Search Sync Service: Data Pipeline

A Fastify service that keeps Meilisearch (full-text search engine) in sync with PostgreSQL. This service demonstrates the **data pipeline** pattern — moving data between two storage systems.

### The Problem It Solves

PostgreSQL is great for CRUD operations but terrible at full-text search:

```
PostgreSQL LIKE query:
  SELECT * FROM "Task" WHERE title LIKE '%meeting%'
  → Full table scan (slow with millions of rows)
  → No typo tolerance ("meting" finds nothing)
  → No relevance ranking
  → No instant search (autocomplete)

Meilisearch:
  POST /indexes/tasks/search { q: "meeting" }
  → Sub-millisecond response (inverted index)
  → Typo tolerance ("meting" still finds "meeting")
  → Ranked by relevance
  → Supports faceted search (filter by status, priority)
```

But Meilisearch is a **separate database**. It doesn't automatically know when PostgreSQL changes. The search-sync service bridges this gap.

### What It Does

```
Endpoints:

POST /sync/task         — Incremental sync (one task changed)
  Body: { id, title, description, status, priority, userId, ... }
  → Adds or updates a single document in Meilisearch

DELETE /sync/task/:id   — Remove from index
  → Deletes a document when a task is deleted

POST /sync/all          — Bulk reindex
  → Reads ALL tasks from PostgreSQL
  → Pushes them all to Meilisearch
  → Used for initial setup or full rebuild
```



### The Sync Flow

```
User creates/updates/deletes a task:

1. Main app writes to PostgreSQL       ← Source of truth
2. Main app fires POST /sync/task      ← Fire-and-forget to search-sync
3. Search-sync pushes to Meilisearch   ← Search index updated

User searches:
1. Main app queries Meilisearch        ← Fast full-text search
2. Returns results to user             ← No PostgreSQL involved
```

```
┌─────────────┐     write       ┌──────────────┐
│ PostgreSQL  │ ◄────────────── │   Main App   │
│ (source)    │                 └──────┬───────┘
└─────────────┘                        │
                                       │ fire-and-forget
                                       ▼
┌─────────────┐     sync         ┌──────────────┐
│ Meilisearch │ ◄──────────────  │ Search Sync  │
│ (index)     │                  │ (:3006)      │
└─────────────┘                  └──────────────┘
```



### Index Configuration on Startup

Meilisearch needs to know which fields are searchable and filterable. The search-sync service configures this on startup:

```typescript
// services/search-sync/src/index.ts (simplified)

import { MeiliSearch } from "meilisearch";

const client = new MeiliSearch({
  host: process.env.MEILI_URL,         // http://task-manager-meilisearch:7700
  apiKey: process.env.MEILI_MASTER_KEY,
});

async function configureIndex() {
  // Create index with explicit primary key
  // Meilisearch can't infer it when multiple fields end with "id"
  await client.createIndex("tasks", { primaryKey: "id" });

  await client.index("tasks").updateSearchableAttributes([
    "title",
    "description",
  ]);

  await client.index("tasks").updateFilterableAttributes([
    "status",    // Users can filter: status:TODO
    "priority",  // Users can filter: priority:HIGH
    "userId",    // Security: only see YOUR tasks
  ]);
}

configureIndex().then(() => {
  app.listen({ port: 3006, host: "0.0.0.0" });
});
```

**The primaryKey gotcha:** Meilisearch tries to guess the primary key by looking for a field ending in "id". But this schema has both `id` and `userId` — Meilisearch picks the wrong one. Setting `primaryKey: "id"` explicitly prevents this.

### The userId Filter (Security)

```
When user A searches for "meeting":
  POST /api/tasks/search?q=meeting

Main app queries Meilisearch:
  POST /indexes/tasks/search
  {
    q: "meeting",
    filter: { userId: "user-A" }    ← SECURITY: scoped to user A
  }

Meilisearch returns ONLY user A's tasks matching "meeting"
User B's tasks are never exposed
```

The `userId` filterable attribute isn't just for convenience — it's a security boundary. Each user only searches their own tasks.

### Bulk Reindex

When Meilisearch is first deployed (empty index) or needs a full rebuild:

```typescript
app.post("/sync/all", async () => {
  // Read ALL tasks from PostgreSQL
  const tasks = await prisma.task.findMany({
    select: {
      id: true, title: true, description: true,
      status: true, priority: true, userId: true,
    },
  });

  // Push all documents to Meilisearch in one batch
  await client.index("tasks").addDocuments(tasks);

  return { indexed: tasks.length };
});
```

This is triggered manually after initial deployment:

```bash
kubectl exec deployment/task-manager -n task-manager -- \
  node -e "fetch('http://task-manager-search-sync:3006/sync/all',{method:'POST'}).then(r=>r.json()).then(j=>console.log(j))"
```

---



## 10. The Realtime Service: Statelessness

The most unusual microservice. No database, no Fastify, no Prisma. Just a WebSocket relay server using Socket.io.

### What It Does

```
Purpose: Push real-time updates to connected browsers

When user A creates a task:
  1. Main app saves task to PostgreSQL
  2. Main app POST /emit to realtime service
  3. Realtime broadcasts "task:created" to ALL connected browsers
  4. User B's browser receives the event and refreshes the task list

The realtime service is a RELAY — it receives events from the
main app and broadcasts them to browsers. It stores nothing.
```



### Why No Database?

```
┌──────────────────────────────────────────────────────┐
│  Realtime Service (:3001)                            │
│                                                      │
│  IN:  POST /emit { event, room, data }               │
│       (from main app)                                │
│                                                      │
│  OUT: Socket.io broadcast to connected browsers      │
│       (task:created, task:updated, task:deleted)     │
│                                                      │
│  DATABASE: None                                      │
│  - Doesn't need to persist anything                  │
│  - Connections are ephemeral (in-memory)             │
│  - Events are transient (fire and forget)            │
│                                                      │
│  If the service restarts:                            │
│  - Browsers reconnect automatically (Socket.io)      │
│  - No data loss (tasks are in PostgreSQL)            │
│  - Missed events recovered by page refresh           │
└──────────────────────────────────────────────────────┘
```

This makes the realtime service the **simplest to reason about** — no migrations, no schema, no data consistency issues. It's a pure pipe.

### JWT Authentication via jose

Browsers connect to the WebSocket with a NextAuth JWT. The realtime service decrypts it to identify the user:

```typescript
// services/realtime/src/index.ts (simplified)

import { jwtDecrypt } from "jose";

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const { payload } = await jwtDecrypt(token, secret);
    socket.data.userId = payload.id;  // Extract user ID
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;

  // Join rooms
  socket.join(`user:${userId}`);  // Personal notifications
  socket.join("board");            // Shared task board

  socket.on("disconnect", () => {
    io.to("board").emit("presence:offline", { userId });
  });
});
```

```
Authentication flow:

1. Browser requests WebSocket token:
   GET /api/ws-token  →  returns the NextAuth JWT

2. Browser connects to realtime:
   io.connect("/", { auth: { token: jwt } })

3. Realtime service:
   - Decrypts JWT with shared NEXTAUTH_SECRET
   - Extracts userId
   - Allows connection
   - Rejects invalid tokens

4. Realtime stores userId in socket.data (in-memory only)
```



### The /emit Endpoint (Internal)

The main app pushes events to connected browsers via this endpoint:

```typescript
// Manual HTTP routing (no Fastify — raw Node.js http)

server.on("request", async (req, res) => {
  if (req.method === "POST" && req.url === "/emit") {
    const body = await readBody(req);
    const { event, room, data } = JSON.parse(body);

    // Broadcast to the room (or all connections)
    if (room) {
      io.to(room).emit(event, data);
    } else {
      io.emit(event, data);
    }

    sendJson(res, { emitted: true, event, room });
  }
});
```

```
Main app creates a task:
  → fetch("realtime:3001/emit", {
      method: "POST",
      body: { event: "task:created", room: "board", data: task }
    })

Realtime service:
  → io.to("board").emit("task:created", task)
  → All browsers in "board" room receive the event

Browser (TaskList.tsx):
  → socket.on("task:created", () => refreshTasks())
  → Task list updates without page refresh
```



### Why Session Affinity Matters

```
Without session affinity (round-robin):
  Browser connects to Pod A
  Main app POST /emit to any pod (e.g., Pod B)
  Pod B doesn't have the browser's connection
  → Event LOST

With session affinity (ClientIP):
  Browser connects to Pod A
  All requests from same IP go to Pod A
  POST /emit reaches Pod A
  Pod A has the browser's connection
  → Event delivered

Helm Service config:
  sessionAffinity: ClientIP
```

This is why the realtime Service has `sessionAffinity: ClientIP` in the Helm chart — WebSocket connections must persist on the same pod.

---



## 11. The Analytics Service: Polyglot Microservices

The only Python service in the project. It demonstrates the **polyglot** pattern — different services can use different programming languages when the use case demands it.

### Why Python?

```
Analytics needs:
  - matplotlib     → chart generation (Python-only library)
  - Statistical computations → Python ecosystem (pandas, numpy)
  - Async database access → asyncpg (fast PostgreSQL driver)

Node.js can't run Python libraries. Rather than hack around this
(shell out to Python scripts, use a chart-as-a-service API), we
embrace polyglot: write the analytics service in Python.
```



### What It Does

```
Endpoints:

GET /health                       → { "status": "ok" }

GET /stats/summary/{user_id}      → Task status counts
                                    Completion rate
                                    Total tasks
                                    30-day daily history (tasks created per day)

GET /stats/productivity/{user_id} → Per-priority breakdown
                                    Completion rates by priority
                                    HIGH/MEDIUM/LOW task counts

CronJob (weekly_report.py):       → Every Monday 9 AM UTC
                                    Generates matplotlib charts
                                    Creates in-app Notifications with stats
```



### FastAPI Instead of Fastify

```python
# services/analytics/main.py (simplified)

from fastapi import FastAPI
import asyncpg
import os

app = FastAPI()
pool = None  # Connection pool (created on startup)

@app.on_event("startup")
async def startup():
    global pool
    pool = await asyncpg.create_pool(
        dsn=clean_db_url(os.environ["DATABASE_URL"]),
        min_size=1,
        max_size=5,
        statement_cache_size=0,  # pgbouncer compatibility
    )

@app.get("/stats/summary/{user_id}")
async def get_summary(user_id: str):
    async with pool.acquire() as conn:
        status_counts = await conn.fetch(
            'SELECT status, COUNT(*) as count '
            'FROM "Task" WHERE "userId" = $1 '
            'GROUP BY status',
            user_id
        )
    return {"statusCounts": format_counts(status_counts)}

@app.get("/health")
async def health():
    return {"status": "ok"}
```

```
FastAPI (Python) vs Fastify (Node.js):

  Fastify:                      FastAPI:
    const app = Fastify()         app = FastAPI()
    app.get("/x", handler)        @app.get("/x")
                                   async def x(): ...
    app.listen({ port: 3004 })    uvicorn main:app --port 8000

  Both are async HTTP frameworks.
  Both have automatic JSON serialization.
  FastAPI has built-in OpenAPI docs at /docs.
```



### The asyncpg + pgbouncer Compatibility

This is a subtle but critical detail. Supabase uses PgBouncer (connection pooler) which doesn't support **prepared statements**:

```python
def clean_db_url(url: str) -> str:
    """Remove pgbouncer params that asyncpg can't handle."""
    # Input:  postgresql://...@host:6543/postgres?pgbouncer=true&connection_limit=1
    # Output: postgresql://...@host:6543/postgres
    return url.split("?")[0]

pool = await asyncpg.create_pool(
    dsn=clean_db_url(os.environ["DATABASE_URL"]),
    statement_cache_size=0,  # CRITICAL: disables prepared statements
)
```

```
Without statement_cache_size=0:
  asyncpg prepares:  PREPARE stmt_1 AS SELECT ... FROM "Task"
  PgBouncer routes to connection A
  Next query:        EXECUTE stmt_1
  PgBouncer routes to connection B (different backend)
  PostgreSQL:  "stmt_1 doesn't exist"  ← CRASH

With statement_cache_size=0:
  asyncpg sends:  SELECT ... FROM "Task" WHERE ...
  PgBouncer routes to any connection
  No prepared statement to lose
  Works every time
```



### Raw SQL Instead of Prisma

```python
# Python can't use Prisma (it's a Node.js ORM)
# Instead, analytics uses raw SQL via asyncpg

# This means the service must know Prisma's table naming convention:
# - Table names are PascalCase: "Task", "User", "Notification"
# - Column names are camelCase: "userId", "createdAt", "dueDate"
# - These must be quoted in SQL: "Task", "userId"

rows = await conn.fetch(
    'SELECT status, COUNT(*) FROM "Task" '
    'WHERE "userId" = $1 GROUP BY status',
    user_id
)
```



### The Weekly Report CronJob

```python
# services/analytics/scripts/weekly_report.py (concept)

import matplotlib.pyplot as plt

async def generate_reports():
    users = await get_all_users()

    for user in users:
        stats = await get_user_stats(user["id"])

        # Generate a chart with matplotlib
        fig, ax = plt.subplots()
        ax.bar(["Todo", "In Progress", "Done"], stats["counts"])
        ax.set_title(f"Weekly Productivity — {user['email']}")
        fig.savefig(f"/tmp/report_{user['id']}.png")
        plt.close()

        # Create in-app notification with summary
        await create_notification(
            user_id=user["id"],
            message=f"This week: {stats['completed']} tasks completed, "
                    f"{stats['completion_rate']}% completion rate"
        )

    print(f"[weekly-report] Done — {len(users)} reports generated")
```

This runs as a separate K8s CronJob (every Monday 9 AM UTC). It doesn't serve HTTP — it's a batch script like the scheduler, but in Python.

### Dockerfile Difference

```dockerfile
# Python service Dockerfile (NOT Node.js)

FROM python:3.12-slim AS builder
WORKDIR /app
COPY services/analytics/requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY services/analytics/ .
ENV PYTHONUNBUFFERED=1    # Real-time log output in K8s
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

No `npm ci`, no `prisma generate`, no `tsx`. Completely different build pipeline.

---



## 12. The Webhook Service: Background Workers

The most behaviorally complex microservice. It runs an HTTP server AND a background polling worker simultaneously, with retry logic and HMAC signing.

### What It Does

```
Two concurrent processes:

HTTP Server (Fastify :3003):
  GET /health      → status check
  POST /trigger    → queue webhook deliveries (called by main app)

Background Worker (infinite loop):
  Every 2 seconds:
    1. Poll WebhookDelivery table for pending records
    2. For each pending delivery:
       a. POST to the registered URL with HMAC signature
       b. If success (2xx): mark as "delivered"
       c. If failure: increment attempts, schedule retry with backoff
       d. If max attempts reached: mark as "failed" (dead letter)
```



### The Trigger Endpoint

When a task is created/updated/deleted, the main app tells the webhook service:

```typescript
// services/webhook/src/index.ts (simplified)

app.post("/trigger", async (request) => {
  const { event, data, userId } = request.body;

  // Find all active webhooks for this user that listen to this event
  const webhooks = await prisma.webhook.findMany({
    where: {
      userId,
      active: true,
      events: { has: event },  // events is an array: ["task.created", "task.updated"]
    },
  });

  // Queue a delivery for each matching webhook
  for (const webhook of webhooks) {
    await prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: JSON.stringify(data),
        status: "pending",
        attempts: 0,
        maxAttempts: 5,
      },
    });
  }

  return { queued: webhooks.length };
});
```

```
Flow:
  User creates task
    → Main app saves to PostgreSQL
    → Main app POST /trigger to webhook service
    → Webhook service creates WebhookDelivery records (status: pending)
    → Returns immediately (queued: 2)

  Background worker (2 seconds later):
    → Finds pending deliveries
    → POSTs to https://user-registered-url.com/webhook
    → Marks as delivered
```



### The Background Worker (Retry Logic)

```typescript
const BACKOFF_INTERVALS = [1, 5, 30, 120, 600]; // seconds: 1s, 5s, 30s, 2m, 10m

async function processDeliveries() {
  while (!shuttingDown) {
    // Get up to 10 pending deliveries
    const pending = await prisma.webhookDelivery.findMany({
      where: {
        status: "pending",
        nextRetryAt: { lte: new Date() },
      },
      take: 10,
      include: { webhook: true },
    });

    for (const delivery of pending) {
      await attemptDelivery(delivery);
    }

    await sleep(Number(process.env.POLL_INTERVAL_MS || "2000"));
  }
}

async function attemptDelivery(delivery) {
  const startTime = Date.now();
  try {
    const response = await fetch(delivery.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": delivery.event,
        "X-Webhook-Signature": hmacSha256(delivery.payload, delivery.webhook.secret),
      },
      body: delivery.payload,
      signal: AbortSignal.timeout(Number(process.env.DELIVERY_TIMEOUT_MS || "10000")),
    });

    if (response.ok) {
      // Success — mark as delivered
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "delivered", statusCode: response.status, deliveredAt: new Date() },
      });
    } else {
      // Non-2xx response — treat as failure
      throw { statusCode: response.status };
    }
  } catch (err) {
    // Failure — retry or dead-letter
    await handleFailure(delivery, err);
  }
}
```



### The Retry State Machine

```
Delivery lifecycle:

pending → delivered (success on attempt 1)
    │
    ├─ retry 1 (1s later) → delivered (success on attempt 2)
    │
    ├─ retry 2 (5s later) → delivered (success on attempt 3)
    │
    ├─ retry 3 (30s later) → delivered (success on attempt 4)
    │
    ├─ retry 4 (2m later) → delivered (success on attempt 5)
    │
    └─ failed (dead letter after 5 attempts)
         → Creates in-app Notification: "Webhook delivery to X failed permanently"

Backoff schedule: 1s → 5s → 30s → 2m → 10m
Total time before giving up: ~12 minutes
```



### HMAC Signing

Each delivery includes a cryptographic signature so the receiver can verify authenticity:

```typescript
import crypto from "crypto";

function hmacSha256(payload: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}
```

```
Receiver verifies:

  const crypto = require('crypto');

  app.post('/webhook', (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const expected = 'sha256=' + crypto
      .createHmac('sha256', MY_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest('hex');

    if (signature !== expected) {
      return res.status(401).send('Invalid signature');
    }

    // Process the webhook
    console.log('Verified event:', req.headers['x-webhook-event']);
    res.json({ ok: true });
  });
```



### Graceful Shutdown

```typescript
let shuttingDown = false;
let inFlight = 0;

process.on("SIGTERM", () => {
  shuttingDown = true;  // Stop accepting new work

  // Wait for in-flight deliveries to complete
  const checkInterval = setInterval(() => {
    if (inFlight === 0) {
      clearInterval(checkInterval);
      app.close();
      prisma.$disconnect();
      process.exit(0);
    }
  }, 1000);
});
```

```
Why graceful shutdown matters:

K8s sends SIGTERM → Pod has 35 seconds to shut down
  → Without graceful shutdown:
    Worker is mid-delivery → Pod killed → delivery lost
  → With graceful shutdown:
    shuttingDown = true → stop polling new work
    Wait for in-flight deliveries → save results
    Clean exit → zero data loss
```

---



## 13. The Team Service: RBAC + Complexity

The largest microservice (429 lines). It handles multi-user collaboration with teams, boards, roles, and activity feeds. This service demonstrates **domain-driven design** and **role-based access control (RBAC)**.

### What It Does

```
13 endpoints across 4 resource types:

Teams:     POST /teams, GET /teams, GET /teams/:id, DELETE /teams/:id
Members:   POST /teams/:id/invite, PATCH /teams/:id/members/:id, DELETE /teams/:id/members/:id
Boards:    POST /teams/:id/boards, GET /teams/:id/boards, GET /teams/:id/boards/:id, DELETE ...
Activity:  GET /teams/:id/activity
```



### Header-Based Authentication

Unlike other services, the team service doesn't decrypt JWTs itself. The main app authenticates the user and passes their ID via a header:

```typescript
// services/team-service/src/index.ts (simplified)

app.addHook("onRequest", async (request, reply) => {
  // Skip auth for health check
  if (request.url === "/health") return;

  const userId = request.headers["x-user-id"];
  if (!userId) {
    reply.code(401).send({ error: "Missing X-User-Id header" });
  }

  request.userId = userId;  // Available in all handlers
});
```

```
Why header-based auth?

  Main app (NextAuth):
    → Authenticates user via JWT
    → Knows the userId
    → Calls team service with header: X-User-Id: <userId>

  Team service:
    → Trusts the main app (internal ClusterIP service)
    → Reads X-User-Id header
    → No JWT decryption needed

  This is the "trusted proxy" pattern — the gateway handles auth,
  internal services trust the gateway. Simpler but requires network
  isolation (ClusterIP-only, no external access).
```



### RBAC: Role-Based Access Control

Three roles with different permissions:

```typescript
const ROLE_PERMISSIONS = {
  ADMIN:  ["read", "write", "invite", "remove", "delete_team", "manage_boards"],
  MEMBER: ["read", "write", "manage_boards"],
  VIEWER: ["read"],
};

async function requireMember(teamId: string, userId: string) {
  const member = await prisma.member.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });

  if (!member) {
    throw { statusCode: 403, message: "Not a member of this team" };
  }

  return member;
}

async function requireAdmin(teamId: string, userId: string) {
  const member = await requireMember(teamId, userId);

  if (member.role !== "ADMIN") {
    throw { statusCode: 403, message: "Admin access required" };
  }

  return member;
}
```

```
Permission matrix:

Action                   ADMIN    MEMBER    VIEWER
───────────────────────  ─────    ──────    ──────
View team + boards       Yes      Yes       Yes
Create/edit tasks        Yes      Yes       No
Create boards            Yes      Yes       No
Invite members           Yes      No        No
Remove members           Yes      No        No
Delete team              Yes      No        No
```



### The Last-Admin Protection

```typescript
// Prevent removing the last admin (team would be orphaned)

app.delete("/teams/:id/members/:memberId", async (request) => {
  const { id: teamId, memberId } = request.params;
  const member = await requireMember(teamId, request.userId);

  const target = await prisma.member.findUnique({ where: { id: memberId } });

  // Check: is the target an admin?
  if (target.role === "ADMIN") {
    const adminCount = await prisma.member.count({
      where: { teamId, role: "ADMIN" },
    });

    if (adminCount <= 1) {
      throw { statusCode: 400, message: "Cannot remove the last admin" };
    }
  }

  await prisma.member.delete({ where: { id: memberId } });
});
```



### Slug Generation with Collision Handling

```typescript
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")  // "Engineering Team" → "engineering-team"
    .replace(/^-|-$/g, "");

  return base;
}

// If slug already exists, append timestamp
async function createTeam(name: string, ownerId: string) {
  let slug = generateSlug(name);

  const existing = await prisma.team.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Date.now()}`;  // "engineering-team-1700000000000"
  }

  return prisma.team.create({
    data: { name, slug, ownerId },
  });
}
```



### Activity Feed

```typescript
async function createActivity(teamId: string, userId: string, type: string, taskId?: string) {
  await prisma.activity.create({
    data: { teamId, userId, type, taskId },
  });
}

// Used throughout the service:
// createActivity(team.id, userId, "MEMBER_JOINED")
// createActivity(team.id, userId, "BOARD_CREATED", board.id)
// createActivity(team.id, userId, "MEMBER_LEFT")
```

```
Activity types (enum in schema.prisma):

  TEAM_CREATED      MEMBER_JOINED     MEMBER_LEFT
  BOARD_CREATED     BOARD_DELETED     TASK_ASSIGNED

The activity feed powers a "recent activity" widget in the team
detail page — "Alice created board 'Sprint 3'", "Bob joined the team"
```



### DB Migration Hook

The team service adds new tables (Team, Member, Board, Activity) to the schema. Before deploying the new code, the schema must be pushed:

```yaml
# helm-chart/templates/team-service/db-migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: task-manager-db-migration
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install  # Runs BEFORE deployment
    "helm.sh/hook-weight": "-5"              # Runs before other hooks
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          command: ["npx", "prisma", "db", "push", "--accept-data-loss"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: task-manager-secrets
                  key: database-url
```

```
Without migration hook:                    With migration hook:
  New pods start with new code              Migration runs FIRST
  Code queries "Team" table                 prisma db push creates tables
  PostgreSQL: "Team doesn't exist"          THEN new pods start
  → CRASH                                   → Correct schema already exists
```

---



## 14. The Service Dependency Graph

Now that you've seen all 8 services individually, let's look at how they relate to each other and what depends on what.

### The Full Dependency Graph

```
                    ┌──────────────────────────────────────────────┐
                    │                BROWSER                       │
                    │  (React UI + Socket.io client)               │
                    └──────┬──────────────────────────┬────────────┘
                           │ HTTP                     │ WebSocket
                           ▼                          ▼
              ┌────────────────────────┐    ┌────────────────────┐
              │   NGINX INGRESS        │    │  NGINX INGRESS     │
              │   (path: /)            │    │  (path: /socket.io)│
              └───────────┬────────────┘    └────────┬───────────┘
                          │                          │
              ┌───────────▼────────────┐    ┌────────▼──────────┐
              │   MAIN APP (:3000)     │    │  REALTIME (:3001) │
              │   - Next.js            │    │  - Socket.io      │
              │   - NextAuth           │    │  - No database    │
              │   - API Gateway        │    │  - JWT auth       │
              └──┬─────┬─────┬────────┘    └────────────────────┘
      ┌──────────┘     │     │ └─────────────┐
      │                │     │               │
      │ sync proxy     │     │ fire-forget   │ sync proxy
      ▼                ▼     ▼               ▼
┌───────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐
│ ANALYTICS │  │TEAM SERVICE│  │ WEBHOOK  │  │FILE SERVICE│
│ (:8000)   │  │ (:3002)    │  │ (:3003)  │  │ (:3005)    │
│ Python    │  │ RBAC       │  │ Worker   │  │ S3 + MinIO │
│ asyncpg   │  │ Prisma     │  │ Prisma   │  │ Prisma     │
└───────────┘  └────────────┘  └──────────┘  └─────┬──────┘
                                                   │
                                            ┌──────▼──────┐
                                            │   MINIO     │
                                            │   (:9000)   │
                                            │ StatefulSet │
                                            └─────────────┘

  Also called by main app (fire-and-forget):
  ┌────────────┐          ┌────────────────┐
  │NOTIFICATION│          │  SEARCH SYNC   │
  │ (:3004)    │          │  (:3006)       │
  │ Prisma     │          │  Prisma + Meili│
  │ + SMTP     │          └───────┬────────┘
  └────────────┘                  │
                           ┌──────▼──────┐
                           │ MEILISEARCH │
                           │ (:7700)     │
                           │ StatefulSet │
                           └─────────────┘

  Autonomous (no main app calls):
  ┌────────────────┐
  │   SCHEDULER    │
  │   (CronJob)    │── reads ──→ PostgreSQL
  │   Prisma       │
  └────────────────┘

                  ALL services read/write:
                         ┌──────────────┐
                         │  POSTGRESQL  │
                         │  (Supabase)  │
                         └──────────────┘
```



### Dependency Tiers

```
Tier 0: PostgreSQL (Supabase)
  → External database, shared by 7 services
  → MUST be up before anything else

Tier 1: Main App + Autonomous Stateful Services
  → Main App: depends on PostgreSQL only
  → MinIO: standalone (no deps)
  → Meilisearch: standalone (no deps)

Tier 2: Services that depend on Tier 1
  → File Service: depends on MinIO (initContainer)
  → Search Sync: depends on Meilisearch (initContainer)
  → Notification: depends on PostgreSQL only
  → Realtime: no external deps (no database)
  → Webhook: depends on PostgreSQL only
  → Team Service: depends on PostgreSQL only (migration hook first)
  → Analytics: depends on PostgreSQL only

Tier 3: Scheduled Services
  → Scheduler: K8s creates Pod on schedule, reads PostgreSQL
  → Analytics Weekly Report: K8s creates Pod weekly, reads PostgreSQL
```



### initContainer Dependencies

Two services need their external dependency ready before starting:

```
File Service:
  initContainer: wait for MinIO /minio/health/live
  then: start file-service (which creates bucket, starts serving)

Search Sync:
  initContainer: wait for Meilisearch /health
  then: start search-sync (which configures index, starts serving)

Without initContainer:
  file-service starts → MinIO not ready → bucket creation fails → crash loop
  K8s restarts pod → MinIO might be ready now → maybe works
  (unreliable, race condition)
```



### Who Talks to Whom? (The Communication Matrix)

```
                 Notif  File   Search  Realtime  Analytics  Webhook  Team  Scheduler
Main App          ✓F     ✓S     ✓F      ✓F         ✓S         ✓F       ✓S     ✗
Notification       -      -      -        -          -          -        -      ✗
File Service       -      -      -        -          -          -        -      ✗
Search Sync        -      -      -        -          -          -        -      ✗
Realtime           -      -      -        -          -          -        -      ✗
Analytics          -      -      -        -          -          -        -      ✗
Webhook            -      -      -        -          -          -        -      ✗
Team Service       -      -      -        -          -          -        -      ✗

✓F = fire-and-forget (async, no response needed)
✓S = synchronous proxy (wait for response)
✗  = no communication

Key insight: Services NEVER talk to each other directly.
             ALL communication flows through the main app.
```

This is a **star topology** — the main app is the hub, all other services are spokes. The main advantage: services don't need to know about each other. The main disadvantage: the main app is a single point of failure for all features (though not for data — that's in PostgreSQL).

### What Happens When a Service Is Down?

```
Service down        User impact                    Data loss?
───────────────     ────────────                   ──────────
Main App            Complete outage                No (data in DB)
Scheduler           Recurring tasks not created    No (next cron catches up)
Notification        No emails/in-app notifs        No (data in DB)
File Service        Can't upload/download files    No (files in MinIO)
Search Sync         Search results stale           No (data in DB)
Realtime            No live updates                No (data in DB)
Analytics           Stats page shows error         No (data in DB)
Webhook             External integrations delayed  No (deliveries queued in DB)
Team Service        Team pages show error          No (data in DB)

The key design principle: PostgreSQL is ALWAYS the source of truth.
Every service is stateless or can rebuild its state from the database.
```

---



## 15. Hands-On Exercises



### Exercise 1: Read the Simplest Service

The scheduler is only 65 lines. Read it completely:

```bash
# Read the scheduler source
cat services/scheduler/src/index.ts
```

**Questions to answer:**

1. What happens if one RecurringTask has an invalid cron expression?
2. Why does the service call `process.exit(0)` at the end?
3. What models from the Prisma schema does it use?



### Exercise 2: Trace a Task Creation

Follow the complete journey when a user creates a task:

```
1. Browser POST /api/tasks
2. Main app validates with Zod
3. Main app saves to PostgreSQL
4. Main app fires events to:

   Try to find WHERE in the code these events are fired:
   grep -r "emitToRealtime\|triggerWebhook\|syncTask" src/app/api/tasks/
```



### Exercise 3: Compare Two Services Side-by-Side

```bash
# Open both in your editor
code services/notification/src/index.ts
code services/webhook/src/index.ts
```

**Compare:**

1. How does each initialize Prisma? (Should be identical — shared pattern)
2. How does each handle the "health" endpoint? (Should be identical)
3. What makes the webhook service more complex? (Background worker)
4. Could the notification service use a background worker pattern? (Think about it)



### Exercise 4: Test Service Health from Inside K8s

```bash
# Check which services are running
kubectl get pods -n task-manager

# Test each service's health endpoint
kubectl exec deployment/task-manager -n task-manager -- \
  node -e "fetch('http://task-manager-notification:3004/health').then(r=>r.json()).then(j=>console.log(j))"

kubectl exec deployment/task-manager -n task-manager -- \
  node -e "fetch('http://task-manager-webhook:3003/health').then(r=>r.json()).then(j=>console.log(j))"

kubectl exec deployment/task-manager -n task-manager -- \
  node -e "fetch('http://task-manager-realtime:3001/health').then(r=>r.json()).then(j=>console.log(j))"

# Notice: each returns slightly different data
# Realtime includes connection count — why?
```



### Exercise 5: Trigger the Scheduler Manually

```bash
# The scheduler is a CronJob — trigger it now
kubectl create job --from=cronjob/task-manager-scheduler manual-test -n task-manager

# Watch it run
kubectl logs job/manual-test -n task-manager

# Clean up
kubectl delete job manual-test -n task-manager
```



### Exercise 6: Identify the Pattern

For each scenario, identify which communication pattern (Section 5) is used:

```
1. User searches for "meeting"
   → Main app calls Meilisearch, waits for results
   → Pattern: ____________

2. User deletes a task
   → Main app deletes from DB, then notifies search-sync
   → Pattern: ____________

3. Every Monday, analytics generates reports
   → CronJob runs, no user involved
   → Pattern: ____________

4. User uploads a file
   → Main app forwards to file-service, waits for response
   → Pattern: ____________

Answers: 1. Synchronous proxy  2. Fire-and-forget  3. Scheduled  4. Synchronous proxy
```



### Exercise 7: Read the Realtime Service (No Database)

```bash
cat services/realtime/src/index.ts
```

**Questions:**

1. Why doesn't this service import Prisma?
2. How does it authenticate WebSocket connections?
3. What happens to connected browsers when the pod restarts?
4. Why does it need `sessionAffinity: ClientIP` on the Service?

---



## 16. What You've Learned



### Technologies Mastered

- Microservices architecture patterns (star topology, API gateway)
- Service-to-service communication (fire-and-forget, synchronous proxy, scheduled)
- Shared Prisma schema pattern (one schema, copied at Docker build)
- Background worker pattern (webhook delivery with retry)
- Graceful degradation (notification without SMTP)
- Polyglot microservices (Python analytics + Node.js services)
- HMAC webhook signing
- JWT authentication for WebSocket connections
- RBAC with role-based permissions (team service)
- Exponential backoff retry logic
- Graceful shutdown (SIGTERM handling)
- initContainer dependency management
- CronJob vs Deployment workloads



### Core Concepts

- **Microservices split complexity:** Code gets simpler (one job per service), infrastructure gets more complex (networking, deployment)
- **The main app is the gateway:** All user traffic flows through it; all other services are internal (ClusterIP)
- **PostgreSQL is the source of truth:** Every service is stateless or can rebuild from the database
- **Fire-and-forget for side effects:** Non-critical operations (notifications, search indexing) don't block the main operation
- **Synchronous proxy for user-facing queries:** When the user needs the result, wait for it
- **Services don't talk to each other:** All communication flows through the main app (star topology)
- **Shared schema avoids drift:** One `schema.prisma`, copied at build time, generated fresh per service
- **Each service has its own package.json:** Independent dependencies, independent deployment



### The Service Catalog


| Service      | Key Pattern          | What Makes It Special                      |
| ------------ | -------------------- | ------------------------------------------ |
| Scheduler    | Run-once script      | No HTTP server, exits after work           |
| Notification | Graceful degradation | Works without SMTP (DB-only fallback)      |
| File Service | Dual storage         | S3 (binary) + PostgreSQL (metadata)        |
| Search Sync  | Data pipeline        | PostgreSQL → Meilisearch indexing          |
| Realtime     | Statelessness        | No database, pure WebSocket relay          |
| Analytics    | Polyglot             | Python FastAPI + asyncpg (no Prisma)       |
| Webhook      | Background worker    | Polling loop + retry state machine + HMAC  |
| Team Service | RBAC                 | Trusted proxy auth, role-based permissions |




### The Six-Level Stack (Complete)

```
Level 1 (Frontend):  React components → User interface
Level 2 (Backend):   API routes → Prisma → PostgreSQL
Level 3 (Docker):    Dockerfile → Docker image
Level 4 (K8s):       YAML manifests → Pods, Services, Deployments
Level 5 (Helm):      Templates + values → YAML manifests
Level 6 (Microservices): 8 services + communication patterns ← YOU ARE HERE
```

---



## Next Steps

After completing Level 6, you're ready for:

**Level 7: Observability & Monitoring** - 4 hours

- Prometheus metrics collection (prom-client)
- Grafana dashboards
- Structured logging with pino
- ServiceMonitor configuration
- Alerting with Alertmanager

You now understand both the infrastructure (Levels 3-5) and the application code (Levels 1-2, 6). Level 7 teaches you how to observe what's happening inside all these services — metrics, logs, and alerts.

Continue with `Level-7.md` when you're ready!

---

**Happy learning!**