# Task Manager Web Application

A production-grade, full-stack task management platform engineered to demonstrate modern web development, microservices architecture, and cloud-native DevOps — built end-to-end from a monolith to a scalable, self-healing Kubernetes deployment with progressive delivery.

## Highlights

- **Full-stack Next.js 16 app** with App Router, real-time updates, and server-rendered pages
- **8 microservices** (Node.js + Python) with dedicated databases and storage
- **Production Kubernetes deployment** — autoscaling, self-healing, canary releases
- **Complete CI/CD pipeline** — 9 Docker images built and pushed on every commit
- **Full observability stack** — Prometheus metrics, Grafana dashboards, centralized logging, alerting
- **GitOps workflow** — push to `main` triggers automatic ArgoCD reconciliation



## Tech Stack


| Layer              | Technologies                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| **Frontend**       | Next.js 16, React 19, Tailwind CSS v4                                   |
| **Backend**        | Next.js API Routes, Node.js (Fastify/Socket.io), Python (FastAPI)       |
| **Database**       | PostgreSQL (Supabase) via Prisma ORM                                    |
| **Search**         | Meilisearch (full-text)                                                 |
| **Cache / Queue**  | Redis (cache-aside + BullMQ workers)                                    |
| **Storage**        | MinIO (S3-compatible object storage)                                    |
| **Auth**           | NextAuth v5 (Credentials, JWT sessions, bcrypt)                         |
| **Infrastructure** | Docker, Kubernetes (Minikube), Helm, NGINX Ingress                      |
| **CI/CD**          | GitHub Actions (quality gates, security scans, multi-image builds)      |
| **GitOps**         | ArgoCD (sync), Argo Rollouts (canary), Prometheus Adapter (HPA metrics) |
| **Observability**  | Prometheus, Grafana, Alertmanager, Loki + Promtail, pino logger         |




## Features

**Application features:**

- Task CRUD with priorities, due dates, and full-text search
- Recurring tasks with cron-based scheduling (pause/resume)
- Real-time task board updates via WebSockets
- File attachments (upload/download via MinIO S3)
- Bell-icon notifications (due-soon, task completion, team invites)
- Teams and Kanban boards with RBAC (Admin / Member / Viewer)
- Webhook registration with HMAC-signed delivery and retry logic
- Productivity analytics dashboard (completion rates, priority breakdown)

**Platform features:**

- Horizontal Pod Autoscaler scaling on custom metrics (requests/second)
- Canary deployments with automated Prometheus-based analysis gates
- GitOps (ArgoCD) — Git is the single source of truth with self-healing
- Five Prometheus alert rules (app down, high error rate, crash looping, etc.)
- Centralized log aggregation (Loki + Promtail → Grafana)



## Architecture

```
                         ┌──────────────────────────────┐
                         │       NGINX Ingress          │
                         │   (task-manager.local)       │
                         └──────┬──────────────┬────────┘
                                │              │ /socket.io
                     ┌──────────▼──────┐  ┌────▼──────────┐
                     │  Next.js App    │  │  Realtime WS  │
                     │  (main app)     │  │  (Socket.io)  │
                     └──┬──┬──┬──┬─────┘  └───────────────┘
                        │  │  │  │
            ┌───────────┘  │  │  └─────────────┐
            ▼              ▼  ▼                ▼
     ┌────────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────┐
     │ Scheduler  │  │ Notif.   │  │ Team Service │  │ Webhook  │
     │ (CronJob)  │  │ Service  │  │              │  │ Service  │
     └─────┬──────┘  └────┬─────┘  └──────┬───────┘  └────┬─────┘
           │              │               │               │
           ▼              ▼               ▼               ▼
     ┌───────────────────────────────────────────────────────────┐
     │                    PostgreSQL (Supabase)                  │
     └───────────────────────────────────────────────────────────┘

     ┌────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐
     │ Analytics  │  │ File Service │  │ Search Sync│  │  Worker  │
     │ (Python)   │  │              │  │            │  │ (BullMQ) │
     └─────┬──────┘  └──────┬───────┘  └─────┬──────┘  └────┬─────┘
           │                │                │              │
           │           ┌────▼─────┐    ┌─────▼──────┐  ┌────▼────┐
           │           │  MinIO   │    │Meilisearch │  │  Redis  │
           │           │ (S3)     │    │ (search)   │  │ (cache) │
           │           └──────────┘    └────────────┘  └─────────┘
           │
     Weekly reports (CronJob)
```



## Project Structure

```
task-manager/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/               # Login, register pages
│   │   ├── (dashboard)/          # Dashboard, teams, recurring, webhooks
│   │   └── api/                  # 22 API routes (tasks, teams, stats, etc.)
│   ├── components/               # React components + Jest tests
│   └── lib/                      # Auth, Prisma, Redis, queue, metrics, logger
├── services/                     # 8 microservices
│   ├── scheduler/                # CronJob — recurring task generation
│   ├── notification/             # Email + in-app notifications (Fastify)
│   ├── file-service/             # File I/O via MinIO (Fastify)
│   ├── search-sync/              # PostgreSQL → Meilisearch sync (Fastify)
│   ├── realtime/                 # WebSocket gateway (Socket.io)
│   ├── analytics/                # Productivity stats (Python FastAPI)
│   ├── webhook/                  # Webhook delivery with retry (Fastify)
│   ├── team-service/             # Teams, boards, RBAC (Fastify)
│   └── worker/                   # BullMQ background job processor
├── prisma/                       # Shared schema + seed script
├── helm-chart/                   # Production Helm chart (all services)
├── argocd/                       # ArgoCD Application CRD
├── scripts/                      # Cluster setup + load testing
├── Dockerfile                    # Multi-stage Next.js standalone build
└── next.config.ts                # serverExternalPackages: bullmq, ioredis
```



