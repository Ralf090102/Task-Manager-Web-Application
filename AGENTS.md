<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Structure

Working directory is `task-manager/`. Root contains only documentation.

- `src/app/` - Next.js App Router with route groups: `(auth)`, `(dashboard)`
- `src/components/` - React components, tests in `__tests__/` subdirectory
- `src/lib/` - Auth, Prisma client, and validation schemas
- `src/generated/prisma/` - Prisma client (generated, gitignored)
- `services/` - Microservices (scheduler, notification, etc.)
- `scripts/` - Cluster setup automation (`setup-cluster.sh`, `setup-cluster.ps1`)

## Essential Commands

Build order matters: Prisma must be generated before building
```bash
npm run build      # Runs: prisma generate && next build
npm run quality    # Runs: lint -> type-check -> test
```

Development and testing:
```bash
npm run dev
npm run test
npm run test:watch
npm run type-check
npm run lint
```

Database:
```bash
npm run db:generate    # Generate Prisma client to src/generated/prisma
npm run db:push        # Push schema changes to database
npm run db:studio      # Open Prisma Studio
```

## Prisma Configuration

- Database: PostgreSQL with `@prisma/adapter-pg` adapter
- Custom client output: `src/generated/prisma` (NOT default node_modules/.prisma)
- Client initialized with custom adapter in `src/lib/prisma.ts`
- `exclude: ["node_modules", "services"]` in main `tsconfig.json` — services have their own tsconfig

## Tailwind CSS v4

Uses Tailwind v4 with new `@import "tailwindcss"` syntax in `globals.css`. Do NOT use v3 `@tailwind` directives.

## Testing

- Jest with `next/jest` and jsdom environment
- Path alias `@/` maps to `src/`
- Mock async handlers with `.mockResolvedValue(undefined)`
- Tests in `src/components/__tests__/` follow component name pattern

## Docker (Phase 2)

- Next.js standalone output enabled (`output: "standalone"` in next.config.ts)
- Multi-stage Dockerfile: deps → build → minimal runner
- Docker Compose: app + PostgreSQL 17 Alpine
- Runner image does NOT contain Prisma CLI — run schema pushes from host:
  ```bash
  # Start containers
  docker compose up -d --build
  # Push schema from host (port 5432 mapped to localhost)
  set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskmanager
  npx prisma db push
  ```
- Docker PostgreSQL is separate from Supabase — register new users inside the containerized app
- `AUTH_TRUST_HOST=true` required in Docker environment (NextAuth v5 security)
- Common commands:
  ```bash
  docker compose up -d --build   # Build and start
  docker compose ps              # Check status
  docker compose logs -f app     # View app logs
  docker compose down            # Stop containers
  docker compose down -v         # Stop and delete DB volume
  ```

## CI/CD (Phase 3)

- GitHub Actions workflow: `.github/workflows/ci.yml` (at repo root)
- Working directory for all steps: `task-manager/`
- Three jobs: `quality` → `security` → `docker`
- **quality**: lint, type-check, test (runs on every push and PR to main)
- **security**: npm audit + Trivy filesystem scan (runs in parallel with quality)
- **docker**: build + push to Docker Hub (only on main push, after quality + security pass)
- Docker build context: `./task-manager`
- Required GitHub secrets: `DOCKER_USERNAME`, `DOCKER_PASSWORD`

## Authentication

- NextAuth v5 beta with Credentials provider + bcryptjs
- JWT session strategy with custom ID injection via callbacks
- Sign-in page: `/login` (custom route)
- Session accessible via `auth()` from `@/lib/auth`

## Kubernetes (Phase 4)

