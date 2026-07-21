# Level 7: Observability & Monitoring

**Duration:** 4 hours  
**Goal:** Understand how to see what's happening inside your applications — metrics, logs, and dashboards

---

## Table of Contents

1. [What is Observability?](#1-what-is-observability)
2. [The Three Pillars of Observability](#2-the-three-pillars-of-observability)
3. [Prometheus: Metrics Collection](#3-prometheus-metrics-collection)
4. [Exposing Metrics with prom-client](#4-exposing-metrics-with-prom-client)
5. [ServiceMonitor: How Prometheus Finds Your App](#5-servicemonitor-how-prometheus-finds-your-app)
6. [Grafana: Visualizing Metrics](#6-grafana-visualizing-metrics)
7. [Structured Logging with pino](#7-structured-logging-with-pino)
8. [Loki + Promtail: Log Aggregation](#8-loki--promtail-log-aggregation)
9. [Sidecar vs DaemonSet: Two Ways to Collect Logs](#9-sidecar-vs-daemonset-two-ways-to-collect-logs)
10. [Querying Logs with LogQL](#10-querying-logs-with-logql)
11. [Hands-On Exercises](#11-hands-on-exercises)
12. [What You've Learned](#12-what-youve-learned)

---



## 1. What is Observability?



### Monitoring vs Observability

```
Monitoring:      "Is the system working?"
                 → Dashboards, alerts, health checks
                 → You know ABOUT a problem

Observability:   "WHY is the system broken?"
                 → Metrics + logs + traces + context
                 → You can DIAGNOSE the problem's root cause
```

```
Example: The main app is returning 500 errors.

  Monitoring tells you:    "Error rate is 15% (normally 0.1%)"
                            → You know something is wrong

  Observability tells you: "Error rate spiked at 14:32 UTC.
                            Errors are on POST /api/tasks.
                            The webhook service started crashing
                            at 14:31. The pod ran out of memory
                            (OOMKilled). The last log before crash:
                            'Webhook delivery backlog: 500 items'"
                            → You know exactly what happened
```



### Why Observability Matters in Microservices

In a monolith, debugging is easy — everything is in one process. In microservices, a single user request might flow through 5 services:

```
User creates a task:
  Browser → Main App → PostgreSQL (save)
                     → Realtime (emit event)
                     → Webhook (queue delivery)
                     → Search Sync (index task)
                     → Notification (send email)

If the task appears but the email doesn't arrive:
  Which service failed? When? Why?

Without observability: SSH into each pod, read logs one at a time
With observability:   Search "taskId=abc123" across ALL services in Grafana
                      See the metrics spike, the error log, the timeline
```



### The Observability Stack in This Project

```
┌───────────────────────────────────────────────────────────────────┐
│                    GRAFANA (Unified UI)                           │
│                                                                   │
│    Dashboards          Logs Explorer          Metrics Explorer    │
│    ┌──────────┐        ┌──────────┐          ┌──────────┐         │
│    │ Charts   │        │ LogQL    │          │ PromQL   │         │
│    │ Graphs   │        │ queries  │          │ queries  │         │
│    └────┬─────┘        └────┬─────┘          └────┬─────┘         │
│         │                   │                     │               │
└─────────┼───────────────────┼─────────────────────┼───────────────┘
          │                   │                     │
          ▼                   ▼                     ▼
   ┌──────────────┐   ┌───────────────┐     ┌───────────────┐
   │  Prometheus  │   │     Loki      │     │ (both query   │
   │  (metrics)   │   │   (logs)      │     │  from Grafana)│
   └──────┬───────┘   └──────┬────────┘     └───────────────┘
          │                   │
          │ scrape /metrics   │ push logs
          ▼                   ▲
   ┌──────────────┐    ┌──────┴───────┐
   │  Main App    │    │   Promtail   │
   │  (prom-client│    │  (DaemonSet) │
   │   exposes    │    │  reads       │
   │   metrics)   │    │  /var/log/   │
   └──────────────┘    │  pods/*      │
                       └──────────────┘
```

Three tools, three jobs:

- **Prometheus** — collects and stores numeric metrics (CPU, request count, error rate)
- **Loki** — collects and stores text logs (JSON log lines from your app)
- **Grafana** — the dashboard that visualizes both in one place

---



## 2. The Three Pillars of Observability



### Metrics, Logs, and Traces

```
Pillar 1: METRICS (numeric data over time)
  "How many requests per second?"
  "What's the error rate?"
  "How much memory is the pod using?"

  Tool: Prometheus
  Format: Numeric time series (e.g., http_requests_total{method="GET"} 42)
  Query: PromQL
  Strength: Aggregation, alerting, trends over time
  Weakness: Can't tell you WHY something happened


Pillar 2: LOGS (text records of events)
  "What did the webhook service log at 14:32?"
  "Show me all errors from the notification service"
  "What was the taskId in that failed request?"

  Tool: Loki
  Format: JSON text lines (e.g., {"level":"error","msg":"Failed to send email"})
  Query: LogQL
  Strength: Context, debugging, root cause analysis
  Weakness: Hard to aggregate, high volume


Pillar 3: TRACES (request flow across services)
  "A user's request went through 5 services — which one was slow?"
  "Show me the full timeline of task creation"

  Tool: Jaeger / Tempo / OpenTelemetry
  Format: Spans (tree of operations with timestamps)
  Query: TraceQL / Jaeger UI
  Strength: Cross-service debugging, latency analysis
  Weakness: Complex to implement, high overhead

  NOTE: This project does NOT implement tracing.
        For a learning project with shared database access,
        metrics + logs are sufficient. Tracing becomes essential
        when you have 50+ services with complex call chains.
```



### How the Pillars Work Together

```
An incident scenario:

1. ALERT fires (from metrics):
   "HighErrorRate: POST /api/tasks returning >10% 5xx errors"
   → Prometheus detected the problem via metric thresholds

2. CHECK the dashboard (from metrics):
   Open Grafana → see error rate spike at 14:32
   → Confirms WHEN it started

3. SEARCH logs (from logs):
   LogQL: {namespace="task-manager"} |= "error" |= "/api/tasks"
   → Found: "Failed to create task: connection refused to webhook:3003"

4. CHECK webhook logs:
   LogQL: {namespace="task-manager", container="webhook"} |= "error"
   → Found: "Webhook service crashed: OOMKilled"

5. ROOT CAUSE identified:
   Webhook pod ran out of memory → crashed → main app can't reach it
   → POST /api/tasks fails because it fires-and-forgets to webhook
   → Fix: increase webhook memory limit in Helm values

Metrics told you WHAT happened.
Logs told you WHY it happened.
Together = observability.
```

---



## 3. Prometheus: Metrics Collection



### What Prometheus Does

Prometheus is a **time-series database** that collects, stores, and queries numeric metrics. It works on a simple model:

```
1. Your app exposes metrics at an HTTP endpoint (e.g., /api/metrics)
2. Prometheus scrapes (pulls) that endpoint every N seconds
3. Prometheus stores each metric with a timestamp
4. You query the stored data with PromQL
5. Grafana visualizes the results

  App                    Prometheus                    Grafana
  ───                    ───────────                    ───────
  /api/metrics           Scrapes every 15s              Queries PromQL
  returns text:          Stores with timestamp          Draws charts
  http_requests_total
  {method="GET"} 42      http_requests_total{
                            method="GET"
                          } 42 @14:32:00
                          http_requests_total{
                            method="GET"
                          } 43 @14:32:15
```



### The Pull Model (Prometheus is Unique)

Most monitoring systems use a **push** model — your app sends metrics TO the monitoring server. Prometheus uses a **pull** model — Prometheus comes to YOUR app and fetches metrics:

```
Push model (StatsD, Datadog Agent):     Pull model (Prometheus):

  App ──push──→ Monitoring Server        App (exposes /metrics endpoint)
  App ──push──→ Monitoring Server        Prometheus ──pull──→ App (every 15s)
  App ──push──→ Monitoring Server        Prometheus ──pull──→ App
                                             ^
  Problem: If the app crashes,             Advantage: If Prometheus can't reach
  it can't push → no alert fires           the app, THAT ITSELF is an alert
  (silent failure)                         (the target is "down")
```

**Why pull is better for microservices:**

- If a service is down, Prometheus immediately knows (scrape fails → `up == 0`)
- Prometheus controls the scraping rate (your app doesn't get overwhelmed)
- No agent needs to be installed in your app (just an HTTP endpoint)



### Metric Types

Prometheus has four metric types. This project uses three of them:

```
1. COUNTER (only goes up)
   "How many total HTTP requests have been made?"
   Example: http_requests_total{method="GET"} 1500
   Resets to 0 when the process restarts.
   Use case: Counting events that never decrease.

   In this project:
     task_operations_total{operation="create",status="success"} 42

2. GAUGE (goes up AND down)
   "How much memory is the process using RIGHT NOW?"
   Example: nodejs_heap_size_used_bytes 45678912
   Can go up or down at any time.
   Use case: Current state (memory, CPU, queue length, connections).

   In this project (auto-collected):
     process_resident_memory_bytes
     nodejs_eventloop_lag_seconds

3. HISTOGRAM (distribution of values)
   "How long do requests take? Show me percentiles."
   Example: http_request_duration_seconds_bucket{le="0.1"} 800
            http_request_duration_seconds_bucket{le="0.5"} 950
            http_request_duration_seconds_bucket{le="1.0"} 990
            http_request_duration_seconds_bucket{le="+Inf"} 1000
   Groups values into buckets (0.1s, 0.5s, 1s, etc.)
   Use case: Latency distributions, percentiles (p50, p90, p99).

   In this project:
     http_request_duration_seconds (buckets: 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10)

4. SUMMARY (like histogram but computes percentiles client-side)
   NOT used in this project — histograms are preferred because they can
   be aggregated across multiple pods.
```



### Labels — The Key to Filtering

Every metric can have **labels** — key-value pairs that let you filter and group:

```
Without labels:
  http_requests_total 1500
  → Can't tell which endpoint, which method, which status code

With labels:
  http_requests_total{
    method="POST",          ← filter by HTTP method
    route="/api/tasks",     ← filter by endpoint
    status_code="201"       ← filter by response code
  } 42

Now you can query:
  "Show me error rate for POST /api/tasks"
  rate(http_requests_total{method="POST",route="/api/tasks",status_code=~"5.."}[5m])
```



### PromQL — The Query Language

PromQL (Prometheus Query Language) lets you ask questions about your metrics:

```
# How many tasks have been created total?
task_operations_total{operation="create",status="success"}

# How many tasks per second (averaged over 5 minutes)?
rate(task_operations_total{operation="create"}[5m])

# Error rate (errors / total requests):
sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]))
/
sum(rate(http_request_duration_seconds_count[5m]))

# P99 latency for GET /api/tasks:
histogram_quantile(0.99,
  rate(http_request_duration_seconds_bucket{
    method="GET", route="/api/tasks"
  }[5m]))

# Memory usage of all task-manager pods:
process_resident_memory_bytes{namespace="task-manager"}

# Which pods are currently up (scrape successful)?
up{namespace="task-manager"}
```



### How Prometheus Was Installed

This project uses `kube-prometheus-stack` — a Helm chart that installs Prometheus AND a bunch of related components:

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --set grafana.adminPassword=admin
```

```
What kube-prometheus-stack installs:

  monitoring namespace:
  ├── Prometheus           — metrics database + scraper
  ├── Grafana              — visualization dashboard (admin/admin)
  ├── Alertmanager         — routes alerts to notifications (email, Slack)
  ├── Node Exporter        — DaemonSet collecting host metrics (CPU, disk, network)
  ├── Kube State Metrics   — K8s object metrics (pod count, deployment status)
  └── Prometheus Operator  — Manages Prometheus config via CRDs
                             (ServiceMonitor, PrometheusRule)
```



### The Prometheus Operator

The **Prometheus Operator** is a controller that extends Kubernetes with Custom Resource Definitions (CRDs). Instead of editing Prometheus's config file manually, you create Kubernetes objects:

```
Without Operator (manual config):        With Operator (CRDs):
  Edit prometheus.yml:                     kubectl apply -f servicemonitor.yaml
    scrape_configs:                          → Operator detects the CRD
      - job_name: 'task-manager'             → Updates Prometheus config automatically
        kubernetes_sd_configs:               → Prometheus starts scraping
          - role: pod
        metrics_path: /api/metrics
        relabel_configs: ...
  (Must restart Prometheus to apply)

  Fragile, manual, no GitOps.             Declarative, automated, version-controlled.
```

The Operator watches for three CRDs:

- **ServiceMonitor** — defines how to scrape a service (Section 5)
- **PodMonitor** — like ServiceMonitor but for individual pods
- **PrometheusRule** — defines alerting rules (Stage 3 Module D)

---



## 4. Exposing Metrics with prom-client



### What is prom-client?

**prom-client** is a Node.js library that creates and maintains Prometheus-format metrics inside your application. It's the bridge between your code and Prometheus:

```
Your code:        trackTaskOperation("create", "success")
                    ↓ increments counter
prom-client:     task_operations_total{operation="create",status="success"} 43
                    ↓ formats as text
/api/metrics:    # HELP task_operations_total Total task operations
                 # TYPE task_operations_total counter
                 task_operations_total{operation="create",status="success"} 43
                    ↓ scraped by Prometheus
Prometheus:      Stores in time-series database
```



### The Metrics Setup in This Project

```typescript
// src/lib/metrics.ts

import { register, Counter, Histogram, collectDefaultMetrics } from "prom-client";

// 1. COLLECT DEFAULT METRICS (Node.js runtime metrics)
collectDefaultMetrics({ register });
// Automatically collects: process_cpu_*, process_memory_*, nodejs_heap_*,
// nodejs_eventloop_lag_*, nodejs_gc_*, etc.
// These tell you if the Node.js process itself is healthy.

// 2. CUSTOM METRIC: HTTP request duration
export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

// 3. CUSTOM METRIC: Task operations counter
export const taskOperations = new Counter({
  name: "task_operations_total",
  help: "Total number of task operations",
  labelNames: ["operation", "status"],
});

// 4. HELPER FUNCTIONS (called from API routes)
export function observeRequest(method, route, statusCode, durationSeconds) {
  httpRequestDuration.labels(method, route, String(statusCode)).observe(durationSeconds);
}

export function trackTaskOperation(operation, status) {
  taskOperations.labels(operation, status).inc();
}

export { register };  // The registry holds ALL metrics
```



### The /api/metrics Endpoint

```typescript
// src/app/api/metrics/route.ts

import { NextResponse } from "next/server";
import { register } from "@/lib/metrics";

export async function GET() {
  const metrics = await register.metrics();  // Returns ALL metrics as text
  return new NextResponse(metrics, {
    headers: { "Content-Type": register.contentType },
    // Content-Type: text/plain; version=0.0.4; charset=utf-8
  });
}
```

When you visit `http://localhost:3000/api/metrics`, you see:

```
# HELP task_operations_total Total number of task operations
# TYPE task_operations_total counter
task_operations_total{operation="create",status="success"} 42
task_operations_total{operation="create",status="error"} 1
task_operations_total{operation="list",status="success"} 156
task_operations_total{operation="delete",status="success"} 8

# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",route="/api/tasks",status_code="201",le="0.05"} 30
http_request_duration_seconds_bucket{method="POST",route="/api/tasks",status_code="201",le="0.1"} 38
http_request_duration_seconds_bucket{method="POST",route="/api/tasks",status_code="201",le="0.25"} 41
http_request_duration_seconds_bucket{method="POST",route="/api/tasks",status_code="201",le="0.5"} 42
http_request_duration_seconds_bucket{method="POST",route="/api/tasks",status_code="201",le="+Inf"} 42
http_request_duration_seconds_sum{method="POST",route="/api/tasks",status_code="201"} 3.45
http_request_duration_seconds_count{method="POST",route="/api/tasks",status_code="201"} 42

# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 45678912

# HELP nodejs_eventloop_lag_seconds Lag of event loop in seconds.
# TYPE nodejs_eventloop_lag_seconds gauge
nodejs_eventloop_lag_seconds 0.0023
```



### How Metrics Are Used in API Routes

Every API route records its metrics:

```typescript
// src/app/api/tasks/route.ts (POST handler — simplified)

import { observeRequest, trackTaskOperation } from "@/lib/metrics";

export async function POST(request: Request) {
  const start = Date.now();              // ← Start timer

  try {
    const body = await request.json();
    const task = await prisma.task.create({ data: { ... } });

    trackTaskOperation("create", "success");   // ← Count the operation
    observeRequest("POST", "/api/tasks", 201, (Date.now() - start) / 1000);
    //                                     ↑     ↑ elapsed time in seconds
    //                                     │     (Date.now() returns ms, divide by 1000)
    //                                     HTTP status code

    return NextResponse.json(task, { status: 201 });

  } catch (err) {
    trackTaskOperation("create", "error");
    observeRequest("POST", "/api/tasks", 500, (Date.now() - start) / 1000);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

**Why both success AND error paths record metrics:** Without the error path, Prometheus would never see 500 responses — making it look like the endpoint always succeeds. This is how you build reliable error-rate alerts.

### Histogram Buckets — Why They Matter

The histogram's `buckets` define which latency ranges are tracked:

```typescript
buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
//         50ms 100ms 250ms 500ms 1s  2s  5s  10s
```

```
Each request falls into ONE bucket (the highest bucket ≤ its duration):

  Request takes 80ms  → falls into le="0.1" bucket (and all higher buckets)
  Request takes 350ms → falls into le="0.5" bucket (and all higher buckets)
  Request takes 4s    → falls into le="5" bucket (and all higher buckets)

This lets you compute percentiles:
  "What's the P99 latency?" → histogram_quantile(0.99, ...)
  "99% of requests complete in under X seconds"
```

If your buckets are poorly chosen, you lose precision. If you only had `[1, 10]`, you couldn't tell the difference between a 0.05s fast request and a 0.9s slow request — both fall in the `le="1"` bucket.

---



## 5. ServiceMonitor: How Prometheus Finds Your App



### The Discovery Problem

Prometheus needs to know:

1. **What** to scrape (which services have metrics?)
2. **Where** to find them (IP, port)
3. **How often** to scrape
4. **What path** the metrics are at

In a Kubernetes cluster with dynamic pod IPs, this can't be hardcoded. The **ServiceMonitor** CRD solves this:

```
Without ServiceMonitor:                With ServiceMonitor:
  Manually configure Prometheus          Create a K8s resource:
  scrape_configs:                          apiVersion: monitoring.coreos.com/v1
    - job_name: 'task-manager'            kind: ServiceMonitor
      static_configs:                     spec:
        targets: ['10.96.1.5:3000']        selector:
      metrics_path: /api/metrics            matchLabels:
      ...                                     app: task-manager
  (Breaks when pod IP changes)            endpoints:
                                            - port: http
                                              path: /api/metrics
                                              interval: 15s
                                        (Automatically tracks pod changes)
```



### The ServiceMonitor in This Project

```yaml
# helm-chart/templates/task-manager/servicemonitor.yaml

{{- if .Values.monitoring.enabled -}}        ← Only create if monitoring is on
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "task-manager.fullname" . }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
    {{- with .Values.monitoring.serviceMonitor.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
spec:
  selector:                                  ← WHICH Service to monitor
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: http                              ← Named port from Service/Deployment
      path: /api/metrics                      ← Where metrics live
      interval: {{ .Values.monitoring.serviceMonitor.scrapeInterval }}
{{- end }}
```



### The `release: monitoring` Label — The Magic Hook

```yaml
# values.yaml
monitoring:
  enabled: true
  serviceMonitor:
    scrapeInterval: 15s
    labels:
      release: monitoring      ← THIS IS CRITICAL
```

```
Why this label matters:

  The Prometheus Operator is configured (by kube-prometheus-stack) to watch
  for ServiceMonitors with the label release: monitoring.

  The label value "monitoring" matches the Helm release name
  of the kube-prometheus-stack install:

    helm install monitoring prometheus-community/kube-prometheus-stack
                 ^^^^^^^^^^^
                 This name becomes the release label that
                 ServiceMonitors must match.

  If you install Prometheus with a different release name
  (e.g., helm install prom ...), the label would need to be:
    labels:
      release: prom

  Without this label:
    ServiceMonitor exists → Operator ignores it → Prometheus never scrapes
    → No metrics in Grafana → silent failure
```



### How ServiceMonitor Finds the Right Pods

```
ServiceMonitor selector:
  matchLabels:
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/instance: task-manager

  → Finds the Service named "task-manager"

Service (task-manager):
  selector:
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/instance: task-manager
    app.kubernetes.io/component: app

  → Routes traffic to Pods with matching labels

Pod (task-manager-xxx):
  labels:
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/instance: task-manager
    app.kubernetes.io/component: app

  → Container listens on port 3000 (named "http")

ServiceMonitor endpoint:
  port: http        ← Matches the named port in the Service
  path: /api/metrics
  interval: 15s

Result: Every 15 seconds, Prometheus scrapes:
  http://task-manager-service:3000/api/metrics
```



### Why Only the Main App Has a ServiceMonitor

Currently, only the main Next.js app has a ServiceMonitor. The 8 microservices don't:

```
Services WITH ServiceMonitor:
  ✓ Main app (prom-client + /api/metrics endpoint)

Services WITHOUT ServiceMonitor:
  ✗ Notification (Fastify — could expose metrics)
  ✗ Webhook (Fastify — could expose metrics)
  ✗ Realtime (Socket.io — could expose connection count)
  ✗ Analytics (Python — could expose via prometheus-client)
  ✗ etc.

Why? For a learning project, the main app is the entry point.
All user requests flow through it, so its metrics are the most valuable.
In production, every service would have its own ServiceMonitor.
```

---



## 6. Grafana: Visualizing Metrics



### What Grafana Does

Grafana is a **visualization dashboard** that queries data sources (Prometheus, Loki, etc.) and renders charts, graphs, and tables:

```
Without Grafana:                    With Grafana:
  Open Prometheus UI                Open Grafana dashboard
  Type PromQL manually              See pre-built charts:
  Get raw numbers                     - Request rate (line graph)
                                       - Error rate (stat panel)
  http_requests_total 1500             - P99 latency (heatmap)
  (What does 1500 mean?)              - Memory usage (gauge)
                                       - Pod status (table)

  Hard to interpret,                  Visual, contextual, color-coded
  no trends, no history               Trends over time at a glance
```



### Grafana Architecture

```
┌───────────────────────────────────────────────────────────┐
│                      GRAFANA                              │
│                                                           │
│  Dashboards              Data Sources                     │
│  ┌─────────────┐         ┌──────────────────────┐         │
│  │ Dashboard 1 │──query──│ Prometheus (metrics) │         │
│  │ - Panel:    │         │ - PromQL queries     │         │
│  │   Req rate  │         └──────────────────────┘         │
│  │ - Panel:    │         ┌──────────────────────┐         │
│  │   Errors    │──query──│ Loki (logs)          │         │
│  └─────────────┘         │ - LogQL queries      │         │
│                          └──────────────────────┘         │
│                                                           │
│  Each panel = one PromQL or LogQL query                   │
│  Dashboard = collection of panels arranged on a grid      │
└───────────────────────────────────────────────────────────┘
```



### How Grafana Connects to Prometheus

When kube-prometheus-stack is installed, Grafana is pre-configured with Prometheus as a datasource:

```
Grafana → Data Sources → Prometheus
  URL: http://monitoring-kube-prometheus-prometheus:9090
  (The Prometheus Service inside the monitoring namespace)

  When you create a dashboard panel:
    Data source: Prometheus
    Query: rate(http_request_duration_seconds_count[5m])
    Visualization: Time series (line graph)

  Grafana sends the PromQL to Prometheus
  Prometheus returns time-series data
  Grafana renders it as a chart
```



### Accessing Grafana

Grafana runs inside the cluster and needs port-forwarding:

```bash
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
# Open http://localhost:3001 (admin/admin)
```



### Pre-built Dashboards

kube-prometheus-stack comes with several pre-installed dashboards (Node Exporter, Kubernetes Compute Resources, Prometheus Overview, etc.). To see YOUR app's metrics, create a custom dashboard with panels like:

```
Panel 1: Request Rate
  PromQL: sum(rate(http_request_duration_seconds_count[5m])) by (route)

Panel 2: Error Rate
  PromQL: sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m]))
          / sum(rate(http_request_duration_seconds_count[5m]))

Panel 3: Task Operations
  PromQL: sum(task_operations_total) by (operation)

Panel 4: Memory Usage
  PromQL: process_resident_memory_bytes
```

---



## 7. Structured Logging with pino



### Why Structured Logging?

```
Unstructured logging (console.log):
  console.log("Task " + taskId + " created by user " + userId);
  Output: Task clx12345 created by user cly67890

  Problems:
  - Hard to search ("find all logs with taskId=clx12345")
  - Hard to parse (regex needed to extract fields)
  - No machine-readable format

Structured logging (pino):
  logger.info({ taskId, userId }, "Task created");
  Output: {"level":"info","time":"2026-07-18T12:34:56.789Z","taskId":"clx12345","userId":"cly67890","msg":"Task created"}

  Benefits:
  - JSON format (machine-readable)
  - Every field is searchable in Loki
  - Level is a discrete field (filter: level="error")
  - Timestamp is ISO 8601 (sortable, timezone-aware)
```



### The pino Configuration

```typescript
// src/lib/logger.ts

import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",

  formatters: {
    level(label) {
      return { level: label };  // "info" instead of 30
    },
  },

  timestamp: pino.stdTimeFunctions.isoTime,  // ISO 8601 timestamps
});

export default logger;
```



### Three Critical Configuration Choices

**1. Level as a word, not a number**

```
Default pino output:    {"level":30, ...}    (30=info, 50=error — unreadable)
With formatter:          {"level":"info", ...}  (readable, filterable in Loki)
```

**2. ISO 8601 timestamps**

```
Default pino output:    {"time":1721303696789}       (Unix ms — hard to read)
With isoTime:            {"time":"2026-07-18T12:34:56Z"}  (ISO — matches Promtail)
```

**3. JSON output (default)**

pino outputs NDJSON by default — each log line is a complete JSON object:

```json
{"level":"info","time":"2026-07-18T12:34:56.789Z","msg":"Server started on port 3000"}
{"level":"error","time":"2026-07-18T12:35:01.456Z","err":{"message":"Connection refused"},"msg":"Failed to notify"}
```

This is exactly what Promtail's JSON pipeline stage parses.

### How Logging Is Used in API Routes

```typescript
import logger from "@/lib/logger";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    logger.warn({ route: "/api/tasks" }, "Unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const task = await prisma.task.create({ data: { ... } });
    logger.info({ taskId: task.id, userId: session.user.id }, "Task created");
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    logger.error({ err, userId: session.user.id }, "Failed to create task");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

```
logger.info(data, message)
         │       │
         │       └── Human-readable summary (becomes "msg" field)
         └── Context fields (merged into top-level JSON)

Levels:
  logger.debug()  — verbose, only in development
  logger.info()   — normal operations ("Task created")
  logger.warn()   — unexpected but recoverable
  logger.error()  — failures ("Failed to send email")
  logger.fatal()  — process must exit
```

---



## 8. Loki + Promtail: Log Aggregation



### The Problem Loki Solves

```
Without Loki:
  kubectl logs <pod-name>     ← ONE pod at a time
  No cross-service search. Logs lost when pod restarts.

  Debugging: kubectl logs task-manager-xxx
             kubectl logs task-manager-webhook-xxx
             kubectl logs task-manager-notification-xxx
             (read each one, manually correlate timestamps)

With Loki:
  All logs from all pods stored in ONE place.
  Query from Grafana: {namespace="task-manager"} |= "error"
  → Instantly see errors across ALL services, sorted by time.
```



### What Loki Is (and Isn't)

```
Loki IS:     A log aggregation system (like Elasticsearch, but simpler)
             Stores logs indexed by LABELS (not full-text indexed)
             Queries with LogQL

Loki IS NOT: A full-text search engine (doesn't index every word)
             A log shipper (that's Promtail's job)
```

```
Loki's design philosophy: "Logs are just like metrics."

  Prometheus indexes metrics by labels:
    http_requests_total{method="GET", route="/api/tasks"}

  Loki indexes logs by labels:
    {namespace="task-manager", container="webhook"}

  The log CONTENT is NOT indexed — only the labels.
  This makes Loki MUCH cheaper to run than Elasticsearch.
```



### What Promtail Is

```
Promtail IS:   A log collector agent
               Ships logs FROM the node TO Loki
               Parses and labels log lines

Promtail IS NOT: A storage system (that's Loki)
                 A visualization tool (that's Grafana)
```



### How Loki + Promtail Were Installed

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set loki.persistence.enabled=true \
  --set loki.persistence.size=5Gi \
  --set promtail.enabled=true \
  --set loki.isDefault=false
```

```
What the loki-stack chart installs:

  monitoring namespace:
  ├── Loki (StatefulSet)            — stores logs with 5Gi PVC
  ├── Promtail (DaemonSet)         — one pod per node, reads logs
  └── Grafana datasource (auto)    — Loki added as a data source

Why loki.isDefault=false:
  Prometheus was already the default datasource.
  Setting isDefault=false prevents Loki from overriding it.
```



### The Promtail Pipeline

Promtail processes each log line through a configurable pipeline:

```
Log line enters Promtail:
  {"level":"info","time":"2026-07-18T12:34:56Z","taskId":"clx123","msg":"Task created"}

Pipeline stages:
  1. json stage: extracts level, msg, time from JSON
  2. labels stage (optional): makes extracted fields into Loki labels
  3. timestamp stage: uses extracted time as the log timestamp

Result in Loki:
  Log:     {"level":"info",...,"msg":"Task created"}
  Labels:  {namespace="task-manager", container="app", level="info"}
  Time:    2026-07-18T12:34:56Z
```

This is why pino's configuration matters — the word-level formatter and ISO timestamp were designed specifically to match this pipeline.

---



## 9. Sidecar vs DaemonSet: Two Ways to Collect Logs

This is the section you specifically asked about. When you installed Loki, you encountered two different architectures for collecting logs.

### What is a Sidecar?

In Kubernetes, a **sidecar** is a second container that runs INSIDE the same Pod as your main application container. They share the same network, can share volumes, and have the same lifecycle:

```
Without sidecar:                     With sidecar:

  Pod                                 Pod
  ┌──────────────────┐                ┌──────────────────┐
  │  Container       │                │  Container A     │
  │  (your app)      │                │  (your app)      │
  │                  │                │  writes to       │
  │  writes logs     │                │  /shared/log     │
  │  to stdout       │                ├──────────────────┤
  └──────────────────┘                │  Container B     │  ← SIDECAR
                                      │  (log collector) │
                                      │  reads /shared/  │
                                      │  log → ships to  │
                                      │  Loki            │
                                      └──────────────────┘
                                      Shared volume: /shared/log
```

```
Why "sidecar"?

  Analogy from motorcycles — a sidecar is attached to the main vehicle:
    Main vehicle (app container)  = does the primary work
    Sidecar (collector container) =附加 support function

  They move together (same Pod lifecycle).
  They share the road (same network, volumes).
  But the sidecar has its own passenger (own process).
```



### The Two Log Collection Patterns



#### Pattern A: DaemonSet (What This Project Uses)

```
Node
┌───────────────────────────────────────────────┐
│  Promtail Pod (DaemonSet)                     │  ← ONE per node
│  Reads /var/log/pods/* on this node           │
│                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ Pod A   │ │ Pod B   │ │ Pod C   │          │  ← Your app pods
│  │ (app)   │ │ (webhook│ │ (notif) │          │
│  │ stdout  │ │ stdout  │ │ stdout  │          │
│  └────┬────┘ └────┬────┘ └────┬────┘          │
│       │           │           │               │
│       ▼           ▼           ▼               │
│  /var/log/pods/pod-a/...                      │  ← Kubernetes writes here
│  /var/log/pods/pod-b/...                      │
│  /var/log/pods/pod-c/...                      │
│       │                                       │
│       └── Promtail reads ALL of these         │
└───────────────────────┬───────────────────────┘
                        │ push
                        ▼
                      Loki
```



#### Pattern B: Sidecar (One Per Pod)

```
Node
┌───────────────────────────────────────────────┐
│  Pod A (app)                                  │
│  ┌─────────────────────────────────┐          │
│  │  Container 1: app               │          │
│  │  writes to /shared/app.log      │          │
│  ├─────────────────────────────────┤          │
│  │  Container 2: collector         │← SIDECAR │
│  │  reads /shared/app.log → Loki   │          │
│  └─────────────────────────────────┘          │
│                                               │
│  Pod B (webhook)                              │
│  ┌─────────────────────────────────┐          │
│  │  Container 1: webhook           │          │
│  │  writes to /shared/app.log      │          │
│  ├─────────────────────────────────┤          │
│  │  Container 2: collector         │← SIDECAR │
│  │  reads /shared/app.log → Loki   │          │
│  └─────────────────────────────────┘          │
└───────────────────────────────────────────────┘
```



### Detailed Comparison


| Aspect                    | DaemonSet (Promtail)         | Sidecar                     |
| ------------------------- | ---------------------------- | --------------------------- |
| **How many collectors?**  | One per NODE                 | One per POD                 |
| **What it reads**         | `/var/log/pods/`* (all pods) | Only its own pod's logs     |
| **Resource overhead**     | Low (1 per node)             | High (N total)              |
| **App changes needed?**   | None (stdout)                | App writes to shared volume |
| **Log parsing**           | Centralized (one config)     | Per-pod (custom each)       |
| **Deployment complexity** | Install once                 | Modify EVERY pod spec       |




### Why This Project Uses DaemonSet

```
Reason 1: Zero app changes
  App writes to stdout (pino default).
  Promtail reads /var/log/pods/ automatically.
  No code changes, no Dockerfile changes.

Reason 2: One install for ALL services
  Install Promtail DaemonSet once → collects logs from ALL 11 pods.
  With sidecars: modify the deployment YAML of ALL 11 services.

Reason 3: Resource efficiency
  Minikube: 1 node → 1 Promtail pod collects all logs.
  Sidecars: 11 extra containers (~50-100MB each) = 550MB-1.1GB extra.

Reason 4: Kubernetes-native
  DaemonSet reads K8s metadata (namespace, pod name, labels)
  automatically — no per-service configuration needed.
```



### When You WOULD Use Sidecars

```
Sidecars are better when:

  1. Per-pod log parsing is needed
     Webhook needs JSON parsing, analytics needs regex.
     DaemonSet uses ONE pipeline for all pods.

  2. Tail-based sampling
     Ship 1% of success logs, 100% of errors.
     Sidecar inspects before shipping; DaemonSet ships everything.

  3. Can't access /var/log/pods/
     Some managed K8s clusters restrict node filesystem access.
     Sidecar reads from shared volume (always works).

  4. App logs to a file (not stdout)
     DaemonSet can't see container-internal files.
     Sidecar shares the volume and reads the file.
```



### The Sidecar Pattern Beyond Logging

Sidecars aren't just for logs. The pattern is used for many cross-cutting concerns:

```
Common sidecar use cases:

  1. Log collector (Fluentd, Filebeat)
     App writes logs → sidecar ships them

  2. Metrics exporter
     App exposes JSON stats → sidecar converts to Prometheus format

  3. Service mesh proxy (Envoy/Istio)        ← Most famous use
     Every pod gets an Envoy sidecar
     Handles mTLS, retries, circuit breaking, traffic shaping

  4. Configuration reloader
     Sidecar watches ConfigMap → writes file → signals app to reload

  5. Health check proxy
     Sidecar runs TCP check → exposes /health for K8s probes
```



### Sidecar vs initContainer — Don't Confuse Them

Both add a second container to a Pod, but they run at different times:

```
initContainer (runs BEFORE the main container):

  Pod startup:
  ┌──────────────────────────┐
  │  initContainer           │  ← Runs first, then EXITS
  │  "wait for MinIO health" │
  └─────────────┬────────────┘
                │ (exits successfully)
                ▼
  ┌──────────────────────────┐
  │  Main container (app)    │  ← Runs second, stays running
  └──────────────────────────┘

  Used for: setup tasks (wait for dependency, seed DB)


sidecar (runs ALONGSIDE the main container):

  ┌──────────────────────────┐
  │  Container 1: app        │  ← Both run simultaneously
  │  (writes logs)           │     throughout the Pod's life
  ├──────────────────────────┤
  │  Container 2: collector  │  ← Runs the whole time
  │  (reads logs, ships)     │
  └──────────────────────────┘

  Used for: ongoing support (log collection, proxy, monitoring)
```

This project uses initContainers (file-service waits for MinIO, search-sync waits for Meilisearch) but does NOT use sidecars. Promtail (DaemonSet) collects logs at the node level instead.

---



## 10. Querying Logs with LogQL

LogQL is Loki's query language. It looks similar to PromQL but is designed for logs, not metrics.

### LogQL Syntax: Two Parts

Every LogQL query has two parts:

```
{label selectors} |= "filter text"
       │                   │
       │                   └── (Optional) filter stage
       │                       Narrows down which lines to keep
       │
       └── Stream selector (required)
           Selects WHICH log streams to search
```



### Stream Selectors (the `{}` part)

Stream selectors choose which log streams to query, based on labels that Promtail attached:

```
{namespace="task-manager"}                              -- all task-manager logs
{namespace="task-manager", container="webhook"}         -- only webhook service
{namespace="monitoring", pod="loki-0"}                  -- only Loki's own logs
{namespace="task-manager", container="app"}             -- main Next.js app
```

```
How labels get there:

  Kubernetes labels pods:     app=task-manager, component=webhook
  Promtail reads these:       adds them as Loki labels
  Result in Loki:             {namespace="task-manager", container="webhook", pod="task-manager-webhook-abc"}
```



### Filter Operators

After the stream selector, you can filter log lines:

```
Operator   Meaning                      Example
|=         Contains                     |= "error"
!=         Does NOT contain             != "debug"
|~         Matches regex                |~ "task\\.(created|updated)"
!~         Does NOT match regex         !~ "GET /static"
```



### Common LogQL Query Patterns

**Find all errors in task-manager:**

```logql
{namespace="task-manager"} |= "error"
```

**Find errors in a specific service:**

```logql
{namespace="task-manager", container="webhook"} |= "error"
```

**Find lines mentioning a specific task ID:**

```logql
{namespace="task-manager"} |= "clx1234567890"
```

**Find all 500 errors in app logs:**

```logql
{namespace="task-manager", container="app"} |= "status\":5"
```



### LogQL for Metrics (Range Aggregations)

LogQL can also compute metrics from logs (this is Loki's "metrics query" mode):

```
Count log lines per pod in the last 5 minutes:
  sum(count_over_time({namespace="task-manager"}[5m])) by (pod)

  Result:
    {pod="task-manager-app-xxx"}      142
    {pod="task-manager-webhook-xxx"}  38
    {pod="task-manager-notif-xxx"}    12

Count error lines per container:
  sum(count_over_time({namespace="task-manager"} |= "error"[5m])) by (container)

Rate of log lines (per second):
  sum(rate({namespace="task-manager"}[1m])) by (container)
```



### How to Run LogQL Queries

```
Option 1: Grafana UI (recommended)
  1. kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
  2. Open http://localhost:3001 → login (admin/admin)
  3. Click "Explore" (compass icon in left sidebar)
  4. Select "Loki" as data source
  5. Type LogQL → click "Run query"

Option 2: Loki HTTP API (programmatic)
  curl -G -s "http://loki:3100/loki/api/v1/query_range" \
    --data-urlencode 'query={namespace="task-manager"} |= "error"' \
    --data-urlencode 'start=2026-07-18T12:00:00Z' \
    --data-urlencode 'end=2026-07-18T13:00:00Z'
```



### LogQL vs PromQL


| Aspect               | PromQL                          | LogQL                                |
| -------------------- | ------------------------------- | ------------------------------------ |
| **Used for**         | Metrics (numbers)               | Logs (text)                          |
| **Data source**      | Prometheus                      | Loki                                 |
| **Example**          | `rate(http_requests_total[5m])` | `{namespace="app"}                   |
| **Selects by**       | Metric name + labels            | Stream labels                        |
| **Time aggregation** | Built-in (rate, sum, avg)       | Separate functions (count_over_time) |


```
Why are they similar?

  Loki was designed to feel like Prometheus for logs.
  If you know PromQL, LogQL feels natural.
  The {label="value"} syntax is shared.
  This was an intentional design choice by Grafana Labs.
```

---



## 11. Hands-On Exercises

These exercises walk you through using the monitoring stack that's already deployed in your Minikube cluster.

### Exercise 1: Verify the Monitoring Stack

```bash
# Check all monitoring pods are running
kubectl get pods -n monitoring

# Expected:
#   monitoring-grafana-xxx                 1/1 Running
#   monitoring-kube-prometheus-prometheus  2/2 Running
#   prometheus-operator-xxx                1/1 Running
#   loki-0                                 1/1 Running
#   promtail-xxx                           1/1 Running
#   alertmanager-xxx                       1/1 Running

# Check the main app's ServiceMonitor exists
kubectl get servicemonitor -n task-manager

# Expected:
#   task-manager   task-manager-app   5m
```



### Exercise 2: Open Prometheus and Run a Query

```bash
# Port-forward Prometheus
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090

# Open http://localhost:9090 in browser
```

Try these PromQL queries in the Prometheus UI:

```
1. See if your app's metrics are being scraped:
   http_request_duration_seconds_count

2. Request rate over the last 5 minutes:
   rate(http_request_duration_seconds_count[5m])

3. Task operations counter:
   task_operations_total

4. Default metrics (Node.js GC, event loop):
   process_resident_memory_bytes
   nodejs_eventloop_lag_seconds

5. See all metrics from your app:
   {job="task-manager/task-manager-app"}
```



### Exercise 3: Open Grafana and Explore

```bash
# Port-forward Grafana
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80

# Open http://localhost:3001 (admin/admin)
```

Tasks:

1. Click **Explore** → select **Prometheus** datasource → run a PromQL query
2. Click **Explore** → select **Loki** datasource → run a LogQL query
3. Browse **Dashboards** → look at pre-built "Node Exporter" or "Kubernetes Compute Resources" dashboards
4. Create a new dashboard → add a panel → query: `rate(http_request_duration_seconds_count[5m])` → set visualization to "Time series"



### Exercise 4: Generate Traffic and Watch Metrics

```bash
# In one terminal, generate traffic to your app
while ($true) { 
    Invoke-WebRequest http://task-manager.local/api/tasks -UseBasicParsing
    Start-Sleep -Milliseconds 200 
}

# (requires minikube tunnel running and hosts file configured)
```

In Grafana (or Prometheus UI), watch:

- `rate(http_request_duration_seconds_count[1m])` — should show spikes from your traffic
- `task_operations_total` — should increment as you create tasks
- `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` — P95 latency



### Exercise 5: Query Logs in Loki

In Grafana → Explore → Loki, run these queries:

```logql
1. All task-manager logs:
   {namespace="task-manager"}

2. Only app logs:
   {namespace="task-manager", container="app"}

3. All errors across services:
   {namespace="task-manager"} |= "error"

4. Logs from a specific service:
   {namespace="task-manager", container="webhook"} |= "delivery"

5. Log volume chart (last 5 min, by pod):
   sum(count_over_time({namespace="task-manager"}[5m])) by (pod)
```



### Exercise 6: Add a Custom Log Statement

Edit `src/app/api/tasks/route.ts` and add a log:

```typescript
import logger from "@/lib/logger";

// Inside GET handler, after fetching tasks:
logger.info({ 
    count: tasks.length, 
    userId: session.user.id 
}, "Tasks fetched");
```

Then:

1. Rebuild the Docker image
2. Load into Minikube
3. Restart the deployment: `kubectl rollout restart deployment/task-manager -n task-manager`
4. Hit the endpoint a few times
5. Query Loki: `{namespace="task-manager", container="app"} |= "Tasks fetched"`

You should see your structured log line with the count and userId fields.

---



## 12. What You've Learned



### The Three Pillars, Connected

```
You started this level learning the concept of observability.
Now you can see how all the pieces fit together:

┌──────────────────────────────────────────────────────────────────────┐
│                       YOUR APPLICATION                                │
│                                                                      │
│  pino logger          prom-client           business operations      │
│  (writes JSON logs    (exposes              (task CRUD, webhooks,    │
│   to stdout)          /api/metrics)          notifications)          │
└──────────┬───────────────────┬──────────────────────────────────────┘
           │                   │
           ▼                   ▼
   ┌───────────────┐  ┌──────────────────┐
   │ Promtail      │  │ ServiceMonitor   │
   │ (DaemonSet)   │  │ (tells Prometheus │
   │               │  │  to scrape)       │
   │ reads         │  └────────┬─────────┘
   │ /var/log/pods │           │
   └───────┬───────┘           │
           │                   │
           ▼                   ▼
   ┌───────────────┐  ┌──────────────────┐
   │ LOKI          │  │ PROMETHEUS       │
   │ (stores logs) │  │ (stores metrics) │
   └───────┬───────┘  └────────┬─────────┘
           │                   │
           └─────────┬─────────┘
                     │
                     ▼
           ┌──────────────────┐
           │     GRAFANA      │
           │ (dashboards)     │
           │                  │
           │  Prometheus →    │
           │    charts        │
           │  Loki →          │
           │    log tables    │
           └──────────────────┘
```



### Key Concepts Recap


| Concept            | What It Does                                    | Where in This Project                            |
| ------------------ | ----------------------------------------------- | ------------------------------------------------ |
| **Metrics**        | Numeric time-series data (counters, histograms) | `/api/metrics` endpoint via prom-client          |
| **Logs**           | Structured event records (JSON)                 | pino logger writing to stdout                    |
| **Traces**         | Request flow across services                    | (Not implemented in this project)                |
| **Prometheus**     | Scrapes and stores metrics                      | `monitoring` namespace, ClusterIP service        |
| **prom-client**    | Node.js library that exposes metrics            | `src/lib/metrics.ts`                             |
| **ServiceMonitor** | Tells Prometheus what to scrape                 | `helm-chart/templates/servicemonitor.yaml`       |
| **Grafana**        | Visualizes metrics and logs                     | Pre-built dashboards + custom panels             |
| **pino**           | Structured JSON logger                          | `src/lib/logger.ts`                              |
| **Loki**           | Stores logs (indexed by labels)                 | `monitoring` namespace, StatefulSet with 5Gi PVC |
| **Promtail**       | Ships logs from nodes to Loki                   | DaemonSet (one per node)                         |
| **LogQL**          | Loki's query language                           | Used in Grafana Explore → Loki                   |
| **PromQL**         | Prometheus's query language                     | Used in Grafana Explore → Prometheus             |




### The DaemonSet vs Sidecar Lesson

You asked about this specifically. Here's the short version:

```
DaemonSet (what this project uses):
  ONE collector per NODE
  Reads /var/log/pods/* (all pods on that node)
  Zero app changes
  Installed once, works for all services

Sidecar (alternative pattern):
  ONE collector per POD (second container in same pod)
  Reads shared volume
  More resource overhead
  Must modify every pod spec

This project uses DaemonSet because:
  - Simpler (install once vs modify 11 deployments)
  - Cheaper (1 collector vs 11 collectors)
  - Standard for stdout-based logging in K8s
```



### Why Monitoring Matters

```
Without monitoring:
  User: "The app is slow."
  You:  kubectl logs task-manager-xxx | grep "slow"
       (searches ONE pod, hopes to find the issue)

With monitoring:
  User: "The app is slow."
  You:  Open Grafana → see P99 latency spiked at 2 PM
       Open Loki → see "Database connection timeout" at 2 PM
       Correlate: latency spike matches DB timeout
       Fix: increase connection pool size
```

Monitoring turns "guessing" into "knowing." It's the difference between debugging by trial-and-error and debugging by evidence.

### Connecting to Previous Levels

```
Level 4 (Kubernetes): You deployed pods, services, ingress.
Level 5 (Helm): You packaged everything as a Helm chart.
Level 6 (Microservices): You split the monolith into 8 services.
Level 7 (Observability): You added monitoring to ALL of the above.

  Monitoring is not a new component — it's a layer on TOP of everything.
  It doesn't change how your app works.
  It changes how well you UNDERSTAND how your app works.

  Every metric, every log line, every dashboard is a window
  into what's happening inside your distributed system.
```



### What's Next

Level 8 will cover **Production Readiness** — the final polish:

- CI/CD pipelines (you already have one in `.github/workflows/ci.yml`)
- Security best practices (secrets management, RBAC, network policies)
- Backup and disaster recovery
- Performance tuning (HPA, resource optimization)
- Cost optimization

By the end of Level 8, you'll have a complete picture of how a production-grade application is built, deployed, monitored, and maintained.

---

**End of Level 7 — Observability & Monitoring**