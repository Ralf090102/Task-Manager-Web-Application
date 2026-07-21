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
- **docker**: matrix build + push all 9 images to Docker Hub (only on main push, after quality + security pass)
- All 9 images built in parallel via matrix strategy (`fail-fast: false`)
- Images: `task-manager-app`, `scheduler-service`, `notification-service`, `file-service`, `search-sync-service`, `realtime-service`, `analytics-service`, `webhook-service`, `team-service`
- Docker build context: `./task-manager` for all images; `file` varies per service
- Each image has its own GHA cache scope (`cache-from`/`cache-to` with `scope=<name>`)
- Tags per image: `sha-<commit>` + `latest` (on main branch only)
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

  # Build image with Docker Desktop, then load into Minikube
  docker build -t ralf090102/task-manager-app:latest -f Dockerfile ./task-manager
  minikube image load ralf090102/task-manager-app:latest

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
- **Log aggregation**: Loki + Promtail in `monitoring` namespace (Stage 3 Module A)
  - Loki: StatefulSet storing all pod logs with 5Gi PVC
  - Promtail: DaemonSet collecting logs from `/var/log/pods/*` on each node
  - Grafana datasource auto-provisioned by loki-stack chart
- ServiceMonitor: `task-manager/helm-chart/templates/servicemonitor.yaml`
  - Label `release: monitoring` required for Prometheus Operator discovery
  - Scrapes `/api/metrics` every 15s on the `http` port