- Helm chart: `task-manager/helm-chart/` (Chart v1.0.0, appVersion 1.0.0)
- Local dev: Minikube with Docker driver, K8s v1.35.1
- Image: `ralf090102/task-manager-app:latest` loaded into Minikube (no remote pull)
- Database: connects to external Supabase PostgreSQL (not in-cluster)
- Access via NGINX Ingress + `minikube tunnel` + hosts file entry
- Common commands:
  ```bash
  # Start Minikube
  minikube start --driver=docker

  # Enable NGINX Ingress controller
  minikube addons enable ingress

  # Build image inside Minikube's Docker daemon
  minikube image build -t ralf090102/task-manager-app:latest -f Dockerfile D:\GitHub\Task-Manager-Web-Application\task-manager

  # Install/upgrade Helm release
  helm install task-manager ./task-manager/helm-chart --namespace task-manager --create-namespace --set secrets.databaseUrl=<URL> --set secrets.nextauthSecret=<SECRET> --set secrets.nextauthUrl=http://task-manager.local --set image.pullPolicy=Never
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values

  # Access the app
  minikube tunnel    # Run in background, routes Ingress to 127.0.0.1
  # Hosts file: 127.0.0.1 task-manager.local
  # Then open http://task-manager.local in browser

  # Check resources
  kubectl get all -n task-manager
  kubectl logs -n task-manager deployment/task-manager --tail=20

  # Uninstall
  helm uninstall task-manager --namespace task-manager
  minikube stop
  ```
- `minikube tunnel` must be running for browser access on Windows/Docker driver
- `image.pullPolicy: Never` for local Minikube dev (uses pre-loaded image)
- Resource limits: 500m CPU / 512Mi memory; requests: 250m CPU / 256Mi memory

## Monitoring & Observability (Phase 5)

- Monitoring stack: `kube-prometheus-stack` Helm chart in `monitoring` namespace
- Components: Prometheus (metrics scraping), Grafana (dashboards), Alertmanager, node-exporter
- App metrics: `prom-client` library, exposed at `/api/metrics`
- Structured logging: `pino` logger (JSON format), configured in `src/lib/logger.ts`
- ServiceMonitor: `task-manager/helm-chart/templates/servicemonitor.yaml`
  - Label `release: monitoring` required for Prometheus Operator discovery
  - Scrapes `/api/metrics` every 15s on the `http` port
- Accessing monitoring UIs (requires `kubectl port-forward`):
  ```bash
  # Grafana (admin/admin)
  kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
  # Open http://localhost:3001

  # Prometheus
  kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
  # Open http://localhost:9090
  ```
- Installing the monitoring stack:
  ```bash
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
  helm repo update
  helm install monitoring prometheus-community/kube-prometheus-stack \
    --namespace monitoring --create-namespace \
    --set grafana.adminPassword=admin
  ```
