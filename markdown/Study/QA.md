# Q&A — Level 6: Microservices Architecture

---

## Q1: In the 8 services, what is a "Framework"?

A **framework** is a pre-built library that handles the repetitive plumbing of running a server, so you can focus on writing your specific business logic instead of boilerplate.

Without a framework, you'd have to write all of this yourself:

```
Things a framework handles for you:

1. Listening on a TCP port (HTTP server)
2. Parsing incoming HTTP requests (method, URL, headers, body)
3. Routing (matching URL paths to handler functions)
4. Parsing JSON bodies, form data, multipart uploads
5. Serializing responses to JSON
6. Setting correct HTTP status codes and headers
7. Error handling (try/catch around every handler)
8. Request logging
9. CORS headers
10. Graceful shutdown
```

```
WITHOUT a framework (raw Node.js):          WITH a framework (Fastify):

const http = require("http");               const app = Fastify({ logger: true });
const server = http.createServer(            
  (req, res) => {                           app.get("/health", async () => {
    if (req.method === "GET"                  return { status: "ok" };
      && req.url === "/health") {           });
      res.writeHead(200,                     
        { "Content-Type":                    app.post("/notify", async (req) => {
          "application/json" });               // just write your logic
      res.end(JSON.stringify(                  await sendEmail(req.body);
        { status: "ok" }));                    return { sent: true };
      }                                      });
    // parse body manually...                
    // handle errors manually...             app.listen({ port: 3004 });
    // route other paths manually...         
  }                                          
);                                            
server.listen(3004);                         
```

The framework version is ~10 lines. The raw version would be 50+ lines just for basic functionality.

**In this project's context**, the "Framework" column in the service table tells you what each service uses to handle HTTP/WebSocket connections:


| Service      | Framework     | What it does for that service                                |
| ------------ | ------------- | ------------------------------------------------------------ |
| Notification | **Fastify**   | Handles HTTP routing, JSON parsing, /health endpoint         |
| File Service | **Fastify**   | Same, plus multipart file upload parsing                     |
| Search Sync  | **Fastify**   | Same                                                         |
| Webhook      | **Fastify**   | Same                                                         |
| Team Service | **Fastify**   | Same                                                         |
| Realtime     | **Socket.io** | Handles WebSocket connections (not HTTP routing)             |
| Analytics    | **FastAPI**   | Python HTTP framework (same role as Fastify, but for Python) |
| Scheduler    | **None**      | No framework — it's a script, not a server                   |


The scheduler has "None" because it doesn't listen on any port. It runs, queries the database, creates tasks, and exits. No HTTP server means no framework needed.

---



## Q2: What is "Fastify" and what are the other most commonly used Frameworks?



### Fastify

**Fastify** is a high-performance HTTP framework for Node.js. Think of it as a layer between your code and raw HTTP:

```
Your code:     app.post("/notify", async (req) => { ... })
                          |
Fastify:       - Matches POST /notify to your function
               - Parses the JSON body into req.body
               - Runs your function inside try/catch
               - Serializes your return value to JSON
               - Sends the HTTP response
               - Logs the request
                          |
Node.js:       Sends bytes over the TCP connection
```

Fastify was chosen for this project because:

- **Fast** — one of the fastest Node.js frameworks (benchmark-optimized)
- **Simple** — minimal API, easy to learn
- **Plugin ecosystem** — `@fastify/multipart` for file uploads, etc.
- **Async-first** — designed for `async/await` (no callbacks)



### Other Commonly Used Frameworks



#### Node.js Frameworks

```
Express          The most popular Node.js framework (since 2010)
                 - Minimal, flexible, huge ecosystem
                 - Slower than Fastify (uses callbacks, not optimized)
                 - Most tutorials and Stack Overflow answers use Express
                 - Example: app.get("/health", (req, res) => res.json({ok:true}))

Fastify          High-performance, modern (what this project uses)
                 - 2-3x faster than Express
                 - Schema-based validation built in
                 - Async/await native

NestJS           Enterprise-grade framework (like Angular for backend)
                 - Dependency injection, decorators, modules
                 - Opinionated structure (controllers, services, providers)
                 - Good for large teams, overkill for small services
                 - Example: @Controller('tasks') class TasksController { ... }

Koa              By the team behind Express, lighter weight
                 - Uses async/await natively (no callbacks)
                 - Smaller ecosystem than Express
                 - Rarely used in new projects today

Hono             Ultra-fast, runs on any runtime (Node, Bun, Deno, Edge)
                 - Very new (2023), gaining popularity
                 - Good for serverless/edge deployments
```



#### Python Frameworks

```
FastAPI          Modern Python framework (what analytics service uses)
                 - Async/await native
                 - Automatic OpenAPI/Swagger docs at /docs
                 - Type-hint-based validation (Pydantic)
                 - Closest Python equivalent to Fastify

Flask            The "Express of Python" — most popular, minimal
                 - Synchronous (not async by default)
                 - Huge ecosystem of extensions

Django           Full-stack Python framework ("batteries included")
                 - ORM, admin panel, auth, templates all built in
                 - Heavy for a microservice (too opinionated)
                 - Good for monolithic web apps

Starlette        The ASGI toolkit that FastAPI is built on top of
                 - Lower-level than FastAPI
                 - You'd only use this directly for custom needs
```



#### Other Languages

```
Go:     Gin, Echo, Fiber, net/http (stdlib)
Rust:   Actix, Axum
Java:   Spring Boot (dominant in enterprise)
Ruby:   Ruby on Rails, Sinatra
C#:     ASP.NET Core
```



### Framework Comparison Table (Node.js)

```
Feature              Express      Fastify      NestJS
─────────────        ────────     ────────     ───────
Performance          Medium       High         Medium
Learning curve       Low          Low          High
Opinionated          No           No           Yes (structure enforced)
Validation            Manual       Built-in     Built-in (class-validator)
TypeScript support   OK           Good         Excellent (built for it)
Plugins              Huge         Growing      Module system
Best for             Quick APIs   Microservices Large enterprise apps
Maturity             Very mature  Mature       Mature
```

**Bottom line:** A framework is just a tool for handling HTTP plumbing. Fastify, Express, and NestJS all do the same job — the difference is speed, ergonomics, and how much structure they impose. This project uses Fastify because it's fast, simple, and perfect for small microservices.

---



## Q3: "Each service typically owns its own database" — what does that mean? And is the shared schema pattern only because task managers aren't typically microservices?



### What "Owns Its Own Database" Means

In the textbook microservices pattern, each service has its **own separate database** — not just its own table, but a completely independent database instance that no other service can access:

```
Textbook microservices (database-per-service):

  Notification Service  →→→  notifications_db (PostgreSQL instance A)
  File Service          →→→  files_db (PostgreSQL instance B)
  Team Service          →→→  teams_db (PostgreSQL instance C)
  Webhook Service       →→→  webhooks_db (PostgreSQL instance D)

  Rules:
  - Service A CANNOT query Service B's database
  - If Service A needs data from Service B, it calls Service B's API
  - Each database can be a different type (PostgreSQL, MongoDB, Redis, etc.)
  - Each service can deploy schema changes independently
```

```
This project (shared database):

  Notification Service  ─┐
  File Service           ─┤
  Team Service           ─┼→→→  ONE PostgreSQL (Supabase)
  Webhook Service        ─┤      All services share the same connection
  Search Sync            ─┤      All services see all tables
  Scheduler              ─┘
```



### Why Textbook Microservices Use Separate Databases

```
1. Loose coupling
   If notification service changes its schema, team service is unaffected.
   With a shared DB, a schema change can break ALL services simultaneously.

2. Independent scaling
   The webhook service might need a high-write database (lots of delivery records).
   The notification service might need a read-heavy database.
   Separate databases can be scaled/optimized independently.

3. Technology fit
   File service might use MongoDB (document storage fits file metadata).
   Analytics might use ClickHouse (columnar storage for aggregations).
   Auth might use Redis (fast key-value for sessions).
   With a shared DB, everyone is stuck with one database type.

4. Fault isolation
   If the webhook database crashes, only webhook delivery stops.
   With a shared DB, a database crash takes down EVERYTHING.

5. Team autonomy
   Team A owns the notification DB schema, deploys changes whenever.
   Team B owns the team service DB schema, deploys whenever.
   No coordination needed. No "please review my schema change" meetings.
```



### Why This Project Uses a Shared Database Instead

You're right that a task manager doesn't *need* microservices. But the shared database choice is about more than that — it's a pragmatic trade-off:

```
Reason 1: Learning project, not production
   - Managing 8 separate databases in Minikube would be complex
   - Supabase gives one free PostgreSQL instance
   - Shared DB keeps the focus on microservice patterns, not DB ops

Reason 2: Small data model
   - The entire schema is ~12 tables
   - Splitting into 8 databases would mean 1-2 tables per database
   - The overhead of managing connections, migrations, and cross-DB
     queries outweighs the benefits

Reason 3: All services use the same data
   - Scheduler creates Tasks → Notification reads Tasks
   - Team Service creates Tasks → Search Sync indexes Tasks
   - Webhook triggers on Task changes
   - With separate DBs, every cross-service data need becomes an API call
   - With shared DB, services just query what they need (simple, fast)

Reason 4: PostgreSQL is already external (Supabase)
   - Can't easily create 8 databases on Supabase's free tier
   - The pooler connection is already shared
```



### Is This an Anti-Pattern?

