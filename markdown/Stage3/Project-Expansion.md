# Project Expansion: Advanced Kubernetes, Helm & Observability

This document outlines expansion modules that build upon the existing Task Manager application. Each module introduces new Kubernetes concepts, Helm patterns, and observability tooling while extending the application with real-world features.

---

## Current Architecture (Baseline)

```
Browser → NGINX Ingress → task-manager (Next.js) ──→ PostgreSQL (Supabase)
                              │  │  │  │
                              │  │  │  └──→ team-service (Fastify, port 3002)
                              │  │  └─────→ webhook-service (Fastify, port 3003) → background delivery loop
                              │  └────────→ notification-service (Fastify, port 3004)
                              └───────────→ file-service (Fastify, port 3005) → MinIO (StatefulSet)
                                             search-sync (Fastify, port 3006) → Meilisearch (StatefulSet)
                                             analytics (FastAPI, port 8000) — Python polyglot
                                             realtime (Socket.io, port 3001) — WebSocket gateway

CronJobs: task-scheduler (every minute)     │    weekly-report (Mondays 9 AM)
                                           ↑
                    Prometheus scrapes /api/metrics (monitoring namespace)
```

**What exists (Stage 2 complete):**

- 8 microservices (Node.js + Python polyglot) deployed as Deployments, StatefulSets, and CronJobs
- External PostgreSQL (Supabase) shared across all services via Prisma
- In-cluster stateful dependencies: MinIO (S3 storage) and Meilisearch (full-text search) as StatefulSets with PVCs
- Prometheus + Grafana monitoring stack in `monitoring` namespace
- pino structured JSON logging to stdout (all Node.js services)
- CI/CD pipeline building 9 Docker images in parallel via matrix strategy
- Fire-and-forget inter-service communication (webhook triggers, notification calls, realtime emits)

**What's still missing:** Autoscaling, progressive delivery. (Log aggregation, Redis caching, queue-based processing, alerting, and GitOps are now complete — Modules A-F.)

---



## Expansion Overview


| Module | Focus Area          | New K8s Concepts                  | New Tooling            |
| ------ | ------------------- | --------------------------------- | ---------------------- |
| A      | Log Aggregation     | DaemonSet, ConfigMap              | Loki, Promtail         |
| B      | Redis Caching       | Cache-aside pattern, TTL strategy | Redis                  |
| C      | Worker Microservice | Message queue, Helm subcharts     | BullMQ                 |
| D      | Alerting            | PrometheusRule CRD                | Alertmanager           |
| E      | Autoscaling         | HPA with Custom Metrics           | Prometheus Adapter, k6 |
| F      | GitOps              | ArgoCD Application CRD            | ArgoCD                 |
| G      | Canary Deployments  | Rollout CRD                       | Argo Rollouts          |


Each module can be implemented independently, but they are ordered by dependency and complexity.

---



## Module A: Log Aggregation with Loki

> **Status: COMPLETE** — Loki + Promtail installed in `monitoring` namespace. Grafana datasource auto-provisioned.



### Problem

With 10+ pods across 8 microservices (Stage 2), pino logs go to each pod's stdout and are only viewable individually via `kubectl logs`. There is no way to search across all services, filter by log level, or correlate logs from multiple services during an incident (e.g., tracing a request from the main app → webhook service → notification service). If a pod restarts, its previous logs are lost.

### Solution

Add **Loki** (log aggregation database) and **Promtail** (log collector agent) to the monitoring stack. Logs flow alongside metrics into Grafana, giving you a unified observability dashboard.

### Architecture

```
Pod stdout → Promtail (DaemonSet) → Loki → Grafana Logs panel
                                          ↕
                               Prometheus metrics (existing)
```



### What You'll Learn

