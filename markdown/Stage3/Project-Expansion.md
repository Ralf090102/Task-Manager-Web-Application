# Project Expansion: Advanced Kubernetes, Helm & Observability

This document outlines expansion modules that build upon the existing Task Manager application. Each module introduces new Kubernetes concepts, Helm patterns, and observability tooling while extending the application with real-world features.

---

## Current Architecture (Baseline)

```
Browser → NGINX Ingress → task-manager (Next.js) → PostgreSQL (Supabase)
                                ↑
                    Prometheus scrapes /api/metrics
```

**What exists:** Single Next.js pod, external PostgreSQL, Prometheus + Grafana monitoring, pino structured logging to stdout.

**What's missing:** Log aggregation, caching, background processing, alerting, autoscaling, GitOps, progressive delivery.

---

## Expansion Overview

| Module | Focus Area | New K8s Concepts | New Tooling |
|--------|-----------|-----------------|-------------|
| A | Log Aggregation | DaemonSet, ConfigMap | Loki, Promtail |
| B | Redis Caching | StatefulSet, PVC, Headless Service | Redis |
| C | Worker Microservice | Multi-pod Deployments, Subcharts | BullMQ |
| D | Alerting | PrometheusRule CRD | Alertmanager |
| E | Autoscaling | HPA with Custom Metrics | Prometheus Adapter, k6 |
| F | GitOps | ArgoCD Application CRD | ArgoCD |
| G | Canary Deployments | Rollout CRD | Argo Rollouts |

Each module can be implemented independently, but they are ordered by dependency and complexity.

---

## Module A: Log Aggregation with Loki

### Problem
Currently, pino logs go to pod stdout and are only viewable via `kubectl logs`. There is no way to search, filter, or correlate logs with metrics. If a pod restarts, its previous logs are lost.

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

2. **Add Loki as a Grafana datasource** (the Loki stack Helm chart can auto-configure this, or you add it manually in Grafana > Configuration > Data Sources > Add Loki)

3. **Query logs in Grafana**
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
- **StatefulSet**: Like a Deployment but with stable network identity and persistent storage — essential for stateful applications like databases and caches
- **PersistentVolumeClaim (PVC)**: Requests durable storage that survives pod restarts
- **Headless Service**: A Service without cluster-IP, used for StatefulSet DNS resolution (`redis-0.redis.task-manager.svc.cluster.local`)
- **Cache-aside pattern**: Application checks cache first, then database, then writes result back to cache
- **Cache invalidation**: Clearing cached data when tasks are created/updated/deleted

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

2. **Add Redis Service** (headless for StatefulSet DNS)
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

3. **Integrate Redis client in Next.js**
```typescript
// src/lib/redis.ts
import { createClient } from "redis";

const client = createClient({ url: process.env.REDIS_URL || "redis://redis:6379" });
client.connect();

export default client;
```

4. **Cache task lists in API routes**
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

5. **Invalidate cache on mutations**
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

### Problem
The Next.js app handles everything synchronously: user requests, database queries, email notifications. Heavy operations block the event loop and degrade user experience.

### Solution
Extract background processing into a **separate worker microservice**. Use Redis (from Module B) as a job queue with BullMQ. The worker watches for task events (completion, overdue checks, daily summaries) and processes them asynchronously.

### Architecture
```
task-manager (Next.js)
  │
  ├── enqueue job ──→ Redis (BullMQ queue)
  │                        │
  │                   worker-service (separate pod)
  │                        ├── send notification email
  │                        ├── generate daily summary
  │                        └── check overdue tasks
  │
  └── user requests (fast, non-blocking)
```

### What You'll Learn
- **Multi-service Kubernetes deployment**: Running and coordinating multiple deployments that share infrastructure
- **Helm subcharts / umbrella chart**: Managing the task-manager, worker, and Redis as a coordinated unit
- **Producer-consumer pattern**: Web app enqueues jobs, worker consumes them
- **Shared configuration**: Both services read from the same Secrets/ConfigMaps
- **Pod isolation**: Worker crash doesn't affect web app, and vice versa

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

2. **Enqueue jobs from the web app**
```typescript
// After task completion in task-manager:
await queue.add("task-event", {
  type: "task.completed",
  taskId: task.id,
  userId: session.user.id,
});
```

3. **Add worker Deployment to Helm chart**
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