It's called the **Shared Database anti-pattern** in microservices literature, but it's extremely common in practice. Here's when it's fine and when it's not:

```
Shared database is FINE when:

  - You have a small team (can coordinate schema changes)
  - The data model is small (< 20 tables)
  - Services mostly read shared data (not heavy writes to same tables)
  - You're migrating from a monolith (interim step)
  - You don't need independent database scaling

  ← THIS PROJECT fits all of these

Shared database is BAD when:

  - You have 10+ teams that can't coordinate schema changes
  - One service's schema migration breaks another service
  - You need different database types (relational vs document vs key-value)
  - You need to scale one service's database independently
  - Services are tightly coupled through shared tables (join queries across domains)

  ← Large enterprises (Netflix, Uber, Amazon) hit these problems
```



### The Real-World Progression

Most companies follow this evolution:

```
Stage 1: Monolith with one database
  → Everything in one codebase, one database
  → This is where most apps START (and stay forever for small apps)

Stage 2: Extract services, keep shared database  ← THIS PROJECT
  → Services are independently deployable
  → But they still share one database
  → Pragmatic, low-risk, good for small teams
  → Most medium-sized companies are here

Stage 3: Full database-per-service
  → Each service has its own database
  → Cross-service communication via API only
  → Maximum decoupling, maximum complexity
  → Only worth it at scale (Netflix, Uber, Amazon)
```

**So to answer your question directly:** Yes, a task manager app doesn't *inherently* need microservices, which is why the shared database pattern works fine here. But even apps that DO need microservices (at scale) often start with a shared database in Stage 2 before eventually splitting databases in Stage 3. The shared schema pattern is a valid, common, and pragmatic choice — not a mistake.

---



## Q4: Are microservices mainly done in polyrepo instead of monorepo?

It's actually split — both are widely used, and there's no consensus on which is "correct." The choice depends on team size and company culture.

### Monorepo vs Polyrepo — The Basics

```
Monorepo (what this project uses):
  One Git repository contains ALL services + shared code.

  task-manager-web-application/        ← ONE repo
  ├── task-manager/
  │   ├── src/                         ← Main app
  │   ├── services/                    ← All 8 microservices
  │   │   ├── notification/
  │   │   ├── webhook/
  │   │   ├── scheduler/
  │   │   └── ...
  │   ├── prisma/
  │   │   └── schema.prisma            ← Shared schema
  │   └── helm-chart/                  ← Shared Helm chart
  ├── .github/
  │   └── workflows/ci.yml             ← ONE CI pipeline
  └── README.md

  One repo. One clone. One PR to see everything.


Polyrepo (one repo per service):
  Each service is its own Git repository.

  task-manager-app/                    ← Repo 1 (main app)
  ├── src/
  ├── Dockerfile
  └── README.md

  task-manager-notification/           ← Repo 2
  ├── src/
  ├── prisma/schema.prisma             ← Copy of schema (or published as a package)
  ├── Dockerfile
  └── README.md

  task-manager-webhook/                ← Repo 3
  ├── src/
  ├── prisma/schema.prisma
  ├── Dockerfile
  └── README.md

  ... (8+ repos, one per service)

  Each repo has its own CI, its own README, its own version.
```



### Who Uses What?

```
Monorepo:                              Polyrepo:
──────────                              ─────────
Google (everything in one repo)         Netflix (one repo per service)
Meta/Facebook                           Uber (originally polyrepo, then
Microsoft (Windows, Office)              moved to a monorepo)
Twitter                                 Amazon (historically polyrepo)
Uber (migrated to monorepo)             Most startups with microservices

This project                            ← Most tutorials show polyrepo
```



### The Trade-offs

```
                        Monorepo                    Polyrepo
                        ─────────                   ─────────

Code sharing            Easy — just import          Hard — must publish as a
                        from sibling directory       package (npm publish) or
                                                     copy-paste

Schema sharing          One file, all services       Must publish schema as a
                        reference it directly         shared package or sync it

Atomic changes          One PR can update the         A breaking change requires
                        schema + all affected         coordinated PRs across
                        services simultaneously       multiple repos

CI/CD                   One pipeline builds            Each repo has its own
                        everything (can be slow)       pipeline (fast, isolated)

Repo size               Large (all code in one         Small (each repo is tiny)
                        place)

Access control          Everyone sees everything       Teams control their own
                                                     repo permissions

Onboarding              Clone one repo, you have       Clone 8+ repos, set up
                        everything                     each one independently

Independent versioning  All services versioned         Each service has its own
                        together                       version number and release

Deployment coupling     Tempting to deploy everything  Each service deploys
                        at once (anti-pattern)         independently by default
```



### Which Is More Common for Microservices?

**Honestly, it's about 50/50 in the industry:**

- **Polyrepo** is what most microservices tutorials and books teach, because it enforces strict separation. Each team owns their repo, their CI, their release schedule. This is the "textbook" approach.
- **Monorepo** is what most large tech companies actually use in practice (Google, Meta, Microsoft, Twitter, Uber). They build custom tooling to handle the scale (Bazel, Buck, Nx, Turborepo) and get the best of both worlds: code sharing + independent deployment.

**This project uses a monorepo** because:

1. One person builds all 8 services (no team-separation need)
2. Shared Prisma schema is critical — monorepo makes this trivial
3. Shared Helm chart references all services from one place
4. Simpler to learn (clone one repo, everything works)
5. CI pipeline can build all images from one place



### The Shared Schema Problem in Polyrepo

The biggest challenge of polyrepo for this project would be the shared Prisma schema. Here's how it's handled in each approach:

```
Monorepo (this project):
  task-manager/
  ├── prisma/schema.prisma           ← ONE file
  └── services/
      └── notification/Dockerfile    ← COPY ../prisma/schema.prisma

  Trivial. Docker build copies the file. Done.


Polyrepo (hypothetical):
  Option A: Publish schema as npm package
    @task-manager/prisma-schema → published to private npm registry
    Each service: npm install @task-manager/prisma-schema
    When schema changes: publish new version, update all services

  Option B: Git submodule
    Each repo has a git submodule pointing to a shared schema repo
    Notoriously painful (submodule sync issues, merge conflicts)

  Option C: Copy-paste
    Each repo has its own copy of schema.prisma
    Schema drift is inevitable (someone forgets to update)

  Option D: Schema registry / code generation
    A dedicated service publishes the schema via an API
    Each service downloads it at build time
    Over-engineered for a small project
```

The monorepo eliminates this entire class of problems.

---



## Q5: Is the anatomy of a microservice different in a polyrepo? How does it work?