- **DaemonSet**: A workload that runs one pod on every node (Promtail needs to be on each node to read container logs from the node's filesystem)
- **ConfigMap**: Configuration data injected into pods at runtime (Promtail config: which logs to scrape, how to parse them, which labels to add)
- **Log pipeline**: scrape → relabel → parse (JSON) → ship → store → query



### Implementation Steps

1. **Install Loki via Helm**

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set loki.persistence.enabled=true \
  --set loki.persistence.size=5Gi \
  --set promtail.enabled=true \
  --set promtail.config.snippets.pipelineStages[0].json.expressions.level=level \
  --set promtail.config.snippets.pipelineStages[0].json.expressions.msg=msg \
  --set promtail.config.snippets.pipelineStages[0].json.expressions.time=time
```

1. **Add Loki as a Grafana datasource** (the Loki stack Helm chart can auto-configure this, or you add it manually in Grafana > Configuration > Data Sources > Add Loki)
2. **Query logs in Grafana**

```logql
# All logs from task-manager namespace
{namespace="task-manager"}

# Only error-level logs
{namespace="task-manager"} |= "level\":\"error"

# Logs correlated with a metric spike (Grafana split view)
{namespace="task-manager"} |= "Task created"
```



### New K8s Resources

- `DaemonSet/loki-promtail` — One pod per node, reads `/var/log/pods/*`
- `StatefulSet/loki` — Stores logs with persistent volume
- `ConfigMap/loki-promtail` — Pipeline configuration (JSON parsing, label extraction)



### Helm Changes

No changes to the task-manager chart. Loki is installed as a separate release in the `monitoring` namespace alongside the existing `kube-prometheus-stack`.

---



## Module B: Redis Caching Layer

> **Status: COMPLETE** — Redis StatefulSet deployed with 1Gi PVC. Cache-aside pattern implemented in `/api/tasks` with 60s TTL. Cache key: `tasks:{userId}`, invalidated on mutations.

### Problem

Every page load and API call hits PostgreSQL. For a task list that rarely changes between updates, this is unnecessary load. Adding a caching layer reduces database pressure and improves response times.

### Solution

Deploy **Redis** inside the Kubernetes cluster as a StatefulSet with persistent storage. The Next.js app caches task lists in Redis with a TTL, falling back to PostgreSQL on cache miss.

### Architecture

```
Browser → task-manager → Redis (cache)  → MISS → PostgreSQL → write back to Redis
                        ↘ HIT → return cached data
```



### What You'll Learn

- **Redis StatefulSet**: Apply the StatefulSet pattern from Stage 2 (MinIO, Meilisearch) to a new stateful workload — this is your third StatefulSet type
- **Cache-aside pattern**: Application checks cache first, then database, then writes result back to cache
- **Cache invalidation**: Clearing cached data when tasks are created/updated/deleted
- **TTL strategy**: Balancing freshness vs. performance with expiry times
- **Foundation for Module C**: Redis is required by the BullMQ worker queue in Module C



### Implementation Steps

1. **Add Redis to the Helm chart** (as a subchart or inline StatefulSet template)

```yaml
# task-manager/helm-chart/templates/redis-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
```

1. **Add Redis Service** (headless for StatefulSet DNS)

```yaml
# task-manager/helm-chart/templates/redis-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector:
    app: redis
  ports:
    - port: 6379
```

1. **Integrate Redis client in Next.js**

```typescript
// src/lib/redis.ts
import { createClient } from "redis";

const client = createClient({ url: process.env.REDIS_URL || "redis://redis:6379" });
client.connect();

export default client;
```

1. **Cache task lists in API routes**

```typescript
// src/app/api/tasks/route.ts (GET handler)
const cacheKey = `tasks:${session.user.id}`;
const cached = await redis.get(cacheKey);
if (cached) {
  return NextResponse.json(JSON.parse(cached));
}
// ... fetch from PostgreSQL ...
await redis.setex(cacheKey, 60, JSON.stringify(tasks)); // 60s TTL
```

1. **Invalidate cache on mutations**

```typescript
// After create/update/delete:
await redis.del(`tasks:${session.user.id}`);
```



### New K8s Resources

- `StatefulSet/redis` — Redis with persistent volume
- `Service/redis` — Headless service for StatefulSet
- `PersistentVolumeClaim/redis-data-redis-0` — 1Gi persistent storage



### Helm Changes

- Add `redis.enabled` toggle to `values.yaml`
- Add `secrets.redisUrl` configurable value
- Add `templates/redis-statefulset.yaml` and `templates/redis-service.yaml`
- Add `REDIS_URL` env var to the task-manager deployment

---



## Module C: Background Worker Microservice

> **Status: COMPLETE** — BullMQ worker service deployed. Queue `task-events` with handlers: `search.index`, `search.remove`, `task.overdue.check` (hourly repeatable). Main app enqueues jobs via `src/lib/queue.ts`. E2E verified: task created → job enqueued → worker indexes in Meilisearch (60→61 docs).

### Problem

Stage 2 already introduced several background processing patterns: the webhook service has a polling-based delivery loop, the scheduler is a CronJob, and the analytics weekly report runs on a schedule. However, these are isolated — there's no centralized job queue. The Next.js app still handles some work synchronously (email notifications, search index updates) via fire-and-forget HTTP calls that can silently fail.

### Solution

Introduce a **queue-based worker microservice** using BullMQ (Redis-backed job queue). The main app enqueues jobs (task completed, send summary, check overdue) instead of making fire-and-forget HTTP calls. A dedicated worker pod consumes jobs with retries, delays, and priority — more reliable than the fire-and-forget pattern used for notifications and webhooks in Stage 2.

### Architecture

```
task-manager (Next.js)
  │
  ├── enqueue job ──→ Redis (BullMQ queue)
  │                        │
  │                   worker-service (separate pod)
  │                        ├── send notification email (retries on failure)
  │                        ├── generate daily summary
  │                        └── check overdue tasks
  │
  └── user requests (fast, non-blocking)
```



### What You'll Learn

- **Message queue pattern**: Contrast with the fire-and-forget HTTP calls used for webhook/notification/realtime triggers in Stage 2 — queues add durability, retries, and visibility
- **Producer-consumer with BullMQ**: Web app enqueues jobs, worker consumes them; jobs survive pod restarts
- **Helm subcharts / umbrella chart**: Restructuring the monolithic multi-service chart into a parent + subcharts organization
- **Shared infrastructure**: Both web app and worker read from the same Redis instance (from Module B) and the same PostgreSQL



### Implementation Steps

1. **Create worker service** (separate Node.js project or Next.js API cron route)

```typescript
// worker/src/index.ts
import { Worker } from "bullmq";
import { connection } from "./redis";

const worker = new Worker("task-events", async (job) => {
  switch (job.data.type) {
    case "task.completed":
      // Send notification, update stats
      break;
    case "task.overdue":
      // Check and notify overdue tasks
      break;
    case "daily.summary":
      // Generate and send daily summary
      break;
  }
});

// Cron: check overdue tasks every hour
import { Queue } from "bullmq";
const queue = new Queue("task-events", { connection });
setInterval(() => {
  queue.add("check-overdue", { type: "task.overdue" }, { repeat: { pattern: "0 * * * *" }});
}, 3600000);
```

1. **Enqueue jobs from the web app**

```typescript
// After task completion in task-manager:
await queue.add("task-event", {
  type: "task.completed",
  taskId: task.id,
  userId: session.user.id,
});
```

1. **Add worker Deployment to Helm chart**

```yaml
# task-manager/helm-chart/templates/worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "task-manager.fullname" . }}-worker
spec:
  replicas: {{ .Values.worker.replicaCount }}
  selector:
    matchLabels:
      app: task-manager-worker
  template:
    spec:
      containers:
        - name: worker
          image: "{{ .Values.worker.image.repository }}:{{ .Values.worker.image.tag }}"
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secrets
                  key: redis-url
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ include "task-manager.fullname" . }}-secrets
                  key: database-url
```

1. **Add ServiceMonitor for the worker** (worker exposes its own `/metrics` endpoint)



### New K8s Resources

- `Deployment/task-manager-worker` — Separate pod for background processing
- Worker has its own image (`ralf090102/task-manager-worker:latest`)
- Worker shares Secrets with the web app (same database, same Redis)



### Helm Changes

- Add `worker:` section to `values.yaml` (replicaCount, image, resources)
- Add `templates/worker-deployment.yaml`
- Add `templates/worker-servicemonitor.yaml`
- Consider splitting into an **umbrella chart** structure:
  ```
  helm-chart/
  ├── Chart.yaml
  ├── values.yaml
  └── charts/
      ├── web/       # task-manager Next.js
      ├── worker/    # background worker
      └── redis/     # Redis StatefulSet
  ```

---



## Module D: Alerting Rules with Alertmanager

> **Status: COMPLETE** — PrometheusRule with 5 alerts deployed: TaskManagerDown, HighErrorRate, PodCrashLooping, NoTaskActivity, PersistentVolumeAlmostFull. Verified in Prometheus and Alertmanager. Alert lifecycle confirmed (inactive → pending → firing).



### Problem

Currently, you have to manually check Grafana dashboards to notice problems. In production, you need proactive alerting — the system should notify you when something goes wrong.

### Solution

Define **PrometheusRules** (alert conditions) and configure **Alertmanager** (notification routing). Alerts fire automatically based on metric thresholds.

### What You'll Learn

- **PrometheusRule CRD**: Declarative alert definitions managed by the Prometheus Operator
- **Alert lifecycle**: Metric threshold crossed → Pending → Firing → Resolved
- **Alertmanager routing**: Group, deduplicate, silence, and route alerts to different receivers
- **Runbooks**: Documentation for what to do when each alert fires



### Implementation Steps

1. **Create PrometheusRule**

```yaml
# task-manager/helm-chart/templates/prometheusrule.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: {{ include "task-manager.fullname" . }}-alerts
  labels:
    release: monitoring
spec:
  groups:
    - name: task-manager
      rules:
        # Alert: High error rate on main app
        - alert: HighErrorRate
          expr: |
            rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]) /
            rate(http_request_duration_seconds_count[5m]) > 0.1
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Error rate above 10%"
            description: "{{ $labels.route }} is returning >10% 5xx errors"

        # Alert: Pod crash looping (any service)
        - alert: PodCrashLooping
          expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Pod {{ $labels.pod }} is restarting repeatedly"

        # Alert: Any service target down
        - alert: ServiceTargetDown
          expr: up{namespace="task-manager"} == 0
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Prometheus cannot scrape {{ $labels.job }}"

        # Alert: StatefulSet PVC nearly full (MinIO, Meilisearch)
        - alert: PersistentVolumeAlmostFull
          expr: |
            kubelet_volume_stats_used_bytes{namespace="task-manager"}
            / kubelet_volume_stats_capacity_bytes{namespace="task-manager"} > 0.85
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "PVC {{ $labels.persistentvolumeclaim }} is >85% full"

        # Alert: Webhook delivery failures piling up
        - alert: WebhookDeliveryBacklog
          expr: webhook_deliveries_pending > 50
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Webhook delivery backlog growing (>50 pending)"
```

1. **Configure Alertmanager** (add notification receivers)

```yaml
# Alertmanager config for webhook (e.g., Discord/Slack)
receivers:
  - name: default
    webhook_configs:
      - url: "https://your-webhook-url"
```

1. **Test alerting** by stopping the task-manager pod and watching the alert fire



### New K8s Resources

- `PrometheusRule/task-manager-alerts` — Custom alert definitions
- Alertmanager is already installed by kube-prometheus-stack



### Helm Changes

- Add `templates/prometheusrule.yaml` to the task-manager chart
- Add `alerting.rules` section to `values.yaml` for configurable thresholds

---



## Module E: Horizontal Pod Autoscaler



### Problem

The main app and all microservices run with fixed replica counts (1 each). Under load, requests queue up. In production, you want the cluster to automatically scale stateless services based on demand — the main app and realtime gateway are prime candidates. StatefulSet services (MinIO, Meilisearch) do not benefit from HPA.

### Solution

Install **Prometheus Adapter** (exposes custom metrics to the Kubernetes API). Configure **HPA** to scale the main app and realtime service based on HTTP request rate and WebSocket connections, not just CPU usage.

### What You'll Learn

- **HPA with custom metrics**: Scaling based on application-specific metrics (QPS) instead of just CPU
- **Prometheus Adapter**: Bridges Prometheus metrics into the Kubernetes custom metrics API
- **Custom Metrics API**: The Kubernetes extension point that HPA queries
- **Load testing**: Using k6 to generate traffic and observe autoscaling behavior



### Implementation Steps

1. **Install Prometheus Adapter**

```bash
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  --namespace monitoring \
  --set prometheus.url=http://monitoring-kube-prometheus-prometheus.monitoring.svc:9090 \
  --set rules.default=true
```

1. **Define custom metric mapping** (ConfigMap for the adapter)

```yaml
# Maps Prometheus metric to Kubernetes custom metric
- seriesQuery: 'http_request_duration_seconds_count{namespace!="",pod!=""}'
  resources:
    overrides:
      namespace: {resource: "namespace"}
      pod: {resource: "pod"}
  name:
    matches: "^(.*)_count"
    as: "requests_per_second"
  metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'
```

1. **Configure HPA**

```yaml
# task-manager/helm-chart/templates/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "task-manager.fullname" . }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "task-manager.fullname" . }}
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Pods
      pods:
        metric:
          name: requests_per_second
        target:
          type: AverageValue
          averageValue: "100"  # Scale up when >100 req/s per pod
```

1. **Load test with k6**

```bash
k6 run --vus 50 --duration 60s load-test.js
# Watch pods scale up:
kubectl get hpa -n task-manager -w
```



### New K8s Resources

- `HorizontalPodAutoscaler/task-manager` — Autoscaling rule
- `Deployment/prometheus-adapter` — Metrics API bridge
- `APIService` — Registers custom metrics API

---



## Module F: GitOps with ArgoCD

> **Status: COMPLETE** — ArgoCD installed in `argocd` namespace. Application CRD tracks the full Helm chart (35+ resources). Automated sync with prune + self-healing. Verified: self-healing reverts manual `kubectl scale` changes.

### Problem

Deployments are manual: build image, run `helm upgrade`. There's no audit trail of what changed when, and no automatic rollback on failure.

### Solution

Install **ArgoCD** in the cluster. Point it at your GitHub repo. Every `git push` to main triggers an automatic Helm release sync. Git becomes the single source of truth for cluster state — including all 9 Docker images, 8 services, 2 StatefulSets, and CronJobs managed by the Stage 2 Helm chart.

### What You'll Learn

- **GitOps principles**: Declarative state, pull-based deployment, automatic drift detection
- **ArgoCD Application CRD**: Defines what to sync and where
- **Sync waves**: Ordered resource creation (e.g., Secrets + DB migration hook before Deployments)
- **Self-healing**: ArgoCD detects manual `kubectl edit` changes and reverts them
- **Image automation**: ArgoCD Image Updater can automatically bump image tags in git when new images are pushed to Docker Hub — critical with 9 images that change independently



### Implementation Steps

1. **Install ArgoCD**

```bash
kubectl create namespace argocd
helm repo add argo https://argoproj.github.io/argo-helm
helm install argocd argo/argo-cd --namespace argocd
```

2. **Adapt chart for GitOps** — ArgoCD manages state from git, so Secrets with real values should NOT come from the chart (they'd be in plaintext). Key changes:
   - `values.yaml`: Added `secrets.enabled: false` (default off for ArgoCD)
   - `templates/secret.yaml`: Wrapped in `{{- if .Values.secrets.enabled }}` conditional
   - `templates/team-service/db-migration-job.yaml`: Gated on `teamService.enabled AND secrets.enabled` (Helm hooks conflict with ArgoCD sync — disable for GitOps mode)
   - Pre-create the main Secret manually before applying the Application CRD

3. **Create an Application manifest**

```yaml
# task-manager/argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: task-manager
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/Ralf090102/Task-Manager-Web-Application
    targetRevision: main
    path: task-manager/helm-chart
  destination:
    server: https://kubernetes.default.svc
    namespace: task-manager
  syncPolicy:
    automated:
      prune: true        # Delete resources removed from git
      selfHeal: true     # Revert manual kubectl edits
    syncOptions:
      - CreateNamespace=true
      - ApplyOutOfSyncOnly=true
```

4. **Apply the Application**

```bash
kubectl apply -f task-manager/argocd/application.yaml
# ArgoCD clones the repo, renders the chart, compares with live state, syncs
```

5. **Git push → auto-deploy**

```bash
# Any change to helm-chart/ on main branch triggers automatic sync within ~3 minutes
git push origin main
# ArgoCD detects the change, runs helm template, applies resources
```

6. **Access ArgoCD UI**

```bash
# Port-forward to access the web UI
kubectl port-forward -n argocd svc/argocd-server 8080:443
# Open https://localhost:8080 (admin / <password>)
# Get password: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### What Was Verified

- **Initial sync**: Application CRD applied → ArgoCD cloned repo → rendered chart → compared 35+ resources → all Synced + Healthy
- **No disruption**: Existing Helm-deployed pods adopted by ArgoCD without restart
- **Self-healing**: Manual `kubectl scale deployment task-manager --replicas=3` reverted to 1 within 35 seconds
- **All resources tracked**: Deployments (9), StatefulSets (3), Services (14), CronJobs (2), PrometheusRule, ServiceMonitor, Ingress, Secrets (3), ConfigMap



### New K8s Resources

- `Namespace/argocd` — ArgoCD's own namespace
- `Application/task-manager` — ArgoCD-managed app definition
- ArgoCD runs its own Deployments, Services, and Redis internally

---



## Module G: Canary Deployments with Argo Rollouts



### Problem

Currently, `kubectl rollout restart` does a rolling update — all pods get the new version. If the new version has a bug, all users are affected immediately.

### Solution

Replace the Deployment with an **Argo Rollout** that uses a canary strategy: route 10% of traffic to the new version, analyze metrics, then gradually promote to 100%.

### What You'll Learn

- **Progressive delivery**: Canary, blue/green deployment strategies
- **Rollout CRD**: Argo Rollouts' replacement for Deployment with advanced strategies
- **Analysis templates**: Automated metric-based promotion/rollback decisions
- **Traffic splitting**: NGINX Ingress weighted routing



### Implementation Steps

1. **Install Argo Rollouts**

```bash
kubectl create namespace argo-rollouts
helm install argo-rollouts argo/argo-rollouts --namespace argo-rollouts
```

1. **Replace Deployment with Rollout**

```yaml
# Change kind: Deployment → kind: Rollout
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: task-manager
spec:
  strategy:
    canary:
      steps:
        - setWeight: 10        # 10% traffic to new version
        - pause: { duration: 2m }  # Wait 2 minutes
        - analysis:            # Check error rate
            templates:
              - templateName: success-rate
        - setWeight: 50        # Promote to 50%
        - pause: { duration: 5m }
        - setWeight: 100       # Full rollout
```

1. **Define analysis template**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  metrics:
    - name: success-rate
      interval: 1m
      successCondition: result[0] >= 0.95
      provider:
        prometheus:
          address: http://monitoring-kube-prometheus-prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_request_duration_seconds_count{status_code!~"5.."}[2m]))
            /
            sum(rate(http_request_duration_seconds_count[2m]))
```

1. **Promote or abort**

```bash
# Promote canary to next step
kubectl argo rollouts promote task-manager -n task-manager

# Abort (rollback) if metrics are bad
kubectl argo rollouts abort task-manager -n task-manager
```

---



## Optimal Implementation Strategy



### The Dependency Graph (Why Order Matters)

Some modules are independent and can be done in any order. Others have hard dependencies — doing them out of order means rebuilding work later.

```
Module A (Loki)          ──── independent (just install, no code changes)
     │
     │  (no dependency, but log aggregation helps debug everything after it)
     ▼
Module B (Redis)         ──── independent, BUT required by Module C
     │
     ▼
Module C (Worker)        ──── HARD DEPENDENCY: needs Redis from Module B
     │                      (BullMQ stores jobs in Redis)
     │
     │
Module D (Alerting)      ──── independent (just needs Prometheus, already running)
     │                      (but more valuable after you have more services to monitor)
     │
     │
Module F (GitOps)        ──── independent, BUT should come BEFORE E and G
     │                      (ArgoCD manages your Helm chart — you want this
     │                       automated before adding HPA and Rollouts to the chart)
     │
     ▼
Module E (Autoscaling)   ──── SOFT DEPENDENCY: benefits from GitOps (Module F)
     │                      (HPA is a Helm template — easier to manage via ArgoCD)
     │                      (also benefits from Module D alerts — you want to know
     │                       when autoscaling fails)
     │
     ▼
Module G (Canary)        ──── HARD DEPENDENCY: needs GitOps (Module F)
                                (Rollout replaces Deployment in Helm chart)
                                (needs Prometheus metrics for analysis — Module D)
                                (needs ArgoCD for Rollout CRD management — Module F)
```



### Why the Recommended Order Is Different from Naive A-G

The document lists modules A-G alphabetically. Here's why the *actual* optimal order rearranges them:

```
Naive order (A→G):            Optimal order (why):
──────────────────            ───────────────────

A (Loki)                      A (Loki)          ← First: helps you debug everything else
B (Redis)                     D (Alerting)      ← Second: zero code changes, instant value
C (Worker)                    B (Redis)         ← Third: foundation for C
D (Alerting)                  C (Worker)        ← Fourth: needs Redis
E (Autoscaling)               F (GitOps)        ← Fifth: automate before adding complexity
F (GitOps)                    E (Autoscaling)   ← Sixth: HPA is a Helm template, manage via GitOps
G (Canary)                    G (Canary)        ← Last: needs F + D
```

**Key insight:** Alerting (D) should jump ahead of Redis (B) because it requires ZERO code changes — it's just a PrometheusRule YAML in your Helm chart. You get immediate production-grade alerting in 1 hour. Redis requires code changes (cache logic, invalidation, Redis client) which is riskier and takes longer.

### The Optimal Order Explained



#### Step 1: Module A (Loki) — 2 hours

**Why first:** Loki requires zero code changes. You install it via Helm, and it automatically starts collecting logs from all pods. Every subsequent module will be easier to debug because you can search across all service logs in Grafana.

```
What you need:     helm install loki (1 command)
What you get:      Centralized logs for all 10+ pods
Why before others: When Module B (Redis) or C (Worker) breaks,
                   you'll want Loki to see what happened
Risk:              None — Loki is read-only, doesn't affect your app
```



#### Step 2: Module D (Alerting) — 2 hours

**Why second:** Alerting needs only Prometheus (already running) and a PrometheusRule YAML. No code changes, no new infrastructure, no Docker images. It's a single Helm template addition.

```
What you need:     1 YAML file (prometheusrule.yaml) in your Helm chart
What you get:      Automatic alerts for crash loops, PVC capacity, error rates
Why before Redis:  Zero risk, instant value, and you'll WANT alerts
                   before adding Redis (a new dependency that can fail)
Risk:              None — alerts are passive (they observe, don't affect the app)
```

```
After this step, you have:
  - Centralized logs (Loki from Step 1)
  - Proactive alerts (Alertmanager from Step 2)
  - Existing metrics (Prometheus from Stage 2)

  This is a complete observability triad: metrics + logs + alerts.
  You can now confidently add more infrastructure knowing you'll
  see problems immediately.
```



#### Step 3: Module B (Redis) — 3 hours

**Why third:** Redis is the foundation for Module C (BullMQ worker). Installing Redis first (as a caching layer) lets you validate the infrastructure before adding the complexity of a worker service.

```
What you need:     - StatefulSet + Service templates in Helm
                   - Redis client in Next.js (npm install redis)
                   - Cache-aside logic in API routes
                   - Cache invalidation on mutations

What you get:      - Faster API responses (cache hits skip PostgreSQL)
                   - Redis infrastructure ready for Module C
                   - Third StatefulSet pattern (after MinIO, Meilisearch)

Why alerting first: If Redis has issues (OOM, connection refused),
                    the alerts from Step 2 will catch it immediately
Risk:              Medium — cache bugs (stale data, invalidation misses)
                   can cause confusing behavior. Test thoroughly.
```



#### Step 4: Module C (Worker) — 3 hours

**Why fourth:** BullMQ worker requires Redis (from Step 3). This module replaces fire-and-forget HTTP calls with durable, retryable jobs.

```
What you need:     - New service: services/worker/ with BullMQ
                   - New Docker image: task-manager-worker
                   - Worker Deployment template in Helm
                   - Modify main app to enqueue jobs instead of
                     fire-and-forget fetch() calls

What you get:      - Jobs survive pod restarts (stored in Redis)
                   - Automatic retries with backoff
                   - Job visibility (BullMQ has a UI dashboard)
                   - Umbrella chart restructuring (Helm subcharts)

Why Redis first:   BullMQ literally cannot run without Redis
Why alerts first:  Worker failures should trigger alerts
                   (job backlog, retry exhaustion)
Risk:              Medium-high — changes the communication pattern
                   from fire-and-forget to queue-based. Need to handle
                   the transition carefully (don't break existing
                   notification/webhook flows).
```



#### Step 5: Module F (GitOps) — 3 hours

**Why fifth (not earlier):** GitOps changes your entire deployment workflow. You want to do this AFTER your Helm chart is stable (Modules A-D are integrated). If you set up ArgoCD first and then keep changing the chart, ArgoCD will fight you (self-healing reverts manual changes).

```
What you need:     - Install ArgoCD in the cluster
                   - Create Application CRD pointing to your repo
                   - Move from manual `helm upgrade` to git-push-triggered sync
                   - Configure image update strategy (how new Docker images
                     get picked up — this is tricky with 9+ images)

What you get:      - `git push` = deploy (no manual commands)
                   - Audit trail (git history = deployment history)
                   - Automatic drift detection and self-healing
                   - Foundation for Module G (canary needs ArgoCD)

Why after A-D:     Your chart needs to be STABLE before ArgoCD manages it.
                   If ArgoCD is managing a chart that's changing every day,
                   self-healing will constantly revert your manual debugging.
                   Freeze the chart, then hand control to ArgoCD.
Risk:              Low-medium — GitOps is additive (doesn't change the app,
                   just the deployment process). Main risk is lock-in
                   (harder to go back to manual deployments once automated).
```

```
After this step, your workflow changes:

  BEFORE (Steps 1-4):
    1. Edit Helm chart
    2. helm upgrade task-manager ./helm-chart --reuse-values --set ...
    3. Watch pods restart
    4. If broken: helm rollback

  AFTER (Step 5+):
    1. Edit Helm chart
    2. git commit && git push
    3. ArgoCD detects change, runs helm upgrade automatically
    4. If broken: git revert && git push (ArgoCD rolls back)
```



#### Step 6: Module E (Autoscaling) — 3 hours

**Why sixth:** HPA adds a HorizontalPodAutoscaler to your Helm chart. With GitOps (Step 5), this is just another template that ArgoCD manages. Without GitOps, you'd be manually applying HPA changes every time you tweak thresholds.

```
What you need:     - Install Prometheus Adapter (bridges metrics to K8s API)
                   - Configure custom metric mapping (QPS from Prometheus)
                   - Add HPA template to Helm chart
                   - Load test with k6 to verify scaling behavior

What you get:      - Pods scale up under load (1 → 5 replicas)
                  - Pods scale down when idle (save resources)
                   - Custom metric scaling (not just CPU-based)

Why GitOps first:  HPA is a Helm template. With ArgoCD, threshold changes
                   are just git commits. Without ArgoCD, you'd run
                   helm upgrade every time you tune the scaling threshold.
Risk:              Low — HPA is non-destructive (worst case: scales too
                   aggressively or too conservatively, both fixable).
                   Prometheus Adapter can be tricky to configure.
```



#### Step 7: Module G (Canary) — 4 hours

**Why last:** Canary deployments are the most advanced pattern. They require:

- Argo Rollouts (replaces Deployment CRD)
- ArgoCD (for Rollout lifecycle management)
- Prometheus metrics (for analysis templates)
- NGINX traffic splitting (weighted routing)

All three prerequisites come from earlier steps (F + D + E).

```
What you need:     - Install Argo Rollouts
                   - Replace Deployment with Rollout in Helm chart
                   - Define AnalysisTemplate (Prometheus success-rate query)
                   - Configure NGINX traffic splitting
                   - Learn kubectl argo rollouts promote/abort commands

What you get:      - 10% canary → analyze → 50% → analyze → 100%
                   - Automatic rollback if error rate > 5%
                   - Zero-downtime releases (no more "all pods restart at once")

Why everything first: Canary needs ALL the infrastructure you've built:
                   - GitOps to manage the Rollout CRD (Step 5)
                   - Prometheus metrics for analysis (Stage 2 + Step 2 alerts)
                   - Stable Helm chart (you don't canary an unstable chart)
                   - HPA to know baseline replica counts (Step 6)
Risk:              Highest — changes the core Deployment resource.
                   If misconfigured, can cause traffic routing issues.
                   Only do this when everything else is stable.
```



### Summary: The Optimal Path

```
Step    Module     Effort    Prerequisites          What It Unlocks
────    ───────    ──────    ─────────────          ───────────────
1       A (Loki)   2 hrs     None                   Centralized logging
                                                (helps debug everything after)

2       D (Alerts) 2 hrs     Prometheus (running)   Proactive monitoring
                                                (catches problems from B, C)

3       B (Redis)  3 hrs     None                   Caching + foundation for C

4       C (Worker) 3 hrs     Redis (Step 3)         Durable async processing
                                                + Helm subcharts

5       F (GitOps) 3 hrs     Stable chart (A-D)     Automated deployments
                                                + foundation for E, G

6       E (HPA)    3 hrs     GitOps (Step 5)        Auto-scaling under load
                                                + Prometheus Adapter

7       G (Canary) 4 hrs     GitOps (5) + Alerts(2) Progressive delivery
                                                + metric-based rollback

                    ─────────
        Total:     20 hours  (2-4 hours per module)
```



### If You Only Have Time for 3 Modules

```
Must-have (production-critical):

  1. Module D (Alerting)     — 2 hrs, zero risk, catches everything
  2. Module A (Loki)         — 2 hrs, zero risk, unified debugging
  3. Module F (GitOps)       — 3 hrs, transforms your workflow

  Total: 7 hours
  Result: You can detect problems (alerts), investigate them (logs),
          and deploy fixes automatically (GitOps). This is the minimum
          viable production setup.
```



### If You Have Time for 5 Modules

```
Must-have + high-impact:

  1. Module D (Alerting)     — catch problems
  2. Module A (Loki)         — investigate problems
  3. Module B (Redis)        — caching + infrastructure for worker
  4. Module C (Worker)       — reliable async processing
  5. Module F (GitOps)       — automated deployments

  Total: 13 hours
  Result: Production-grade observability + caching + reliable workers
          + automated deployments. This is a complete mid-level production setup.
  Skip:   E (Autoscaling) and G (Canary) — nice but not essential for
          a learning project with predictable traffic.
```



### Visual Timeline

```
Week 1 (6 hrs):
  ┌─────────────┬──────────────┐
  │ A: Loki     │ D: Alerting  │     Observability foundation
  │ (2 hrs)     │ (2 hrs)      │     ── detect + investigate problems
  └─────────────┴──────────────┘
              + buffer/debugging (2 hrs)

Week 2 (6 hrs):
  ┌─────────────┬──────────────┐
  │ B: Redis    │ C: Worker    │     Data + async infrastructure
  │ (3 hrs)     │ (3 hrs)      │     ── caching + durable jobs
  └─────────────┴──────────────┘
              (sequential — C needs B)

Week 3 (6 hrs):
  ┌─────────────┬──────────────┐
  │ F: GitOps   │ E: HPA       │     Deployment automation
  │ (3 hrs)     │ (3 hrs)      │     ── auto-deploy + auto-scale
  └─────────────┴──────────────┘
              (sequential — E benefits from F)

Week 4 (4 hrs):
  ┌─────────────────────────────┐
  │ G: Canary Deployments       │     Advanced progressive delivery
  │ (4 hrs)                     │     ── zero-downtime, metric-based rollout
  └─────────────────────────────┘
              (needs everything from weeks 1-3)
```



### Infrastructure Accumulation

After each step, your cluster grows. Here's what's running at each stage:

```
Step 0 (Baseline — Stage 2):
  11 pods (app + 8 services + MinIO + Meilisearch)
  + Prometheus + Grafana (monitoring namespace)
  = ~13 pods

Step 1 (Loki):      + 2 pods (loki + promtail)
  = ~15 pods

Step 2 (Alerting):  + 0 pods (Alertmanager already running)
  = ~15 pods

Step 3 (Redis):     + 1 pod (redis StatefulSet)
  = ~16 pods

Step 4 (Worker):    + 1 pod (worker Deployment)
  = ~17 pods

Step 5 (GitOps):    + 4 pods (argocd-server, argocd-repo-server,
                              argocd-application-controller, argocd-redis)
  = ~21 pods

Step 6 (Autoscale): + 1 pod (prometheus-adapter)
  = ~22 pods
  + HPA can add up to 4 more app pods under load (1→5 replicas)

Step 7 (Canary):    + 0 pods (Argo Rollouts controller is 1 pod, already counted)
  But Rollout replaces Deployment, so during canary:
  = ~24 pods (old version + new version pods coexisting temporarily)
```

```
Minikube resource consideration:
  Default Minikube: ~4-8 GB RAM
  At Step 7:       ~24 pods consuming ~3-4 GB RAM

  If Minikube struggles:
  - Start with more memory: minikube start --memory=8192
  - Skip non-essential pods during learning
  - Use ArgoCD's HA-off mode (single replica)
```

**Estimated effort per module:** 2-4 hours each.

---



## Resume Impact

These modules build on the Stage 2 microservices architecture (8 services, polyglot, StatefulSets, CronJobs). After completing them, you can add the following to your resume:

- **Full observability stack**: Extended Prometheus + Grafana monitoring with Loki log aggregation — unified metrics, logs, and dashboards across all microservices
- **Cache layer**: Redis StatefulSet with cache-aside pattern and TTL-based invalidation, reducing PostgreSQL load
- **Queue-based processing**: BullMQ worker service contrasting with the fire-and-forget HTTP pattern — adds durability, retries, and job visibility
- **Proactive alerting**: Custom PrometheusRules with Alertmanager routing for multi-service health (error rates, PVC capacity, webhook backlogs)
- **Custom-metric autoscaling**: HPA scaling stateless services based on application QPS via Prometheus Adapter
- **GitOps**: ArgoCD managing the full multi-service Helm chart — 9 images, conditional service templates, Helm hooks
- **Progressive delivery**: Canary deployments with automated metric-based rollback for zero-downtime releases

