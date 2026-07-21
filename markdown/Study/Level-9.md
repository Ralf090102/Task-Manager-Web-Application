# Stage 3 Module C — BullMQ Worker Queue: Detailed Learning Guide

This document explains every concept, pattern, and implementation detail behind the BullMQ worker queue added in Stage 3 Module C. It covers message queue theory, the producer-consumer pattern, BullMQ internals, retry/backoff strategy, repeatable jobs, graceful shutdown, the critical `serverExternalPackages` fix, shared Redis architecture, and verification techniques — all with real code from the codebase.

---

## Table of Contents

1. [The Problem with Fire-and-Forget HTTP Calls](#1-the-problem-with-fire-and-forget-http-calls)
2. [What Is a Message Queue?](#2-what-is-a-message-queue)
3. [BullMQ: Redis-Based Job Queue for Node.js](#3-bullmq-redis-based-job-queue-for-nodejs)
4. [Why Both `bullmq` AND `ioredis`?](#4-why-both-bullmq-and-ioredis)
5. [The `maxRetriesPerRequest: null` Requirement](#5-the-maxretriesperrequest-null-requirement)
6. [The Producer: `src/lib/queue.ts`](#6-the-producer-srclibqueuets)
7. [The Consumer: `services/worker/src/index.ts`](#7-the-consumer-servicesworkersrcindexts)
8. [Job Lifecycle in BullMQ](#8-job-lifecycle-in-bullmq)
9. [Retry Strategy and Exponential Backoff](#9-retry-strategy-and-exponential-backoff)
10. [Job Handlers: What the Worker Actually Does](#10-job-handlers-what-the-worker-actually-does)
11. [Repeatable Jobs: Cron-Like Scheduling in BullMQ](#11-repeatable-jobs-cron-like-scheduling-in-bullmq)
12. [Graceful Shutdown: SIGTERM and SIGINT Handling](#12-graceful-shutdown-sigterm-and-sigint-handling)
13. [The `serverExternalPackages` Fix (Critical)](#13-the-serverexternalpackages-fix-critical)
14. [Graceful Degradation in the Producer](#14-graceful-degradation-in-the-producer)
15. [Shared Redis: Cache and Queue on One Instance](#15-shared-redis-cache-and-queue-on-one-instance)
16. [Health Checks: The Worker's HTTP Server](#16-health-checks-the-workers-http-server)
17. [Docker Multi-Stage Build for the Worker](#17-docker-multi-stage-build-for-the-worker)
18. [Helm Templates: Worker Deployment and Service](#18-helm-templates-worker-deployment-and-service)
19. [Task API Integration Points](#19-task-api-integration-points)
20. [Verification and End-to-End Testing](#20-verification-and-end-to-end-testing)
21. [Troubleshooting](#21-troubleshooting)
22. [Key Patterns and Best Practices](#22-key-patterns-and-best-practices)

---

## 1. The Problem with Fire-and-Forget HTTP Calls

### How Stage 2 Worked

In Stage 2, the main app communicated with microservices using **fire-and-forget HTTP calls**. When a task was created, the API route made several side-effect calls without awaiting them:

```typescript
// Stage 2 pattern — fire-and-forget
emitToRealtime("task:created", task);      // HTTP POST to realtime service
triggerWebhook("task.created", task, ...);  // HTTP POST to webhook service
// Search indexing was also done via direct HTTP to search-sync
```

These calls are "fire-and-forget" because:
1. The response is sent to the user **before** the side effects complete
2. If the target service is down, the call fails silently
3. There's **no retry** — a failed call is lost forever

### When Fire-and-Forget Breaks

| Scenario | Fire-and-Forget | Queue-Based |
|----------|----------------|-------------|
| Search-sync service restarting | Index update lost | Job waits in Redis, processed when service is back |
| Brief network blip | HTTP request fails | Job automatically retried with backoff |
| Pod is OOM-killed mid-request | Partial work lost | Job re-processed from the queue |
| Need to check overdue tasks hourly | Requires separate CronJob | Repeatable job in the same worker |
| Need visibility into pending/failed work | No visibility | BullMQ tracks all job states in Redis |

### The Queue Solution

Instead of calling services directly, the main app **enqueues a job** (a lightweight message describing the work). A dedicated **worker pod** consumes jobs from the queue, processes them, and retries on failure:

```
Main App (Next.js)                    Worker Pod (separate Deployment)
┌──────────────────┐                 ┌──────────────────────────────┐
│  POST /api/tasks │                 │  BullMQ Worker               │
│   ├── create DB  │                 │   ├── search.index handler   │──→ Search Sync
│   ├── enqueue ───┼──→ Redis ──────┼──→ search.remove handler  │──→ (Meilisearch)
│   │   "search.   │   (BullMQ       │   ├── task.overdue handler   │──→ DB + Notifications
│   │    index"    │    queue)       │   └── health server :3007    │
│   └── return 201 │                 └──────────────────────────────┘
└──────────────────┘
```

The job survives in Redis even if the worker pod crashes. When a new worker pod starts, it picks up where the old one left off.

---

## 2. What Is a Message Queue?

A **message queue** is a communication pattern where a **producer** sends messages (jobs) to a queue, and a **consumer** processes them asynchronously. The producer and consumer are decoupled — they don't need to know about each other's state.

### Core Concepts

| Concept | Analogy | In This Project |
|---------|---------|-----------------|
| **Producer** | Customer placing an order | Next.js app enqueues jobs |
| **Queue** | Kitchen order ticket rail | Redis (BullMQ stores jobs here) |
| **Consumer/Worker** | Chef processing tickets | Worker pod processes jobs |
| **Job** | An order ticket | `{ name: "search.index", data: { taskId: "abc" } }` |
| **Acknowledge** | Chef marks ticket done | BullMQ moves job to "completed" |
| **Retry** | "Fix that burnt order" | BullMQ re-queues failed jobs |

### Queue vs Fire-and-Forget: Request Flow

**Fire-and-forget (Stage 2):**
```
User creates task
  → Next.js creates DB record
  → Next.js fires HTTP POST to search-sync (not awaited)
  → Next.js returns 201 to user
  → [If search-sync is down: index update is LOST]
```

**Queue-based (Stage 3 Module C):**
```
User creates task
  → Next.js creates DB record
  → Next.js enqueues job to Redis (~1ms, local network)
  → Next.js returns 201 to user
  → Worker picks up job from Redis
  → Worker POSTs to search-sync
  → [If search-sync is down: job stays in queue, retried automatically]
```

### Why Not Just Use CronJobs?

Kubernetes CronJobs (like the scheduler service) are great for **time-based** work. But many jobs are **event-based** — they should run immediately after a user action, not on a schedule. BullMQ handles both:

| Need | CronJob | BullMQ |
|------|---------|--------|
| Run hourly overdue check | ✅ | ✅ (repeatable jobs) |
| Index task immediately after creation | ❌ (latency) | ✅ |
| Retry on failure with backoff | ❌ | ✅ |
| Track pending/failed/processing counts | ❌ | ✅ |

---

## 3. BullMQ: Redis-Based Job Queue for Node.js

**BullMQ** is a high-performance Node.js job queue library built on top of Redis. It's the successor to Bull (which used callbacks instead of promises).

### Key Features

| Feature | Description |
|---------|-------------|
| **Persistent jobs** | Jobs stored in Redis — survive pod restarts |
| **Automatic retries** | Configurable retry count with exponential backoff |
| **Repeatable jobs** | Cron-like scheduling (`repeat: { pattern: "0 * * * *" }`) |
| **Job priorities** | High-priority jobs processed first |
| **Concurrency control** | Process N jobs in parallel |
| **Delayed jobs** | Schedule jobs to run at a future time |
| **Job events** | Listen for `completed`, `failed`, `progress` events |
| **Rate limiting** | Max N jobs per second (cluster-friendly) |
| **Queue statistics** | Waiting, active, completed, failed, delayed counts |

### BullMQ's Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │                  Redis                           │
                    │  ┌─────────┐  ┌────────┐  ┌──────────┐         │
     Producer       │  │  Wait   │→│ Active │→│ Completed│         │
     (Queue.add)────┼─▶│  List   │  │ (Hash) │  │  (Hash)  │         │
                    │  └─────────┘  └────────┘  └──────────┘         │
                    │       │            │                            │
     Consumer       │       │      ┌─────▼─────┐                     │
     (Worker)───────┼───────┘      │  Failed   │                     │
                    │              │ (retry or │                     │
                    │              │  dead-end)│                     │
                    │              └───────────┘                     │
                    └─────────────────────────────────────────────────┘
```

BullMQ uses Redis data structures efficiently:
- **Lists** for ordered job queues (wait, active)
- **Hashes** for job data and metadata
- **Sorted sets** for delayed/repeatable jobs (ordered by timestamp)
- **Pub/Sub** for real-time job events

---

## 4. Why Both `bullmq` AND `ioredis`?

### The Two Packages

```json
// services/worker/package.json
{
  "dependencies": {
    "bullmq": "^5.30.0",
    "ioredis": "^5.4.0"
  }
}
```

You might wonder: why two Redis packages? Isn't that redundant?

### BullMQ Uses ioredis Internally

BullMQ is a **job queue library**, not a Redis client. It needs a Redis client to communicate with Redis. BullMQ chose `ioredis` as its underlying client because:

1. **Lua script support**: BullMQ uses Redis Lua scripts for atomic operations (e.g., moving a job from "wait" to "active" and incrementing attempt count must be atomic). ioredis has excellent Lua script support.
2. **Pipeline transactions**: BullMQ batches Redis commands for efficiency using ioredis pipelines.
3. **Reliable reconnects**: ioredis handles connection drops and reconnects gracefully — critical for long-running workers.

### The Connection Is Shared

Both the main app and the worker create their own `ioredis` connection and pass it to BullMQ:

```typescript
// Worker creates ONE ioredis connection, shares it with BullMQ
import IORedis from "ioredis";
import { Worker, Queue, QueueEvents } from "bullmq";

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,  // Required by BullMQ — see Section 5
});

// Same connection used by Worker, Queue, and QueueEvents
const worker = new Worker(QUEUE_NAME, handler, { connection });
const queue = new Queue(QUEUE_NAME, { connection });
const events = new QueueEvents(QUEUE_NAME, { connection });
```

### Main App vs Worker Packages

| Package | Main App (`src/lib/queue.ts`) | Worker (`services/worker`) |
|---------|-------------------------------|---------------------------|
| `bullmq` | ✅ (Queue class only) | ✅ (Worker, Queue, QueueEvents) |
| `ioredis` | ✅ (connection for BullMQ) | ✅ (connection for BullMQ) |
| `redis` (node-redis v4) | ✅ (for caching — Module B) | ❌ |

The main app uses `redis` (node-redis v4) for **caching** and `ioredis` for **queueing**. They're different clients connecting to the same Redis instance — but using different libraries because BullMQ requires ioredis.

---

## 5. The `maxRetriesPerRequest: null` Requirement

### The Most Important Line

```typescript
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,  // ← THIS IS CRITICAL
});
```

Without `maxRetriesPerRequest: null`, BullMQ throws this error:

```
Error: Your redis options maxRetriesPerRequest must be set to null.
BullMQ uses blocking connections to listen for jobs in the wait queue.
```

### Why BullMQ Needs This

ioredis has a default `maxRetriesPerRequest: 3`. If Redis goes down, ioredis retries the command 3 times, then throws an error if still failing.

But BullMQ uses **blocking commands** (specifically `BRPOPLPUSH` / `BZPOPMIN`) to listen for new jobs. A blocking command waits indefinitely for data to appear in a queue. If Redis temporarily drops the connection during a blocking wait:

- **With `maxRetriesPerRequest: 3`** (default): ioredis retries 3 times, then throws — the worker crashes
- **With `maxRetriesPerRequest: null`** (infinite): ioredis keeps retrying forever — the worker reconnects when Redis is back

This is the difference between a worker that crashes on every Redis hiccup and one that survives transient failures.

### Analogy

Think of the worker as a receptionist waiting for calls:
- `maxRetriesPerRequest: 3`: If the phone line drops 3 times, the receptionist quits
- `maxRetriesPerRequest: null`: The receptionist keeps picking up the phone forever — it'll work once the line is restored

---

## 6. The Producer: `src/lib/queue.ts`

The producer lives in the main Next.js app. It's a **lazy singleton** — the BullMQ Queue is only created when the first job is enqueued.

### Full Source

```typescript
// src/lib/queue.ts
import { Queue } from "bullmq";
import IORedis from "ioredis";
import logger from "./logger";

const QUEUE_NAME = "task-events";

let connection: IORedis | null = null;
let queue: Queue | null = null;

function getQueue(): Queue | null {
  if (!process.env.REDIS_URL) return null;

  if (!queue) {
    connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    connection.on("error", (err) => {
      logger.warn({ err }, "Queue Redis connection error");
    });
    queue = new Queue(QUEUE_NAME, { connection });
    logger.info("BullMQ queue initialized");
  }

  return queue;
}

type JobName = "search.index" | "search.remove";

export async function enqueueTaskEvent(
  name: JobName,
  data: Record<string, unknown>
): Promise<void> {
  const q = getQueue();
  if (!q) return;

  try {
    await q.add(name, data, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    logger.info({ job: name, data }, "job enqueued");
  } catch (err) {
    logger.warn({ err, job: name }, "failed to enqueue job — fire-and-forget fallback");
  }
}
```

### Design Decisions

**1. Lazy initialization (same pattern as Redis cache)**

The Queue is only created when `enqueueTaskEvent` is first called. If no tasks are ever created, no Redis connection is opened. This avoids unnecessary connections for routes that don't enqueue jobs.

**2. Module-level singleton (not `globalThis`)**

```typescript
let connection: IORedis | null = null;
let queue: Queue | null = null;
```

Same rationale as the Redis cache client (see Project-Redis.md Section 18): BullMQ doesn't suffer from the connection pool exhaustion issue that Prisma does, so `globalThis` isn't needed.

**3. `getQueue()` is OUTSIDE the try/catch**

```typescript
export async function enqueueTaskEvent(name, data) {
  const q = getQueue();  // ← Not in try/catch
  if (!q) return;

  try {
    await q.add(name, data, { ... });
  } catch (err) {
    logger.warn({ err }, "failed to enqueue job");
  }
}
```

If `new IORedis(...)` or `new Queue(...)` throws synchronously (e.g., invalid URL), the error propagates as an unhandled promise rejection because `enqueueTaskEvent` is called without `await` at the call site. This is acceptable — it would only happen on misconfiguration, and the fix is correcting the env var.

**4. Fire-and-forget at the call site**

```typescript
// In the API route — note: no await!
enqueueTaskEvent("search.index", { taskId: task.id });
```

The `enqueueTaskEvent` function is async, but it's called without `await`. This means the API response doesn't wait for the job to be enqueued. The ~1ms Redis write happens in the background.

If you wanted to guarantee the job was enqueued before returning, you'd `await` it. But that would add latency to the response. The tradeoff: rare job loss (if Redis is down during the 1ms window) vs consistent fast responses. We chose fast responses.

---

## 7. The Consumer: `services/worker/src/index.ts`

The worker is a standalone Node.js process running in its own Kubernetes pod. It connects to Redis, listens for new jobs, and processes them.

### High-Level Structure

```typescript
// services/worker/src/index.ts

// 1. Create shared ioredis connection
const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// 2. Create Prisma client (for overdue check + DB queries)
const prisma = new PrismaClient({ adapter: new PrismaPg({ ... }) });

// 3. Create the Worker — this is the consumer
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case "search.index":       await syncTaskToSearch(job.data.taskId); break;
      case "search.remove":      await removeTaskFromSearch(job.data.taskId); break;
      case "task.overdue.check": await checkOverdueTasks(); break;
      default:                   log("warn", `unknown job: ${job.name}`);
    }
  },
  { connection, concurrency: 5 }
);

// 4. Register event handlers
worker.on("completed", (job) => { ... });
worker.on("failed", (job, err) => { ... });
worker.on("error", (err) => { ... });

// 5. Start health server
healthServer.listen(3007, "0.0.0.0", () => { ... });

// 6. Register repeatable jobs
const queue = new Queue(QUEUE_NAME, { connection });
await queue.add("task.overdue.check", {}, {
  repeat: { pattern: "0 * * * *" },  // hourly
});

// 7. Listen for queue-level events
const queueEvents = new QueueEvents(QUEUE_NAME, { connection });
queueEvents.on("failed", ({ jobId, failedReason }) => { ... });

// 8. Graceful shutdown
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

### The BullMQ Trinity: Worker, Queue, QueueEvents

BullMQ has three main classes. The worker uses all three:

| Class | Role | Listens? | Writes Jobs? |
|-------|------|----------|-------------|
| `Worker` | Consumes jobs | Yes (blocking) | No (just processes) |
| `Queue` | Produces jobs | No | Yes (`queue.add()`) |
| `QueueEvents` | Listens for events | Yes (pub/sub) | No |

**Why does the worker need `Queue`?** Because it registers repeatable jobs (the hourly overdue check). The `Queue` class is the producer — even inside the worker process.

**Why does the worker need `QueueEvents`?** For additional monitoring. `QueueEvents` subscribes to Redis pub/sub for job events (`completed`, `failed`, `progress`). The `Worker` already has `.on("completed")` / `.on("failed")` handlers, but `QueueEvents` catches events from ALL workers (useful in multi-worker setups).

---

## 8. Job Lifecycle in BullMQ

When a job is added to the queue, it goes through several states:

```
                    queue.add("search.index", data)
                              │
                              ▼
                    ┌─────────────────┐
                    │  WAITING        │  ← Job is queued, waiting for a free worker
                    │  (Redis List)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  ACTIVE         │  ← Worker picked up the job, processing...
                    │  (Redis Hash)   │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
           ┌──────────────┐  ┌──────────────┐
           │  COMPLETED   │  │   FAILED     │
           │  (Hash)      │  │  (Hash)      │
           │  removeOnComplete: 100  │  attempts < 3?  ──── Yes ──→ back to WAITING (with delay)
           └──────────────┘  │              │
                             │  attempts = 3? ──── No ───→ stays FAILED (dead letter)
                             └──────────────┘
```

### State Details

| State | Redis Key | Description |
|-------|-----------|-------------|
| **waiting** | `bull:task-events:wait` | List of job IDs waiting to be processed (FIFO) |
| **active** | `bull:task-events:active` | Currently being processed by a worker |
| **completed** | `bull:task-events:completed` | Successfully finished (kept for `removeOnComplete` count, then deleted) |
| **failed** | `bull:task-events:failed` | All retries exhausted — dead letter |
| **delayed** | `bull:task-events:delayed` | Scheduled for future execution (sorted set by timestamp) |
| **repeat** | `bull:task-events:repeat` | Repeatable job schedules (cron patterns) |

### Inspecting States in Redis

```bash
# List all BullMQ keys
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli KEYS "bull:task-events:*"

# Check how many jobs are waiting
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli LLEN "bull:task-events:wait"

# Check completed jobs count
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli ZCARD "bull:task-events:completed"

# Check failed jobs count
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli ZCARD "bull:task-events:failed"
```

### The `removeOnComplete` and `removeOnFail` Settings

```typescript
await q.add(name, data, {
  removeOnComplete: 100,  // Keep last 100 completed jobs, then auto-delete oldest
  removeOnFail: 200,      // Keep last 200 failed jobs for debugging
});
```

Without these settings, completed and failed jobs accumulate forever, consuming Redis memory. The limits ensure Redis doesn't grow unbounded while still retaining recent job history for debugging.

---

## 9. Retry Strategy and Exponential Backoff

### The Configuration

```typescript
// Producer side (src/lib/queue.ts)
await q.add(name, data, {
  attempts: 3,                                    // Max 3 attempts (1 initial + 2 retries)
  backoff: { type: "exponential", delay: 2000 },  // Start at 2s, double each time
});

// Repeatable job (services/worker/src/index.ts)
await queue.add("task.overdue.check", {}, {
  repeat: { pattern: "0 * * * *" },
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },  // Start at 5s for overdue check
});
```

### How Exponential Backoff Works

When a job fails, BullMQ waits before retrying. The delay doubles each time:

| Attempt | Delay Before Retry | Total Time Elapsed |
|---------|--------------------|--------------------|
| 1 (initial) | — | 0s |
| 2 (retry 1) | 2s | ~2s |
| 3 (retry 2) | 4s | ~6s |
| Failed (dead letter) | — | ~6s |

For the overdue check (5s base):
| Attempt | Delay | Total |
|---------|-------|-------|
| 1 | — | 0s |
| 2 | 5s | ~5s |
| 3 | 10s | ~15s |
| Failed | — | ~15s |

### Why Exponential Backoff?

If search-sync is down, retrying immediately would hammer it with requests. Exponential backoff gives the service time to recover:

```
Job fails → wait 2s → retry → fails → wait 4s → retry → fails → dead letter
```

The formula is: `delay = baseDelay * 2^(attempt - 1)`

- `baseDelay = 2000`, attempt 1: `2000 * 2^0 = 2000ms` (2s)
- `baseDelay = 2000`, attempt 2: `2000 * 2^1 = 4000ms` (4s)
- `baseDelay = 2000`, attempt 3: `2000 * 2^2 = 8000ms` (8s)

### Fixed Backoff (Alternative)

```typescript
backoff: { type: "fixed", delay: 5000 }  // Always wait exactly 5s between retries
```

Fixed backoff is simpler but less efficient — it doesn't adapt to prolonged outages.

---

## 10. Job Handlers: What the Worker Actually Does

The worker processes three job types. Here's what each does:

### `search.index` — Index a Task in Meilisearch

```typescript
async function syncTaskToSearch(taskId: string): Promise<void> {
  // 1. Fetch the task from PostgreSQL
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    log("warn", "task not found for search index", { taskId });
    return;
  }

  // 2. POST the task to search-sync service
  const res = await fetch(`${searchSyncUrl}/sync/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: task.id, title: task.title, description: task.description || "",
      status: task.status, priority: task.priority, userId: task.userId,
      dueDate: task.dueDate, createdAt: task.createdAt,
    }),
  });

  if (!res.ok) {
    throw new Error(`search-sync returned ${res.status}`);  // Triggers retry
  }
  log("info", "task indexed in meilisearch", { taskId, title: task.title });
}
```

**Why fetch from DB instead of passing data in the job?** The job could include the full task data, but:
1. The task might change between enqueue time and processing time — we want the **latest** version
2. Job data should be small (taskId is 24 chars vs a full task object)
3. The worker has DB access — it can always fetch fresh data

**Why throw on failure?** Throwing an error tells BullMQ the job failed. BullMQ then applies the retry/backoff strategy. If we just logged the error without throwing, BullMQ would mark the job as completed — losing the retry.

### `search.remove` — Remove a Task from Meilisearch

```typescript
async function removeTaskFromSearch(taskId: string): Promise<void> {
  const res = await fetch(`${searchSyncUrl}/sync/task/${taskId}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`search-sync delete returned ${res.status}`);
  }
  log("info", "task removed from meilisearch", { taskId });
}
```

Simpler than `search.index` — just a DELETE request to remove the document.

### `task.overdue.check` — Find and Notify Overdue Tasks

```typescript
async function checkOverdueTasks(): Promise<void> {
  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },        // Due date is in the past
      status: { not: "COMPLETED" }, // Not yet completed
    },
  });

  let notified = 0;
  for (const task of tasks) {
    // Check if we already notified about this task being overdue
    const existing = await prisma.notification.findFirst({
      where: { taskId: task.id, type: "task_overdue" },
    });

    if (existing) continue;  // Already notified — skip

    await prisma.notification.create({
      data: {
        userId: task.userId,
        type: "task_overdue",
        message: `Task "${task.title}" is overdue (due ${task.dueDate?.toISOString()})`,
        taskId: task.id,
      },
    });
    notified++;
  }

  log("info", "overdue check complete", { total: tasks.length, notified });
}
```

**Idempotency**: The function checks for existing `task_overdue` notifications before creating new ones. This means the hourly repeatable job can run many times without creating duplicate notifications — if a task was already flagged as overdue, it's skipped.

This is a critical pattern for repeatable jobs: **always make the handler idempotent** (running it multiple times has the same effect as running it once).

---

## 11. Repeatable Jobs: Cron-Like Scheduling in BullMQ

### The Registration Code

```typescript
// services/worker/src/index.ts
const queue = new Queue(QUEUE_NAME, { connection });

async function setupRepeatableJobs() {
  const repeatableJobs = await queue.getRepeatableJobs();
  const hasOverdueJob = repeatableJobs.some((j) => j.name === "task.overdue.check");

  if (!hasOverdueJob) {
    await queue.add(
      "task.overdue.check",
      {},
      {
        repeat: { pattern: "0 * * * *" },  // Cron: at minute 0 of every hour
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );
    log("info", "registered repeatable job: task.overdue.check (hourly)");
  } else {
    log("info", "repeatable job already registered: task.overdue.check");
  }
}

setupRepeatableJobs().catch((err) => {
  log("error", "failed to setup repeatable jobs", { error: err.message });
});
```

### How BullMQ Repeatable Jobs Work

BullMQ stores the cron pattern in Redis. On every hour (`0 * * * *`), BullMQ creates a new job in the queue with the name `task.overdue.check`. The worker picks it up and processes it like any other job.

```
Hour 1:00 → BullMQ creates job → worker runs checkOverdueTasks()
Hour 2:00 → BullMQ creates job → worker runs checkOverdueTasks()
Hour 3:00 → BullMQ creates job → worker runs checkOverdueTasks()
```

### The Idempotency Check

```typescript
const repeatableJobs = await queue.getRepeatableJobs();
const hasOverdueJob = repeatableJobs.some((j) => j.name === "task.overdue.check");

if (!hasOverdueJob) {
  await queue.add("task.overdue.check", {}, { repeat: { pattern: "0 * * * *" } });
}
```

**Why check before registering?** If the worker restarts (pod crash, deployment update), the `setupRepeatableJobs()` function runs again. Without the idempotency check, it would register a **duplicate** repeatable job — causing `task.overdue.check` to run twice every hour. Over multiple restarts, you'd have N copies running.

The check prevents duplicates: it queries Redis for existing repeatable jobs and only registers if the job doesn't exist yet.

### Cron Expression Format

```
0 * * * *
│ │ │ │ │
│ │ │ │ └── Day of week (0-7, Sunday = 0 or 7)
│ │ │ └──── Month (1-12)
│ │ └────── Day of month (1-31)
│ └──────── Hour (0-23)
└────────── Minute (0-59)
```

`0 * * * *` = "at minute 0 of every hour, every day, every month, every day of week" = every hour on the hour.

BullMQ uses the [`cron-parser`](https://www.npmjs.com/package/cron-parser) library under the hood.

---

## 12. Graceful Shutdown: SIGTERM and SIGINT Handling

### The Problem

When Kubernetes updates a Deployment (e.g., new image), it sends `SIGTERM` to the old pod. The default behavior is:
1. Process receives `SIGTERM`
2. Kubernetes waits `terminationGracePeriodSeconds` (default 30s)
3. If the process hasn't exited, Kubernetes sends `SIGKILL` (force kill)

Without graceful shutdown:
- The worker might be mid-job when killed — the job appears "active" in Redis but no one is processing it
- The Redis connection stays open until the TCP timeout
- The health server port stays bound

### The Solution

```typescript
async function shutdown(signal: string) {
  log("info", `received ${signal}, shutting down...`);

  // 1. Stop accepting new connections on the health server
  healthServer.close();

  // 2. Stop the worker — waits for in-progress jobs to finish
  await worker.close();

  // 3. Close the queue (stop producing repeatable jobs)
  await queue.close();

  // 4. Close queue events listener
  await queueEvents.close();

  // 5. Close the Redis connection
  await connection.quit();

  // 6. Disconnect from PostgreSQL
  await prisma.$disconnect();

  log("info", "shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

### Shutdown Order Matters

| Step | What It Does | Why This Order |
|------|-------------|----------------|
| 1. `healthServer.close()` | Stops health checks | Kubernetes stops routing traffic — but worker keeps processing |
| 2. `worker.close()` | Waits for active jobs to finish | **Most important** — don't kill mid-job |
| 3. `queue.close()` | Stops the producer | No new repeatable jobs are scheduled |
| 4. `queueEvents.close()` | Stops event listener | No more pub/sub messages |
| 5. `connection.quit()` | Closes Redis cleanly | No dangling connections |
| 6. `prisma.$disconnect()` | Closes DB pool | Last — only needed after worker.close() finishes |

### `worker.close()` Internals

BullMQ's `worker.close()` does the following:
1. Stops accepting new jobs from the queue
2. Waits for all in-progress jobs to complete (respecting `concurrency`)
3. Marks the worker as offline in Redis

If a job is still running after `terminationGracePeriodSeconds` (30s), Kubernetes force-kills the pod. The job stays in "active" state in Redis until another worker picks it up (BullMQ has a stalled job recovery mechanism).

### The `terminationGracePeriodSeconds` Setting

```yaml
# templates/worker/deployment.yaml
spec:
  terminationGracePeriodSeconds: 30
```

This gives the worker 30 seconds to finish in-progress jobs. If your jobs take longer (e.g., large batch processing), increase this value.

---

## 13. The `serverExternalPackages` Fix (Critical)

### The Silent Failure

When we first deployed the worker, everything appeared healthy:
- Worker pod running, health endpoint returning OK
- Redis queue keys present (`bull:task-events:*`)
- Main app creating tasks successfully

But **jobs were never enqueued**. The worker had no jobs to process. The "BullMQ queue initialized" log message never appeared in the main app logs.

### Root Cause: Next.js Standalone Output Tracing

Next.js `output: "standalone"` mode uses `@vercel/nft` (Node File Tracing) to determine which `node_modules` packages to include in the production output. The tracer analyzes `import`/`require` calls and copies only the needed packages.

For most packages, this works automatically. But `bullmq` and `ioredis` have complex internal structures:
- `ioredis` uses dynamic `require()` calls for optional features
- `bullmq` imports `ioredis` internally, creating a deep dependency tree

The tracer **failed to detect** these packages, and they were silently omitted from the standalone build:

```bash
# Inside the container — BEFORE the fix:
kubectl exec deployment/task-manager -- ls node_modules/ | grep -E "bullmq|ioredis"
# Output: (nothing — packages missing!)
```

Without the packages, `import IORedis from "ioredis"` failed at runtime. But because `enqueueTaskEvent` catches errors silently (graceful degradation), the failure was invisible.

### The Fix

Add `serverExternalPackages` to `next.config.ts`:

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["bullmq", "ioredis"],  // ← THE FIX
};
```

### What `serverExternalPackages` Does

This config tells Next.js:
1. **Don't bundle** these packages with Turbopack/webpack (treat them as external)
2. Instead, load them via native Node.js `require()` at runtime
3. **The standalone tracer then detects** the external `require()` calls and copies the full packages to the output

After the fix:

```bash
# Inside the container — AFTER the fix:
kubectl exec deployment/task-manager -- ls node_modules/ | grep -E "bullmq|ioredis"
# Output:
# @ioredis
# bullmq
# ioredis
```

### How to Verify

```bash
# Check if packages are in the standalone build
kubectl exec deployment/task-manager -n task-manager -- sh -c "ls node_modules/ | grep -E 'bullmq|ioredis'"

# Check main app logs for "BullMQ queue initialized"
kubectl logs deployment/task-manager -n task-manager --tail=20 | Select-String "BullMQ"

# Check worker logs for job processing
kubectl logs deployment/task-manager-worker -n task-manager --tail=10
# Expected: "processing job: search.index", "task indexed in meilisearch"
```

### When to Use `serverExternalPackages`

| Package Type | Example | Use `serverExternalPackages`? |
|-------------|---------|------------------------------|
| Pure JS libraries | `lodash`, `zod` | ❌ (Turbopack bundles fine) |
| React UI components | `@radix-ui` | ❌ |
| Native addons | `sharp`, `bcrypt` | ✅ (native bindings) |
| Complex internal require trees | `bullmq`, `ioredis` | ✅ |
| Prisma | `@prisma/client` | Already handled by `prisma generate` |
| NextAuth | `next-auth` | ❌ (has built-in support) |

**Rule of thumb**: If a package uses dynamic `require()`, has native bindings, or seems to "disappear" from the standalone build, add it to `serverExternalPackages`.

---

## 14. Graceful Degradation in the Producer

### Same Philosophy as the Redis Cache

The cache layer (Module B) has a golden rule: **cache failure must never break the app**. The queue producer follows the same principle:

```typescript
export async function enqueueTaskEvent(name: JobName, data: Record<string, unknown>): Promise<void> {
  const q = getQueue();
  if (!q) return;  // No REDIS_URL → silent no-op

  try {
    await q.add(name, data, { ... });
    logger.info({ job: name, data }, "job enqueued");
  } catch (err) {
    logger.warn({ err, job: name }, "failed to enqueue job — fire-and-forget fallback");
    // Don't re-throw — the API response continues normally
  }
}
```

### What Happens When Redis Is Down

| Scenario | What Happens |
|----------|-------------|
| `REDIS_URL` not set | `getQueue()` returns null, `enqueueTaskEvent` returns immediately |
| Redis pod is down | `q.add()` throws, caught by try/catch, warning logged |
| Redis is slow | `q.add()` eventually times out or succeeds — job might be late but not lost |

In all cases, the task is still created in PostgreSQL. The user sees their task. Only the background search indexing is affected — the task won't appear in Meilisearch search results until Redis is back and the task is manually re-indexed.

### The Tradeoff

| Approach | Reliability | Latency |
|----------|------------|---------|
| `await enqueueTaskEvent(...)` | Job guaranteed before response | +1-5ms response time |
| `enqueueTaskEvent(...)` (no await) ✅ | Best-effort (99.99%+ success) | 0ms additional |

We chose fire-and-forget (no await) because:
1. The enqueue is ~1ms — failure only happens if Redis is down at that exact moment
2. The search index is not critical for correctness — the task exists in PostgreSQL regardless
3. Adding latency to every task creation for a 0.01% failure scenario isn't worth it

---

## 15. Shared Redis: Cache and Queue on One Instance

### The Architecture

The Redis instance from Module B (caching) is shared with Module C (queueing). Both the cache client (`redis` v4) and the queue client (`ioredis` via BullMQ) connect to the same Redis pod:

```
                          ┌──────────────────────────┐
                          │     Redis Pod (redis-0)   │
                          │     Port: 6379            │
                          │                          │
     Main App ────────────┤     ┌─────────────────┐  │
     ├── redis v4 ────────┼────▶│ Cache keys      │  │
     │   (cache client)   │     │ tasks:{userId}  │  │
     │                    │     ├─────────────────┤  │
     ├── ioredis ─────────┼────▶│ BullMQ keys     │  │
     │   (queue client)   │     │ bull:task-events│  │
     │                    │     └─────────────────┘  │
                          │                          │
     Worker ──────────────┤                          │
     ├── ioredis ─────────┼────▶│ (same BullMQ    │  │
     │   (consumer)       │     │  keys)          │  │
                          └──────────────────────────┘
```

### Why Share?

| Factor | Separate Instance | Shared Instance ✅ |
|--------|------------------|-------------------|
| Resource usage | 2x memory, 2x CPU | Shared pool |
| Complexity | 2 StatefulSets, 2 services | 1 StatefulSet, 1 service |
| Isolation | Cache flush doesn't affect queue | Keys are namespaced |
| Redis efficiency | 2 connections per client | 1 connection (reused) |

Redis handles both workloads efficiently because:
1. **Cache keys** (`tasks:{userId}`) are short-lived (60s TTL) and small (~10KB each)
2. **BullMQ keys** (`bull:task-events:*`) are mostly list/hash structures, compact
3. **No contention**: Redis is single-threaded but each command is microsecond-fast

### Key Namespace Separation

Redis doesn't have "databases" in the traditional sense (it has `SELECT` but that's deprecated). Instead, keys are separated by naming convention:

| Prefix | Owner | Example |
|--------|-------|---------|
| `tasks:` | Cache (Module B) | `tasks:cmr4bryd90000...` |
| `bull:` | BullMQ (Module C) | `bull:task-events:wait` |

No collision is possible — the prefixes are completely different.

---

## 16. Health Checks: The Worker's HTTP Server

### Why a Worker Needs HTTP

The worker is not a web server — it processes background jobs. But Kubernetes requires HTTP health checks (or exec probes). We chose HTTP because:
1. It's simpler to configure in Helm (`httpGet` vs `exec`)
2. It can return richer status than exit codes
3. It follows the same pattern as all other services

### The Health Server

```typescript
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", queue: QUEUE_NAME }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

healthServer.listen(3007, "0.0.0.0", () => {
  log("info", `health server listening on port ${HEALTH_PORT}`);
});
```

### Response

```bash
kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-worker:3007/health').then(r=>r.json()).then(j=>console.log(j))"
# Output: {"status":"ok","queue":"task-events"}
```

### Kubernetes Probes

```yaml
# templates/worker/deployment.yaml
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 15    # Wait 15s before first check (worker startup)
  periodSeconds: 30          # Check every 30s

readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 5     # Ready check starts sooner
  periodSeconds: 10
```

**Why 15s initial delay for liveness?** The worker needs time to:
1. Connect to Redis (~1s)
2. Generate Prisma client (on first run, ~2s)
3. Start the health server (~1s)
4. Register repeatable jobs (~1s)

If liveness starts too early, the probe fails and Kubernetes restarts the pod — creating a crash loop.

### What the Health Check Doesn't Verify

The `/health` endpoint only checks if the HTTP server is responding. It does NOT verify:
- Redis connectivity
- Database connectivity
- Worker is actually processing jobs

A more sophisticated health check could check Redis connectivity:

```typescript
// Possible future enhancement:
if (req.url === "/health") {
  const redisOk = connection.status === "ready";
  res.writeHead(redisOk ? 200 : 503);
  res.end(JSON.stringify({ status: redisOk ? "ok" : "degraded", redis: connection.status }));
}
```

But for now, the simple check is sufficient — if the worker can't connect to Redis, BullMQ's error handler logs it and the worker keeps retrying.

---

## 17. Docker Multi-Stage Build for the Worker

### The Dockerfile

```dockerfile
# services/worker/Dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY services/worker/package.json services/worker/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim AS builder
WORKDIR /app
COPY services/worker/package.json services/worker/package-lock.json* ./
RUN npm ci
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/worker/prisma.config.ts ./
RUN npx prisma generate
COPY services/worker/tsconfig.json ./
COPY services/worker/src/ ./src/

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
```

### Stage Comparison

| Stage | Purpose | Has node_modules? | Has Prisma client? |
|-------|---------|-------------------|-------------------|
| **deps** | Install production deps | ✅ (prod only) | ❌ |
| **builder** | Full dev deps + Prisma generate | ✅ (dev + prod) | ✅ |
| **runner** | Final image | ✅ (from deps, prod only) | ❌ (wait — see below) |

**Wait — where's the Prisma client in the runner?**

The Prisma client is generated into `src/generated/prisma/` (based on `prisma.config.ts`). The `COPY --from=builder /app/src/ ./src/` line copies the `src/` directory, which includes the generated Prisma client. The runner's `node_modules` comes from deps (production dependencies: `@prisma/client`, `@prisma/adapter-pg`), and the actual generated client code lives in `src/generated/prisma/`.

### Why `tsx` Instead of `tsc + node`?

```dockerfile
CMD ["npx", "tsx", "src/index.ts"]
```

Prisma 7.8 generates `.ts` files with `import.meta.url` (ESM syntax). Compiling with `tsc` would break this syntax. `tsx` is a TypeScript runtime that executes `.ts` files directly without compilation — it handles ESM syntax correctly.

This is the same pattern used by all Node.js microservices in the project (scheduler, notification, file-service, etc.).

### Build Context: `task-manager/` (Not `services/worker/`)

```bash
docker build -t ralf090102/worker-service:latest -f services/worker/Dockerfile .
#                                                    ^^^^^^^^^^^^^^^^^^^^^^^^^
#                                                    Dockerfile path          Build context
```

The build context is `task-manager/` because the Dockerfile needs to access `prisma/schema.prisma` (shared schema). If the context was `services/worker/`, the `COPY prisma/schema.prisma` instruction would fail — the schema lives at the project root.

---

## 18. Helm Templates: Worker Deployment and Service

### Deployment Template

```yaml
# templates/worker/deployment.yaml
{{- if .Values.worker.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "task-manager.fullname" . }}-worker
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: worker
spec:
  replicas: 1
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: worker
  template:
    metadata:
      labels:
        {{- include "task-manager.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: worker
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: worker
          image: "{{ .Values.worker.image.repository }}:{{ .Values.worker.image.tag }}"
          imagePullPolicy: {{ .Values.worker.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 3007
              protocol: TCP
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secrets
                  key: database-url
            {{- if .Values.redis.enabled }}
            - name: REDIS_URL
              value: "redis://{{ include "task-manager.fullname" . }}-redis:6379"
            {{- end }}
            {{- if .Values.searchSync.enabled }}
            - name: SEARCH_SYNC_URL
              value: "http://{{ include "task-manager.fullname" . }}-search-sync:3006"
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
          resources:
            {{- toYaml .Values.worker.resources | nindent 12 }}
{{- end }}
```

### Key Design Decisions

**1. Conditional env vars**

```yaml
{{- if .Values.redis.enabled }}
- name: REDIS_URL
  value: "redis://{{ include "task-manager.fullname" . }}-redis:6379"
{{- end }}
```

`REDIS_URL` is only injected when Redis is enabled. If Redis is disabled, `process.env.REDIS_URL` is undefined, and the worker's `new IORedis(undefined || "redis://localhost:6379")` would fail to connect — but the health server would still run, so Kubernetes would keep restarting the pod trying to connect to localhost.

In practice, the worker **requires** Redis (BullMQ cannot function without it). If you disable Redis, you should also disable the worker (`worker.enabled: false`).

**2. `app.kubernetes.io/component: worker`**

Following the service selector label convention from Stage 2. Without a unique component label, the main app's Service selector would accidentally route traffic to the worker pod — causing 404s for Next.js routes.

**3. `terminationGracePeriodSeconds: 30`**

Gives the worker 30 seconds to finish in-progress jobs during shutdown (see Section 12).

**4. No ServiceMonitor (yet)**

The worker doesn't expose Prometheus metrics yet. This could be added in the future using `prom-client` (like the main app's `/api/metrics` endpoint). The health server could serve both `/health` and `/metrics`.

### Service Template

```yaml
# templates/worker/service.yaml
{{- if .Values.worker.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "task-manager.fullname" . }}-worker
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: worker
spec:
  type: ClusterIP
  ports:
    - port: 3007
      name: http
      targetPort: http
  selector:
    {{- include "task-manager.selectorLabels" . | nindent 4 }}
    app.kubernetes.io/component: worker
{{- end }}
```

The Service is only needed for the health endpoint (Kubernetes probes don't actually need a Service, but having one lets you check health from other pods):

```bash
kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-worker:3007/health').then(r=>r.json()).then(j=>console.log(j))"
```

### values.yaml

```yaml
# helm-chart/values.yaml
worker:
  enabled: true
  image:
    repository: ralf090102/worker-service
    pullPolicy: Never
    tag: latest
  resources:
    limits:
      cpu: 250m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 128Mi
```

---

## 19. Task API Integration Points

### Where Jobs Are Enqueued

The main app enqueues jobs at three points:

**1. POST `/api/tasks` — after creating a task:**

```typescript
// src/app/api/tasks/route.ts
const task = await prisma.task.create({ ... });

await invalidateCache(`tasks:${session.user.id}`);          // Redis cache invalidation
enqueueTaskEvent("search.index", { taskId: task.id });       // ← Enqueue search index job
emitToRealtime("task:created", task);                        // WebSocket push
triggerWebhook("task.created", task, session.user.id);       // Webhook delivery
return NextResponse.json(task, { status: 201 });
```

**2. PUT `/api/tasks/[id]` — after updating a task:**

```typescript
// src/app/api/tasks/[id]/route.ts
const task = await prisma.task.update({ ... });

await invalidateCache(`tasks:${session.user.id}`);          // Redis cache invalidation
enqueueTaskEvent("search.index", { taskId: task.id });       // ← Re-index updated task
emitToRealtime("task:updated", task);
triggerWebhook("task.updated", task, session.user.id);
return NextResponse.json(task);
```

**3. DELETE `/api/tasks/[id]` — after deleting a task:**

```typescript
// src/app/api/tasks/[id]/route.ts
await prisma.task.delete({ where: { id } });

await invalidateCache(`tasks:${session.user.id}`);          // Redis cache invalidation
enqueueTaskEvent("search.remove", { taskId: id });           // ← Remove from search index
emitToRealtime("task:deleted", { id });
triggerWebhook("task.deleted", { id }, session.user.id);
return NextResponse.json({ success: true });
```

### The Pattern: Mutate → Invalidate → Enqueue → Push

All three handlers follow the same side-effect sequence:

```
1. Database mutation (create/update/delete)
2. Cache invalidation (Redis)
3. Search index job (BullMQ)
4. Realtime push (HTTP to realtime service)
5. Webhook trigger (HTTP to webhook service)
6. Return response to user
```

Steps 2-5 are all fire-and-forget side effects. The user gets the response after step 1 (the database write). Steps 2-5 happen in the background — they're best-effort optimizations that don't affect correctness.

### Why `search.index` on Both POST and PUT?

- **POST**: New task needs to be added to the search index
- **PUT**: Updated task needs to be re-indexed (title/description/status might have changed)

The search-sync service handles both cases — it uses Meilisearch's `addDocuments` API which creates or updates based on the primary key (`id`).

---

## 20. Verification and End-to-End Testing

### Deploy Verification Checklist

#### Layer 1: Pod Health

```bash
# Worker pod running?
kubectl get pods -n task-manager | findstr worker
# Expected: task-manager-worker-xxxxx    1/1     Running     0    87s

# Health endpoint responds?
kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-worker:3007/health').then(r=>r.json()).then(j=>console.log(j))"
# Expected: {"status":"ok","queue":"task-events"}
```

#### Layer 2: Worker Logs (Startup)

```bash
kubectl logs deployment/task-manager-worker -n task-manager --tail=10
# Expected:
# {"level":"info","msg":"worker starting","data":{"redis":"configured","searchSync":"http://..."}}
# {"level":"info","msg":"worker listening on queue \"task-events\""}
# {"level":"info","msg":"health server listening on port 3007"}
# {"level":"info","msg":"registered repeatable job: task.overdue.check (hourly)"}
```

#### Layer 3: Packages in Standalone Build

```bash
# Verify bullmq and ioredis are in the main app container
kubectl exec deployment/task-manager -n task-manager -- sh -c "ls node_modules/ | grep -E 'bullmq|ioredis'"
# Expected:
# @ioredis
# bullmq
# ioredis
```

#### Layer 4: BullMQ Queue Keys in Redis

```bash
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli KEYS "bull:task-events:*"
# Expected:
# bull:task-events:repeat            (repeatable job definitions)
# bull:task-events:repeat:...        (scheduled instances)
# bull:task-events:delayed           (delayed/scheduled jobs)
# bull:task-events:id                (job ID counter)
# bull:task-events:meta              (queue metadata)
# bull:task-events:events            (pub/sub event stream)
```

#### Layer 5: E2E Test (Create Task → Job Processed → Indexed)

```bash
# Start port-forward
kubectl port-forward -n task-manager svc/task-manager 3000:3000 &
sleep 5

# Check Meilisearch document count BEFORE
kubectl exec deployment/task-manager -n task-manager -- node -e "
  fetch('http://task-manager-meilisearch:7700/indexes/tasks/stats',
    {headers:{Authorization:'Bearer meili-master-key-change-me'}})
    .then(r=>r.json()).then(t=>console.log('BEFORE:',t.numberOfDocuments))
"

# Create a task via the API
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrfRes = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/csrf" -WebSession $session -UseBasicParsing
$csrf = ($csrfRes.Content | ConvertFrom-Json).csrfToken
$body = "csrfToken=$csrf&email=shampoo01@gmail.com&password=junnaruse&callbackUrl=http://localhost:3000/dashboard"
Invoke-WebRequest -Uri "http://localhost:3000/api/auth/callback/credentials" -Method POST -Body $body -ContentType "application/x-www-form-urlencoded" -WebSession $session -UseBasicParsing | Out-Null
$taskBody = @{ title = "E2E Queue Test"; description = "BullMQ flow"; priority = "HIGH" } | ConvertTo-Json
$createRes = Invoke-WebRequest -Uri "http://localhost:3000/api/tasks" -Method POST -Body $taskBody -ContentType "application/json" -WebSession $session -UseBasicParsing
Write-Output "Task: $($createRes.Content)"

# Wait for async processing
sleep 5

# Check worker logs
kubectl logs deployment/task-manager-worker -n task-manager --tail=10
# Expected:
# {"level":"info","msg":"processing job: search.index","data":{"id":"2","data":{"taskId":"..."}}}
# {"level":"info","msg":"task indexed in meilisearch","data":{"taskId":"...","title":"E2E Queue Test"}}
# {"level":"info","msg":"job completed: search.index","data":{"id":"2"}}

# Check Meilisearch document count AFTER (should be BEFORE + 1)
kubectl exec deployment/task-manager -n task-manager -- node -e "
  fetch('http://task-manager-meilisearch:7700/indexes/tasks/stats',
    {headers:{Authorization:'Bearer meili-master-key-change-me'}})
    .then(r=>r.json()).then(t=>console.log('AFTER:',t.numberOfDocuments))
"
```

---

## 21. Troubleshooting

### Problem: Jobs Not Being Enqueued (Silent Failure)

**Symptoms**: Tasks are created successfully, but worker logs show no job processing. No "BullMQ queue initialized" in main app logs.

**Cause**: `bullmq` and/or `ioredis` are missing from the Next.js standalone build (see Section 13).

**Fix**: Add `serverExternalPackages` to `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["bullmq", "ioredis"],
};
```

Then rebuild and redeploy:
```bash
docker build -t ralf090102/task-manager-app:latest -f Dockerfile .
minikube ssh "docker rmi -f ralf090102/task-manager-app:latest"
minikube image load ralf090102/task-manager-app:latest
kubectl rollout restart deployment/task-manager -n task-manager
```

**Verification**:
```bash
kubectl exec deployment/task-manager -n task-manager -- sh -c "ls node_modules/ | grep -E 'bullmq|ioredis'"
# Should list: @ioredis, bullmq, ioredis
```

### Problem: `Error: Your redis options maxRetriesPerRequest must be set to null`

**Cause**: The ioredis connection was created without `maxRetriesPerRequest: null`.

**Fix**: Ensure both producer and consumer set this option:
```typescript
new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,  // REQUIRED by BullMQ
});
```

### Problem: Worker pod CrashLoopBackOff

**Cause**: Worker can't connect to Redis, database, or search-sync service.

**Debug**:
```bash
# Check worker logs
kubectl logs deployment/task-manager-worker -n task-manager --tail=20

# Check env vars
kubectl exec deployment/task-manager-worker -n task-manager -- printenv | findstr -i "REDIS\|DATABASE\|SEARCH"

# Check if Redis is running
kubectl get pods -n task-manager | findstr redis

# Check if Redis is reachable from the worker
kubectl exec deployment/task-manager-worker -n task-manager -- node -e "
  const net = require('net');
  const s = net.connect(6379, 'task-manager-redis');
  s.on('connect', () => { console.log('Redis reachable'); s.end(); });
  s.on('error', (e) => console.log('Redis unreachable:', e.message));
"
```

### Problem: Repeatable Job Registered Multiple Times

**Cause**: The idempotency check in `setupRepeatableJobs()` was bypassed (e.g., Redis was flushed between registrations).

**Symptoms**: Worker logs show "registered repeatable job: task.overdue.check (hourly)" multiple times. Overdue checks run N times per hour instead of once.

**Fix**: Clear repeatable job keys and restart:
```bash
# Delete all repeatable job definitions
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli DEL "bull:task-events:repeat"
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli KEYS "bull:task-events:repeat:*" | ForEach-Object { kubectl exec task-manager-redis-0 -n task-manager -- redis-cli DEL $_ }

# Restart worker (it will re-register cleanly)
kubectl rollout restart deployment/task-manager-worker -n task-manager
```

### Problem: `job failed: search-sync returned 503`

**Cause**: Search-sync service is down or Meilisearch is unreachable.

**Debug**:
```bash
# Check search-sync health
kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-search-sync:3006/health').then(r=>r.json()).then(j=>console.log(j))"

# Check Meilisearch health
kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-meilisearch:7700/health').then(r=>r.json()).then(j=>console.log(j))"

# Check failed jobs in Redis
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli ZCARD "bull:task-events:failed"
```

BullMQ will automatically retry the job (up to 3 attempts with exponential backoff). If search-sync comes back within ~6 seconds, the job succeeds on retry.

### Problem: Main app logs "failed to enqueue job — fire-and-forget fallback"

**Cause**: The main app can't connect to Redis to enqueue a job.

**Impact**: Task was still created in PostgreSQL. Only search indexing is affected — the task won't appear in Meilisearch search results until Redis is back.

**Fix**: Check Redis health and connectivity:
```bash
# Check Redis pod
kubectl get pods -n task-manager | findstr redis

# Check REDIS_URL in main app
kubectl exec deployment/task-manager -n task-manager -- printenv REDIS_URL
```

---

## 22. Key Patterns and Best Practices

### Pattern 1: Producer-Consumer Decoupling

```
Producer (main app) ──enqueue──→ Redis ──consume──→ Consumer (worker)
```

**Principle**: The producer doesn't know or care how the consumer processes the job. It just puts a message on the queue and moves on. This decouples the API response time from the background work time.

### Pattern 2: Jobs Survive Pod Restarts

**Principle**: Jobs are stored in Redis, not in the worker's memory. If the worker pod crashes, jobs wait in the queue. When a new worker pod starts, it picks up where the old one left off. No work is lost.

### Pattern 3: Automatic Retries with Backoff

```typescript
{ attempts: 3, backoff: { type: "exponential", delay: 2000 } }
```

**Principle**: Transient failures (network blips, service restarts) are common in distributed systems. Retrying with exponential backoff gives the system time to recover without overwhelming it.

### Pattern 4: Idempotent Job Handlers

```typescript
// Overdue check: skip if notification already exists
const existing = await prisma.notification.findFirst({
  where: { taskId: task.id, type: "task_overdue" },
});
if (existing) continue;
```

**Principle**: A job might be processed multiple times (retry after partial failure, or repeatable job runs). The handler must be safe to run multiple times — no duplicate side effects.

### Pattern 5: Graceful Degradation

```typescript
// enqueueTaskEvent catches errors and logs a warning — never throws
try { await q.add(...); } catch (err) { logger.warn(...); }
```

**Principle**: If the queue is unavailable, the app must continue working. Search indexing is a background optimization, not a correctness requirement. The task exists in PostgreSQL regardless.

### Pattern 6: Repeatable Job Idempotency Check

```typescript
const repeatableJobs = await queue.getRepeatableJobs();
if (!repeatableJobs.some(j => j.name === "task.overdue.check")) {
  await queue.add("task.overdue.check", {}, { repeat: { pattern: "0 * * * *" } });
}
```

**Principle**: When registering repeatable jobs on startup, always check if they're already registered. Worker restarts are common (deployments, scaling, crashes) — without the check, you'd accumulate duplicate schedules.

### Pattern 7: Graceful Shutdown Sequence

```
healthServer.close() → worker.close() → queue.close() → connection.quit()
```

**Principle**: Close in reverse order of dependency. Stop accepting new work first, then finish in-progress work, then close connections. This ensures no job is left half-processed.

### Pattern 8: `serverExternalPackages` for Complex Packages

```typescript
serverExternalPackages: ["bullmq", "ioredis"],
```

**Principle**: Next.js standalone tracing can't always detect packages with complex internal structures. If a package uses dynamic `require()` or native bindings, add it to `serverExternalPackages` to ensure it's included in the production build.

### Pattern 9: Shared Infrastructure with Key Namespacing

```
Redis keys:
  tasks:{userId}           ← Cache (Module B)
  bull:task-events:*       ← Queue (Module C)
```

**Principle**: Multiple systems can share the same Redis instance as long as they use distinct key prefixes. This avoids the overhead of running separate Redis instances while maintaining logical isolation.

### Pattern 10: Minimal Job Data

```typescript
// Good: pass only the ID
enqueueTaskEvent("search.index", { taskId: task.id });

// Bad: pass the full object
enqueueTaskEvent("search.index", { task: { id, title, description, status, ... } });
```

**Principle**: Job data should be as small as possible. The worker fetches fresh data from the database when processing — this ensures the latest state and keeps Redis memory usage low.

---

## Summary

The BullMQ worker queue transforms fire-and-forget HTTP calls into **durable, retryable background jobs**:

- **Before**: Task created → HTTP POST to search-sync → if search-sync is down, index update is lost
- **After**: Task created → job enqueued to Redis → worker processes with 3 retries + exponential backoff → job survives pod restarts

Key design decisions:
1. **BullMQ + ioredis** — BullMQ needs ioredis for blocking connections and Lua scripts
2. **`maxRetriesPerRequest: null`** — Required by BullMQ for blocking commands
3. **`serverExternalPackages`** — Critical fix for Next.js standalone build tracing
4. **Fire-and-forget enqueue** — No `await` at call site for fast API responses
5. **Idempotent handlers** — Safe to retry without duplicate side effects
6. **Repeatable jobs** — Hourly overdue check without a separate CronJob
7. **Graceful shutdown** — `worker.close()` waits for in-progress jobs before exiting
8. **Shared Redis** — Cache (Module B) and queue (Module C) on one instance

This module completes the **Redis-based infrastructure layer** started in Module B. Together, they provide:
- **Module B**: Read caching (reduce PostgreSQL query load)
- **Module C**: Write buffering (durable background processing)

Both share the same Redis instance, demonstrating how a single piece of infrastructure can serve multiple architectural needs with proper key namespacing.
