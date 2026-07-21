# Level 3: Docker & Containerization

**Duration:** 4 hours  
**Goal:** Understand how to package applications into portable, reproducible containers

---

## Table of Contents

1. [What is Docker?](#1-what-is-docker)
2. [Core Docker Concepts](#2-core-docker-concepts)
3. [Dockerfile Anatomy](#3-dockerfile-anatomy)
4. [Multi-Stage Builds](#4-multi-stage-builds)
5. [.dockerignore](#5-dockerignore)
6. [Docker Compose](#6-docker-compose)
7. [Health Checks](#7-health-checks)
8. [The Microservice Dockerfile Pattern](#8-the-microservice-dockerfile-pattern)
9. [Docker Build Workflow](#9-docker-build-workflow)
10. [Hands-On Exercises](#10-hands-on-exercises)
11. [The Container Pipeline](#11-the-container-pipeline)
12. [What You've Learned](#12-what-youve-learned)

---



## 1. What is Docker?



### The Problem Docker Solves

Before Docker, deploying an application meant:

```
"It works on my machine"
     │
     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Developer   │     │   Staging    │     │  Production  │
│  Laptop      │     │    Server    │     │    Server    │
│              │     │              │     │              │
│ Node 22.6.1  │     │ Node 20.10.0 │     │ Node 18.x    │
│ npm 10.8.3   │     │ npm 9.x      │     │ yarn 1.22    │
│ macOS arm64  │     │ Ubuntu x86   │     │ Debian x86   │
│ OpenSSL 3.x  │     │ OpenSSL 1.1  │     │ OpenSSL 3.x  │
└──────────────┘     └──────────────┘     └──────────────┘

Different runtimes → different behavior → bugs that only appear in production
```



### The Docker Solution

Docker packages your application **and everything it needs** into a single, immutable unit called a **container image**:

```
┌───────────────────────────────────┐
│          Container Image          │
│                                   │
│  ┌─────────────────────────────┐  │
│  │   Your Application Code     │  │
│  ├─────────────────────────────┤  │
│  │   All Dependencies (npm)    │  │
│  ├─────────────────────────────┤  │
│  │   Node.js Runtime           │  │
│  ├─────────────────────────────┤  │
│  │   OS Libraries              │  │
│  ├─────────────────────────────┤  │
│  │   Linux (Debian Slim)       │  │
│  └─────────────────────────────┘  │
│                                   │
│  Runs identically EVERYWHERE:     │
│  dev laptop → staging → production│
└───────────────────────────────────┘
```

**Container vs Virtual Machine:**

```
Virtual Machines:                    Containers:

┌─────┐ ┌─────┐ ┌─────┐            ┌─────┐ ┌─────┐ ┌─────┐
│ App │ │ App │ │ App │            │ App │ │ App │ │ App │
│ Libs│ │ Libs│ │ Libs│            │ Libs│ │ Libs│ │ Libs│
│Guest│ │Guest│ │Guest│            ├─────┴─┴─────┴─┴─────┤
│ OS  │ │ OS  │ │ OS  │            │  Container Engine   │
├─────┴─┴─────┴─┴─────┤            ├─────────────────────┤
│    Hypervisor       │            │     Host OS         │
├─────────────────────┤            ├─────────────────────┤
│      Host OS        │            │    Infrastructure   │
├─────────────────────┤            └─────────────────────┘
│   Infrastructure    │
└─────────────────────┘

Heavy — each VM has a full OS       Light — shares host OS kernel
Slow to start (minutes)             Fast to start (seconds)
GBs per VM                          MBs per container
```

---



## 2. Core Docker Concepts



### Images vs Containers


| Concept        | What it is                       | Analogy                      |
| -------------- | -------------------------------- | ---------------------------- |
| **Image**      | A read-only template (blueprint) | A recipe or class definition |
| **Container**  | A running instance of an image   | The baked cake or object     |
| **Registry**   | Where images are stored          | App store for containers     |
| **Dockerfile** | Instructions to build an image   | The recipe instructions      |


```bash
# Image → build once, store in registry
docker build -t task-manager-app:latest .

# Container → run from image
docker run -p 3000:3000 task-manager-app:latest

# One image → many containers (scale horizontally)
docker run -p 3001:3000 task-manager-app:latest
docker run -p 3002:3000 task-manager-app:latest
```



### Docker Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Your Machine                     │
│                                                     │
│   ┌─────────┐                                       │
│   │  docker │ ← CLI (what you type)                 │
│   │   CLI   │                                       │
│   └────┬────┘                                       │
│        │ REST API                                   │
│        ▼                                            │
│   ┌─────────────────┐                               │
│   │  Docker Daemon  │ ← Background service          │
│   │   (dockerd)     │                               │
│   └────┬─────┬──────┘                               │
│        │     │                                      │
│   ┌────▼──┐ ┌▼────────┐ ┌──────────┐                │
│   │Cont.  │ │  Cont   │ | Image    │                │
│   │  #1   │ │  #2     │ │  Cache   │                │
│   │ (app) │ │  (db)   │ │          │                │
│   └───────┘ └─────────┘ └──────────┘                │
│                                                     │
└─────────────────────────────────────────────────────┘
         │ docker push/pull
         ▼
┌─────────────────────────────────────────────────────┐
│              Docker Registry                        │
│         (Docker Hub / Private Registry)             │
│                                                     │
│   ralf090102/task-manager-app:latest                │
│   ralf090102/scheduler-service:latest               │
│   ralf090102/notification-service:latest            │
│   postgres:17-alpine                                │
│   ...                                               │
└─────────────────────────────────────────────────────┘
```



### Essential Docker Commands

```bash
# ─── Building ───
docker build -t <name>:<tag> .              # Build image from Dockerfile
docker build -t app:latest -f Dockerfile .  # Specify Dockerfile path

# ─── Running ───
docker run -p 3000:3000 <image>             # Run, map port 3000
docker run -d <image>                       # Run in background (detached)
docker run --rm <image>                     # Auto-remove when stopped
docker run -e KEY=value <image>             # Pass environment variable
docker run -v $(pwd):/app <image>           # Mount volume

# ─── Inspecting ───
docker ps                                   # List running containers
docker ps -a                                # List ALL containers (incl. stopped)
docker images                               # List local images
docker logs <container>                     # View container logs
docker logs -f <container>                  # Follow logs (tail -f)
docker exec -it <container> sh              # Open shell inside container
docker inspect <container>                  # Full container details (JSON)

# ─── Cleanup ───
docker stop <container>                     # Stop running container
docker rm <container>                       # Remove stopped container
docker rmi <image>                          # Remove image
docker system prune                         # Remove unused images, containers, networks
docker system prune -a                      # Also remove ALL unused images (not just dangling)

# ─── Registry ───
docker login                                # Login to Docker Hub
docker tag <local> <remote>:<tag>           # Tag image for registry
docker push <remote>:<tag>                  # Upload to registry
docker pull <remote>:<tag>                  # Download from registry
```

---



## 3. Dockerfile Anatomy

A Dockerfile is a list of instructions that Docker executes in order to build an image. Here's the main app's Dockerfile with every line explained:

```dockerfile
# task-manager/Dockerfile

# ─── Base Image ───
# Start from an official Node.js image (Debian "slim" variant = smaller)
# ARG allows overriding the version at build time:
#   docker build --build-arg NODE_VERSION=20-slim .
ARG NODE_VERSION=22-slim
FROM node:${NODE_VERSION} AS dependencies

# ─── Working Directory ───
# All subsequent commands (COPY, RUN) happen inside /app
WORKDIR /app

# ─── Install Dependencies (Stage 1: dependencies) ───
# Copy ONLY package files first — this is the Docker cache trick:
# If package.json hasn't changed, Docker reuses the cached npm ci layer
# If you copied everything, ANY code change would invalidate the cache
COPY package.json package-lock.json* ./

# ─── Build Cache Mount ───
# --mount=type=cache: Speeds up rebuilds by caching npm's download cache
# across builds. Downloaded packages persist between builds.
# --no-audit: Skip npm audit (faster, not needed during build)
# --no-fund: Skip funding messages
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ─── Build Stage (Stage 2: builder) ───
# New stage from the same base image
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Copy node_modules from the dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy all source code (what .dockerignore doesn't exclude)
COPY . .

# Production environment variables for the build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma client AND build Next.js
# Both must happen in the builder stage because:
#   - prisma generate creates TypeScript types needed by next build
#   - next build produces the standalone output
RUN npx prisma generate && npm run build

# ─── Runtime Stage (Stage 3: runner) ───
# This is what actually runs in production — minimal and lean
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"    # Required for Next.js standalone to accept connections

# ─── Security: Non-Root User ───
# Create a dedicated user (nextjs) with no root privileges
# If an attacker compromises the app, they can't access the rest of the container
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy ONLY what's needed to run — NOT source code, NOT node_modules
COPY --from=builder /app/public ./public

# Next.js standalone output: a minimal server.js + only the deps it needs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to the non-root user
USER nextjs

# Document which port the container listens on (informational only)
EXPOSE 3000

# The command that runs when the container starts
CMD ["node", "server.js"]
```



### Dockerfile Instructions Reference


| Instruction    | Purpose                            | Example                                |
| -------------- | ---------------------------------- | -------------------------------------- |
| `FROM`         | Base image to start from           | `FROM node:22-slim`                    |
| `WORKDIR`      | Set working directory              | `WORKDIR /app`                         |
| `COPY`         | Copy files from host into image    | `COPY package.json ./`                 |
| `COPY --from=` | Copy from another build stage      | `COPY --from=builder /app/dist ./dist` |
| `RUN`          | Execute a command during build     | `RUN npm ci`                           |
| `ENV`          | Set environment variable           | `ENV NODE_ENV=production`              |
| `ARG`          | Build-time variable                | `ARG NODE_VERSION=22-slim`             |
| `USER`         | Run as this user                   | `USER nextjs`                          |
| `EXPOSE`       | Document listening port            | `EXPOSE 3000`                          |
| `CMD`          | Default command                    | `CMD ["node", "server.js"]`            |
| `ENTRYPOINT`   | Fixed command (harder to override) | `ENTRYPOINT ["npx"]`                   |




### The Docker Cache Trick

Docker caches each layer (each instruction = one layer). If a layer's inputs haven't changed, Docker reuses the cached result:

```
Dockerfile                        Cache Behavior
──────────                        ──────────────
COPY package.json ./              ← Changed? → rebuild everything below
RUN npm ci                        ← Only runs if package.json changed
COPY . .                          ← Always changes (your source code changes)
RUN npm run build                 ← Always rebuilds

Why copy package.json SEPARATELY:
──────────────────────────────────
Step 1: COPY package.json ./      ← package.json unchanged? CACHE HIT ⚡
Step 2: RUN npm ci                ← CACHE HIT ⚡ (skips 30s npm install)
Step 3: COPY . .                  ← Cache miss (source changed)
Step 4: RUN npm run build         ← Rebuilds (needs to, source changed)

If you did COPY . . first:
Step 1: COPY . .                  ← Cache miss (any file changed)
Step 2: RUN npm ci                ← Reinstalls ALL packages every time 😫
```

**Rule:** Always copy dependency files (`package.json`, `package-lock.json`) before source code.

---



## 4. Multi-Stage Builds



### Why Multi-Stage?

A single-stage Docker image includes everything: source code, dev dependencies, build tools, test files. That's bloated and insecure.

Multi-stage builds let you copy **only the artifacts you need** from a "builder" stage into a minimal "runner" stage:

```
Stage 1: dependencies       Stage 2: builder           Stage 3: runner
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│  node:22-slim   │        │  node:22-slim   │        │  node:22-slim   │
│                 │        │                 │        │                 │
│  package.json   │ ──→    │  + source code  │ ──→    │  + server.js    │
│  node_modules   │ copy   │  + prisma gen   │ copy   │  + .next/static │
│  (full deps)    │        │  + next build   │ ONLY   │  + standalone/  │
│                 │        │  + .next/       │ needed │  node_modules/  │
│  ~400MB         │        │  ~800MB         │        │  ~150MB         │
└─────────────────┘        └─────────────────┘        └─────────────────┘
                                                           │
                                                     Final image pushed
                                                     to registry: ~150MB
```



### How It Works

```dockerfile
# Each FROM starts a new stage
FROM node:22-slim AS builder    # Stage named "builder"
# ... build steps ...

FROM node:22-slim AS runner     # Stage named "runner"
# Copy specific files from builder:
COPY --from=builder /app/.next/standalone ./
# Files NOT copied = NOT in the final image
```

**What gets left behind in the runner stage:**


| In builder                                   | In runner                                  | Why left behind                       |
| -------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| Source code (`.ts`, `.tsx`)                  | Only compiled output                       | Source is not needed at runtime       |
| `devDependencies` (eslint, jest, typescript) | Only production deps                       | Dev tools are build-only              |
| `.next/` (full build cache)                  | Only `.next/standalone/` + `.next/static/` | Standalone is the minimal output      |
| Prisma CLI                                   | Only Prisma Client                         | CLI is used during build, not runtime |
| Git history, test files, docs                | Nothing                                    | Never needed in production            |




### Next.js Standalone Output

The magic that makes the tiny runner image possible:

```typescript
// task-manager/next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",  // ← This line
};
```

With `output: "standalone"`, Next.js bundles a **minimal Node.js server** (`server.js`) with **only the dependencies it actually uses** (not all of `node_modules`):

```
.next/
├── standalone/          ← Self-contained server
│   ├── server.js        ← Entry point (runs with `node server.js`)
│   ├── node_modules/    ← ONLY required packages (tree-shaken)
│   └── package.json
├── static/              ← Static assets (JS, CSS, images)
│   ├── chunks/
│   ├── css/
│   └── media/
└── ...                  ← Other build artifacts (NOT needed at runtime)
```

Without standalone, you'd need to copy ALL of `node_modules` (~400MB) into the runner. With standalone, the runner is ~150MB.

### Size Comparison

```
Without multi-stage:              With multi-stage + standalone:

┌──────────────────────┐         ┌──────────────────────┐
│   ~800MB image       │         │   ~150MB image       │
│                      │         │                      │
│  Source code         │         │  server.js           │
│  Dev dependencies    │         │  Static assets       │
│  Build tools         │         │  Production deps     │
│  Test files          │         │  (minimal)           │
│  .next/ (all)        │         │                      │
│  Full node_modules   │         │                      │
│  Prisma CLI          │         │                      │
└──────────────────────┘         └──────────────────────┘
    5x larger                       5x smaller, 5x more secure
```

---



## 5. .dockerignore



### What is .dockerignore?

`.dockerignore` tells Docker which files to **exclude** when copying into the image. It's like `.gitignore` but for Docker builds.

```
# task-manager/.dockerignore

node_modules          # Don't copy host node_modules (we npm ci in container)
**/node_modules       # Don't copy nested node_modules either
.next                 # Don't copy build output (we build inside container)
**/.next
**/src/generated      # Don't copy generated Prisma client (regenerated in build)
.git                  # Don't copy git history
.gitignore            # Don't need this in the image
.env                  # NEVER copy secrets into the image!
.env.*                # Never any env files
coverage              # Don't copy test coverage reports
src/generated         # Prisma generates fresh during build
*.md                  # Documentation isn't needed at runtime
Dockerfile            # Don't need the Dockerfile inside the image
docker-compose*.yml   # Don't need compose files inside the image
.dockerignore         # Don't need this file inside the image
helm-chart            # Kubernetes configs not needed in Docker image
scripts               # Setup scripts not needed at runtime
.swc                  # SWC cache
**/*.log              # Log files
```



### Why .dockerignore Matters

```
Without .dockerignore:              With .dockerignore:

docker build .                      docker build .

COPY . . copies EVERYTHING:         COPY . . copies ONLY needed files:
├── node_modules/ (400MB!)          ├── src/
├── .next/ (200MB!)                 ├── prisma/
├── .git/ (50MB!)                   ├── package.json
├── coverage/ (20MB)                ├── package-lock.json
├── .env (SECRETS!)                 ├── next.config.ts
├── tests/                          ├── tailwind.config.ts
├── *.md                            └── tsconfig.json
├── helm-chart/                     
└── src/                            Build context: ~2MB
                                    Build context: ~700MB (FAST ⚡)
Build is SLOW, image is INSECURE
```

**Critical security rule:** `.env` files must ALWAYS be in `.dockerignore`. Secrets should be injected at **runtime** via environment variables, never baked into the image.

---



## 6. Docker Compose



### What is Docker Compose?

Docker Compose defines and runs **multi-container applications**. Instead of running multiple `docker run` commands manually, you declare everything in a single YAML file:

### Docker vs Docker Compose: What's the Difference?

You already experienced the difference in the exercises! Let's compare:

#### Exercise 1 (Docker only): Just the app

```bash
# You typed ALL of this manually:
docker build -t task-manager-app:latest .

docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/taskmanager" \
  -e NEXTAUTH_SECRET="test-secret" \
  -e AUTH_TRUST_HOST="true" \
  task-manager-app:latest
```

This runs **only the app container**. You needed a database already running somewhere else (on your host machine). You had to type every flag manually.

#### Exercise 3 (Docker Compose): Full stack with one command

```bash
# That's it. One command.
docker compose up -d --build
```

This runs **both the app AND the database**. How did it know what to do? **The** `docker-compose.yml` **file told it.**

#### What Docker Compose Automated for You

Here's what `docker compose up --build` actually did — all from reading `docker-compose.yml`:

```
docker compose up -d --build
      │
      │  1. Reads docker-compose.yml
      │     Sees two services: "db" and "app"
      │
      │  2. Starts the "db" service:
      │     docker run -d \
      │       --name task-manager-db \
      │       -e POSTGRES_USER=postgres \
      │       -e POSTGRES_PASSWORD=postgres \
      │       -e POSTGRES_DB=taskmanager \
      │       -p 5432:5432 \
      │       -v pgdata:/var/lib/postgresql/data \
      │       postgres:17-alpine
      │
      │  3. Waits for db health check to pass
      │     (pg_isready -U postgres must return 0)
      │
      │  4. Builds the "app" service:
      │     docker build -t task-manager-app -f Dockerfile .
      │     (because app uses "build:", not "image:")
      │
      │  5. Starts the "app" service:
      │     docker run -d \
      │       --name task-manager-app \
      │       -e DATABASE_URL=postgresql://postgres:postgres@db:5432/taskmanager \
      │       -e NEXTAUTH_URL=http://localhost:3000 \
      │       -e NEXTAUTH_SECRET=local-dev-secret-change-in-production \
      │       -e AUTH_TRUST_HOST=true \
      │       -p 3000:3000 \
      │       task-manager-app
      │
      │  6. Creates a Docker network so "app" and "db" can talk to each other
      │     app can reach db at hostname "db" (not localhost)
      │
      ▼
  Both containers running, connected, healthy
```

`docker run` **is manual.** You type every flag. `docker compose up` reads a file and does it all automatically.

#### The Key Difference: `image:` vs `build:`

Look at the two services in `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:17-alpine     # ← PULL this pre-built image from Docker Hub
    # No build step — just download and run

  app:
    build:                        # ← BUILD this image from our Dockerfile
      context: .
      dockerfile: Dockerfile
    # Must run "docker build" before "docker run"
```

- `image:` = Pull a ready-made image (like `postgres:17-alpine`)
- `build:` = Build a custom image from your Dockerfile first, then run it

The `--build` flag in `docker compose up -d --build` forces a rebuild: "Don't reuse the cached image, rebuild from the Dockerfile."

#### Comparison Summary

```
docker run (Exercise 1):             docker compose up (Exercise 3):

┌────────────────────────────┐       ┌────────────────────────────────────┐
│  Manual single container   │       │  Automated multi-container         │
│                            │       │                                    │
│  docker run -p 3000:3000 \ │       │  docker compose up -d --build      │
│    -e DATABASE_URL=... \   │       │                                    │
│    -e NEXTAUTH_SECRET=...  │       │  Reads docker-compose.yml          │
│    task-manager-app        │       │  ├── builds app from Dockerfile    │
│                            │       │  ├── pulls postgres:17-alpine      │
│  What about the database?  │       │  ├── creates network               │
│  → You need it separately  │       │  ├── sets all env vars             │
│  → You configure it manual │       │  ├── mounts volumes                │
│  → No network between them │       │  ├── waits for health checks       │
│                            │       │  └── connects app ↔ db             │
│  1 command per container   │       │                                    │
│  1 container only          │       │  1 command, N containers           │
└────────────────────────────┘       └────────────────────────────────────┘
```

```yaml
# task-manager/docker-compose.yml

services:
  # ─── Database Container ───
  db:
    image: postgres:17-alpine        # Use pre-built image from registry
    container_name: task-manager-db
    restart: unless-stopped          # Restart policy
    environment:                     # Environment variables
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: taskmanager
    ports:
      - "5432:5432"                  # host_port:container_port
    volumes:
      - pgdata:/var/lib/postgresql/data    # Named volume for persistence
    healthcheck:                     # Health check (see Section 7)
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Application Container ───
  app:
    build:                           # Build from Dockerfile instead of pulling
      context: .                     # Build context = current directory
      dockerfile: Dockerfile         # Which Dockerfile to use
    container_name: task-manager-app
    restart: unless-stopped
    environment:
      # The app connects to "db" (service name) not "localhost"
      # Docker's internal DNS resolves "db" to the database container's IP
      DATABASE_URL: postgresql://postgres:postgres@db:5432/taskmanager
      NEXTAUTH_URL: http://localhost:3000
      NEXTAUTH_SECRET: local-dev-secret-change-in-production
      AUTH_TRUST_HOST: "true"
    ports:
      - "3000:3000"
    depends_on:                      # Start order + health dependency
      db:
        condition: service_healthy   # Wait for db to be healthy before starting

# Named volumes persist data across container restarts
volumes:
  pgdata:                            # Docker manages where this is stored
```



### Key Concepts



#### Service-to-Service Communication

```
┌────────────────────────────────────────────┐
│            Docker Network                  │
│                                            │
│  ┌────────────┐         ┌───────────────┐  │
│  │  db        │         │  app          │  │
│  │ port: 5432 │ ←────── │ DATABASE_URL  │  │
│  │            │         │ ...@db:5432   │  │
│  └────────────┘         └───────────────┘  │
│       ↑                       ↑            │
│       │                       │            │
│  "db" resolves to         "app" resolves   │
│   the db container        to the app       │
│   via Docker DNS          container        │
└────────────────────────────────────────────┘
```

The app uses `db` as the hostname in `DATABASE_URL` — **not** `localhost`. Docker's internal DNS resolves service names to container IPs.

#### Ports: Host vs Container

```yaml
ports:
  - "5432:5432"
#    ↑      ↑
#  host    container
#  port    port
```

- **Host port:** What you connect to from outside Docker (`localhost:5432`)
- **Container port:** What the app listens on inside the container

```
Your machine (host):
  localhost:3000  ──→  maps to container port 3000 (app)
  localhost:5432  ──→  maps to container port 5432 (db)
```



#### Volumes: Persistent Storage

Containers are **ephemeral** — when a container is removed, its data is lost. Volumes persist data across container lifecycles:

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data   # Named volume
```

```
Container running:          Container removed + recreated:
┌──────────────┐           ┌──────────────┐
│  postgres    │           │  postgres    │
│  container   │           │  container   │
│  /var/lib/   │           │  /var/lib/   │
│  postgresql/ │           │  postgresql/ │
│  ┌────────┐  │           │  ┌────────┐  │ 
│  │ DATA   │  │           │  │ DATA   │  │
│  └───┬────┘  │           │  └───┬────┘  │
└──────┼───────┘           └──────┼───────┘
       │                          │
       ▼                          ▼
┌────────────────────────────────────────────┐
│            Docker Volume (pgdata)          │
│                                            │
│  Survives container deletion               │
│  Managed by Docker on host filesystem      │
│  Located at: /var/lib/docker/volumes/...   │
└────────────────────────────────────────────┘
```



#### depends_on: Startup Order

```yaml
depends_on:
  db:
    condition: service_healthy   # Wait until db health check passes
```

Without this, the app container might start before the database is ready, causing connection errors. With `condition: service_healthy`, Docker Compose waits until the `db` service's health check passes before starting `app`.

### Docker Compose Commands

```bash
# Build and start all services
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f app      # Follow app logs
docker compose logs -f db       # Follow db logs

# Stop all services (keeps volumes)
docker compose down

# Stop and DELETE volumes (loses all data!)
docker compose down -v

# Rebuild a single service
docker compose up -d --build app

# Execute command in running container
docker compose exec app sh
docker compose exec db psql -U postgres
```

---



## 7. Health Checks



### What is a Health Check?

A health check is a periodic test that tells Docker whether a container is actually working — not just whether its process is running.

```
Without health check:              With health check:

docker compose ps                  docker compose ps
NAME      STATUS                   NAME      STATUS
app       Up 3 minutes             app       Up 3 minutes (healthy)
db        Up 3 minutes             db        Up 3 minutes (healthy)
```



### Health Check in docker-compose.yml

```yaml
db:
  image: postgres:17-alpine
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    #     ↑ what to run      ↑ command to test readiness
    interval: 10s       # Run every 10 seconds
    timeout: 5s         # Fail if it takes longer than 5 seconds
    retries: 5          # After 5 consecutive failures, mark unhealthy
```

**Health states:**

- `starting` — Container just started, health check hasn't run yet
- `healthy` — Health check passed (at least once, and no consecutive failures)
- `unhealthy` — Health check failed `retries` times in a row



### Health Checks in Kubernetes (Preview)

In Kubernetes (Level 4), health checks are split into two types:

```yaml
# Kubernetes uses probes (Level 4 preview)
livenessProbe:           # "Is the app alive? If not, restart it."
  httpGet:
    path: /api/health
    port: 3000

readinessProbe:          # "Is the app ready to serve traffic? If not, remove it from load balancer."
  httpGet:
    path: /api/health
    port: 3000
```


| Probe     | Purpose                       | Failure Action                           |
| --------- | ----------------------------- | ---------------------------------------- |
| Liveness  | App is alive (not deadlocked) | Restart the container                    |
| Readiness | App can serve requests        | Stop sending traffic (but don't restart) |


---



## 8. The Microservice Dockerfile Pattern

This project has 9 Docker images: 1 main app + 8 microservices. They follow two patterns.

### Pattern A: Node.js Microservice (with Database)

Services that need Prisma (notification, scheduler, webhook, team-service):

```dockerfile
# services/notification/Dockerfile (representative example)

# ─── Stage 1: Install production deps ───
FROM node:22-slim AS deps
WORKDIR /app
COPY services/notification/package.json services/notification/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# ─── Stage 2: Build (needs dev deps + Prisma) ───
FROM node:22-slim AS builder
WORKDIR /app
COPY services/notification/package.json services/notification/package-lock.json* ./
RUN npm ci                                    # Full install (incl. dev deps)
COPY prisma/schema.prisma ./prisma/schema.prisma  # Shared schema!
COPY services/notification/prisma.config.ts ./
RUN npx prisma generate                       # Generate Prisma client
COPY services/notification/tsconfig.json ./
COPY services/notification/src/ ./src/

# ─── Stage 3: Runtime (production deps only) ───
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3004
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
```

**Key differences from the main app:**

1. Uses `tsx` runtime instead of `node` — TypeScript executed directly (no compilation step)
2. Copies shared `prisma/schema.prisma` from the root — all services share one schema
3. Build context is `task-manager/` (not `services/notification/`) — needed to access `prisma/schema.prisma`



### Pattern B: Node.js Microservice (No Database)

Services without database access (realtime):

```dockerfile
# services/realtime/Dockerfile

# Simpler — no Prisma, no schema copy, no prisma generate
FROM node:22-slim AS base
WORKDIR /app
COPY services/realtime/package.json services/realtime/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM base AS builder
COPY services/realtime/tsconfig.json ./
COPY services/realtime/src/ ./src/
COPY services/realtime/scripts/ ./scripts/

FROM base AS runner
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3001
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/scripts/ ./scripts/
CMD ["npx", "tsx", "src/index.ts"]
```

**Key differences:**

- No Prisma steps (no schema copy, no `prisma generate`)
- Uses `base AS builder` (extends base stage, inherits `node_modules`)
- Runner also extends `base` and prunes dev deps



### Pattern C: Polyglot Service (Python)

The analytics service is Python — a completely different language and ecosystem:

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
ENV PYTHONUNBUFFERED=1             # Required for real-time logs in K8s
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Key differences:**

- `pip install --user` installs to `/root/.local` (portable, no system-wide install)
- No `tsx` or Node.js — uses `uvicorn` (ASGI server) to run FastAPI
- `PYTHONUNBUFFERED=1` flushes stdout immediately (otherwise logs are delayed)



### Build Context: Why It Matters

All microservice Dockerfiles are built from the `task-manager/` directory:

```bash
# Build from task-manager/ (NOT from services/notification/)
docker build -t ralf090102/notification-service:latest \
    -f services/notification/Dockerfile .
#                                     ↑
#                          Build context = task-manager/
```

```
Why? Because the Dockerfile needs to COPY files from TWO places:

task-manager/                          ← Build context (.)
├── prisma/
│   └── schema.prisma                  ← COPY prisma/schema.prisma  (needs context = task-manager/)
├── services/
│   └── notification/
│       ├── package.json               ← COPY services/notification/package.json
│       ├── prisma.config.ts           ← COPY services/notification/prisma.config.ts
│       ├── tsconfig.json              ← COPY services/notification/tsconfig.json
│       └── src/
│           └── index.ts               ← COPY services/notification/src/
└── Dockerfile                         ← Main app Dockerfile (separate)
```

If you ran `docker build` from `services/notification/`, the `COPY prisma/schema.prisma` instruction would fail because `prisma/` is outside the build context.

---



## 9. Docker Build Workflow



### Building for Local Docker Compose

```bash
cd task-manager

# Build and run with Docker Compose (uses local PostgreSQL)
docker compose up -d --build

# Push schema to the containerized database
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskmanager
npx prisma db push
```



### Building for Kubernetes (Minikube)

This is the standard workflow used by `setup-cluster.sh`:

```
┌──────────────────────────────────────────────────────────────────┐
│                    BUILD WORKFLOW                                │
│                                                                  │
│  Step 1: Build with Docker Desktop                               │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  docker build -t ralf090102/notification-service:latest │     │
│  │      -f services/notification/Dockerfile .              │     │
│  │                                                         │     │
│  │  → Image built in Docker Desktop's daemon               │     │
│  │  → ~16GB RAM available, fast builds                     │     │
│  └────────────────────────┬────────────────────────────────┘     │
│                           │                                      │
│  Step 2: Force-remove stale image from Minikube                  │
│  ┌────────────────────────▼────────────────────────────────┐     │
│  │  minikube ssh "docker rmi -f ralf090102/notification:latest"  │ 
│  │                                                         │     │
│  │  → Minikube caches by TAG, not digest                   │     │
│  │  → Without removal, pods keep running OLD code          │     │
│  └────────────────────────┬────────────────────────────────┘     │
│                           │                                      │
│  Step 3: Load image into Minikube                                │
│  ┌────────────────────────▼────────────────────────────────┐     │
│  │  minikube image load ralf090102/notification-service:latest   │
│  │                                                         │     │
│  │  → Copies image from Docker Desktop → Minikube daemon   │     │
│  └────────────────────────┬────────────────────────────────┘     │
│                           │                                      │
│  Step 4: Restart deployment to pick up new image                 │
│  ┌────────────────────────▼────────────────────────────────┐     │
│  │  kubectl rollout restart deployment/task-manager-notification │
│  │                                                         │     │
│  │  → Pods terminate and restart with the new image        │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```



### Why Docker Desktop → Minikube Load?

```
Option A (used): Docker Desktop builds → load into Minikube
  Docker Desktop:  ~16GB RAM → builds are fast, no OOM
  Minikube daemon: ~7GB RAM  → shared with all running pods

Option B (avoided): Build inside Minikube
  eval $(minikube docker-env)
  docker build ...                ← Uses Minikube's daemon (7GB shared RAM)
  Problem: Large builds (@aws-sdk, next.js) OOM-kill the daemon
```



### Parallel Builds

The `setup-cluster.sh` script builds all 9 images **in parallel** for speed:

```bash
# Each build runs as a background process
for build in "${BUILDS[@]}"; do
    (
        docker build -t "$build_tag" \
            -f "$build_dockerfile" "$BUILD_CONTEXT" \
            > "$BUILD_LOGS_DIR/${build_name}.log" 2>&1
    ) &
    PIDS+=($!)
done

# Wait for all to complete
for pid in "${PIDS[@]}"; do
    wait "$pid"
done
```

```
Sequential (9 images × ~60s each):    Parallel (9 images simultaneously):
─────────────────────────────────     ─────────────────────────────────
  Image 1 ████████░░░░ 60s              Image 1 ████████░░░░ 60s
  Image 2 ████████░░░░ 60s              Image 2 ████████░░░░ 60s
  Image 3 ████████░░░░ 60s              Image 3 ████████░░░░ 60s
  ...                                  ...
  Image 9 ████████░░░░ 60s              Image 9 ████████░░░░ 60s
  Total: ~540s (9 min)                  Total: ~60-90s (1-1.5 min)
                                       ~4-6x faster with parallelism
```

---



## 10. Hands-On Exercises



### Exercise 1: Build and Run the Main App

```bash
cd task-manager

# Build the image
docker build -t task-manager-app:latest .

# See the layers
docker image history task-manager-app:latest

# Run it (you'll need a DATABASE_URL)
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/taskmanager" \
  -e NEXTAUTH_SECRET="test-secret" \
  -e AUTH_TRUST_HOST="true" \
  task-manager-app:latest

# Open http://localhost:3000
```



### Exercise 2: Explore a Running Container

```bash
# List running containers
docker ps

# Open a shell inside the container
docker exec -it task-manager-app sh

# Inside the container, explore:
ls -la                  # What files are here?
whoami                  # Which user are you? (should be "nextjs")
cat server.js | head    # What does the entry point look like?
echo $NODE_ENV          # What environment is set?
exit
```



### Exercise 3: Docker Compose Full Stack

```bash
cd task-manager

# Start everything
docker compose up -d --build

# Watch the app wait for db to be healthy
docker compose ps       # Check status

# Push schema to the containerized DB
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskmanager
npx prisma db push

# Register a new user and create tasks at http://localhost:3000

# View logs
docker compose logs -f app
docker compose logs -f db

# Clean up
docker compose down         # Stop containers (keeps data)
docker compose down -v      # Stop + DELETE database data
```



### Exercise 4: Compare Image Sizes

```bash
cd task-manager

# Build the main app image
docker build -t task-manager:full .
docker images task-manager:full

# Now check the size of individual stages (advanced)
# This shows how multi-stage keeps the final image small

# List all images by size
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | sort -k3 -h
```



### Exercise 5: Build a Microservice Image

```bash
cd task-manager

# Build the notification service
docker build -t notification-service:latest \
    -f services/notification/Dockerfile .

# Run it standalone (won't fully work without DB, but tests the image)
docker run --rm -p 3004:3004 notification-service:latest

# Try to reach it
# (from another terminal)
curl http://localhost:3004/health
```

---



## 11. The Container Pipeline

> **This section connects Level 2's full-stack pipeline to the Docker layer.** It shows what happens when you wrap the pipeline in containers.



### Before Docker (Levels 1-2)

```
┌─────────────────────────────────────────────────────┐
│              Single Machine (your laptop)           │
│                                                     │
│  ┌──────────┐                                       │
│  │ Browser  │                                       │
│  └────┬─────┘                                       │
│       │ HTTP                                        │
│  ┌────▼──────────────────────────────────────────┐  │
│  │  Next.js Dev Server (npm run dev)             │  │
│  │  ├── Frontend (React)                         │  │
│  │  ├── API Routes                               │  │
│  │  ├── Prisma → PostgreSQL                      │  │
│  │  └── Port 3000                                │  │
│  └────┬──────────────────────────────────────────┘  │
│       │                                             │
│  ┌────▼──────────────────────────────────────────┐  │
│  │  PostgreSQL (Supabase cloud)                  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```



### After Docker Compose (Level 3)

```
┌────────────────────────────────────────────────────────────────┐
│                    Single Machine (Docker)                     │
│                                                                │
│  ┌──────────┐                                                  │
│  │ Browser  │                                                  │
│  └────┬─────┘                                                  │
│       │ localhost:3000                                         │
│       │                                                        │
│  ┌────▼────────────────────────────────────────────────────┐   │
│  │  Docker Network (task-manager_default)                  │   │
│  │                                                         │   │
│  │  ┌──────────────────┐       ┌───────────────────────┐   │   │
│  │  │  app container   │       │  db container         │   │   │
│  │  │                  │       │                       │   │   │
│  │  │  node server.js  │       │  postgres:17-alpine   │   │   │
│  │  │  Port 3000       │──────→│  Port 5432            │   │   │
│  │  │                  │       │                       │   │   │
│  │  │  USER: nextjs    │       │  USER: postgres       │   │   │
│  │  │  No source code  │       │  Data: pgdata volume  │   │   │
│  │  │  ~150MB          │       │  ~400MB               │   │   │
│  │  └──────────────────┘       └───────────────────────┘   │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```



### What Changed?


| Aspect          | Before Docker             | After Docker                    |
| --------------- | ------------------------- | ------------------------------- |
| Runtime         | Node.js installed on host | Node.js inside container image  |
| Database        | Supabase cloud connection | PostgreSQL container (local)    |
| Dependencies    | `npm install` on host     | `npm ci` during build           |
| Environment     | `.env` file on host       | `environment:` in compose       |
| Startup         | `npm run dev` (manual)    | `docker compose up` (automated) |
| Reproducibility | "Works on my machine"     | Identical everywhere            |
| Isolation       | Shares host processes     | Isolated in containers          |




### The Same Pipeline, Now Containerized

When the user creates a task, the exact same pipeline from Level 2 runs — but now inside containers:

```
Browser
  │ fetch(POST /api/tasks)
  ▼
┌─ app container ───────────────────────┐
│                                       │
│  Next.js Server (node server.js)      │
│  ├── auth() → JWT                     │
│  ├── Zod validation                   │
│  ├── prisma.task.create()             │
│  │     │                              │
│  │     ▼                              │
│  │   SQL INSERT                       │
│  │     │                              │
│  └─────┼──────────────────────────────┘
│        │
│        ▼
│  ┌─ db container ─────────────────────┐
│  │                                    │
│  │  PostgreSQL 17                     │
│  │  ├── Receives INSERT               │
│  │  ├── Writes to disk                │
│  │  │   (pgdata volume)               │
│  │  └── Returns new row               │
│  │                                    │
│  └────────────────────────────────────┘
│        │
│        ▼
┌─ app container ───────────────────────┐
│  Returns 201 Created (JSON)           │
│  Side effects (realtime, webhook)     │
└───────────────────────────────────────┘
        │
        ▼
Browser updates UI
```

**The code is identical.** Docker just changes *where* it runs, not *how* it works.

### What's Next: From Containers to Orchestration

Docker Compose runs everything on one machine. But real production needs:

```
Docker Compose (now):           Kubernetes (Level 4):

┌──────────────────────────┐    ┌──────────────────────────────────┐
│  1 machine               │    │  Cluster of machines             │
│  2 containers            │    │  10+ containers (pods)           │
│  Manual scaling          │    │  Auto-scaling                    │
│  No load balancing       │    │  Built-in load balancing         │
│  No self-healing         │    │  Auto-restart failed pods        │
│  No rolling updates      │    │  Zero-downtime deployments       │
│  No service discovery    │    │  Internal DNS per service        │
└──────────────────────────┘    └──────────────────────────────────┘

1 app + 1 db              →    1 app + 8 microservices + monitoring
```

Each microservice is its own container, built with the patterns you learned in Section 8. Kubernetes manages all of them.

---



## 12. What You've Learned



### Technologies Mastered

- Docker fundamentals (images, containers, registries)
- Dockerfile authoring with multi-stage builds
- Docker Compose for local development
- .dockerignore for security and build speed
- Health checks for container readiness
- Microservice Dockerfile patterns (Node.js + Python)
- Build context and caching strategies



### Core Concepts

- **Image vs Container:** Blueprint vs running instance
- **Multi-stage builds:** Small final images (150MB vs 800MB)
- **Docker cache:** Copy `package.json` before source code
- **Standalone output:** Next.js minimal server bundle
- **Named volumes:** Persistent data across container restarts
- **Service networking:** DNS-based service discovery
- **Non-root user:** Security best practice
- **Build context:** Why microservices build from `task-manager/`



### Dockerfile Checklist

Before pushing an image to production, verify:

- [ ] Multi-stage build (builder + runner stages)
- [ ] Non-root user in the runner stage
- [ ] `.dockerignore` excludes `.env`, `node_modules`, `.git`
- [ ] `NODE_ENV=production` set in runner
- [ ] `package.json` copied before source code (cache optimization)
- [ ] No secrets baked into the image
- [ ] `EXPOSE` documents the correct port
- [ ] `CMD` uses the correct entry point
- [ ] Image is as small as possible

---