Yes, the internal structure of each service changes. The service code itself is similar, but the surrounding ecosystem (how it's built, how it shares code, how CI works) is different.

### Anatomy Comparison



#### This Project (Monorepo)

```
task-manager-web-application/                  ← ONE repo
├── task-manager/
│   ├── prisma/
│   │   └── schema.prisma                       ← Shared, referenced directly
│   ├── services/
│   │   └── notification/
│   │       ├── package.json                    ← Service-specific deps
│   │       ├── tsconfig.json
│   │       ├── prisma.config.ts                ← Points to ../../prisma/schema.prisma
│   │       ├── Dockerfile                      ← COPY ../../prisma/schema.prisma
│   │       └── src/
│   │           └── index.ts
│   ├── helm-chart/                             ← ONE chart for ALL services
│   │   └── templates/
│   │       ├── notification/
│   │       ├── webhook/
│   │       └── ...
│   ├── Dockerfile                              ← Main app Dockerfile
│   └── package.json                            ← Main app deps
├── .github/
│   └── workflows/ci.yml                        ← ONE pipeline
└── README.md                                   ← ONE readme
```



#### Polyrepo Equivalent

```
Each service becomes a fully self-contained repository:

task-manager-notification/                      ← Repo 1 (notification service)
├── src/
│   └── index.ts
├── prisma/
│   └── schema.prisma                           ← OWNED COPY (or synced via package)
├── prisma.config.ts
├── package.json
├── package-lock.json
├── tsconfig.json
├── Dockerfile
├── .github/
│   └── workflows/ci.yml                        ← OWN pipeline (builds only this image)
├── helm/                                       ← OWN Helm values/chart fragment
│   └── values.yaml
├── .env.example
├── .gitignore
└── README.md                                   ← OWN readme


task-manager-webhook/                           ← Repo 2 (webhook service)
├── src/
│   └── index.ts
├── prisma/
│   └── schema.prisma                           ← OWNED COPY
├── package.json
├── Dockerfile
├── .github/
│   └── workflows/ci.yml                        ← OWN pipeline
├── helm/
│   └── values.yaml
└── README.md


task-manager-app/                               ← Repo 3 (main app)
├── src/
├── Dockerfile
├── package.json
├── .github/
│   └── workflows/ci.yml
└── README.md


task-manager-infra/                             ← Repo 4 (infrastructure)
├── helm-chart/                                 ← Master chart that references
│   └── Chart.yaml                                 all service images
├── terraform/                                  ← (if using IaC)
├── scripts/
│   ├── setup-cluster.sh
│   └── deploy-all.sh                           ← Orchestrates deployment
└── README.md
```



### What Changes: Side-by-Side



#### 1. The `src/index.ts` — Almost Identical

```typescript
// The actual service code is the SAME either way.
// This doesn't change between monorepo and polyrepo:

import Fastify from "fastify";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const app = Fastify();
app.get("/health", async () => ({ status: "ok" }));
// ... business logic ...

app.listen({ port: 3004, host: "0.0.0.0" });
```

The code is the same because the *runtime* doesn't care where the code lives in Git. What changes is everything *around* the code.

#### 2. The Dockerfile — Slightly Different

```dockerfile
# MONOREPO Dockerfile (this project):
# The build context is the parent directory (task-manager/)
# so the Dockerfile can access the shared schema

FROM node:22-slim AS base
WORKDIR /app
COPY services/notification/package.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY prisma/schema.prisma ./prisma/schema.prisma    ← COPIED FROM PARENT DIR
COPY services/notification/prisma.config.ts ./
RUN npx prisma generate
COPY services/notification/src/ ./src/
# ...

# Build command (note the context is . not services/notification/):
# docker build -t notification-service -f services/notification/Dockerfile .
```

```dockerfile
# POLYREPO Dockerfile:
# The build context IS the repo root, so everything is local

FROM node:22-slim AS base
WORKDIR /app
COPY package.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY prisma/schema.prisma ./prisma/schema.prisma     ← ALREADY IN THIS REPO
COPY prisma.config.ts ./
RUN npx prisma generate
COPY src/ ./src/
# ...

# Build command (simpler — you're already in the right directory):
# docker build -t notification-service .
```

The polyrepo Dockerfile is actually **simpler** because there's no relative path traversal. Everything the service needs is in its own repo.

#### 3. CI/CD Pipeline — Significantly Different

```yaml
# MONOREPO CI (this project — one pipeline for everything):
# .github/workflows/ci.yml

jobs:
  quality:
    # Runs lint + type-check + test for the MAIN APP only
    # (services have their own tsconfig, excluded from main checks)

  docker:
    strategy:
      matrix:
        image: [app, scheduler, notification, file-service, ...]
    # Builds ALL 9 images in parallel from the SAME repo
    # Each uses a different Dockerfile but same build context
```

```yaml
# POLYREPO CI (one pipeline PER repo):
# task-manager-notification/.github/workflows/ci.yml

jobs:
  test:
    # Only tests THIS service's code

  docker:
    # Only builds THIS service's image
    # Pushes to Docker Hub with its own tag

  deploy:
    # Only deploys THIS service's Helm values
    # Can deploy independently without touching other services
```

```
Key difference:

Monorepo CI:
  git push (changed notification + webhook + main app)
  → ONE pipeline run
  → Builds all 9 images (even unchanged ones, unless using smart caching)
  → Deploy all at once

Polyrepo CI:
  git push to task-manager-notification (changed notification only)
  → ONLY notification pipeline runs
  → Builds only notification image
  → Deploys only notification

  task-manager-webhook repo is completely unaffected
  → Zero risk of accidentally breaking another service
```



#### 4. Helm Chart — Split or Shared

```
MONOREPO (this project):
  ONE helm-chart/ with ALL templates
  helm upgrade updates everything in one command

POLYREPO options:

  Option A: Each repo has its own chart
    task-manager-notification/helm/  → helm upgrade from notification repo
    task-manager-webhook/helm/       → helm upgrade from webhook repo
    Problem: shared resources (secrets, ingress) duplicated

  Option B: Separate infra repo with umbrella chart
    task-manager-infra/
    ├── helm-chart/
    │   ├── Chart.yaml (depends on subcharts)
    │   └── values.yaml
    └── scripts/deploy-all.sh

    Each service publishes its Helm chart to a chart registry
    The infra repo pulls them all as dependencies
    Most common polyrepo approach
```



#### 5. Shared Code — The Biggest Difference

```
MONOREPO (trivial sharing):

  task-manager/
  ├── src/lib/validations.ts          ← Shared validation schemas
  └── services/notification/
      └── src/index.ts
          import { validate } from "../../../src/lib/validations"
          ← Direct import, no publishing needed


POLYREPO (must publish packages):

  task-manager-shared/                 ← Separate repo for shared code
  ├── package.json
  │   "name": "@task-manager/shared"
  │   "version": "1.2.0"
  └── src/validations.ts

  task-manager-notification/
  └── package.json
      "dependencies": {
        "@task-manager/shared": "1.2.0"    ← Must publish + version + update
      }

  When validations.ts changes:
  1. Update task-manager-shared repo
  2. Bump version to 1.2.1
  3. npm publish (to private registry)
  4. Go to notification repo, npm install @task-manager/shared@1.2.1
  5. Go to webhook repo, npm install @task-manager/shared@1.2.1
  6. Go to every service that uses it, repeat
  7. Test each one independently
  8. Deploy each one independently
```

This is why monorepos are so popular — shared code updates become a single PR instead of a multi-repo coordination nightmare.

### Summary: What's Different, What's the Same

```
Aspect                    Monorepo                    Polyrepo
──────────                ─────────                   ─────────
src/index.ts              IDENTICAL                   IDENTICAL
package.json              In subdirectory             Own repo
Dockerfile                Relative path traversal     Self-contained (simpler)
Prisma schema             One shared file             Copy or publish as package
CI pipeline               One pipeline for all        One per repo
Helm chart                One chart, all services     Umbrella chart or per-service
Shared code (lib/)        Direct import               npm publish + version management
Onboarding                Clone one repo              Clone N repos
Atomic cross-service      One PR                      Multiple coordinated PRs
  changes
Independent deployment    Possible but tempting       Natural (default behavior)
  in CI                   to deploy all at once
```

**The service code (**`src/index.ts`**) doesn't change.** What changes is the *ecosystem around it* — how you build, share, version, and deploy. The monorepo trades repo-level isolation for code-sharing simplicity. The polyrepo trades code-sharing simplicity for repo-level isolation.

---



## Q6: What is WebSocket? Realtime? Socket.io? Webhook? The networking concepts explained

There are a LOT of networking terms in this project that sound similar but mean different things. Let's build up from the fundamentals.

### Part 1: The Two Ways Browsers Talk to Servers



#### HTTP (Request-Response) — The Default

```
Browser                              Server
  │                                    │
  │  GET /api/tasks                    │
  │ ─────────────────────────────────→ │
  │                                    │
  │  200 OK [{id:1,...}, {id:2,...}]   │
  │ ←───────────────────────────────── │
  │                                    │
  │  (connection closes)               │
  │                                    │
  │  ... time passes ...               │
  │                                    │
  │  GET /api/tasks (again, to check   │
  │  if anything changed)              │
  │ ─────────────────────────────────→ │
  │                                    │
  │  200 OK [{id:1,...}, {id:2,...},   │
  │  {id:3,...}]                       │
  │ ←───────────────────────────────── │
  │                                    │
  │  (connection closes)               │
```

HTTP is **one-directional**: the browser asks, the server answers, the connection closes. If the server has new data, it has to WAIT for the browser to ask again.

This is called **polling** — repeatedly asking "anything new?" It works but it's wasteful:

```
Problems with polling:

  Ask every 1 second:   Most responses are "nothing new" (wasted requests)
  Ask every 60 seconds: New tasks show up 60 seconds late (laggy UX)
  Can't find a good interval: too fast = waste, too slow = laggy
```



#### WebSocket (Bidirectional) — The Alternative

WebSocket is a **persistent, two-way connection** between browser and server:

```
Browser                              Server
  │                                    │
  │  Upgrade: websocket                │
  │ ─────────────────────────────────→ │  (HTTP request that says
  │                                    │   "let's switch to WebSocket")
  │  101 Switching Protocols           │
  │ ←───────────────────────────────── │
  │                                    │
  │  ══════ CONNECTION STAYS OPEN ═════│
  │                                    │
  │  (server has new task)             │
  │ ←───────── task:created {id:3} ──  │  Server pushes WITHOUT being asked
  │                                    │
  │  (browser updates UI instantly)    │
  │                                    │
  │  (user types a message)            │
  │ ────────── message {text:"hi"} ──→ │  Browser sends data too
  │                                    │
  │  (server pushes another update)    │
  │ ←───────── task:updated {id:1} ──  │
  │                                    │
  │  ══════ STAYS OPEN ═══════════════ │
```

```
HTTP vs WebSocket:

  HTTP:          "Knock knock." "Who's there?" "Here's your data." *closes door*
                  → Ask every time you want something
                  → Server can't initiate

  WebSocket:     "I'm going to stand in this doorway." "OK, me too."
                  → Both can talk at any time
                  → Connection never closes (until someone leaves)
                  → Instant push in both directions
```

**In general:** WebSocket is used for chat apps, live dashboards, collaborative editing (Google Docs), multiplayer games, real-time notifications — anything where the server needs to push data to the browser instantly without waiting for a request.

#### In This Project: WebSocket for Live Task Board

```
Without WebSocket (HTTP polling):
  User A creates a task
  User B doesn't see it until they refresh the page
  Or: poll every 5 seconds → up to 5 second delay

With WebSocket:
  User A creates a task
  Server pushes "task:created" to User B's browser instantly
  User B sees the task appear without refreshing
  The task list has a green "Live" badge
```

---



### Part 2: Socket.io — A WebSocket Library



#### The Problem with Raw WebSocket

WebSocket is a **protocol** (a communication standard), not a library. If you use raw WebSocket in Node.js, you have to handle:

```
Raw WebSocket pain points:

  1. Reconnection
     If the WiFi drops for 2 seconds, the connection dies.
     You must write: detect disconnection → wait → retry → reconnect
     (and handle messages that were sent during the gap)

  2. Rooms/groups
     You want to send "task:created" only to users on the same team.
     Raw WebSocket has no concept of rooms. You must track
     which socket belongs to which user and manually route messages.

  3. Fallback
     Some corporate firewalls block WebSocket connections.
     You need a fallback to long-polling (HTTP that pretends to be persistent).
     Raw WebSocket can't do this.

  4. Message acknowledgment
     "Did the server receive my message?" Raw WebSocket has no built-in
     delivery confirmation.

  5. Broadcasting
     "Send this to ALL connected clients except the sender."
     Raw WebSocket: loop through all sockets manually.
```



#### What Socket.io Does

Socket.io is a **library** that wraps WebSocket and handles all of the above:

```
Socket.io = WebSocket + reconnection + rooms + fallback + acknowledgments + broadcasting

  auto-reconnect:        Connection drops? Socket.io reconnects automatically.
  rooms:                 socket.join("board") → send to everyone in "board"
  fallback:              WebSocket blocked? Falls back to HTTP long-polling.
  broadcasting:          io.to("board").emit("task:created", data)
  acknowledgment:        socket.emit("event", data, (response) => { ... })
```

```
Analogy:

  Raw WebSocket = raw TCP socket
    (you build everything yourself)

  Socket.io   = like Express for WebSocket
    (framework that handles the plumbing)
```



#### In This Project

```
Two parts of Socket.io:

  SERVER side (services/realtime/src/index.ts):
    const io = new Server(server);  // Socket.io server

    io.on("connection", (socket) => {
      socket.join("board");           // User joins the task board "room"
    });

    // Main app pushes an event:
    io.to("board").emit("task:created", taskData);
    // → Every browser in the "board" room receives it instantly


  CLIENT side (src/components/TaskList.tsx):
    import { io } from "socket.io-client";

    const socket = io("/", {          // Connects to same origin
      auth: { token: jwt }             // Auth token from /api/ws-token
    });

    socket.on("task:created", () => {
      refreshTasks();                  // Reload task list when event arrives
    });

    socket.on("task:updated", () => {
      refreshTasks();
    });
```

**Key point:** Socket.io is NOT a different protocol from WebSocket. It uses WebSocket under the hood (with HTTP fallback). It's a convenience library that makes WebSocket usable in production.

---



### Part 3: "Realtime" — The Concept and the Service



#### Realtime As a Concept

"Realtime" is not a technology — it's a **user experience property**. It means "changes appear instantly without the user needing to refresh." There are many technologies that enable realtime:

```
Technologies that enable realtime:

  WebSocket           (what this project uses via Socket.io)
  Server-Sent Events  (one-way push from server to browser, simpler than WebSocket)
  Long polling        (HTTP request that the server holds open until new data arrives)
  WebRTC              (peer-to-peer, for video/audio calls)

"Realtime" just means: the user sees updates as they happen,
not on the next page refresh.
```



#### In This Project: The Realtime Service

The "realtime service" (`services/realtime/`) is a dedicated microservice that runs a Socket.io server. Its entire job is to **relay events** between the main app and connected browsers:

```
User A creates a task:

  Browser A                  Main App              Realtime Service          Browser B
     │                          │                       │                       │
     │  POST /api/tasks         │                       │                       │
     │ ───────────────────────→ │                       │                       │
     │                          │                       │                       │
     │                          │  Save to PostgreSQL   │                       │
     │                          │                       │                       │
     │                          │  POST /emit           │                       │
     │                          │  {event:task:created} │                       │
     │                          │ ────────────────────→ │                       │
     │                          │                       │                       │
     │  201 Created             │                       │  WebSocket push       │
     │ ←─────────────────────── │                       │  task:created         │
     │                          │                       │ ────────────────────→ │
     │                          │                       │                       │
     │                          │                       │              Browser B
     │                          │                       │              refreshes
     │                          │                       │              task list
```

The realtime service is called "realtime" because it provides the **realtime experience** — instant push updates. It uses Socket.io (which uses WebSocket) to do this.

```
Why a separate service? Why not run Socket.io inside the main app?

  1. WebSocket connections are long-lived and stateful.
     Each open connection holds memory. If the main app restarts,
     all connections drop and users must reconnect.

  2. The main app handles HTTP (request-response).
     Mixing WebSocket (persistent) and HTTP (ephemeral) in one process
     can cause performance issues (WebSocket connections consume event loop).

  3. Independent scaling.
     If you have 10,000 connected browsers, you might need 5 realtime pods
     but only 2 main app pods. Separate service = independent scaling.

  4. Session affinity.
     WebSocket needs sticky sessions (same client → same pod).
     HTTP doesn't. Separating them means only the realtime Service
     needs sessionAffinity: ClientIP.
```

---



### Part 4: Webhook — Completely Different from WebSocket

This is where most confusion happens. "Webhook" and "WebSocket" sound similar but are entirely different concepts.

#### Webhook As a Concept

A **webhook** is an **outbound HTTP callback**. Your application makes an HTTP POST to someone else's URL when something happens:

```
Webhook = "When event X happens, send an HTTP POST to this URL"

  User registers:      "When a task is created, call https://my-server.com/webhook"

  Task created:        Your server POSTs { event: "task.created", data: {...} }
                       to https://my-server.com/webhook

  Their server:        Receives the POST, does whatever they want with it
                       (send a Slack message, trigger a CI build, log it, etc.)
```

```
WebSocket vs Webhook:

  WebSocket (bidirectional, persistent):
    Your browser ←──── persistent connection ────→ your server
    Used for: live UI updates within your own application

  Webhook (one-way, per-event):
    Your server ──── one HTTP POST ────→ someone else's server
    Used for: notifying EXTERNAL systems about events
    Each webhook = one HTTP request, then the connection closes
```

```
Real-world webhook examples:

  Stripe:     "When a payment succeeds, POST to https://yoursite.com/webhooks/stripe"
  GitHub:     "When someone pushes code, POST to https://ci-server.com/webhooks/github"
  Slack:      "When someone mentions @here, POST to your bot's URL"
  Shopify:    "When an order is placed, POST to https://erp.com/webhooks/order"

  This project: "When a task is created/updated/deleted, POST to the URL
                the user registered in the Webhook settings page"
```



#### In This Project: The Webhook Service

The webhook service (`services/webhook/`) lets users register external URLs that receive HTTP callbacks when tasks change:

```
Setup (user configures webhooks in the UI):
  User goes to Settings → Webhooks
  URL: https://my-slack-bot.com/task-notifier
  Events: [task.created, task.completed]

  Main app saves this to the Webhook table in PostgreSQL.

Trigger (user creates a task):
  1. Main app saves task to DB
  2. Main app fires-and-forgets to webhook service: POST /trigger
  3. Webhook service finds matching webhooks in DB
  4. Creates WebhookDelivery records (status: pending)

Delivery (background worker, 2 seconds later):
  5. Worker polls for pending deliveries
  6. POSTs to https://my-slack-bot.com/task-notifier
     Headers:
       X-Webhook-Event: task.created
       X-Webhook-Signature: sha256=abc123...  (HMAC proof)
     Body: { id: "task-1", title: "New task", ... }

  7. If the external server returns 200: mark as "delivered"
  8. If it fails: retry with backoff (1s, 5s, 30s, 2m, 10m)
```



#### Why Webhooks Need a Background Worker

```
The external URL might be:
  - Slow (takes 5 seconds to respond)
  - Down (server is offline)
  - Rate-limited (too many requests)
  - Erroring (returns 500)

If the main app waited for the webhook delivery:
  User clicks "Create Task"
  → Main app saves to DB (fast)
  → Main app POSTs to external URL (waits... 10 seconds... timeout)
  → User sees "Loading..." for 10 seconds
  → BAD UX

Instead:
  User clicks "Create Task"
  → Main app saves to DB (fast)
  → Main app queues the delivery (instant)
  → User sees "Task created!" immediately
  → Background worker delivers the webhook later
  → GOOD UX
```

---



### Part 5: Putting It All Together — The Networking Map

Here's every networking concept in this project, with a one-line explanation:

```
CONCEPT              WHAT IT IS                        IN THIS PROJECT
─────────            ─────────                         ─────────────────
HTTP                 Request-response protocol         All API routes, all
                     (browser asks, server answers)     service-to-service calls

WebSocket            Persistent two-way connection     Realtime service ↔ browsers
                     (both sides can push anytime)      for live task updates

Socket.io            Library that wraps WebSocket       Used by realtime service
                     (adds rooms, reconnection,          (server) and TaskList
                     fallback, broadcasting)             component (client)

Realtime             UX property: "updates appear       Provided by the realtime
                     instantly without refresh"          service via Socket.io

Webhook              Outbound HTTP POST to an           Webhook service delivers
                     external URL when an event          to user-registered URLs
                     happens                             when tasks change

ClusterIP            K8s Service type: internal         All microservices use
                     only (no external access)           ClusterIP (except main app)

Ingress              K8s HTTP routing from outside      NGINX routes external
                     the cluster to internal services    traffic to main app +
                                                         realtime (/socket.io)

DNS (K8s internal)   Service names resolve to IPs       task-manager-notification:3004
                     (http://service-name:port)          works inside the cluster

JWT                  Signed token for authentication    NextAuth issues JWTs;
                     (contains user ID, no DB lookup)    realtime decrypts them

Fire-and-forget      Send an HTTP request and          Main app → realtime,
                     don't wait for the response         webhook, search-sync
```



### Part 6: The Confusing Terms Disambiguated

```
"Socket"         = The raw OS-level networking primitive (TCP socket)
                   Every HTTP and WebSocket connection uses a socket underneath

"WebSocket"      = A protocol that upgrades an HTTP connection to a
                   persistent two-way channel (RFC 6455)

"Socket.io"      = A JavaScript library that uses WebSocket (with fallback)
                   NOT the same as WebSocket (it's a library, not a protocol)

"Realtime"       = A UX concept (instant updates), not a technology
                   WebSocket is ONE way to achieve realtime

"Webhook"        = An outbound HTTP callback to an external system
                   Has NOTHING to do with WebSocket despite the similar name
                   "web" + "hook" = "hook into the web" (callback on the web)

"Polling"        = Repeatedly asking the server "anything new?" via HTTP
                   The OLD alternative to WebSocket (what we replaced)

"Server-Sent     = Like a one-way WebSocket over HTTP
 Events (SSE)"     Server pushes to browser, browser can't push back
                   Simpler than WebSocket but less powerful
                   NOT used in this project

"Long polling"   = HTTP request where the server holds the connection open
                   until new data is available, then responds
                   The fallback that Socket.io uses when WebSocket is blocked
```



### Part 7: Mental Model — Which One Am I Looking At?

When you see code in this project, use this guide to identify the networking pattern:

```
"If I see..."                              "It's..."
────────────────                           ──────────
fetch() or axios in API route              HTTP (request-response)
                                           Standard API call, one direction

io.emit() or io.to().emit()                Socket.io broadcast
                                           Pushing to connected browsers

socket.on() in a component                 Socket.io client listening
                                           Browser receiving pushed events

POST /trigger or POST /emit                Internal HTTP (fire-and-forget)
                                           Main app → microservice

POST to external URL (fetch to             Webhook delivery
  user-registered URL)                     Application → external system

io.connect() or io("/", {...})             WebSocket/Socket.io connection
                                           Browser connecting to realtime
```

**The single most important distinction:** WebSocket/Socket.io/realtime are about **your browser and your server talking live**. Webhooks are about **your server notifying someone else's server**. They solve completely different problems that happen to share the word "web."

---



## Q7: In Kubernetes, what's a stateful app vs stateless app?



### What Does "State" Mean?

"State" means **data that the application stores and must survive restarts**. A database table, a file on disk, a search index — that's state. If the app loses it on restart, users lose data.

```
Stateless app (no data to lose):
  - Receives a request
  - Does some computation
  - Returns a response
  - Forgets everything

  "What's 2 + 2?" → "4" → forgets you ever asked

Stateful app (has data that must persist):
  - Stores data somewhere (disk, memory, database)
  - That data must survive restarts
  - Losing it = data loss for users

  "Create user John" → stores in database → next restart, John still exists
```



### The Bathroom Stall Analogy

```
STATELESS = a public bathroom stall

  ┌──────────────────────────┐
  │     Stall #1             │
  │                          │
  │  - No belongings left    │
  │  - Next person starts    │
  │    fresh                 │
  │  - Any stall works       │
  │    equally well          │
  │  - Doesn't matter which  │
  │    one you use           │
  └──────────────────────────┘

  If stall #1 is occupied, use stall #2. Identical experience.
  If stall #1 is cleaned (restarted), nothing is lost.
  You can add/remove stalls freely.


STATEFUL = your bedroom

  ┌──────────────────────────┐
  │     Your Room            │
  │                          │
  │  - Your clothes in closet│
  │  - Your bed (made a way) │
  │  - Your stuff on shelves │
  │  - THIS room is YOURS    │
  │  - Can't just switch to  │
  │    a random room         │
  └──────────────────────────┘

  If your room is "cleaned" (restarted), your stuff is gone = BAD.
  Your stuff is tied to THIS specific room.
  You can't just move to another room — your stuff is here.
```



### In This Project: Which Services Are Which?

```
STATELESS (Deployment) — 8 services:
  ┌─────────────────────────────────────────────────────┐
  │ Main App (Next.js)     File Service                 │
  │ Notification           Search Sync                  │
  │ Webhook                Team Service                 │
  │ Realtime               Analytics                    │
  │                                                     │
  │ These don't store data locally.                     │
  │ All data lives in:                                  │
  │   - PostgreSQL (external Supabase)  ← shared DB     │
  │   - Or they're just relay services (no data at all) │
  │                                                     │
  │ Kill any pod → recreate it → works identically      │
  │ The new pod has no memory of the old one            │
  └─────────────────────────────────────────────────────┘

STATEFUL (StatefulSet) — 2 services:
  ┌──────────────────────────────────────────────────────┐
  │ MinIO        ← stores uploaded files on disk         │
  │ Meilisearch  ← stores search index on disk           │
  │                                                      │
  │ These store data LOCALLY on a persistent volume.     │
  │ Kill the pod → data must survive → volume reattaches │
  │ The new pod picks up the SAME volume with SAME data  │
  └──────────────────────────────────────────────────────┘
```



### Why the Distinction Matters: The Pod Identity Problem

This is the core reason K8s has two different workload types:

```
STATELESS pod (Deployment):
  Pod name: task-manager-app-xyz123     ← RANDOM suffix
  Pod IP:   10.244.1.5                  ← RANDOM IP
  Volume:   none (or shared, read-only)

  Dies → new pod created:
  Pod name: task-manager-app-abc789     ← DIFFERENT name
  Pod IP:   10.244.1.9                  ← DIFFERENT IP
  No data lost (there was no local data)

  This is FINE. Any pod is interchangeable.


STATEFUL pod (StatefulSet):
  Pod name: minio-0                     ← STABLE, ordered name
  Pod IP:   10.244.1.5                  ← may change, but...
  Volume:   minio-data (10Gi)           ← MUST reattach to THIS pod

  Dies → new pod created:
  Pod name: minio-0                     ← SAME name!
  Volume:   minio-data (SAME 10Gi)      ← SAME volume reattaches!

  This pod is NOT interchangeable.
  It has a specific identity and specific data.
```

```
Why does MinIO need a stable identity?

  MinIO stores files on disk. If MinIO's pod dies and restarts:
    - The NEW pod must get the SAME disk
    - Otherwise, all uploaded files are lost
    - The pod name (minio-0) is linked to the volume (minio-data)

  A Deployment can't guarantee this:
    - Pod names are random
    - Volumes are ephemeral (or shared across all replicas)
    - No guarantee which pod gets which volume

  A StatefulSet guarantees:
    - Pod name is stable (minio-0, minio-1, minio-2)
    - Each pod gets its OWN persistent volume
    - If minio-0 dies, the replacement is also minio-0
    - minio-0's volume reattaches to the new minio-0
```



### How K8s Handles Them Differently

```
                        Deployment                  StatefulSet
                        ───────────                 ───────────
Pod naming             Random suffix               Ordered (0, 1, 2...)
                       app-xyz123, app-abc789      minio-0, minio-1

Pod identity           Interchangeable             Each pod is unique
                       Any pod serves any request  Pod 0 ≠ Pod 1

Volume handling        Shared or ephemeral         Per-pod persistent volume
                       (all replicas share one)    (minio-0 gets vol-0)

Scaling                All at once                 Sequential, ordered
                       1→3: creates 2 pods         1→3: create pod-1, wait,
                       simultaneously              then create pod-2

Startup order          Random                      Ordered (0 starts first)
                       All pods start together     Pod-1 waits for Pod-0

Rolling updates        Kills any pod               Kills highest-index first
                       Random order                (minio-2 before minio-1)

Persistent volume      One PVC shared by all       volumeClaimTemplates:
                       (or none)                   each pod gets own PVC

Network identity       Service load-balances       Headless Service gives
                       to any pod                  each pod its own DNS:
                                                   minio-0.minio-headless

Use case               Web servers, APIs           Databases, queues, caches
                       (any stateless app)         (any app with local data)
```



### The Storage Chain: How Stateful Data Survives

```
StatefulSet + PVC + PV = data that survives pod death

  ┌──────────────────────────────────────────────────────┐
  │                  Kubernetes Cluster                  │
  │                                                      │
  │  StatefulSet: minio                                  │
  │  ┌───────────────────────────────────────────────┐   │
  │  │  Pod: minio-0                                 │   │
  │  │  ┌─────────────┐    ┌──────────────────────┐  │   │
  │  │  │ Container   │    │ Volume Mount: /data  │  │   │
  │  │  │ (MinIO)     │───→│                      │  │   │
  │  │  │ writes files│    │ Points to PVC        │  │   │
  │  │  │ to /data    │    └──────────┬───────────┘  │   │
  │  │  └─────────────┘               │              │   │
  │  └────────────────────────────────┼──────────────┘   │
  │                                   │                  │
  │  ┌────────────────────────────────▼─────────────┐    │
  │  │ PVC: minio-data-minio-0                      │    │
  │  │ (PersistentVolumeClaim — "I need 10Gi")      │    │
  │  │ BOUND to:                                    │    │
  │  └────────────────────────────────┬─────────────┘    │
  │                                   │                  │
  │  ┌────────────────────────────────▼──────────────┐   │
  │  │ PV: pvc-abc123                                │   │
  │  │ (PersistentVolume — actual disk on node)      │   │
  │  │ 10Gi on Minikube's Docker volume              │   │
  │  └───────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────┘

When minio-0 pod dies:
  1. StatefulSet creates a new minio-0 (same name!)
  2. New pod mounts the SAME PVC (minio-data-minio-0)
  3. PVC is still bound to the SAME PV (the disk)
  4. All files are still on the disk
  5. MinIO starts up and sees all its files again

The data never left the disk. Only the pod (the process) was replaced.
```



### Why Most Microservices Are Stateless

```
The stateless ideal:

  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │  Pod 1   │     │  Pod 2   │     │  Pod 3   │
  │ (app)    │     │ (app)    │     │ (app)    │
  └────┬─────┘     └────┬─────┘     └────┬─────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                   ┌────▼──────┐
                   │ PostgreSQL│  ← ALL state lives here
                   │ (external)│     (Supabase)
                   └───────────┘

  Benefits of keeping state OUTSIDE the pod:
  - Kill any pod → no data lost (state is in the DB)
  - Scale to 100 pods → they all share the same DB
  - Deploy new version → old pods die, new pods start, data is safe
  - Pod crashes → Deployment recreates it, picks up where it left off

  This is why ALL 8 microservices in this project are stateless:
  - Notification: reads/writes to shared PostgreSQL
  - Webhook: reads/writes to shared PostgreSQL
  - File Service: writes to MinIO (external to the pod)
  - Search Sync: writes to Meilisearch (external to the pod)
  - Realtime: no data at all (pure relay)
  - etc.

  The pod is just a worker. The DATA lives somewhere else.
```



### When Something MUST Be Stateful

```
MinIO and Meilisearch can't be stateless because they ARE the data store:

  MinIO:
    - Files are stored on disk as actual binary data
    - Can't put files in PostgreSQL (too large, wrong tool)
    - The pod's disk IS the data
    - Must be stateful

  Meilisearch:
    - Search index is a complex data structure on disk
    - Rebuilding the index from PostgreSQL takes minutes/hours
    - The index must persist across restarts
    - Must be stateful

  Rule of thumb:
    If the service IS the database/storage → stateful
    If the service USES a database/storage → stateless
```



### What About the Database Itself?

```
PostgreSQL (Supabase) is stateful — but it's NOT in your cluster:

  ┌─────────────────────────────┐
  │  Your Minikube Cluster      │
  │                             │
  │  (stateless microservices)  │
  │  (MinIO — stateful)         │
  │  (Meilisearch — stateful)   │
  │                             │
  │  NO database running here   │
  └──────────┬──────────────────┘
             │ DATABASE_URL
             ▼
  ┌─────────────────────────────┐
  │  Supabase Cloud (external)  │
  │  PostgreSQL (stateful)      │  ← Someone else's problem
  │  (backups, replication,     │     Supabase manages it
  │   failover — all handled)   │
  └─────────────────────────────┘

Why external? Running PostgreSQL in K8s is hard:
  - Needs StatefulSet with persistent volumes
  - Needs backup automation
  - Needs replication setup (primary + replicas)
  - Needs failover logic (if primary dies, promote replica)
  - Needs connection pooling (PgBouncer)

  Supabase handles all of this for you.
  In production, many teams use managed databases (RDS, Cloud SQL, Supabase)
  rather than running stateful databases in K8s.
```



### Quick Reference Card

```
"Is this service stateful or stateless?"

Ask: "If I delete this pod and recreate it, is any data lost?"

  NO data lost → STATELESS → use Deployment
    (data lives in external PostgreSQL, MinIO, Meilisearch)

  YES, data lost → STATEFUL → use StatefulSet
    (data lives on the pod's own disk)

Ask: "Does this service need a stable identity?"

  No, any pod works → STATELESS → Deployment

  Yes, pod-0 must always be pod-0 → STATEFUL → StatefulSet

Ask: "Does it manage its own storage?"

  No, delegates to external DB → STATELESS → Deployment

  Yes, IS the storage → STATEFUL → StatefulSet
```



### The Bigger Picture: Stateful vs Stateless Across the Stack

```
Layer              Stateless              Stateful
──────────────────────────────────────────────────────
Pod (K8s)          Deployment             StatefulSet
                   (random pod names)     (ordered: minio-0, minio-1)

Service (K8s)      ClusterIP              Headless Service
                   (load-balanced)        (returns individual pod IPs)

Storage            No local volume        PersistentVolume per pod
                   (or shared, read-only) (volumeClaimTemplates)

HTTP Session       JWT (stateless)        Server session (stateful)
                   Token contains all      Server stores session data
                   the info needed         (must persist across requests)

App architecture   REST API               Database, message queue,
                   (each request is        cache, file storage
                   self-contained)

Scaling            Horizontal (add pods)  Vertical (bigger machine)
                   Easy, just replicas    Hard, data must migrate
```

**The trend in modern architecture is toward statelessness.** Services stay stateless; state is pushed to dedicated systems (managed databases, object storage, search engines). This is exactly what this project does — 8 stateless services + 2 stateful storage systems + 1 external database. The stateless majority can be killed, restarted, and scaled freely. The stateful minority (MinIO, Meilisearch) are handled carefully with StatefulSets and persistent volumes.

---



## Q8: What makes a pod? Do we create pod manifests, or does Kubernetes create them automatically?

Great question — this gets at the core of how Kubernetes is designed. The short answer is: **you almost never create Pod manifests directly. Controllers create Pods for you automatically.**

### The Two Ways to Create a Pod

```
Way 1: Direct Pod manifest (almost never done)
  ─────────────────────────────────────────────
  You write a YAML with kind: Pod
  kubectl apply -f pod.yaml
  → K8s creates exactly ONE pod
  → If it crashes, it stays dead (nobody restarts it)
  → If the node dies, the pod is gone forever

Way 2: Controller creates Pods for you (what you actually do)
  ──────────────────────────────────────────────────────────
  You write a YAML with kind: Deployment
  kubectl apply -f deployment.yaml
  → K8s creates the Deployment object
  → The Deployment CONTROLLER reads it
  → Controller creates Pods automatically
  → If a Pod crashes, controller creates a new one
  → If a node dies, controller recreates Pods elsewhere
```



### What a Bare Pod Manifest Looks Like (You Don't Write This)

Yes, `kind: Pod` is a valid Kubernetes manifest. But nobody uses it in production:

```yaml
# bare-pod.yaml — DON'T DO THIS (except for learning/debugging)

apiVersion: v1
kind: Pod                          # ← Direct pod, no controller
metadata:
  name: my-task-app
spec:
  containers:
    - name: task-app
      image: ralf090102/task-manager-app:latest
      ports:
        - containerPort: 3000

# Problems:
#   - Crashes → stays dead forever (no restart)
#   - Node dies → pod is permanently lost
#   - Can't scale (only 1 pod, no replicas)
#   - Can't update (no rolling updates)
#   - This is basically Docker Compose inside K8s (defeats the purpose)
```

This is why Level-4 said "Pods are rarely created directly. They're created by Deployments." You write a **Deployment** manifest, and the Deployment controller creates Pods from the template inside it.

### What You Actually Write: The Pod Template Inside a Controller

The Pod definition lives INSIDE the Deployment manifest, as a **template**:

```yaml
# deployment.yaml — THIS is what you write

apiVersion: apps/v1
kind: Deployment                          # ← The controller
metadata:
  name: task-manager
spec:
  replicas: 1                             # ← "I want 1 pod"
  selector:
    matchLabels:
      app.kubernetes.io/component: app
  template:                               # ← THE POD TEMPLATE
    metadata:
      labels:
        app.kubernetes.io/component: app
    spec:                                 # ← THIS IS A POD SPEC
      containers:                         #    (same as the bare pod above)
        - name: task-app
          image: ralf090102/task-manager-app:latest
          ports:
            - containerPort: 3000
```

```
The template section IS the pod definition — it's just wrapped in a controller:

  ┌──────────────────────────────────────────────────┐
  │  kind: Deployment                                │
  │  ┌────────────────────────────────────────────┐  │
  │  │  spec.replicas: 1                          │  │
  │  │  spec.template: ← THIS IS A POD SPEC       │  │
  │  │  ┌──────────────────────────────────────┐  │  │
  │  │  │  containers:                         │  │  │
  │  │  │    - image: task-manager-app         │  │  │
  │  │  │    - ports: [3000]                   │  │  │
  │  │  │    - env: [...]                      │  │  │
  │  │  │    - probes: [...]                   │  │  │
  │  │  └──────────────────────────────────────┘  │  │
  │  └────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────┘

  You never write kind: Pod.
  You write kind: Deployment with a template that describes the pod.
  The controller creates the pod FOR you.
```



### Who Actually Creates the Pod? (It's Not kubectl)

This is the key insight: **kubectl doesn't create Pods.** kubectl just talks to the API server. The **controller** (running inside the cluster) creates Pods:

```
Step-by-step: what happens when you run helm install

  1. YOU run: helm install task-manager ./helm-chart
     │
     ▼
  2. Helm renders templates → produces YAML (Deployment, Service, etc.)
     │
     ▼
  3. Helm sends YAML to K8s API Server via kubectl
     "Here's a Deployment object. Please store it."
     │
     ▼
  4. API Server stores the Deployment in etcd (the cluster database)
     "Deployment 'task-manager' saved. replicas: 1."
     │
     ▼
  5. Deployment Controller (running inside the cluster) NOTICES the new Deployment
     "Oh, someone wants 1 replica of task-manager. I need to create 1 Pod."
     │
     ▼
  6. Deployment Controller creates a Pod object (via the API server)
     "API Server, please create this Pod from my template."
     │
     ▼
  7. Scheduler (another controller) NOTICES the unscheduled Pod
     "There's a Pod with no Node assigned. Let me pick a Node."
     │
     ▼
  8. Scheduler assigns the Pod to a Node
     "Pod goes to Node-1."
     │
     ▼
  9. Kubelet (agent on Node-1) NOTICES a Pod assigned to it
     "I have a Pod to run. Let me start the container."
     │
     ▼
  10. Kubelet tells containerd/Docker to pull the image and start the container
      "docker run ralf090102/task-manager-app:latest"
      │
      ▼
  11. Container starts → Pod is Running
```

```
Who did what:

  You:         Wrote a Deployment manifest, ran helm install
  Helm:        Rendered templates, sent to API server
  API Server:  Stored objects in etcd
  Controller:  WATCHED for Deployments, CREATED the Pod  ← THIS IS THE ANSWER
  Scheduler:   Chose which Node to run the Pod on
  Kubelet:     Actually started the container on the Node

  kubectl/Helm = messenger (carries your instructions)
  Controller   = manager (decides what Pods to create)
  Kubelet      = worker (starts the actual container)
```



### The Controller Pattern: A Reconciliation Loop

The Deployment controller runs a continuous **reconciliation loop** (same concept as Operators from Level-4 §14):

```
Deployment Controller (always running inside the cluster):

  while True:
    desired = read Deployment → "replicas: 1"
    actual  = count running Pods for this Deployment

    if actual < desired:
      create (desired - actual) Pods from template

    if actual > desired:
      delete extra Pods

    if a Pod's template changed (rolling update):
      create new Pod, delete old Pod
```

```
This is why the Pod gets recreated when it crashes:

  Pod dies (OOM, crash, node failure)
    │
    ▼
  Controller loop runs (within seconds)
    "Desired: 1. Actual: 0. Mismatch!"
    │
    ▼
  Controller creates a new Pod from the template
    │
    ▼
  New Pod starts → Actual: 1 → Match → Controller waits

  You didn't do anything. The controller did it automatically.
  This is the "self-healing" you saw in Level-4.
```



### Every Controller Creates Pods Differently

Different controllers wrap the same Pod template but manage it differently:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Deployment                                                         │
│  "I want N identical interchangeable pods"                          │
│  template: { containers: [...] }                                    │
│  behavior: creates N pods, replaces on crash, rolling updates       │
│  example: main app, notification, webhook (all stateless services)  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  StatefulSet                                                        │
│  "I want N pods with stable identities and individual storage"      │
│  template: { containers: [...] } + volumeClaimTemplates             │
│  behavior: creates pods sequentially (0, 1, 2), each gets own volume│
│  example: MinIO (minio-0), Meilisearch (meilisearch-0)              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CronJob                                                            │
│  "I want a pod to run on a schedule"                                │
│  jobTemplate: { template: { containers: [...] } }                   │
│  behavior: creates a Pod at scheduled times, Pod runs then exits    │
│  example: scheduler (every 5 min), analytics weekly report          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Job                                                                │
│  "I want a pod to run once to completion"                           │
│  template: { containers: [...] }                                    │
│  behavior: creates a Pod, retries until it succeeds, then stops     │
│  example: DB migration Job (runs prisma db push, then exits)        │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DaemonSet                                                          │
│  "I want ONE pod on EVERY node"                                     │
│  template: { containers: [...] }                                    │
│  behavior: automatically creates a Pod on each Node (1:1)           │
│  example: Promtail (one per node, collects logs)                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

ALL of them use the SAME pod spec (containers, ports, env, probes).
The difference is HOW the controller manages the pods.
```



### The Object Hierarchy in Kubernetes

```
What you create (via manifest)     What K8s creates automatically
──────────────────────────────────────────────────────────────────

  Deployment                        ReplicaSet (version tracking)
       │                                  │
       │                                  └── Pod  ← K8s creates this
       │                                       │
       │                                       └── Container (your app)

  StatefulSet                       (no ReplicaSet)
       │                                  │
       │                                  └── Pod (minio-0)  ← stable identity
       │                                       │
       │                                       └── Container

  CronJob                           Job (per schedule trigger)
       │                                  │
       │                                  └── Pod  ← runs once, exits

  DaemonSet                         (nothing intermediate)
       │                                  │
       │                                  └── Pod (one per Node)

  Service                           Endpoints (list of Pod IPs)
       │                                  │
       │                                  └── keeps updating as Pods come/go

You only ever write manifests for the LEFT column.
Everything on the RIGHT is created by K8s controllers automatically.
```

```
Proof — run these commands:

  kubectl get deployments -n task-manager     ← YOU created these (via Helm)
  kubectl get replicasets -n task-manager     ← K8s created these (you didn't)
  kubectl get pods -n task-manager            ← K8s created these (you didn't)
  kubectl get endpoints -n task-manager       ← K8s created these (you didn't)

  The ReplicaSet, Pods, and Endpoints are ALL auto-generated.
  You only "asked" for Deployments and Services.
```



### When WOULD You Create a Bare Pod?

Almost never in production. But there are a few debugging/learning scenarios:

```
Valid uses of kind: Pod (bare pod):

  1. Quick debugging
     "Let me run a curl pod to test if my service is reachable"
     kubectl run debug-pod --image=curlimages/curl --rm -it -- sh

  2. Learning Kubernetes
     "I want to understand pods before learning controllers"

  3. One-off initialization (though initContainers or Jobs are better)

  4. Testing a container image quickly

Invalid uses:

  - Running your production app (use a Deployment)
  - Running a database (use a StatefulSet)
  - Running a scheduled task (use a CronJob)
  - Anything that needs to survive restarts (use a controller)
```

The `kubectl run` command (without `--generator`) actually creates a bare Pod for debugging:

```bash
# This creates a bare pod (for debugging, auto-deleted when you exit)
kubectl run debug --image=busybox --rm -it -- sh
#                                                         ↑ runs interactively
#                                            ↑ removes pod when you exit
```



### Summary: The Mental Model

```
QUESTION: "What makes a pod?"

ANSWER: A controller makes pods. You make controllers.

  You write:     kind: Deployment (with a pod template inside)
  Helm sends:    the Deployment to the API server
  API server:    stores it in etcd
  Controller:    watches etcd, sees the Deployment, creates Pods from the template
  Scheduler:     assigns each Pod to a Node
  Kubelet:       starts the container on that Node

  You never type "kind: Pod" in a manifest.
  You never "create" a pod directly.
  You declare WHAT you want (Deployment with replicas: 3)
  The controller creates and maintains the pods to match.

This is the "declarative" model:
  You don't say "create 3 pods"
  You say "I want 3 replicas to always be running"
  K8s figures out HOW to make that happen (create, recreate, reschedule)
```

---

## Q9: What is a ConfigMap (as a K8s kind)? And why is there no `config.yaml` in my microservices and app?

### What a ConfigMap Is

A ConfigMap is a Kubernetes resource (`kind: ConfigMap`) that stores **non-sensitive configuration as key-value pairs**. It exists inside the cluster, not inside your application code:

```yaml
apiVersion: v1
kind: ConfigMap            # ← A K8s object, like Deployment or Service
metadata:
  name: webhook-config     # ← Name to reference it
data:                      # ← The actual configuration
  MAX_ATTEMPTS: "5"        # key: value pairs (always strings)
  BACKOFF_INTERVALS: "1,5,30,120,600"
  POLL_INTERVAL_MS: "2000"
  DELIVERY_TIMEOUT_MS: "10000"
```

```
ConfigMap is to K8s what .env is to a Node.js app:
  .env file:    MAX_ATTEMPTS=5 (read by dotenv at runtime)
  ConfigMap:    MAX_ATTEMPTS: "5" (read by K8s, injected as env var)

  The difference:
    .env lives in your repo (or on the server)
    ConfigMap lives INSIDE the Kubernetes cluster
    ConfigMap can be updated without touching your code or Docker image
```

### Where ConfigMaps Live in This Project

ConfigMaps are **Kubernetes manifests**, not application files. They live in the Helm chart, not in your service code:

```
task-manager/
├── src/                           ← App code (NO ConfigMaps here)
├── services/
│   ├── webhook/
│   │   └── src/index.ts           ← Service code (NO ConfigMaps here)
│   └── notification/
│       └── src/index.ts           ← Service code (NO ConfigMaps here)
└── helm-chart/                    ← ALL K8s manifests live here
    ├── values.yaml                ← Configuration values
    └── templates/
        └── webhook/
            └── configmap.yaml     ← THE ConfigMap (only webhook has one)
```

```
This project has exactly ONE ConfigMap:

  helm-chart/templates/webhook/configmap.yaml

  Why only webhook?
    The webhook service has tunable retry parameters that might change
    (max attempts, backoff intervals, poll interval, timeout).
    A ConfigMap lets you change these WITHOUT rebuilding the Docker image.

  Other services don't have ConfigMaps because:
    - They have no tunable config (realtime, team-service)
    - Their config comes from Secrets (DATABASE_URL)
    - Their config is hardcoded in the Deployment env section (PORT)
```



### Why There's No `config.yaml` in Your App Code

This is the key insight: **your application code doesn't read config files. It reads environment variables.** ConfigMaps are just one way K8s populates those environment variables.

```
Your webhook service code (services/webhook/src/index.ts):

  const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || "5", 10);
  const BACKOFF_INTERVALS = process.env.BACKOFF_INTERVALS || "1,5,30,120,600";
  const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "2000", 10);

  The code reads:    process.env.MAX_ATTEMPTS
  The code does NOT: read a config file, import a config module, etc.

  Where does process.env.MAX_ATTEMPTS come from?
  → K8s injects it from the ConfigMap at pod startup.
  → The code has NO idea a ConfigMap exists.
  → If you ran this code outside K8s (local dev), you'd use a .env file instead.
```

```
The code is CONFIG-SOURCE-AGNOSTIC:

  process.env.MAX_ATTEMPTS works regardless of WHERE the value came from:

  In K8s:      ConfigMap → env var → process.env.MAX_ATTEMPTS
  In Docker:   docker run -e MAX_ATTEMPTS=5 → process.env.MAX_ATTEMPTS
  In local dev: .env file (via dotenv) → process.env.MAX_ATTEMPTS
  In CI:       GitHub Actions secrets → env var → process.env.MAX_ATTEMPTS

  The code doesn't change. Only the SOURCE of the env var changes.
```



### The Full Chain: How Config Gets From values.yaml Into Your Code

```
Step 1: values.yaml (Helm values)
─────────────────────────────────
  webhook:
    retry:
      maxAttempts: 5
      intervals: [1, 5, 30, 120, 600]


Step 2: helm-chart/templates/webhook/configmap.yaml (Helm template)
────────────────────────────────────────────────────────────────────
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: webhook-config
  data:
    MAX_ATTEMPTS: "{{ .Values.webhook.retry.maxAttempts }}"
    BACKOFF_INTERVALS: "{{ join "," .Values.webhook.retry.intervals }}"


Step 3: Helm renders → actual ConfigMap YAML (at deploy time)
─────────────────────────────────────────────────────────────
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: webhook-config
  data:
    MAX_ATTEMPTS: "5"
    BACKOFF_INTERVALS: "1,5,30,120,600"


Step 4: helm install → K8s stores the ConfigMap
────────────────────────────────────────────────


Step 5: Webhook Deployment references the ConfigMap
───────────────────────────────────────────────────
  helm-chart/templates/webhook/deployment.yaml:

  spec:
    template:
      spec:
        containers:
          - name: webhook
            envFrom:                        ← "Inject ALL ConfigMap keys as env vars"
              - configMapRef:
                  name: webhook-config
            env:
              - name: DATABASE_URL          ← "Inject from Secret"
                valueFrom:
                  secretKeyRef:
                    name: task-manager-secrets
                    key: database-url


Step 6: K8s starts the pod → injects env vars
─────────────────────────────────────────────
  Container environment:
    MAX_ATTEMPTS=5
    BACKOFF_INTERVALS=1,5,30,120,600
    POLL_INTERVAL_MS=2000
    DELIVERY_TIMEOUT_MS=10000
    DATABASE_URL=postgresql://...  (from Secret)


Step 7: Your code reads process.env
───────────────────────────────────
  services/webhook/src/index.ts:

  const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || "5", 10);
  // process.env.MAX_ATTEMPTS = "5" (from ConfigMap → env var)
```

```
Visual summary:

  values.yaml                    Your configuration
       │
       ▼
  configmap.yaml (template)      Helm template
       │
       ▼  (helm render)
  ConfigMap (K8s object)         Stored in cluster
       │
       ▼  (envFrom in Deployment)
  Container environment vars     Injected into pod
       │
       ▼
  process.env.MAX_ATTEMPTS       Your code reads this
       │
       ▼
  parseInt(...) → 5              Used as a number

  Your CODE never touches a config file.
  It only reads process.env.* and trusts K8s to fill them in.
```



### ConfigMap vs Secret vs Inline — Three Ways to Set Env Vars

Looking at the webhook deployment, there are THREE sources of env vars:

```yaml
# From helm-chart/templates/webhook/deployment.yaml

containers:
  - name: webhook
    envFrom:                           # SOURCE 1: ConfigMap (all keys at once)
      - configMapRef:
          name: webhook-config

    env:
      - name: DATABASE_URL             # SOURCE 2: Secret (one key at a time)
        valueFrom:
          secretKeyRef:
            name: task-manager-secrets
            key: database-url

      - name: LOG_LEVEL               # SOURCE 3: Inline value (hardcoded)
        value: "info"
```

```
When to use each:

  ConfigMap:   Non-sensitive config that might change (retry settings, feature flags)
               Multiple keys injected at once via envFrom
               Updateable without code/image changes

  Secret:      Sensitive data (passwords, API keys, tokens)
              Base64-encoded (not encrypted — just encoded)
               One key at a time via secretKeyRef
               Updateable without code/image changes

  Inline:      Constants that NEVER change (LOG_LEVEL, PORT)
               Hardcoded in the Deployment YAML
               Changing requires helm upgrade (but no image rebuild)

  ALL THREE become process.env.* inside the container.
  The code can't tell which source a value came from.
```



### The Twelve-Factor App Principle

This design follows a well-known methodology called the **Twelve-Factor App**, which says:

> **Store config in the environment.**

```
BAD (config in code):
  // config.js
  module.exports = {
    maxAttempts: 5,           ← Hardcoded in source
    databaseUrl: "postgres:..." ← Hardcoded in source
  }

  Problems:
  - Change config → must edit code → must rebuild image → must redeploy
  - Different values for dev/prod → need different code branches
  - Secrets in code → visible in Git history

GOOD (config in environment):
  // index.ts
  const maxAttempts = parseInt(process.env.MAX_ATTEMPTS || "5");

  Benefits:
  - Same code runs everywhere (dev, staging, prod)
  - Change config → update ConfigMap/Secret → restart pod (no rebuild)
  - Different values per environment → different ConfigMaps
  - Secrets never in Git → stored in K8s Secrets
```

This is why your project has NO `config.json`, `config.yaml`, or `settings.ts` files. All configuration flows through environment variables, which are populated by K8s ConfigMaps and Secrets at runtime.



### Why Most Services Don't Even Have a ConfigMap

Looking at the Helm chart, only the webhook service has a ConfigMap. The other 7 services don't:

```
Services WITH a ConfigMap:
  ✓ Webhook (retry config: MAX_ATTEMPTS, BACKOFF_INTERVALS, etc.)
    → Has tunable parameters that operators might want to change

Services WITHOUT a ConfigMap:
  ✗ Main app          → Uses Secrets (DATABASE_URL, NEXTAUTH_SECRET)
  ✗ Notification      → Uses Secrets (DATABASE_URL) + inline (SMTP_PORT)
  ✗ File Service      → Uses Secrets (DATABASE_URL) + inline (MINIO_URL)
  ✗ Search Sync       → Uses Secrets (DATABASE_URL) + inline (MEILI_URL)
  ✗ Realtime          → Uses inline (CORS_ORIGIN)
  ✗ Team Service      → Uses Secrets (DATABASE_URL)
  ✗ Analytics         → Uses inline (DATABASE_URL cleaning logic)
  ✗ Scheduler         → Uses Secrets (DATABASE_URL)
```

```
Why don't these services need ConfigMaps?

  Their env vars fall into two categories:
  1. Secrets  → DATABASE_URL, NEXTAUTH_SECRET (stored in K8s Secret)
  2. Constants → PORT, LOG_LEVEL (hardcoded inline in Deployment YAML)

  They have NO "tunable" non-sensitive config.
  → Nothing that an operator would change without rebuilding.
  → ConfigMap would be overkill.

  The webhook service is different because:
  - Retry intervals might need tuning (slow external servers → longer timeouts)
  - Poll interval might need adjustment (high load → slower polling)
  - These are operational knobs, not secrets, not constants
  → ConfigMap makes them changeable without a Docker rebuild
```



### How to Change ConfigMap Values

```
Method 1: helm upgrade with --set (temporary override)

  helm upgrade task-manager ./helm-chart --namespace task-manager \
    --reuse-values \
    --set webhook.retry.maxAttempts=10 \
    --set webhook.retry.intervals="{1,10,60,300,1800}"

  → Helm re-renders the ConfigMap template with new values
  → Updates the ConfigMap in K8s
  → You still need to restart pods to pick up new values:
    kubectl rollout restart deployment/task-manager-webhook -n task-manager


Method 2: Edit values.yaml (permanent change)

  # helm-chart/values.yaml
  webhook:
    retry:
      maxAttempts: 10              ← Changed from 5
      intervals: [1, 10, 60, 300, 1800]

  helm upgrade task-manager ./helm-chart --namespace task-manager --reuse-values


Method 3: Edit the ConfigMap directly (quick and dirty, not recommended)

  kubectl edit configmap task-manager-webhook-config -n task-manager
  # Opens editor, change values, save
  # WARNING: This change is NOT in Git. Next helm upgrade will OVERWRITE it.
```



### Summary: The Mental Model

```
QUESTION: "What is a ConfigMap and why is there no config.yaml in my app?"

ANSWER:

  A ConfigMap is a K8s object (kind: ConfigMap) that stores key-value config.
  It lives INSIDE the cluster, managed by Helm templates.
  It does NOT exist in your application source code.

  There's no config.yaml in your services because:
  1. Your code reads process.env.* (environment variables)
  2. K8s injects those env vars from ConfigMaps + Secrets at pod startup
  3. The code is "config-source-agnostic" — same code works in K8s,
     Docker, local dev, or CI

  ConfigMap flow:
    values.yaml → Helm template → ConfigMap (K8s) → envFrom → process.env

  Only the webhook service has a ConfigMap (tunable retry settings).
  Other services use Secrets (for sensitive data) or inline values (for constants).

  This follows the Twelve-Factor App principle:
    "Store config in the environment, not in the code."
```