- Accessing monitoring UIs (requires `kubectl port-forward`):
  ```bash
  # Grafana (admin/admin) — metrics + logs + dashboards
  kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
  # Open http://localhost:3001 → Explore → Loki datasource for LogQL queries

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
- Installing Loki + Promtail (log aggregation):
  ```bash
  helm repo add grafana https://grafana.github.io/helm-charts
  helm install loki grafana/loki-stack \
    --namespace monitoring \
    --set loki.persistence.enabled=true \
    --set loki.persistence.size=5Gi \
    --set promtail.enabled=true \
    --set loki.isDefault=false  # Prevents conflict with Prometheus (default datasource)
  ```
- LogQL query examples:
  ```logql
  {namespace="task-manager"}                              -- all task-manager logs
  {namespace="task-manager", container="webhook"}         -- only webhook service
  {namespace="task-manager"} |= "error"                   -- lines containing "error"
  sum(count_over_time({namespace="task-manager"}[5m])) by (pod)  -- log volume chart
  ```
- Helm upgrade with new ServiceMonitor keys (when `--reuse-values` doesn't merge new keys):
  ```bash
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values \
    --set monitoring.enabled=true \
    --set monitoring.serviceMonitor.scrapeInterval=15s \
    --set monitoring.serviceMonitor.labels.release=monitoring
  ```

## Redis Caching Layer — Stage 3 Module B

- **Purpose**: Cache task lists in Redis with 60s TTL to reduce PostgreSQL load (cache-aside pattern)
- **Redis**: StatefulSet (`redis-0`) with `volumeClaimTemplates` (1Gi), Headless Service + ClusterIP Service, health probes via `redis-cli ping`
- **Image**: `redis:7-alpine` (pre-pulled into Minikube)
- **npm package**: `redis` (node-redis v4+) — NOT `ioredis` or `redis@3`
- **Client**: `src/lib/redis.ts` — lazy connect singleton with graceful degradation (never throws, returns null on failure)
- **Cache key**: `tasks:{userId}` — invalidated on task create/update/delete
- **Pattern**: Cache-aside (check cache → DB fallback → write cache with TTL)
- **TypeScript note**: `redis` v4 has complex generics — `ReturnType<typeof createClient>` for typing; avoid globalThis pattern (use module-level variable instead)
- **Helm templates**: `templates/redis/` (StatefulSet, headless-service, service) — follows exact MinIO pattern
- **values.yaml**: `redis:` section with `enabled`, `image`, `persistence`, `resources`
- **Main app env var**: `REDIS_URL` added conditionally to deployment when `redis.enabled=true`
- **Foundation for Module C**: Redis instance is shared with the BullMQ worker queue (Module C)
- **Deploy commands**:
  ```bash
  # Pull Redis image into Minikube
  minikube image pull redis:7-alpine

  # Build app image with Redis caching code (from task-manager/, Docker Desktop)
  docker build -t ralf090102/task-manager-app:latest -f Dockerfile .
  minikube ssh "docker rmi -f ralf090102/task-manager-app:latest"
  minikube image load ralf090102/task-manager-app:latest

  # Helm upgrade with Redis enabled
  # NOTE: --reuse-values does NOT read new values.yaml keys!
  # Must pass ALL redis.* values via --set on first deploy:
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

  # Subsequent upgrades only need --reuse-values:
  helm upgrade task-manager ./helm-chart --namespace task-manager --reuse-values --no-hooks

  # Verify Redis is running and healthy:
  kubectl exec task-manager-redis-0 -n task-manager -- redis-cli PING
  # Expected: PONG

  # Check cache keys (after loading the dashboard to trigger cache write):
  kubectl exec task-manager-redis-0 -n task-manager -- redis-cli DBSIZE
  kubectl exec task-manager-redis-0 -n task-manager -- redis-cli KEYS "*"
  kubectl exec task-manager-redis-0 -n task-manager -- redis-cli TTL "tasks:<userId>"
  # TTL should be 50-60 seconds
  ```

## BullMQ Worker Queue — Stage 3 Module C

- **Purpose**: Durable background job processing via BullMQ (Redis-backed queue) — replaces fire-and-forget HTTP calls for search indexing and overdue notifications
- **Worker service**: `services/worker/` — Node.js microservice consuming jobs from `task-events` queue
- **npm packages**: `bullmq` and `ioredis` (both required — BullMQ uses ioredis internally with `maxRetriesPerRequest: null`)
- **CRITICAL Next.js config**: `serverExternalPackages: ["bullmq", "ioredis"]` in `next.config.ts` — without this, Next.js standalone output tracing omits these packages and `enqueueTaskEvent` fails silently
- **Worker**: `services/worker/src/index.ts` — BullMQ Worker on queue `task-events`
  - Job handlers: `search.index` (POST to search-sync `/sync/task`), `search.remove` (DELETE to search-sync), `task.overdue.check` (query DB for overdue tasks, create notifications)
  - Repeatable job: hourly overdue check (`0 * * * *` cron)
  - Health server on port 3007 (`{"status":"ok","queue":"task-events"}`)
  - Graceful shutdown on SIGTERM/SIGINT
- **Queue client**: `src/lib/queue.ts` — `enqueueTaskEvent(name, data)` with graceful degradation (never throws, logs warning on failure)
  - Job config: attempts 3, exponential backoff 2000ms, removeOnComplete: 100, removeOnFail: 200
- **Task API integration**: POST `/api/tasks` → enqueue `search.index`; PUT → enqueue `search.index`; DELETE → enqueue `search.remove`
- **Shared Redis**: Worker and main app both connect to the same Redis instance (from Module B)
- **Helm templates**: `templates/worker/` (Deployment with health probes, Service ClusterIP:3007)
- **values.yaml**: `worker:` section with `enabled`, `image`, `resources`
- **Image**: `ralf090102/worker-service:latest`
- **Build context**: `task-manager/` (same as other services)
- **Deploy commands**:
  ```bash
  # Build worker image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/worker-service:latest -f services/worker/Dockerfile .
  minikube image load ralf090102/worker-service:latest

  # Helm upgrade (values.yaml already has worker config)
  helm upgrade task-manager ./helm-chart --namespace task-manager --reuse-values --no-hooks

  # Verify worker health:
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-worker:3007/health').then(r=>r.json()).then(j=>console.log(j))"
  # Expected: {"status":"ok","queue":"task-events"}

  # Check BullMQ queue keys in Redis:
  kubectl exec task-manager-redis-0 -n task-manager -- redis-cli KEYS "bull:task-events:*"

  # Check worker logs for job processing:
  kubectl logs deployment/task-manager-worker -n task-manager --tail=10
  # Expected: "processing job: search.index", "task indexed in meilisearch", "job completed: search.index"
  ```

## Alerting Rules — Stage 3 Module D

- **Purpose**: Proactive monitoring — PrometheusRules define alert conditions that fire automatically based on metric thresholds, sent to Alertmanager for routing/notifications
- **PrometheusRule CRD**: `templates/prometheusrule.yaml` — 5 alert rules, conditional on `.Values.alerting.enabled`
- **Label requirement**: `release: monitoring` on the PrometheusRule — Prometheus Operator uses `ruleSelector.matchLabels.release=monitoring` to discover rules
- **Helm escaping**: Prometheus annotation templates (`{{ $labels.xxx }}`) must be escaped in Helm using `` {{` {{ $labels.xxx }} `}} `` — otherwise Helm tries to evaluate them as Go template variables
- **Alert rules**:
  - `TaskManagerDown` — `up{job="task-manager"} == 0` for 2m — **critical** — main app unreachable
  - `HighErrorRate` — 5xx rate >10% per route for 5m — **critical** — uses `http_request_duration_seconds_count{status_code=~"5.."}`
  - `PodCrashLooping` — `increase(kube_pod_container_status_restarts_total[15m]) > 3` for 1m — **warning** — any pod in namespace
  - `NoTaskActivity` — `sum(rate(task_operations_total[10m])) == 0` for 10m — **warning** — potential outage/auth failure
  - `PersistentVolumeAlmostFull` — PVC usage >85% for 10m — **warning** — Redis, MinIO, Meilisearch volumes
- **Alert lifecycle**: `inactive` → `pending` (condition true, waiting for `for` duration) → `firing` (condition true for full duration) → `resolved` (condition cleared)
- **Alertmanager**: Already installed by `kube-prometheus-stack` — no additional installation needed
- **values.yaml**: `alerting.enabled: true` (simple toggle, thresholds hardcoded in template for readability)
- **Deploy commands**:
  ```bash
  # Helm upgrade (first time: must pass alerting.enabled via --set since it's a new key)
  helm upgrade task-manager ./helm-chart --namespace task-manager --reuse-values --no-hooks --set alerting.enabled=true

  # Verify PrometheusRule exists:
  kubectl get prometheusrule -n task-manager
  # Expected: task-manager-alerts

  # Verify rules loaded in Prometheus:
  kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
  # Open http://localhost:9090/rules or query API:
  curl http://localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="task-manager")'

  # Check active alerts:
  curl http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.labels.alertname | startswith("Task") or startswith("High") or startswith("Pod") or startswith("No") or startswith("Persistent"))'

  # Access Alertmanager UI:
  kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-alertmanager 9093:9093
  # Open http://localhost:9093 — see firing/pending alerts, silences, status

  # Test: trigger TaskManagerDown by scaling down:
  kubectl scale deployment task-manager -n task-manager --replicas=0
  # Wait 2+ minutes, check Alertmanager UI
  kubectl scale deployment task-manager -n task-manager --replicas=1
  ```

## GitOps with ArgoCD — Stage 3 Module F

- **Purpose**: Git-driven deployments — every `git push` to main triggers an automatic Helm chart sync. No more manual `helm upgrade`. Git is the single source of truth.
- **ArgoCD**: Installed via Helm in `argocd` namespace (server, repo-server, application-controller, redis)
- **Application CRD**: `task-manager/argocd/application.yaml` — points to GitHub repo main branch, path `task-manager/helm-chart`, automated sync with `prune: true` + `selfHeal: true`
- **Chart changes for GitOps compatibility**:
  - `values.yaml`: `secrets.enabled: false` (default off — ArgoCD mode pre-creates Secrets manually; set to `true` for manual `helm upgrade --set` deploys)
  - `templates/secret.yaml`: Conditional `{{- if .Values.secrets.enabled }}` — main Secret not rendered by ArgoCD
  - `templates/team-service/db-migration-job.yaml`: Gated on `teamService.enabled AND secrets.enabled` — Helm hooks conflict with ArgoCD sync, so disabled in GitOps mode
- **Secrets (pre-created in cluster)**: `task-manager-secret` (database-url, nextauth-secret, nextauth-url, auth-trust-host) must exist before applying the Application CRD
- **Repo visibility**: Repo must be PUBLIC for ArgoCD to access without credentials (or configure a repository credential for private repos)
- **Self-healing verified**: Manual `kubectl scale deployment task-manager --replicas=3` reverted to 1 within 35 seconds
- **35+ resources tracked**: All Deployments, StatefulSets, Services, CronJobs, PrometheusRule, ServiceMonitor, Ingress, Secrets, ConfigMaps
- Accessing ArgoCD UI:
  ```bash
  # Port-forward the UI
  kubectl port-forward -n argocd svc/argocd-server 8080:443
  # Open https://localhost:8080 (admin / password from:)

  # Get initial admin password
  kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
  ```
- Deploying via GitOps:
  ```bash
  # Make a change to helm-chart/, commit, push
  git add task-manager/helm-chart/
  git commit -m "feat: update resource limits"
  git push origin main
  # ArgoCD detects change within ~3 minutes (default poll interval), auto-syncs

  # Force immediate refresh
  kubectl patch application task-manager -n argocd --type merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'

  # Check sync status
  kubectl get application task-manager -n argocd
  # Expected: Synced / Healthy
  ```

## Microservices Expansion — Stage 2

### Overview

Expanding the monolith into a microservices architecture. 8 planned modules across 4 phases. Module 7 (Scheduler), Module 1 (Notification), Module 2 (File Service + MinIO), and Module 5 (Search Sync + Meilisearch) are implemented.

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
  # Build scheduler image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/scheduler-service:latest -f services/scheduler/Dockerfile .
  minikube image load ralf090102/scheduler-service:latest

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
  # Build notification image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/notification-service:latest -f services/notification/Dockerfile .
  minikube image load ralf090102/notification-service:latest

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

### Module 2: File Service + MinIO (Phase 2)

- **Service**: `services/file-service/` — Node.js Fastify HTTP microservice with S3-compatible storage
- **Purpose**: File upload/download for task attachments
- **Runtime**: `tsx` (same pattern as scheduler/notification)
- **Port**: 3005 (ClusterIP only — no Ingress, internal access only)
- **Endpoints**: `GET /health`, `POST /upload` (multipart, `x-task-id` header), `GET /download/:id`, `GET /attachments/:taskId`, `DELETE /attachments/:id`
- **Storage**: MinIO (S3-compatible) running as StatefulSet with persistent volume
- **Schema**: `Attachment` model (id, taskId, filename, mimeType, size, storageKey, createdAt)
- **MinIO**: StatefulSet (`minio-0`) with `volumeClaimTemplates` (10Gi), Headless Service + ClusterIP Service, health probes at `/minio/health/live` and `/minio/health/ready`
- **Bucket**: Auto-created on startup with retry logic (exponential backoff)
- **initContainer**: Waits for MinIO health endpoint before file-service starts (prevents startup race condition)
- **Helm templates**: `templates/minio/` (StatefulSet, headless-service, service, secret), `templates/file-service/` (Deployment with initContainer, Service)
- **values.yaml**: `minio:` section (enabled, image, persistence, accessKey/secretKey, resources), `fileService:` section (enabled, image, resources)
- **Image**: `ralf090102/file-service:latest`, `minio/minio:latest`
- **Build context**: `task-manager/` (same as other services)
- **Deploy commands**:
  ```bash
  # Build file-service image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/file-service:latest -f services/file-service/Dockerfile .
  minikube image load ralf090102/file-service:latest

  # Helm upgrade with MinIO + file-service enabled
  # NOTE: --reuse-values does NOT read new values.yaml keys!
  # Must pass ALL minio.* and fileService.* values via --set on first deploy:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values \
    --set minio.enabled=true \
    --set minio.image.repository=minio/minio \
    --set minio.image.tag=latest \
    --set minio.image.pullPolicy=Never \
    --set minio.persistence.size=10Gi \
    --set minio.accessKey=minioadmin \
    --set minio.secretKey=minioadmin \
    --set minio.resources.limits.cpu=250m \
    --set minio.resources.limits.memory=512Mi \
    --set minio.resources.requests.cpu=100m \
    --set minio.resources.requests.memory=256Mi \
    --set fileService.enabled=true \
    --set fileService.image.repository=ralf090102/file-service \
    --set fileService.image.tag=latest \
    --set fileService.image.pullPolicy=Never \
    --set fileService.resources.limits.cpu=250m \
    --set fileService.resources.limits.memory=256Mi \
    --set fileService.resources.requests.cpu=100m \
    --set fileService.resources.requests.memory=128Mi

  # Subsequent upgrades only need --reuse-values:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values

  # Test health endpoints:
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-minio:9000/minio/health/live').then(r=>console.log('MinIO:',r.status))"
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-file-service:3005/health').then(r=>r.json()).then(j=>console.log(j))"

  # Debug via test script (inside file-service pod):
  kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts bucket
  kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts tasks
  kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts attachments
  ```

### Module 5: Search Sync + Meilisearch (Phase 2)

- **Service**: `services/search-sync/` — Node.js Fastify HTTP microservice that syncs PostgreSQL tasks to Meilisearch
- **Purpose**: Full-text search indexing — bulk reindex and incremental document sync
- **Runtime**: `tsx` (same pattern as other services)
- **Port**: 3006 (ClusterIP only — no Ingress, internal access only)
- **Endpoints**: `GET /health`, `POST /sync/task` (incremental), `DELETE /sync/task/:id`, `POST /sync/all` (bulk reindex)
- **Search engine**: Meilisearch (`getmeili/meilisearch:v1.6`) running as StatefulSet with persistent volume (5Gi)
- **Meilisearch**: StatefulSet (`meilisearch-0`) with `volumeClaimTemplates` (5Gi), Headless Service + ClusterIP Service, health probe at `/health`, `MEILI_ENV=production` requires `MEILI_MASTER_KEY`
- **Primary key**: Must be explicitly set via `createIndex("tasks", { primaryKey: "id" })` — Meilisearch can't infer it when multiple fields end with "id" (e.g., `id` and `userId`)
- **Index config**: Configured on startup — searchable: `["title", "description"]`, filterable: `["status", "priority", "userId"]`
- **initContainer**: Waits for Meilisearch `/health` endpoint before search-sync starts (same pattern as file-service/MinIO)
- **Main app endpoint**: `GET /api/tasks/search?q=...&status=...&priority=...` — queries Meilisearch directly, scoped by `userId` filter
- **Main app env vars**: `MEILI_URL` and `MEILI_MASTER_KEY` added conditionally to deployment when `meilisearch.enabled=true`
- **Helm templates**: `templates/search/` (StatefulSet, headless-service, service, secret), `templates/search-sync/` (Deployment with initContainer, Service)
- **values.yaml**: `meilisearch:` section (enabled, image, persistence, masterKey, resources), `searchSync:` section (enabled, image, resources)
- **Image**: `ralf090102/search-sync-service:latest`, `getmeili/meilisearch:v1.6`
- **Build context**: `task-manager/` (same as other services)
- **Deploy commands**:
  ```bash
  # Build search-sync image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/search-sync-service:latest -f services/search-sync/Dockerfile .
  minikube image load ralf090102/search-sync-service:latest

  # Pull Meilisearch image into Minikube
  minikube image pull getmeili/meilisearch:v1.6

  # Helm upgrade with Meilisearch + search-sync enabled
  # NOTE: --reuse-values does NOT read new values.yaml keys!
  # Must pass ALL meilisearch.* and searchSync.* values via --set on first deploy:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values \
    --set meilisearch.enabled=true \
    --set meilisearch.image.repository=getmeili/meilisearch \
    --set meilisearch.image.tag=v1.6 \
    --set meilisearch.image.pullPolicy=Never \
    --set meilisearch.persistence.size=5Gi \
    --set meilisearch.masterKey="meili-master-key-change-me" \
    --set meilisearch.resources.limits.cpu=250m \
    --set meilisearch.resources.limits.memory=512Mi \
    --set meilisearch.resources.requests.cpu=100m \
    --set meilisearch.resources.requests.memory=256Mi \
    --set searchSync.enabled=true \
    --set searchSync.image.repository=ralf090102/search-sync-service \
    --set searchSync.image.tag=latest \
    --set searchSync.image.pullPolicy=Never \
    --set searchSync.resources.limits.cpu=250m \
    --set searchSync.resources.limits.memory=256Mi \
    --set searchSync.resources.requests.cpu=100m \
    --set searchSync.resources.requests.memory=128Mi

  # Subsequent upgrades only need --reuse-values:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values

  # Test health endpoints:
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-meilisearch:7700/health').then(r=>r.json()).then(j=>console.log(j))"
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-search-sync:3006/health').then(r=>r.json()).then(j=>console.log(j))"

  # Trigger bulk reindex (initial sync):
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-search-sync:3006/sync/all',{method:'POST'}).then(r=>r.json()).then(j=>console.log(j))"

  # Query Meilisearch directly (via REST API with base64 encoding for PowerShell):
  $script = "fetch('http://task-manager-meilisearch:7700/indexes/tasks/stats',{headers:{Authorization:'Bearer meili-master-key-change-me'}}).then(r=>r.json()).then(t=>console.log(JSON.stringify(t)))"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
  kubectl exec deployment/task-manager -n task-manager -- node -e "eval(Buffer.from('$encoded','base64').toString())"
  ```

### Module 3: Analytics & Reporting Service (Phase 3)

- **Service**: `services/analytics/` — Python FastAPI analytics microservice (polyglot)
- **Purpose**: Productivity analytics — task completion rates, daily history, priority breakdown, weekly reports
- **Runtime**: Python 3.12 with uvicorn (NOT tsx/Node.js — this is the first polyglot service)
- **Port**: 8000 (ClusterIP only — no Ingress, internal access only)
- **Database access**: Raw SQL via `asyncpg` (NOT Prisma — Python service uses its own DB driver)
- **pgbouncer compatibility**: `statement_cache_size=0` required — Supabase connection pooler doesn't support prepared statements
- **DATABASE_URL cleaning**: Strips `?pgbouncer=true&connection_limit=1` query params before passing to asyncpg
- **Endpoints**: `GET /health`, `GET /stats/summary/{user_id}` (status counts, completion rate, 30-day daily history), `GET /stats/productivity/{user_id}` (by-priority breakdown)
- **CronJob**: `scripts/weekly_report.py` — generates matplotlib charts, creates in-app Notification records, runs every Monday 9 AM UTC
- **Main app integration**:
  - `src/app/api/stats/route.ts` — proxies requests to analytics service (auth-scoped, passes user ID)
  - `src/components/StatsWidget.tsx` — dashboard widget showing total/completed/rate/priority stats
- **Helm templates**: `templates/analytics/` — Deployment, Service (ClusterIP), CronJob (weekly report)
- **values.yaml**: `analytics:` section with `enabled`, `image`, `cronSchedule`, `resources`
- **Image**: `ralf090102/analytics-service:latest`
- **Build context**: `task-manager/` (same as other services)
- **PYTHONUNBUFFERED=1**: Required for real-time log output in K8s
- **Deploy commands**:
  ```bash
  # Build analytics image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/analytics-service:latest -f services/analytics/Dockerfile .
  minikube image load ralf090102/analytics-service:latest

  # Helm upgrade with analytics enabled
  # NOTE: --reuse-values does NOT read new values.yaml keys!
  # Must pass ALL analytics.* values via --set on first deploy:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values \
    --set analytics.enabled=true \
    --set analytics.image.repository=ralf090102/analytics-service \
    --set analytics.image.tag=latest \
    --set analytics.image.pullPolicy=Never \
    --set analytics.resources.limits.cpu=250m \
    --set analytics.resources.limits.memory=256Mi \
    --set analytics.resources.requests.cpu=100m \
    --set analytics.resources.requests.memory=128Mi

  # Subsequent upgrades only need --reuse-values:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values

  # Test health endpoint:
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-analytics:8000/health').then(r=>r.json()).then(j=>console.log(j))"
  # Expected: {"status":"ok"}

  # Test stats endpoint (replace user-id with a real cuid):
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-analytics:8000/stats/summary/<user-id>').then(r=>r.json()).then(j=>console.log(j))"
  # Expected: JSON with statusCounts, completionRate, totalTasks, dailyHistory

  # Trigger weekly report manually:
  kubectl create job --from=cronjob/task-manager-weekly-report manual-report -n task-manager
  kubectl logs job/manual-report -n task-manager
  # Expected: "[weekly-report] Done — N reports generated"
  ```

### Module 4: Real-time WebSocket Gateway (Phase 3)

- **Service**: `services/realtime/` — Node.js Socket.io WebSocket gateway
- **Purpose**: Live task board updates, real-time notifications push
- **Runtime**: `tsx` (same pattern as other services)
- **Port**: 3001 (ClusterIP with sessionAffinity — no separate Ingress, routes through main Ingress via `/socket.io` path)
- **No database access**: Pure WebSocket relay — no Prisma, no PostgreSQL
- **JWT auth**: Decrypts NextAuth JWT (`jose.jwtDecrypt`) using shared `NEXTAUTH_SECRET`; extracts `userId` for room routing
- **Endpoints**: `GET /health` (returns connection count), `POST /emit` (internal — main app pushes events)
- **Socket events**: `task:created`, `task:updated`, `task:deleted` (broadcast to `board` room), `presence:online`/`presence:offline`
- **Session affinity**: `sessionAffinity: ClientIP` on Service (sticky sessions — WebSocket connections must persist on one pod)
- **NGINX Ingress**: `/socket.io` path routes to realtime service; WebSocket annotations (`proxy-read-timeout: 3600`, `proxy-send-timeout: 3600`) added when realtime is enabled
- **Main app integration**:
  - `src/lib/realtime.ts` — `emitToRealtime()` helper (fire-and-forget POST to `/emit`)
  - `src/app/api/ws-token/route.ts` — returns NextAuth JWT cookie for frontend Socket.io auth
  - Task API routes emit events after mutations (create/update/delete)
  - `src/components/TaskList.tsx` — Socket.io client listener, refreshes tasks on events, shows "Live" badge
- **Frontend**: `socket.io-client` connects to same origin (Ingress routes `/socket.io/` to realtime pod), auth token from `/api/ws-token`
- **Helm templates**: `templates/realtime/` — Deployment, Service (ClusterIP with sessionAffinity)
- **values.yaml**: `realtime:` section with `enabled`, `replicaCount`, `image`, `corsOrigin`, `resources`
- **Image**: `ralf090102/realtime-service:latest`
- **Build context**: `task-manager/` (same as other services)
- **Deploy commands**:
  ```bash
  # Build realtime image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/realtime-service:latest -f services/realtime/Dockerfile .
  minikube image load ralf090102/realtime-service:latest

  # Helm upgrade with realtime enabled
  # NOTE: --reuse-values does NOT read new values.yaml keys!
  # Must pass ALL realtime.* values via --set on first deploy:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values \
    --set realtime.enabled=true \
    --set realtime.image.repository=ralf090102/realtime-service \
    --set realtime.image.tag=latest \
    --set realtime.image.pullPolicy=Never \
    --set realtime.corsOrigin=http://task-manager.local \
    --set realtime.resources.limits.cpu=250m \
    --set realtime.resources.limits.memory=256Mi \
    --set realtime.resources.requests.cpu=100m \
    --set realtime.resources.requests.memory=128Mi

  # Subsequent upgrades only need --reuse-values:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values

  # Test health endpoint:
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-realtime:3001/health').then(r=>r.json()).then(j=>console.log(j))"
  # Expected: {"status":"ok","connections":0}

  # Test /emit endpoint (internal):
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-realtime:3001/emit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'test:event',room:'board',data:{hello:'world'}})}).then(r=>r.json()).then(j=>console.log(j))"
  # Expected: {"emitted":true,"event":"test:event","room":"board"}
  ```

### Module 6: Webhook Delivery Service (Phase 3)

- **Service**: `services/webhook/` — Node.js Fastify microservice with background delivery worker
- **Purpose**: Delivers HTTP POST callbacks (webhooks) to user-registered URLs when tasks are created/updated/deleted
- **Runtime**: `tsx` (same pattern as other services)
- **Port**: 3003 (ClusterIP only — no Ingress, internal access only)
- **Endpoints**: `GET /health`, `POST /trigger` (internal — main app pushes events)
- **Background worker**: Infinite loop polling `WebhookDelivery` table for pending deliveries every 2s
- **Retry logic**: Exponential backoff (1s, 5s, 30s, 2m, 10m), max 5 attempts, then marked as `failed` (dead letter)
- **HMAC signing**: Each delivery includes `X-Webhook-Signature: sha256=<hex>` header (HMAC of body with webhook secret)
- **ConfigMap**: Retry configuration stored in ConfigMap (`MAX_ATTEMPTS`, `BACKOFF_INTERVALS`, `POLL_INTERVAL_MS`, `DELIVERY_TIMEOUT_MS`) — no image rebuild needed to tune
- **Graceful shutdown**: `SIGTERM`/`SIGINT` handler stops the background loop, waits for in-flight deliveries, closes Fastify + Prisma; `terminationGracePeriodSeconds: 35`
- **Schema**: `Webhook` model (id, userId, url, events[], secret, active) and `WebhookDelivery` model (id, webhookId, event, payload, statusCode, response, attempts, maxAttempts, nextRetryAt, deliveredAt, status)
- **Main app integration**:
  - `src/lib/webhook.ts` — `triggerWebhook()` helper (fire-and-forget POST to `/trigger`)
  - Task API routes emit webhook events after mutations (create/update/delete)
  - `src/app/api/webhooks/route.ts` — GET list, POST create (auto-generates HMAC secret)
  - `src/app/api/webhooks/[id]/route.ts` — GET detail (with delivery history), PATCH update, DELETE
- **Helm templates**: `templates/webhook/` — Deployment, Service (ClusterIP), ConfigMap
- **values.yaml**: `webhook:` section with `enabled`, `image`, `retry` (maxAttempts, intervals), `resources`
- **Image**: `ralf090102/webhook-service:latest`
- **Build context**: `task-manager/` (same as other services)
- **Deploy commands**:
  ```bash
  # Build webhook image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/webhook-service:latest -f services/webhook/Dockerfile .
  minikube image load ralf090102/webhook-service:latest

  # Helm upgrade with webhook enabled
  # NOTE: --reuse-values does NOT read new values.yaml keys!
  # Must pass ALL webhook.* values via --set on first deploy:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values \
    --set webhook.enabled=true \
    --set webhook.image.repository=ralf090102/webhook-service \
    --set webhook.image.tag=latest \
    --set webhook.image.pullPolicy=Never \
    --set webhook.resources.limits.cpu=250m \
    --set webhook.resources.limits.memory=256Mi \
    --set webhook.resources.requests.cpu=100m \
    --set webhook.resources.requests.memory=128Mi

  # Subsequent upgrades only need --reuse-values:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values

  # Test health endpoint:
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-webhook:3003/health').then(r=>r.json()).then(j=>console.log(j))"
  # Expected: {"status":"ok"}

  # Test /trigger endpoint (no webhooks registered → 0 queued):
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-webhook:3003/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'task.created',data:{id:'test',title:'Test'},userId:'test'})}).then(r=>r.json()).then(j=>console.log(j))"
  # Expected: {"queued":0}

  # Check ConfigMap:
  kubectl get configmap task-manager-webhook-config -n task-manager -o yaml
  # Expected: MAX_ATTEMPTS: "5", BACKOFF_INTERVALS: "1,5,30,120,600"
  ```

### Module 8: Team & Workspace Management (Phase 4)

- **Service**: `services/team-service/` — Node.js Fastify microservice for multi-user collaboration
- **Purpose**: Teams, boards (Kanban), member management with RBAC (Admin/Member/Viewer), activity feed
- **Runtime**: `tsx` (same pattern as notification/webhook)
- **Port**: 3002 (ClusterIP only — no Ingress, internal access only)
- **Authentication**: `X-User-Id` header injected by the main app proxy (main app authenticates via NextAuth, passes userId to team-service)
- **Endpoints**: `GET/POST /teams`, `GET/DELETE /teams/:id`, `POST /teams/:id/invite`, `PATCH/DELETE /teams/:id/members/:memberId`, `GET/POST /teams/:id/boards`, `GET/DELETE /teams/:id/boards/:boardId`, `GET /teams/:id/activity`
- **Schema**: `Team` (id, name, slug, ownerId), `Member` (id, teamId, userId, role), `Board` (id, teamId, name, color), `Activity` (id, teamId, userId, type, taskId, metadata). Task model extended with optional `boardId` and `assigneeId`. New enums: `MemberRole` (ADMIN/MEMBER/VIEWER), `ActivityType` (TASK_CREATED/MEMBER_JOINED/BOARD_CREATED/etc.)
- **RBAC**: `requireMember()` / `requireAdmin()` helper functions enforce access control. Only admins can invite/remove members or delete teams. Viewers get read-only access.
- **Slug generation**: Auto-generates URL-friendly slug from team name, appends timestamp if slug already exists
- **Activity feed**: Auto-created on key events (member join/leave, board creation)
- **Helm templates**: `templates/team-service/` — Deployment, Service (ClusterIP), db-migration-job.yaml (Helm pre-upgrade hook)
- **DB Migration Hook**: `helm.sh/hook: pre-upgrade,pre-install` with `helm.sh/hook-weight: "-5"` — runs `prisma db push --accept-data-loss` before the deployment rolls out
- **values.yaml**: `teamService:` section with `enabled`, `image`, `resources`
- **Main app integration**:
  - `src/lib/team-proxy.ts` — `teamProxy()` helper (authenticates user, adds `X-User-Id` header, forwards to team-service)
  - API routes: `src/app/api/teams/route.ts`, `src/app/api/teams/[id]/route.ts`, members, boards, activity sub-routes
  - Conditional `TEAM_SERVICE_URL` env var in main app deployment
- **Frontend**:
  - `/teams` page — list teams, create new team
  - `/teams/[id]` page — team detail with boards and members tabs, invite members, manage roles
  - `/teams/[id]/boards/[boardId]` page — Kanban board view (drag-and-drop task columns)
  - Navbar "Teams" link (visible when logged in)
- **Image**: `ralf090102/team-service:latest`
- **Build context**: `task-manager/` (same as other services)
- **Deploy commands**:
  ```bash
  # Build team-service image (from task-manager/, Docker Desktop)
  docker build -t ralf090102/team-service:latest -f services/team-service/Dockerfile .
  minikube image load ralf090102/team-service:latest

  # Helm upgrade with team-service enabled
  # NOTE: --reuse-values does NOT read new values.yaml keys!
  # Must pass ALL teamService.* values via --set on first deploy:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager \
    --reuse-values \
    --set teamService.enabled=true \
    --set teamService.image.repository=ralf090102/team-service \
    --set teamService.image.tag=latest \
    --set teamService.image.pullPolicy=Never \
    --set teamService.resources.limits.cpu=250m \
    --set teamService.resources.limits.memory=256Mi \
    --set teamService.resources.requests.cpu=100m \
    --set teamService.resources.requests.memory=128Mi

  # Subsequent upgrades only need --reuse-values:
  helm upgrade task-manager ./task-manager/helm-chart --namespace task-manager --reuse-values

  # Test health endpoint:
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-team-service:3002/health').then(r=>r.json()).then(j=>console.log(j))"
  # Expected: {"status":"ok"}

  # Create a team (via main app proxy — requires X-User-Id which the proxy injects):
  kubectl exec deployment/task-manager -n task-manager -- node -e "fetch('http://task-manager-team-service:3002/teams',{method:'POST',headers:{'Content-Type':'application/json','X-User-Id':'<your-user-id>'},body:JSON.stringify({name:'Engineering'})}).then(r=>r.json()).then(j=>console.log(j))"

  # Check DB migration Job:
  kubectl get jobs -n task-manager
  # Expected: task-manager-db-migration completed
  ```

### Service Selector Labels (Critical)

The main app Deployment and Service MUST have `app.kubernetes.io/component: app` in their labels/selectors. Without it, the main app Service selector (`app.kubernetes.io/name=task-manager` + `app.kubernetes.io/instance=task-manager`) matches ALL pods with those base labels — including notification pods. This causes traffic to be load-balanced across both pods (Fastify returns 404 for Next.js routes like `/dashboard`).

**Rule**: Every service's Deployment pod template and Service selector must include a unique `app.kubernetes.io/component` label:
- Main app: `app.kubernetes.io/component: app`
- Notification: `app.kubernetes.io/component: notification`
- File service: `app.kubernetes.io/component: file-service`
- MinIO: `app.kubernetes.io/component: minio`
- Meilisearch: `app.kubernetes.io/component: meilisearch`
- Search sync: `app.kubernetes.io/component: search-sync`
- Realtime: `app.kubernetes.io/component: realtime`
- Analytics: `app.kubernetes.io/component: analytics`
- Webhook: `app.kubernetes.io/component: webhook`
- Team service: `app.kubernetes.io/component: team-service`
- Scheduler: N/A (CronJob, no Service)

### Microservice Pattern (reusable for future services)

Each Node.js microservice follows this structure:
```
services/<name>/
├── package.json          # "type": "module", tsx as dependency
├── tsconfig.json         # moduleResolution: "bundler", noEmit: true
├── prisma.config.ts      # Minimal config pointing to shared schema (omit if no DB access)
├── src/index.ts          # imports from ./generated/prisma/client.ts (omit if no DB access)
├── scripts/test.ts       # Debug/test commands (run via npx tsx in pod)
├── Dockerfile            # copies shared schema, runs prisma generate, uses tsx (omit prisma if no DB)
└── .gitignore
```

**Note**: Services that don't need database access (e.g., realtime service) omit `prisma.config.ts`, `src/generated/`, and the Prisma steps in the Dockerfile. The Dockerfile is simpler: base + builder (no prisma generate) + runner.

### Helm Chart Structure (multi-service)

```
helm-chart/templates/
├── _helpers.tpl              # Shared helpers
├── secret.yaml               # Shared secrets
├── task-manager/             # Main app (deployment, service, ingress, servicemonitor)
├── scheduler/                # Scheduler (cronjob)
├── notification/             # Notification (deployment, service, secret)
├── minio/                    # MinIO (statefulset, headless-service, service, secret)
├── file-service/             # File service (deployment with initContainer, service)
├── search/                   # Meilisearch (statefulset, headless-service, service, secret)
├── search-sync/              # Search sync (deployment with initContainer, service)
├── realtime/                 # Realtime WebSocket (deployment, service with sessionAffinity)
├── analytics/                # Analytics (deployment, service, cronjob)
├── webhook/                  # Webhook (deployment, service, configmap)
└── team-service/             # Team service (deployment, service, db-migration hook)
```

Each service has an `enabled` flag in `values.yaml` for conditional rendering.

### Testing Microservices (ESM + PowerShell)

Microservices use ES modules (`import`) with `tsx` runtime. Testing via `kubectl exec` from PowerShell requires special handling because:
1. `node -e "..."` runs in CommonJS context — `import` syntax fails
2. PowerShell interprets `$` in JavaScript (e.g., `$disconnect`)
3. Nested quoting across PowerShell → kubectl → sh → node is error-prone

**Method 1: Test scripts (recommended)**
Each service has `scripts/test.ts` with reusable debug commands. Run via tsx:
```bash
kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts bucket
kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts tasks
kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx scripts/test.ts attachments
```

**Method 2: tsx + base64 (for ad-hoc one-liners)**
Encode the script as base64 to avoid all escaping issues, then eval with tsx:
```powershell
$script = 'import { PrismaClient } from "./src/generated/prisma/client.ts"; console.log("hello")'
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
kubectl exec deployment/task-manager-file-service -n task-manager -- npx tsx -e "eval(Buffer.from('$encoded','base64').toString())"
```

### Service Dependencies (initContainer Pattern)

When a service depends on another service being ready (e.g., file-service needs MinIO), use an `initContainer` that waits for the dependency's health endpoint. This prevents startup race conditions where the service starts before its dependency is ready.

```yaml
spec:
  initContainers:
    - name: wait-for-minio
      image: busybox:1.35
      command:
        - sh
        - -c
        - 'until wget -q -O /dev/null http://<service-name>:<port>/health; do echo "waiting"; sleep 2; done'
  containers:
    # ... main container ...
