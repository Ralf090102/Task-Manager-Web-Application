# Stage 3 Module B — Redis Caching Layer: Detailed Learning Guide

This document explains every concept, pattern, and implementation detail behind the Redis caching layer added in Stage 3 Module B. It covers caching theory, the node-redis v4 client, the cache-aside pattern, cache invalidation, TTL strategy, the Redis StatefulSet, conditional Helm templates, TypeScript generics issues, and verification techniques — all with real code from the codebase.

---

## Table of Contents

1. [Why Cache? The Database Pressure Problem](#1-why-cache-the-database-pressure-problem)
2. [What Is Redis?](#2-what-is-redis)
3. [Caching Strategies: Cache-Aside vs Alternatives](#3-caching-strategies-cache-aside-vs-alternatives)
4. [The node-redis v4 Client](#4-the-node-redis-v4-client)
5. [The Lazy Connection Singleton Pattern](#5-the-lazy-connection-singleton-pattern)
6. [Graceful Degradation: Why the Cache Never Throws](#6-graceful-degradation-why-the-cache-never-throws)
7. [The Cache-Aside Implementation in GET /api/tasks](#7-the-cache-aside-implementation-in-get-apitasks)
8. [Cache Invalidation on Mutations](#8-cache-invalidation-on-mutations)
9. [TTL Strategy and Stale Data Tradeoffs](#9-ttl-strategy-and-stale-data-tradeoffs)
10. [Cache Key Design](#10-cache-key-design)
11. [Redis Commands Used (GET, SETEX, DEL)](#11-redis-commands-used-get-setex-del)
12. [Redis StatefulSet — Third StatefulSet in the Project](#12-redis-statefulset--third-statefulset-in-the-project)
13. [Health Probes: redis-cli ping](#13-health-probes-redis-cli-ping)
14. [Headless Service vs ClusterIP Service](#14-headless-service-vs-clusterip-service)
15. [Conditional Helm Templates (`.Values.redis.enabled`)](#15-conditional-helm-templates-valuesredisenabled)
16. [The `--reuse-values` Gotcha with New Keys](#16-the---reuse-values-gotcha-with-new-keys)
17. [TypeScript Generics Issue with redis v4](#17-typescript-generics-issue-with-redis-v4)
18. [Why NOT globalThis for Redis (Unlike Prisma)](#18-why-not-globalthis-for-redis-unlike-prisma)
19. [The REDIS_URL Environment Variable](#19-the-redis_url-environment-variable)
20. [Verification and Testing](#20-verification-and-testing)
21. [Troubleshooting](#21-troubleshooting)
22. [Key Patterns and Best Practices](#22-key-patterns-and-best-practices)

---

## 1. Why Cache? The Database Pressure Problem

### The Problem

Every time a user opens the dashboard, the Next.js app calls `GET /api/tasks`, which runs a Prisma query against PostgreSQL:

```typescript
// src/app/api/tasks/route.ts — BEFORE caching
const tasks = await prisma.task.findMany({
  where: { userId: session.user.id },
  orderBy: { createdAt: "desc" },
  include: { board: { select: { id: true, name: true, color: true } } },
});
```

This query hits PostgreSQL on **every single page load**. For a task list that rarely changes between updates (the user might refresh 10 times without adding a task), this is wasted database work:

```
Page load 1 → PostgreSQL query (50ms)
Page load 2 → PostgreSQL query (50ms)  ← same data!
Page load 3 → PostgreSQL query (50ms)  ← same data!
Page load 4 → PostgreSQL query (50ms)  ← same data!
```

### Why This Matters in Production

- **Connection pool exhaustion**: Supabase uses PgBouncer with a limited connection pool (transaction mode). Every query consumes a connection slot. Under load, new queries queue up.
- **Latency**: PostgreSQL queries involve network round-trip + query planning + disk I/O. Redis reads are from memory — 10-100x faster.
- **Cost**: Cloud databases charge by compute and connection hours. Reducing query count reduces cost.

### The Solution: A Cache Layer

Add Redis between the app and the database. On the first request, fetch from PostgreSQL and store in Redis. On subsequent requests, return the cached data directly:

```
Page load 1 → Redis MISS → PostgreSQL (50ms) → write to Redis (1ms)
Page load 2 → Redis HIT (1ms)  ← 50x faster!
Page load 3 → Redis HIT (1ms)
Page load 4 → Redis HIT (1ms)
```

---

## 2. What Is Redis?

**Redis** (Remote Dictionary Server) is an in-memory key-value data store. It stores data as key-value pairs in RAM, making reads and writes extremely fast (sub-millisecond latency).

### Key Characteristics

| Property | Value | Why It Matters |
|----------|-------|----------------|
| **Storage** | In-memory (RAM) | 10-100x faster than disk-based databases |
| **Data model** | Key-value (strings, lists, sets, hashes, sorted sets) | Simple, flexible |
| **Persistence** | Optional (RDB snapshots + AOF logs) | Survives restarts; configurable |
| **Single-threaded** | One command at a time | No locks needed; atomic operations |
| **TTL support** | Built-in key expiry | Perfect for caching — data auto-expires |
| **Protocol** | RESP (REdis Serialization Protocol) | Lightweight, text-based |

### Redis vs PostgreSQL: Different Tools for Different Jobs

```
PostgreSQL                          Redis
┌─────────────────────┐            ┌─────────────────────┐
│ Disk-based          │            │ In-memory           │
│ Relational (tables) │            │ Key-value (strings) │
│ ACID transactions   │            │ Atomic operations   │
│ Complex queries     │            │ Simple GET/SET      │
│ Persistent          │            │ Volatile (TTL)      │
│ ~50ms per query     │            │ ~1ms per read       │
│ Source of truth     │            │ Cache (temporary)   │
└─────────────────────┘            └─────────────────────┘
```

Redis is NOT a replacement for PostgreSQL. It's a **cache** — a temporary, fast-access copy of data that can be rebuilt from the source of truth (PostgreSQL) at any time.

### Why `redis:7-alpine`?

The Alpine variant is a minimal Linux image (~40MB vs ~130MB for the full Debian-based image). Redis 7 is the latest stable major version with improved performance and new commands. Alpine is ideal for Kubernetes — smaller images mean faster pulls and lower memory overhead.

---

## 3. Caching Strategies: Cache-Aside vs Alternatives

There are several caching patterns. This project uses **cache-aside** (also called lazy loading).

### Cache-Aside (Used in This Project)

The application is responsible for checking the cache and populating it:

```
┌──────────┐                        ┌─────────┐                ┌──────────────┐
│  Client   │──GET /api/tasks──────▶│   App   │──1. GET key──▶│    Redis     │
└──────────┘                        └─────────┘                └──────────────┘
                                         │                            │
                                         │◀──2. nil (cache miss)──────┤
                                         │                            │
                                         │──3. findMany()─▶┌──────────────────┐
                                         │                 │   PostgreSQL     │
                                         │◀──4. tasks[]────┤                  │
                                         │                 └──────────────────┘
                                         │──5. SETEX key 60──▶┌─────────────┐
                                         │                     │    Redis    │
                                         │◀──6. return tasks───│  (populated)│
                                         │                     └─────────────┘
                                         │
                                         │──7. NextResponse.json(tasks)──▶ Client
```

**On the next request:**
```
Client ──GET──▶ App ──1. GET key──▶ Redis
                                  ──2. HIT (cached tasks)──▶ App ──3. return──▶ Client
```

The code:
```typescript
// src/app/api/tasks/route.ts
const cacheKey = `tasks:${session.user.id}`;

// Step 1: Check cache
const cached = await getCache<unknown[]>(cacheKey);
if (cached) {
  return NextResponse.json(cached);  // Cache HIT — skip database entirely
}

// Step 2: Cache MISS — query database
const tasks = await prisma.task.findMany({ ... });

// Step 3: Write result to cache with 60s TTL
await setCache(cacheKey, tasks, 60);

return NextResponse.json(tasks);
```

### Other Strategies (Not Used Here)

| Strategy | How It Works | Pros | Cons |
|----------|-------------|------|------|
| **Read-Through** | Cache itself loads from DB on miss | App code simpler | Requires cache library that supports it |
| **Write-Through** | Write to cache AND DB simultaneously | Cache always fresh | Write latency doubles |
| **Write-Behind** | Write to cache, async write to DB | Fast writes | Risk of data loss on crash |
| **Cache-Aside** ✅ | App checks cache, falls back to DB | Simple, explicit control | App must handle both cache and DB |

**Why cache-aside?** It's the simplest pattern that gives the most control. The application explicitly decides when to read from cache and when to write to it. There's no "magic" — everything is visible in the code. This makes it easy to debug and reason about.

---

## 4. The node-redis v4 Client

### Package: `redis` (NOT `ioredis`)

There are two popular Redis clients for Node.js:

| Package | Maintainer | Style | Used Here? |
|---------|-----------|-------|------------|
| `redis` | Redis (official) | Promise-based, v4+ | ✅ Yes |
| `ioredis` | Community | Promise-based, older | No |

We use the official `redis` package (v4+). It's the recommended client maintained by Redis Labs.

### Key API Methods Used

```typescript
import { createClient } from "redis";

// Create a client (doesn't connect yet)
const client = createClient({ url: "redis://localhost:6379" });

// Connect to Redis
await client.connect();

// SET with expiry (seconds)
await client.setEx("mykey", 60, JSON.stringify({ hello: "world" }));

// GET
const value = await client.get("mykey");
// Returns: '{"hello":"world"}' or null

// DELETE
await client.del("mykey");

// Check if connected
client.isOpen;  // boolean

// Disconnect
await client.disconnect();
```

### Important: v4+ Requires Explicit connect()

In `redis@3` and earlier, the client connected automatically on creation. In v4+, you **must** call `await client.connect()` explicitly:

```typescript
// redis@3 (old — auto-connects)
const client = redis.createClient();
client.set("key", "value");  // Works immediately

// redis@4+ (new — explicit connect required)
const client = createClient();
await client.connect();       // MUST call this first!
await client.set("key", "value");
```

This is why our `redis.ts` has the `ensureConnected()` function — it lazily connects on first use.

---

## 5. The Lazy Connection Singleton Pattern

### The Design

The Redis client should only connect when actually needed. Not every API route uses the cache — only `/api/tasks` does. Connecting on app startup would waste resources if the cache is never used.

The solution is a **lazy singleton**: the client is created and connected on the first `getCache()` / `setCache()` call, then reused for all subsequent calls.

```typescript
// src/lib/redis.ts

let client: ReturnType<typeof createClient> | null = null;
let initialized = false;
let connectPromise: Promise<boolean> | null = null;

function getClient() {
  // No REDIS_URL configured? Don't create a client at all.
  if (!process.env.REDIS_URL) return null;

  // Create the client ONCE (singleton)
  if (!initialized) {
    initialized = true;
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => {
      logger.warn({ err }, "Redis client error");
    });
  }

  return client;
}

async function ensureConnected(): Promise<boolean> {
  const c = getClient();
  if (!c) return false;               // No REDIS_URL
  if (c.isOpen) return true;          // Already connected

  // Prevent duplicate connect() calls during concurrent requests
  if (!connectPromise) {
    connectPromise = c
      .connect()
      .then(() => {
        logger.info("Redis connected");
        connectPromise = null;        // Clear promise for next reconnect
        return true;
      })
      .catch((err) => {
        logger.warn({ err }, "Redis connection failed — falling back to direct DB queries");
        connectPromise = null;
        return false;
      });
  }

  return connectPromise;             // All concurrent callers share the same promise
}
```

### Why Three State Variables?

| Variable | Purpose |
|----------|---------|
| `client` | The Redis client instance (null until first use) |
| `initialized` | Prevents recreating the client on every call |
| `connectPromise` | Prevents duplicate `connect()` calls if multiple requests arrive simultaneously |

The `connectPromise` is critical: if two API requests arrive at the same time (both cache miss), both would call `ensureConnected()`. Without deduplication, both would call `client.connect()` — the second call throws "client is already connecting". The shared promise ensures only one `connect()` happens.

### Flow Walkthrough

```
1. App starts → client = null, initialized = false

2. First GET /api/tasks arrives
   → getCache("tasks:abc") called
   → getClient(): REDIS_URL exists, !initialized → create client, initialized = true
   → ensureConnected(): client exists, !isOpen, !connectPromise → call connect()
   → connectPromise set, connection in progress...
   → connection succeeds → "Redis connected" logged, connectPromise cleared
   → return true
   → cache MISS → query DB → setCache() → return tasks

3. Second GET /api/tasks (same user)
   → getCache("tasks:abc") called
   → getClient(): initialized = true → return existing client
   → ensureConnected(): client.isOpen = true → return true immediately
   → cache HIT → return cached tasks (no DB query!)

4. Redis pod restarts (connection drops)
   → client.isOpen = false
   → Next request: ensureConnected() → !isOpen → connect() again
   → If Redis is back: reconnects
   → If Redis is still down: catch → return false → falls back to DB
```

---

## 6. Graceful Degradation: Why the Cache Never Throws

### The Golden Rule

**Cache is a performance optimization, not a requirement.** If Redis is down, the app must continue working — just slower (direct DB queries instead of cache hits).

Every cache function returns `null` on failure instead of throwing:

```typescript
export async function getCache<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c || !(await ensureConnected())) return null;  // No Redis → null
  try {
    const data = await c.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    return null;  // Any error → null (treated as cache miss)
  }
}

export async function setCache<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
  const c = getClient();
  if (!c || !(await ensureConnected())) return;  // No Redis → silent skip
  try {
    await c.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silent fail — cache is best-effort
  }
}

export async function invalidateCache(key: string): Promise<void> {
  const c = getClient();
  if (!c || !(await ensureConnected())) return;
  try {
    await c.del(key);
  } catch {
    // Silent fail
  }
}
```

### Why Silent Failures Are Correct

| Scenario | If Cache Throws | If Cache Returns Null (Our Approach) |
|----------|----------------|--------------------------------------|
| Redis down | 500 error to user | Falls back to DB, user sees data |
| Redis slow | Request timeout | Falls back to DB after connect timeout |
| Redis corrupts data | JSON.parse throws | Returns null, treated as cache miss |
| Network partition | Connection error | Falls back to DB |

The caller (`/api/tasks`) treats `null` as "cache miss" and proceeds to the database:

```typescript
const cached = await getCache<unknown[]>(cacheKey);
if (cached) {
  return NextResponse.json(cached);  // Cache hit
}
// If cached is null (miss OR error): fall through to database
const tasks = await prisma.task.findMany({ ... });
```

This means Redis can be removed entirely (uninstalled from the cluster) and the app continues working — just with higher database load. This is called **graceful degradation**.

---

## 7. The Cache-Aside Implementation in GET /api/tasks

### The Full GET Handler

```typescript
// src/app/api/tasks/route.ts

export async function GET() {
  const start = Date.now();
  try {
    // 1. Authentication (always first — no point caching for unauthenticated users)
    const session = await auth();
    if (!session?.user?.id) {
      observeRequest("GET", "/api/tasks", 401, (Date.now() - start) / 1000);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Build cache key — scoped to this user
    const cacheKey = `tasks:${session.user.id}`;

    // 3. Check cache (returns null on miss OR if Redis is unavailable)
    const cached = await getCache<unknown[]>(cacheKey);
    if (cached) {
      trackTaskOperation("list", "success");
      observeRequest("GET", "/api/tasks", 200, (Date.now() - start) / 1000);
      return NextResponse.json(cached);  // ← Cache HIT: return immediately
    }

    // 4. Cache MISS: query the database
    const tasks = await prisma.task.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: { board: { select: { id: true, name: true, color: true } } },
    });

    // 5. Write result to cache with 60s TTL (fire-and-forget)
    await setCache(cacheKey, tasks, 60);

    // 6. Return tasks to client
    trackTaskOperation("list", "success");
    observeRequest("GET", "/api/tasks", 200, (Date.now() - start) / 1000);
    return NextResponse.json(tasks);
  } catch {
    trackTaskOperation("list", "error");
    observeRequest("GET", "/api/tasks", 500, (Date.now() - start) / 1000);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### Why Auth Happens Before Cache Check

The cache check comes **after** authentication. This is important:

1. **Cache key includes user ID**: `tasks:{userId}`. We need the user ID to build the key.
2. **No point caching 401s**: Unauthenticated requests should never populate the cache.
3. **Security**: If we cached before auth, one user might see another user's tasks via a stale key.

### The Three Metrics Tracked

Notice that the cache hit path and the cache miss path both track the same metrics:

```typescript
// Cache HIT path:
trackTaskOperation("list", "success");
observeRequest("GET", "/api/tasks", 200, (Date.now() - start) / 1000);
return NextResponse.json(cached);

// Cache MISS path (after DB query):
trackTaskOperation("list", "success");
observeRequest("GET", "/api/tasks", 200, (Date.now() - start) / 1000);
return NextResponse.json(tasks);
```

The `observeRequest` metric includes the response time. On a cache hit, `(Date.now() - start) / 1000` will be very small (1-2ms). On a miss, it will be larger (30-50ms). This lets you see the performance improvement in Prometheus/Grafana.

---

## 8. Cache Invalidation on Mutations

### The Problem with Caching

Caches introduce a risk: **stale data**. If a user creates a new task but the cache still holds the old task list, the new task won't appear until the cache expires (60 seconds).

### The Solution: Explicit Invalidation

Every mutation (create, update, delete) **invalidates** the cache for that user:

```typescript
// POST /api/tasks — after creating a task
await invalidateCache(`tasks:${session.user.id}`);

// PUT /api/tasks/[id] — after updating a task
await invalidateCache(`tasks:${session.user.id}`);

// DELETE /api/tasks/[id] — after deleting a task
await invalidateCache(`tasks:${session.user.id}`);
```

### Invalidation Flow

```
1. User creates task "Buy groceries"
   → POST /api/tasks
   → prisma.task.create(...)
   → invalidateCache("tasks:abc123")  ← DELETE key from Redis
   → return new task

2. User loads dashboard
   → GET /api/tasks
   → getCache("tasks:abc123") → null (was invalidated)
   → prisma.task.findMany(...) ← queries DB (includes new task)
   → setCache("tasks:abc123", tasks, 60) ← fresh cache
   → return tasks (includes "Buy groceries")
```

### Why Not Just Update the Cache Instead of Deleting?

You might wonder: instead of deleting the cache, why not update it with the new data?

```typescript
// Bad approach: try to update cache directly
const tasks = await getCache(cacheKey);
tasks.push(newTask);
await setCache(cacheKey, tasks, 60);
```

Problems with this approach:
1. **Race conditions**: Two concurrent requests could both read the old cache, both append, and one overwrites the other.
2. **Complexity**: You'd need to re-run the full Prisma query with `include: { board: ... }` to get the right shape.
3. **Cache might not exist**: The cache could have expired — then you're pushing to null.

**Deleting is simpler and safer**: the next GET rebuilds the cache from scratch with fresh data. The tradeoff is one extra DB query (the first GET after a mutation), which is acceptable.

### TTL as a Safety Net

Even if explicit invalidation fails (Redis was briefly down), the 60-second TTL ensures stale data is eventually cleared. This is the **defense in depth** approach:
1. **Primary**: Explicit invalidation on mutations (immediate)
2. **Fallback**: TTL expiry (within 60 seconds)

---

## 9. TTL Strategy and Stale Data Tradeoffs

### What Is TTL?

TTL (Time To Live) is how long a key lives in Redis before being automatically deleted. Redis tracks this precisely:

```
SETEX "tasks:abc123" 60 '{"..."}'
                     ^^ 60 seconds

TTL "tasks:abc123"    → 58   (2 seconds later)
TTL "tasks:abc123"    → 30   (30 seconds later)
TTL "tasks:abc123"    → -2   (key expired and was deleted)
```

### Choosing the Right TTL

| TTL | Staleness Window | DB Load Reduction | Use Case |
|-----|-----------------|-------------------|----------|
| 0 (no cache) | 0 seconds | 0% | Data that changes every request |
| 5 seconds | 5 seconds | ~90% | Real-time dashboards |
| **60 seconds** ✅ | **60 seconds** | **~98%** | **Task lists (this project)** |
| 5 minutes | 5 minutes | ~99.5% | Rarely-changing config data |
| 1 hour | 1 hour | ~99.9% | Reference data (countries, categories) |

### Why 60 Seconds?

This project uses 60 seconds — a balance between freshness and performance:

**Why not shorter (5s)?**
- More cache misses → more DB queries → less benefit
- For a task list, 5 seconds of staleness is unnecessary precision

**Why not longer (5m)?**
- If invalidation fails (Redis briefly down), users see stale data for 5 minutes
- 60 seconds is the maximum acceptable staleness for a task list

**With explicit invalidation**, the TTL is just a safety net. In normal operation, the cache is invalidated immediately on mutations, so staleness is near-zero. The TTL only matters if invalidation fails.

---

## 10. Cache Key Design

### The Key Format

```
tasks:{userId}
```

Example: `tasks:cmr4bryd90000jkko7798c0t9`

### Why User-Scoped Keys?

Each user has their own task list. The cache key includes the user ID to prevent data leakage:

```typescript
const cacheKey = `tasks:${session.user.id}`;
```

If the key was just `"tasks"` (no user ID), all users would share the same cache entry — user A would see user B's tasks. This would be a critical security bug.

### Key Naming Conventions

| Convention | Example | Why |
|-----------|---------|-----|
| Use colons as separators | `tasks:abc123` | Redis convention — easy to parse |
| Entity first | `tasks:{id}` not `{id}:tasks` | Enables pattern matching (`KEYS tasks:*`) |
| Include scope | `tasks:{userId}` | Prevents cross-user data leakage |
| Keep it short | `tasks:` not `task_manager:task_list:` | Redis keys live in memory — shorter = less RAM |

### Checking Keys in Production

```bash
# List all cache keys
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli KEYS "*"
# Output: tasks:cmr4bryd90000jkko7798c0t9

# Check TTL for a specific key
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli TTL "tasks:cmr4bryd90000jkko7798c0t9"
# Output: 58  (58 seconds until expiry)

# Check how many keys exist
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli DBSIZE
# Output: 1

# Inspect a key's value
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli GET "tasks:cmr4bryd90000jkko7798c0t9"
# Output: [{"id":"cmr4...","title":"Buy groceries",...}]
```

---

## 11. Redis Commands Used (GET, SETEX, DEL)

### SETEX — Set with Expiry

```
SETEX key seconds value
```

```typescript
// In our code:
await client.setEx(key, ttlSeconds, JSON.stringify(value));
```

This is equivalent to:
```
SET key value
EXPIRE key seconds
```

But atomic — both operations happen as one step. This is important: if you used `SET` then `EXPIRE` separately, a crash between the two would leave the key without an expiry (permanent stale data).

### GET — Read Value

```
GET key
```

```typescript
const data = await client.get(key);
return data ? (JSON.parse(data) as T) : null;
```

Returns `null` if the key doesn't exist (cache miss) or has expired. Returns the string value if it exists.

Note: Redis stores everything as strings. Objects must be `JSON.stringify()`'d before writing and `JSON.parse()`'d after reading.

### DEL — Delete Key

```
DEL key
```

```typescript
await client.del(key);
```

Removes the key immediately. Used for cache invalidation on mutations.

### TTL — Check Time Remaining

```
TTL key
```

Returns:
- `-2` — key does not exist (was deleted or never created)
- `-1` — key exists but has no expiry
- `0` or positive integer — seconds remaining

---

## 12. Redis StatefulSet — Third StatefulSet in the Project

This is the third StatefulSet in the project (after MinIO and Meilisearch). The pattern is identical — StatefulSet + Headless Service + ClusterIP Service + volumeClaimTemplates.

### StatefulSet Template

```yaml
# task-manager/helm-chart/templates/redis/statefulset.yaml
{{- if .Values.redis.enabled }}
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: {{ include "task-manager.fullname" . }}-redis
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    app.kubernetes.io/component: redis
spec:
  serviceName: {{ include "task-manager.fullname" . }}-redis-headless
  replicas: 1
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: redis
  template:
    metadata:
      labels:
        {{- include "task-manager.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: redis
    spec:
      containers:
        - name: redis
          image: "{{ .Values.redis.image.repository }}:{{ .Values.redis.image.tag }}"
          ports:
            - containerPort: 6379
              name: redis
          volumeMounts:
            - name: data
              mountPath: /data
          livenessProbe:
            exec:
              command: ["redis-cli", "ping"]
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["redis-cli", "ping"]
            initialDelaySeconds: 3
            periodSeconds: 5
          resources:
            {{- toYaml .Values.redis.resources | nindent 12 }}
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: {{ .Values.redis.persistence.size }}
{{- end }}
```

### Key Design Decisions

**1. `replicas: 1`**

Redis (in this configuration) is a single instance. No clustering, no replication. This is appropriate for a cache — if Redis goes down, the app falls back to PostgreSQL. No data is lost permanently because PostgreSQL is the source of truth.

**2. `volumeClaimTemplates` with 1Gi**

Redis persistence is configured via the `/data` mount path. Redis writes RDB snapshots to `/data/dump.rdb`. On pod restart, it loads this file to restore cached data. 1Gi is generous for a task list cache (even 100,000 cached task lists would be a few hundred MB).

**3. `app.kubernetes.io/component: redis`**

Following the selector label convention established in Stage 2 (to avoid the label selector bug where the main app service accidentally routed traffic to other pods). Every StatefulSet and its services have a unique component label.

**4. `serviceName` points to the headless service**

```yaml
serviceName: {{ include "task-manager.fullname" . }}-redis-headless
```

StatefulSets require a `serviceName` that points to a headless service (`clusterIP: None`). This provides stable DNS names for each pod (`redis-0.redis-headless`).

---

## 13. Health Probes: redis-cli ping

### Why Not HTTP Health Checks?

MinIO and Meilisearch expose HTTP health endpoints (`/minio/health/live`, `/health`). Redis doesn't speak HTTP — it uses the RESP protocol. You can't use `httpGet` probes.

### The exec Probe

```yaml
livenessProbe:
  exec:
    command: ["redis-cli", "ping"]
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  exec:
    command: ["redis-cli", "ping"]
  initialDelaySeconds: 3
  periodSeconds: 5
```

`redis-cli ping` sends a `PING` command to the Redis server. If Redis is healthy, it responds with `PONG` (exit code 0). If Redis is not responding, the command fails (exit code 1), and Kubernetes restarts the pod (liveness) or removes it from the service (readiness).

### Liveness vs Readiness

| Probe | Purpose | When It Fails |
|-------|---------|----------------|
| **Liveness** | Should Kubernetes restart the pod? | Pod is in a bad state (deadlocked, crashed) |
| **Readiness** | Should Kubernetes route traffic to this pod? | Pod is alive but not ready (starting up, overloaded) |

For Redis, both probes use the same command. The difference is timing:
- Readiness starts at 3s with 5s intervals (faster detection during startup)
- Liveness starts at 5s with 10s intervals (don't restart too aggressively)

---

## 14. Headless Service vs ClusterIP Service

Redis has **two** services (same pattern as MinIO and Meilisearch):

### Headless Service (for StatefulSet DNS)

```yaml
# task-manager/helm-chart/templates/redis/headless-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "task-manager.fullname" . }}-redis-headless
spec:
  clusterIP: None    # ← Headless: no load-balanced IP
  ports:
    - port: 6379
      name: redis
  selector:
    {{- include "task-manager.selectorLabels" . | nindent 4 }}
    app.kubernetes.io/component: redis
```

**Purpose**: Required by the StatefulSet. Provides stable DNS names for each pod:
- `task-manager-redis-0.task-manager-redis-headless.task-manager.svc.cluster.local`

Without this service, the StatefulSet won't function correctly (pods can't discover each other).

### ClusterIP Service (for app connections)

```yaml
# task-manager/helm-chart/templates/redis/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "task-manager.fullname" . }}-redis
spec:
  type: ClusterIP    # ← Normal service: stable cluster IP
  ports:
    - port: 6379
      name: redis
  selector:
    {{- include "task-manager.selectorLabels" . | nindent 4 }}
    app.kubernetes.io/component: redis
```

**Purpose**: This is what the app connects to. The DNS name `task-manager-redis` resolves to a stable cluster IP that routes to the Redis pod.

```typescript
// In the deployment env vars:
REDIS_URL=redis://task-manager-redis:6379
//                     ^^^^^^^^^^^^^^^^^^^
//                     This DNS name comes from the ClusterIP service
```

### Why Two Services?

| Service | `clusterIP` | Purpose | Who Uses It |
|---------|-------------|---------|-------------|
| Headless | `None` | StatefulSet pod DNS | StatefulSet controller, pod discovery |
| ClusterIP | Auto-assigned | Stable connection endpoint | The app (Next.js) |

With `replicas: 1`, the distinction is subtle. But if you later scale Redis to multiple replicas (e.g., Redis Sentinel), the headless service gives each pod a unique DNS name while the ClusterIP service load-balances across them.

---

## 15. Conditional Helm Templates (`.Values.redis.enabled`)

### The `{{- if }}` Guard

Every Redis template starts and ends with a conditional:

```yaml
{{- if .Values.redis.enabled }}
apiVersion: apps/v1
kind: StatefulSet
# ... full template ...
{{- end }}
```

This means the StatefulSet, headless service, and ClusterIP service are **only created when `redis.enabled` is `true`** in values.yaml.

### values.yaml

```yaml
# task-manager/helm-chart/values.yaml
redis:
  enabled: false    # ← Disabled by default
  image:
    repository: redis
    pullPolicy: IfNotPresent
    tag: 7-alpine
  persistence:
    size: 1Gi
  resources:
    limits:
      cpu: 250m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 128Mi
```

### Enabling Redis

```bash
helm upgrade task-manager ./helm-chart --namespace task-manager \
  --reuse-values --no-hooks \
  --set redis.enabled=true \
  --set redis.image.repository=redis \
  --set redis.image.tag=7-alpine \
  --set redis.image.pullPolicy=Never \
  --set redis.persistence.size=1Gi \
  --set redis.resources.limits.cpu=250m \
  --set redis.resources.limits.memory=256Mi \
  --set redis.resources.requests.cpu=100m \
  --set redis.resources.requests.memory=128Mi
```

### Disabling Redis

```bash
helm upgrade task-manager ./helm-chart --namespace task-manager \
  --reuse-values --no-hooks \
  --set redis.enabled=false
```

When `redis.enabled` is `false`:
- The StatefulSet, Services, and PVC are deleted
- The `REDIS_URL` env var is NOT added to the deployment
- The app's `redis.ts` checks `process.env.REDIS_URL` → undefined → returns null → all cache functions no-op → falls back to DB

This makes Redis truly optional — you can enable/disable it without code changes.

---

## 16. The `--reuse-values` Gotcha with New Keys

### The Problem

When you add a **new** top-level key to `values.yaml` (like `redis:`), `helm upgrade --reuse-values` **does NOT read it**. This is a Helm behavior:

- `--reuse-values` takes the **previous release's values** (stored in a Helm secret) and reuses them
- Since the previous release didn't have a `redis:` key, it stays `undefined`
- The `{{- if .Values.redis.enabled }}` check fails → template not rendered

### The Solution

On the **first** deploy with Redis, you must pass ALL `redis.*` values via `--set`:

```bash
helm upgrade task-manager ./helm-chart --namespace task-manager \
  --reuse-values --no-hooks \
  --set redis.enabled=true \
  --set redis.image.repository=redis \
  --set redis.image.tag=7-alpine \
  --set redis.image.pullPolicy=Never \
  --set redis.persistence.size=1Gi \
  --set redis.resources.limits.cpu=250m \
  --set redis.resources.limits.memory=256Mi \
  --set redis.resources.requests.cpu=100m \
  --set redis.resources.requests.memory=128Mi
```

After this first deploy, the `redis` key is stored in the release secret. Subsequent upgrades only need `--reuse-values`:

```bash
# Subsequent upgrades (values are now persisted in the release):
helm upgrade task-manager ./helm-chart --namespace task-manager --reuse-values --no-hooks
```

### Why `--no-hooks`?

The Helm chart has a pre-upgrade database migration hook (from Module 8 / team-service). This hook runs `prisma db push` which hangs on the Supabase PgBouncer URL (port 6543). Adding `--no-hooks` skips this hook. Database migrations are run manually from the host with the direct connection URL (port 5432).

---

## 17. TypeScript Generics Issue with redis v4

### The Problem

The `redis` v4 package has extremely complex TypeScript generics. The `createClient` function returns `RedisClientType<M, F, S, RESP, T>` where each type parameter has defaults:

```typescript
// What TypeScript infers from createClient():
RedisClientType<{}, {}, {}, 3, {}>

// What the RedisClientType type defaults to:
RedisClientType<RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>
```

These don't match. If you try to use the common globalThis singleton pattern (like Prisma):

```typescript
// BROKEN — TypeScript error:
const globalForRedis = globalThis as unknown as {
  __redisClient?: ReturnType<typeof createClient>;
};

function getClient() {
  if (!globalForRedis.__redisClient) {
    globalForRedis.__redisClient = createClient({ url: process.env.REDIS_URL });
    // ERROR: Type 'RedisClientType<{}, {}, {}, 3, {}>' is not assignable to
    //        type 'RedisClientType<RedisModules, RedisFunctions, ...>'
  }
  return globalForRedis.__redisClient;
}
```

The generic parameters resolve differently in the type annotation vs the actual function call.

### The Solution: Module-Level Variable

Instead of using `globalThis` (which requires matching types), use a simple module-level variable:

```typescript
// src/lib/redis.ts — working solution
let client: ReturnType<typeof createClient> | null = null;
let initialized = false;

function getClient() {
  if (!process.env.REDIS_URL) return null;

  if (!initialized) {
    initialized = true;
    client = createClient({ url: process.env.REDIS_URL });
    // TypeScript is happy — both sides are ReturnType<typeof createClient>
  }

  return client;
}
```

The type `ReturnType<typeof createClient>` matches perfectly because both the variable declaration and the assignment use the same generic inference.

---

## 18. Why NOT globalThis for Redis (Unlike Prisma)

### Why Prisma Uses globalThis

Prisma's official recommendation is to use `globalThis` to prevent connection pool exhaustion in development:

```typescript
// src/lib/prisma.ts (Prisma pattern)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Why**: Next.js dev mode (hot reload) creates new module instances. Without `globalThis`, every file change creates a new `PrismaClient`, which opens new database connections. After 20 hot reloads, you have 20 open connections — PostgreSQL rejects new connections ("too many clients").

### Why Redis Doesn't Need globalThis

Redis handles idle connections gracefully:
1. **Redis supports 10,000+ concurrent connections** — a few extra from hot reload is negligible
2. **Redis connections are lightweight** — each uses ~50KB of memory vs PostgreSQL's ~10MB per connection
3. **No connection pool to exhaust** — Redis is single-threaded; it doesn't allocate resources per connection

If hot reload creates 5 Redis clients, that's 5 connections × 50KB = 250KB of extra memory. Negligible.

For PostgreSQL, 5 extra PrismaClients = 5 × (default pool of 10) = 50 open database connections. That exhausts Supabase's free-tier pool.

### Decision Matrix

| Factor | Prisma | Redis |
|--------|--------|-------|
| Connections per client | 10 (pool) | 1 |
| Memory per connection | ~10MB | ~50KB |
| Max connections (free tier) | ~20 (PostgreSQL) | 10,000+ |
| Risk of exhaustion | HIGH | NEGLIGIBLE |
| Use globalThis? | ✅ Yes | ❌ No (module-level is fine) |

---

## 19. The REDIS_URL Environment Variable

### Conditional Injection in the Deployment

```yaml
# task-manager/helm-chart/templates/task-manager/deployment.yaml
{{- if .Values.redis.enabled }}
- name: REDIS_URL
  value: "redis://{{ include "task-manager.fullname" . }}-redis:6379"
{{- end }}
```

This is a conditional env var — it only appears when Redis is enabled. When disabled, `process.env.REDIS_URL` is `undefined`, and the cache client returns null for all operations.

### URL Format

```
redis://task-manager-redis:6379
│      │                    │
│      │                    └── Port (6379 is Redis default)
│      └── Hostname (Kubernetes service DNS name)
└── Protocol (Redis scheme)
```

The hostname `task-manager-redis` comes from the ClusterIP Service name. Kubernetes DNS resolves this to the service's cluster IP, which routes to the Redis pod.

### Why Not a Secret?

PostgreSQL credentials, NextAuth secrets, and SMTP passwords are stored in Kubernetes Secrets because they're sensitive. The Redis URL has no password (no `AUTH` configured) and is only accessible within the cluster. There's nothing sensitive to protect.

If you later add Redis AUTH (password protection), the URL would become:
```
redis://:password@task-manager-redis:6379
```

And you'd move it to a Secret. But for now, a plain env var is appropriate.

---

## 20. Verification and Testing

### Deploy Verification Checklist

After deploying Redis, verify each layer:

#### Layer 1: Pod Health

```bash
# Redis pod running and healthy?
kubectl get pods -n task-manager | findstr redis
# Expected: task-manager-redis-0    1/1     Running     0    87s

# Redis responds to PING?
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli PING
# Expected: PONG
```

#### Layer 2: Network Connectivity

```bash
# App can resolve Redis DNS?
kubectl exec deployment/task-manager -n task-manager -- printenv REDIS_URL
# Expected: redis://task-manager-redis:6379

# App can reach Redis TCP port?
kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-redis:6379').catch(e=>console.log(e.message))"
# Expected: "fetch failed" (expected — Redis speaks RESP, not HTTP)
# If you get ECONNREFUSED, DNS resolution failed or port is wrong
```

#### Layer 3: Cache Write (Trigger)

Make an authenticated request to `/api/tasks`. The first request is a cache miss — it queries the DB and writes to Redis:

```bash
# After loading the dashboard (which calls GET /api/tasks):
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli DBSIZE
# Expected: 1 (one key: tasks:{userId})

kubectl exec task-manager-redis-0 -n task-manager -- redis-cli KEYS "*"
# Expected: tasks:cmr4bryd90000jkko7798c0t9
```

#### Layer 4: TTL Verification

```bash
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli TTL "tasks:cmr4bryd90000jkko7798c0t9"
# Expected: 50-60 (seconds until expiry)
```

#### Layer 5: Cache Hit Verification

Make the same request again. Check the app logs:

```bash
kubectl logs deployment/task-manager -n task-manager --tail=5
# Expected (on first request): "Redis connected"
# No additional "Redis connected" on second request (already connected)
```

#### Layer 6: Invalidation Verification

Create, update, or delete a task, then immediately check Redis:

```bash
# After creating a task via the UI:
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli DBSIZE
# Expected: 0 (cache was invalidated)
# Next GET /api/tasks will be a cache miss (rebuilds from DB)
```

### End-to-End Test Script (PowerShell)

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# 1. Get CSRF token
$csrfRes = Invoke-WebRequest -Uri "http://task-manager.local/api/auth/csrf" -WebSession $session -UseBasicParsing
$csrf = ($csrfRes.Content | ConvertFrom-Json).csrfToken

# 2. Sign in
$body = "csrfToken=$csrf&email=shampoo01@gmail.com&password=junnaruse&callbackUrl=http://task-manager.local/dashboard"
Invoke-WebRequest -Uri "http://task-manager.local/api/auth/callback/credentials" -Method POST -Body $body -ContentType "application/x-www-form-urlencoded" -WebSession $session | Out-Null

# 3. First GET (cache miss — writes to Redis)
$tasksRes1 = Invoke-WebRequest -Uri "http://task-manager.local/api/tasks" -WebSession $session -UseBasicParsing
$tasks = $tasksRes1.Content | ConvertFrom-Json
Write-Output "Tasks count: $($tasks.Count)"

# 4. Check Redis
$keyCount = kubectl exec task-manager-redis-0 -n task-manager -- redis-cli DBSIZE
Write-Output "Redis DBSIZE: $keyCount"  # Expected: 1
```

---

## 21. Troubleshooting

### Problem: Redis pod stuck in `ContainerCreating`

**Cause**: PVC can't be provisioned (no storage class, or cluster is out of disk).

**Fix**:
```bash
kubectl describe pod task-manager-redis-0 -n task-manager
# Look at the "Events" section for provisioning errors

# Check available storage
kubectl get pv
kubectl get sc  # Storage classes
```

### Problem: `Redis connection failed — falling back to direct DB queries`

**Cause**: Redis pod is running but the app can't reach it.

**Debug**:
```bash
# Check if REDIS_URL is set
kubectl exec deployment/task-manager -n task-manager -- printenv REDIS_URL

# Check if the service exists
kubectl get svc -n task-manager | findstr redis

# Check DNS resolution from the app pod
kubectl exec deployment/task-manager -n task-manager -- nslookup task-manager-redis
```

### Problem: App shows old data after creating a task

**Cause**: Cache invalidation failed, or you're looking at a different user's cache.

**Debug**:
```bash
# Check if cache was invalidated
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli DBSIZE
# If DBSIZE > 0, the cache wasn't invalidated

# Check the app logs for invalidation errors
kubectl logs deployment/task-manager -n task-manager --tail=20 | findstr -i "cache\|redis\|error"
```

**Manual fix**: Flush the Redis cache:
```bash
kubectl exec task-manager-redis-0 -n task-manager -- redis-cli FLUSHALL
```

### Problem: TypeScript error with `createClient`

**Error**: `Type 'RedisClientType<{}, {}, {}, 3, {}>' is not assignable to type 'RedisClientType<RedisModules, RedisFunctions, RedisScripts, RespVersions, TypeMapping>'`

**Cause**: Using `globalThis` with the Redis v4 generics (see [Section 17](#17-typescript-generics-issue-with-redis-v4)).

**Fix**: Use a module-level variable instead of globalThis:
```typescript
// Don't do this:
const globalForRedis = globalThis as unknown as { __redis: RedisClientType };

// Do this:
let client: ReturnType<typeof createClient> | null = null;
```

### Problem: `Cannot use import statement outside a module`

**Cause**: Trying to test Redis from inside the pod using `node -e "import ..."` — Node.js eval context doesn't support ESM imports.

**Fix**: Use `require()` (CJS) since the Next.js standalone image bundles everything:
```bash
# Instead of import syntax, use require:
kubectl exec deployment/task-manager -n task-manager -- node -e "const { createClient } = require('redis'); ..."
```

Note: The `redis` package is bundled into the Next.js server output by Turbopack, not available as a standalone `node_modules` entry. Test Redis connectivity via `redis-cli` inside the Redis pod instead.

### Problem: `--reuse-values` doesn't pick up new `redis:` section

**Cause**: Helm's `--reuse-values` reuses the previous release's values, which didn't have a `redis:` key.

**Fix**: Pass all `redis.*` values via `--set` on the first deploy (see [Section 16](#16-the---reuse-values-gotcha-with-new-keys)).

### Problem: Prisma schema mismatch (`User.welcomeShown does not exist`)

**Cause**: The Prisma schema was updated (new field added) but `prisma db push` wasn't run.

**Fix**:
```bash
# Push schema with DIRECT connection (not pgbouncer — port 6543 hangs)
cmd /c "set DATABASE_URL=postgresql://postgres.xxx:password@host.supabase.com:5432/postgres&& npx prisma db push --accept-data-loss"
```

Note: `--accept-data-loss` is required because Prisma detected a potentially destructive schema change (adding a column with a default value is safe, but Prisma asks for confirmation anyway).

---

## 22. Key Patterns and Best Practices

### Pattern 1: Cache is Best-Effort

```typescript
// Every cache function returns null on failure — never throws
export async function getCache<T>(key: string): Promise<T | null> {
  try { ... } catch { return null; }
}
```

**Principle**: The cache is a performance optimization. If it fails, the app must continue working (just slower). Never let a cache failure become a user-facing error.

### Pattern 2: Cache-Aside (Lazy Loading)

```typescript
const cached = await getCache(key);
if (cached) return cached;        // Hit

const data = await db.query();    // Miss → query DB
await setCache(key, data, 60);   // Populate cache
return data;
```

**Principle**: The application explicitly manages the cache. No magic, no hidden behavior. Easy to debug because every cache interaction is visible in the code.

### Pattern 3: Invalidate on Write

```typescript
// After every mutation:
await invalidateCache(`tasks:${userId}`);
```

**Principle**: Whenever data changes, delete the corresponding cache entry. The next read rebuilds it from the database. Combined with TTL, this ensures data is never stale for more than a few seconds.

### Pattern 4: TTL as Safety Net

```typescript
await setCache(key, value, 60);  // 60-second TTL
```

**Principle**: Even if explicit invalidation fails, the TTL ensures stale data is eventually cleared. This is defense in depth — multiple independent mechanisms protect against staleness.

### Pattern 5: Conditional Deployment

```yaml
{{- if .Values.redis.enabled }}
# ... Redis templates ...
{{- end }}
```

**Principle**: Optional infrastructure should be toggleable. New deployments shouldn't require Redis unless explicitly enabled. This lets you add the code now and enable it later without redeploying.

### Pattern 6: Lazy Connection

```typescript
async function ensureConnected() {
  if (c.isOpen) return true;
  // Connect only when needed
}
```

**Principle**: Don't connect on app startup. Connect on first use. This avoids connection overhead for routes that don't use the cache, and handles Redis starting after the app (race condition avoidance).

### Pattern 7: Connection Deduplication

```typescript
if (!connectPromise) {
  connectPromise = c.connect().then(() => { ... });
}
return connectPromise;
```

**Principle**: If multiple requests arrive simultaneously during the initial connection, share a single `connect()` call. Without this, the second request would call `connect()` while the first is still in progress — throwing "client is already connecting".

### Pattern 8: User-Scoped Cache Keys

```typescript
const cacheKey = `tasks:${session.user.id}`;
```

**Principle**: Cache keys must include all dimensions that affect the data. Since tasks are per-user, the key includes the user ID. This prevents cross-user data leakage.

### Pattern 9: JSON Serialization

```typescript
// Write: stringify before storing
await setCache(key, JSON.stringify(tasks));

// Read: parse after reading
const data = await client.get(key);
return data ? JSON.parse(data) : null;
```

**Principle**: Redis stores strings. Complex objects must be serialized. JSON is universal and sufficient for read-heavy data. (For write-heavy data, consider Redis Hashes for field-level updates.)

### Pattern 10: Separate Headless and ClusterIP Services

```yaml
# Headless (for StatefulSet)
clusterIP: None

# ClusterIP (for app connections)
type: ClusterIP
```

**Principle**: StatefulSets need a headless service for pod DNS. Applications need a ClusterIP service for load-balanced connections. Both serve the same pods but for different purposes.

---

## Summary

The Redis caching layer adds a **performance optimization** without changing the application's correctness:

- **Before**: Every `GET /api/tasks` hits PostgreSQL (~50ms)
- **After**: First request hits PostgreSQL + writes cache (~51ms), subsequent requests hit Redis (~1ms)

Key design decisions:
1. **Cache-aside pattern** — explicit, debuggable, no magic
2. **60-second TTL** — balance between freshness and performance
3. **Explicit invalidation** — cache is cleared on every mutation
4. **Graceful degradation** — Redis failure doesn't break the app
5. **Lazy connection** — no startup overhead, no race conditions
6. **Conditional Helm templates** — Redis is optional infrastructure

This module also lays the **foundation for Module C** (BullMQ worker queue), which uses the same Redis instance for job storage. The Redis StatefulSet, Service, and `REDIS_URL` env var are shared between the caching layer and the future worker queue.