4. **Add ServiceMonitor for the worker** (worker exposes its own `/metrics` endpoint)

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
        # Alert: High error rate
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

        # Alert: Pod crash looping
        - alert: PodCrashLooping
          expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Pod is restarting repeatedly"

        # Alert: No successful scrapes
        - alert: PrometheusTargetDown
          expr: up{job="task-manager"} == 0
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Prometheus cannot scrape task-manager"
```

2. **Configure Alertmanager** (add notification receivers)
```yaml
# Alertmanager config for webhook (e.g., Discord/Slack)
receivers:
  - name: default
    webhook_configs:
      - url: "https://your-webhook-url"
```

3. **Test alerting** by stopping the task-manager pod and watching the alert fire

### New K8s Resources
- `PrometheusRule/task-manager-alerts` — Custom alert definitions
- Alertmanager is already installed by kube-prometheus-stack

### Helm Changes
- Add `templates/prometheusrule.yaml` to the task-manager chart
- Add `alerting.rules` section to `values.yaml` for configurable thresholds

---

## Module E: Horizontal Pod Autoscaler

### Problem
The app runs with a fixed replica count (1). Under load, requests queue up. In production, you want the cluster to automatically scale pods based on demand.

### Solution
Install **Prometheus Adapter** (exposes custom metrics to the Kubernetes API). Configure **HPA** to scale based on HTTP request rate, not just CPU usage.

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

2. **Define custom metric mapping** (ConfigMap for the adapter)
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

3. **Configure HPA**
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

4. **Load test with k6**
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

### Problem
Deployments are manual: build image, run `helm upgrade`. There's no audit trail of what changed when, and no automatic rollback on failure.

### Solution
Install **ArgoCD** in the cluster. Point it at your GitHub repo. Every `git push` to main triggers an automatic Helm release sync. Git becomes the single source of truth for cluster state.

### What You'll Learn
- **GitOps principles**: Declarative state, pull-based deployment, automatic drift detection
- **ArgoCD Application CRD**: Defines what to sync and where
- **Sync waves**: Ordered resource creation (e.g., Secrets before Deployments)
- **Self-healing**: ArgoCD detects manual `kubectl edit` changes and reverts them

### Implementation Steps

1. **Install ArgoCD**
```bash
kubectl create namespace argocd
helm repo add argo https://argoproj.github.io/argo-helm
helm install argocd argo/argo-cd --namespace argocd
```

2. **Create an Application manifest**
```yaml
# argocd/task-manager-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: task-manager
  namespace: argocd
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
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

3. **Git push → auto-deploy**
```bash
# Any change to helm-chart/ on main branch triggers automatic sync
git push origin main
# ArgoCD detects the change, runs helm template, applies resources
```

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

2. **Replace Deployment with Rollout**
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

3. **Define analysis template**
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

4. **Promote or abort**
```bash
# Promote canary to next step
kubectl argo rollouts promote task-manager -n task-manager

# Abort (rollback) if metrics are bad
kubectl argo rollouts abort task-manager -n task-manager
```

---

## Recommended Implementation Order

```
Module A (Loki)         ← Quickest win, directly enhances logging
    ↓
Module B (Redis)        ← Foundation for Module C
    ↓
Module C (Worker)       ← Most complex app change, multi-service K8s
    ↓
Module D (Alerting)     ← Builds on existing Prometheus metrics
    ↓
Module E (Autoscaling)  ← Requires custom metrics from Prometheus
    ↓
Module F (GitOps)       ← Changes deployment workflow
    ↓
Module G (Canary)       ← Most advanced, requires GitOps + metrics
```

**Estimated effort per module:** 2-4 hours each.

---

## Resume Impact

After completing these modules, you can add the following to your resume:

- **Microservices architecture**: Split monolith into web + worker services with shared Redis queue
- **Stateful workloads**: Managed Redis StatefulSet with persistent volumes in Kubernetes
- **Full observability stack**: Prometheus + Grafana + Loki for metrics, dashboards, and log aggregation
- **Proactive alerting**: Custom PrometheusRules with Alertmanager notification routing
- **Autoscaling**: HPA with custom Prometheus metrics via Prometheus Adapter
- **GitOps**: ArgoCD for declarative, pull-based continuous deployment
- **Progressive delivery**: Canary deployments with automated metric-based rollback