```

**Complementary**: Also implement retry logic in the service code (exponential backoff) as a safety net for runtime failures, not just startup.

### Docker Build Workflow (Docker Desktop → Minikube Load)

All images are built with Docker Desktop (host Docker daemon), then loaded into Minikube. This is the default — not a fallback. Docker Desktop has more memory (~16GB+ vs Minikube's ~7GB shared daemon), builds are faster, and OOM kills on large dependency trees (e.g., `@aws-sdk/client-s3`) are eliminated.

`setup-cluster.sh` automates this: parallel `docker build` for all services → force-remove stale images in Minikube → `minikube image load` for each.

For ad-hoc manual rebuilds of a single service:

```bash
# 1. Build with Docker Desktop (from task-manager/)
docker build -t ralf090102/<service>:latest -f services/<service>/Dockerfile .

# 2. IMPORTANT: Force-remove old image from Minikube before loading
#    Minikube caches by tag, not digest — without this, pods keep stale code:
minikube ssh "docker rmi -f ralf090102/<service>:latest"

# 3. Load the freshly built image into Minikube
minikube image load ralf090102/<service>:latest

# 4. Restart the deployment to pick up new image
kubectl rollout restart deployment/task-manager-<service> -n task-manager
```

**Dockerfile pattern for microservices** (avoids parallel `npm ci` OOM):
```dockerfile
FROM node:22-slim AS base
WORKDIR /app
COPY services/<name>/package.json services/<name>/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM base AS builder
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/<name>/prisma.config.ts ./
RUN npx prisma generate
COPY services/<name>/tsconfig.json ./
COPY services/<name>/src/ ./src/
COPY services/<name>/scripts/ ./scripts/

FROM base AS runner
RUN npm prune --omit=dev
ENV NODE_ENV=production
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/scripts/ ./scripts/
CMD ["npx", "tsx", "src/index.ts"]
```

Single `npm ci` in `base` stage (sequential, not parallel). `builder` extends `base` (adds prisma generate + src). `runner` extends `base` (prunes dev deps, copies src from builder).