## Quick Start



### Prerequisites

- Node.js 22+, npm
- Docker Desktop
- Minikube, kubectl, Helm (for Kubernetes deployment)



### Local Development

```bash
cd task-manager
npm install
npm run db:generate         # Generate Prisma client
npm run db:push             # Create database schema
npm run dev                 # http://localhost:3000
```

Create a `.env` file (see `.env.example` if present) with:

```
DATABASE_URL="postgresql://..."     # Supabase or local Postgres
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
```



### Deploy to Kubernetes (Minikube)

```bash
# 1. Start cluster + enable ingress
minikube start --driver=docker
minikube addons enable ingress

# 2. Build all 9 images and load into Minikube
cd task-manager
bash scripts/setup-cluster.sh

# 3. Create namespace + secret
kubectl create namespace task-manager
kubectl create secret generic task-manager-secrets --namespace=task-manager \
  --from-literal=database-url='...' \
  --from-literal=nextauth-secret='...' \
  --from-literal=nextauth-url='http://task-manager.local' \
  --from-literal=auth-trust-host='true'

# 4. Deploy via Helm
helm install task-manager ./helm-chart --namespace task-manager \
  --set secrets.enabled=false

# 5. Access the app
minikube tunnel                # Run in background terminal
# Add to hosts file: 127.0.0.1 task-manager.local
# Open http://task-manager.local
```



### GitOps Deployment (ArgoCD)

For Git-driven deployments where `git push` triggers automatic reconciliation:

```bash
kubectl apply -f task-manager/argocd/application.yaml
# ArgoCD syncs the Helm chart from main branch every ~3 minutes
```



## NPM Scripts


| Command               | Description                                   |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start development server                      |
| `npm run build`       | Generate Prisma client + build for production |
| `npm run quality`     | Lint + type-check + test (full quality gate)  |
| `npm run lint`        | ESLint on `src/`                              |
| `npm run type-check`  | TypeScript compiler check                     |
| `npm run test`        | Jest test suite                               |
| `npm run db:push`     | Push schema to database                       |
| `npm run db:generate` | Regenerate Prisma client                      |
| `npm run db:studio`   | Open Prisma Studio GUI                        |




## CI/CD Pipeline

`.github/workflows/ci.yml` runs on every push/PR to `main` and `dev`:


| Job          | What It Does                                                        |
| ------------ | ------------------------------------------------------------------- |
| **quality**  | Lint → type-check → test (must pass to merge)                       |
| **security** | `npm audit --audit-level=high` + Trivy filesystem scan              |
| **docker**   | Matrix build of all 9 Docker images, push to Docker Hub (main only) |


All 9 images build in parallel via matrix strategy with independent GHA cache scopes.

## Observability

- **Metrics**: `prom-client` exposes Prometheus metrics at `/api/metrics`
- **Dashboards**: Grafana with auto-provisioned Prometheus + Loki datasources
- **Logs**: `pino` structured JSON logs → Promtail → Loki → Grafana Explore
- **Alerts**: 5 PrometheusRules (app down, high error rate, crash looping, no activity, PV almost full) routed to Alertmanager
- **Custom Metrics**: Prometheus Adapter bridges Prometheus → Kubernetes Custom Metrics API for HPA



## Kubernetes Platform

The Helm chart (`task-manager/helm-chart/`) deploys a complete platform:


| Capability               | Implementation                                                    |
| ------------------------ | ----------------------------------------------------------------- |
| **Autoscaling**          | HPA on `requests_per_second` custom metric (1-3 replicas)         |
| **Progressive delivery** | Argo Rollouts canary (20% → 50% → 100% with Prometheus analysis)  |
| **GitOps**               | ArgoCD with self-healing and prune — Git is source of truth       |
| **Caching**              | Redis cache-aside layer (60s TTL) for task lists                  |
| **Background jobs**      | BullMQ worker (Redis-backed) for search indexing + overdue checks |
| **Secrets**              | Pre-created manually (kept out of Git)                            |
| **Ingress**              | NGINX with WebSocket support for realtime updates                 |




## Documentation

Detailed learning guides in `markdown/` cover each phase of the project:

- **Stage 1** — Full-stack Next.js fundamentals, auth, Prisma
- **Stage 2** — Microservices expansion (all 8 modules)
- **Stage 3** — Platform engineering: Redis caching, BullMQ workers, alerting, GitOps, HPA, canary deployments
- **Study** — Concept deep-dives (Prometheus, Kubernetes networking, etc.)



## Testing

- **Jest** with `next/jest` and jsdom environment
- **Testing Library** for React component tests
- Tests in `src/components/__tests__/` follow component name pattern
- Path alias `@/` maps to `src/`



## License

MIT