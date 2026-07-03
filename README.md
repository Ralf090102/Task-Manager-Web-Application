# Task Manager Web Application

A production-grade, full-stack task management platform built to learn full-stack development, DevOps, and Kubernetes — from monolith to microservices.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Backend:** Next.js API Routes + 8 microservices (Node.js/Python)
- **Database:** PostgreSQL (Supabase) with Prisma ORM
- **Auth:** NextAuth v5 (Credentials provider, JWT sessions)
- **Infrastructure:** Docker, Kubernetes (Minikube), Helm, NGINX Ingress
- **CI/CD:** GitHub Actions (lint, test, security scan, 9-image Docker build)
- **Monitoring:** Prometheus, Grafana, Alertmanager, prom-client

## Architecture

```
task-manager/
├── src/                        # Next.js app (API routes, components, pages)
│   ├── app/                    # App Router — (auth) and (dashboard) route groups
│   ├── components/             # React components with tests
│   └── lib/                    # Auth, Prisma, validations, metrics, logger
├── services/                   # 8 microservices
│   ├── scheduler/              # CronJob — creates tasks from recurring templates
│   ├── notification/           # Email + in-app notifications (Fastify)
│   ├── file-service/           # File upload/download via MinIO S3
│   ├── search-sync/            # Syncs tasks to Meilisearch for full-text search
│   ├── realtime/               # WebSocket gateway (Socket.io)
│   ├── analytics/              # Python FastAPI — productivity stats + reports
│   ├── webhook/                # Webhook delivery with retry + HMAC signing
│   └── team-service/           # Teams, boards, RBAC, activity feed
├── prisma/                     # Shared schema + seed script
├── helm-chart/                 # Helm chart for all services
├── scripts/                    # Cluster setup automation
├── Dockerfile                  # Multi-stage Next.js standalone build
└── .github/workflows/ci.yml    # CI/CD pipeline
```

## Features

- **Task management** — CRUD, priorities, due dates, full-text search, file attachments
- **Recurring tasks** — Cron-based scheduling with pause/resume
- **Real-time updates** — WebSocket-powered live task board
- **Notifications** — Bell icon with unread badge; triggers on task completion, recurring fires, team invites, board creation, webhook failures
- **Teams & boards** — Multi-user collaboration with Kanban boards and RBAC (Admin/Member/Viewer)
- **Webhooks** — Register URLs to receive HMAC-signed callbacks on task events
- **Analytics** — Productivity stats (completion rates, priority breakdown, weekly reports)
- **Monitoring** — Prometheus metrics at `/api/metrics`, Grafana dashboards, alert thresholds

## Quick Start

### Prerequisites

- Node.js 22+, Docker Desktop, Minikube, kubectl, Helm

### Development

```bash
cd task-manager
npm install
npm run db:generate    # Generate Prisma client
npm run db:push        # Create database tables
npm run dev            # Start dev server at localhost:3000
```

### Deploy to Kubernetes

```bash
# Build images and deploy the full cluster
cd task-manager
bash scripts/setup-cluster.sh

# Or reuse an existing cluster
bash scripts/setup-cluster.sh --skip-recreate --skip-builds

# Start tunnel for Ingress access (separate terminal)
minikube tunnel
# Then open http://task-manager.local (add to hosts file: 127.0.0.1 task-manager.local)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Generate Prisma client + build for production |
| `npm run quality` | Lint + type-check + test |
| `npm run test` | Run Jest test suite |
| `npm run db:studio` | Open Prisma Studio |
| `npx tsx prisma/seed.ts` | Seed test data (user: shampoo01@gmail.com) |

## License

MIT