- Helm upgrade with new ServiceMonitor keys (when `--reuse-values` doesn't merge new keys):
  ```bash
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values \
    --set monitoring.enabled=true \
    --set monitoring.serviceMonitor.scrapeInterval=15s \
    --set monitoring.serviceMonitor.labels.release=monitoring
  ```

## Microservices Expansion — Stage 2

### Overview

Expanding the monolith into a microservices architecture. 8 planned modules across 4 phases. Module 7 (Scheduler) and Module 1 (Notification) are implemented.

### Module 7: Recurring Task Scheduler (Phase 1)

- **Service**: `services/scheduler/` — Node.js CronJob microservice
- **Purpose**: Creates tasks from recurring templates on a cron schedule
- **Runtime**: `tsx` (NOT `tsc + node`) — required because Prisma 7.8 generates `.ts` files with `import.meta.url` (ESM syntax incompatible with CJS compilation)
- **Schema sharing**: Copies `prisma/schema.prisma` during Docker build, runs `npx prisma generate` fresh — no committed generated files
- **API endpoints** (main app):
  - `GET/POST /api/recurring` — list/create recurring tasks
  - `PATCH/DELETE /api/recurring/[id]` — update/delete
  - Validates cron expressions via `cron-parser`
- **Helm template**: `templates/scheduler/cronjob.yaml` — CronJob with `concurrencyPolicy: Forbid`
- **values.yaml**: `scheduler:` section with `enabled`, `schedule`, `image`, `resources`
- **Build context**: `task-manager/` (not `services/scheduler/`) — needed to access shared `prisma/schema.prisma`
- **Image**: `ralf090102/scheduler-service:latest`
- **Deploy commands**:
  ```bash
  # Build scheduler image (from task-manager/)
  minikube image build -t ralf090102/scheduler-service:latest -f services/scheduler/Dockerfile .

  # Helm upgrade (reuse existing secrets)
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values --set scheduler.image.pullPolicy=Never

  # Trigger manual run
  kubectl create job --from=cronjob/task-manager-scheduler -n task-manager manual-test-1
  kubectl logs -n task-manager job/manual-test-1
  ```

### Module 1: Notification Service (Phase 1)

- **Service**: `services/notification/` — Node.js Fastify HTTP microservice
- **Purpose**: Sends email (nodemailer) and in-app notifications for due-soon and completed tasks
- **Runtime**: `tsx` (same pattern as scheduler)
- **Port**: 3004 (ClusterIP only — no Ingress, internal access only)
- **Endpoints**: `GET /health`, `POST /notify/due-soon`, `POST /notify/task-completed`
- **SMTP**: Graceful degradation — if `SMTP_HOST` is empty, emails are skipped but in-app notifications are still created in the database
- **Schema**: `Notification` model added to `prisma/schema.prisma` (fields: id, userId, type, message, read, taskId, createdAt)
- **Helm templates**: `templates/notification/` — Deployment, Service (ClusterIP), Secret (SMTP credentials)
- **values.yaml**: `notification:` section with `enabled`, `image`, `smtp`, `resources`
- **Image**: `ralf090102/notification-service:latest`
- **Build context**: `task-manager/` (same as scheduler)
- **Deploy commands**:
  ```bash
  # Build notification image (from task-manager/)
  minikube image build -t ralf090102/notification-service:latest -f services/notification/Dockerfile .

  # Helm upgrade with notification enabled
  # NOTE: --reuse-values does NOT read new values.yaml keys!
  # Must pass ALL notification.* values via --set on first deploy:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
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

  # Subsequent upgrades only need --reuse-values (values are now persisted):
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values

  # Test internal communication (no curl/wget in slim images — use Node.js):
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-notification:3004/health').then(r=>r.text()).then(t=>console.log(t))"
  # Expected: {"status":"ok"}
  ```

### Service Selector Labels (Critical)

The main app Deployment and Service MUST have `app.kubernetes.io/component: app` in their labels/selectors. Without it, the main app Service selector (`app.kubernetes.io/name=task-manager` + `app.kubernetes.io/instance=task-manager`) matches ALL pods with those base labels — including notification pods. This causes traffic to be load-balanced across both pods (Fastify returns 404 for Next.js routes like `/dashboard`).

**Rule**: Every service's Deployment pod template and Service selector must include a unique `app.kubernetes.io/component` label:
- Main app: `app.kubernetes.io/component: app`
- Notification: `app.kubernetes.io/component: notification`
- Scheduler: N/A (CronJob, no Service)

### Microservice Pattern (reusable for future services)

Each Node.js microservice follows this structure:
```
services/<name>/
├── package.json          # "type": "module", tsx as dependency
├── tsconfig.json         # moduleResolution: "bundler", noEmit: true
├── prisma.config.ts      # Minimal config pointing to shared schema
├── src/index.ts          # imports from ./generated/prisma/client.ts
├── Dockerfile            # copies shared schema, runs prisma generate, uses tsx
└── .gitignore
```

### Helm Chart Structure (multi-service)

```
helm-chart/templates/
├── _helpers.tpl              # Shared helpers
├── secret.yaml               # Shared secrets
├── task-manager/             # Main app (deployment, service, ingress, servicemonitor)
├── scheduler/                # Scheduler (cronjob)
└── notification/             # Notification (deployment, service, secret)
```

Each service has an `enabled` flag in `values.yaml` for conditional rendering.
