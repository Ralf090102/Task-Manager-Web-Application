# Level 5: Helm Charts & Multi-Service Management

**Duration:** 6 hours  
**Goal:** Understand how Helm templates generate Kubernetes resources, and how 11 services are managed as one unit

---

## Table of Contents

1. [What is Helm?](#1-what-is-helm)
2. [Chart Structure](#2-chart-structure)
3. [The Template Engine: Templates to YAML](#3-the-template-engine-templates-to-yaml)
4. [values.yaml: The Configuration Layer](#4-valuesyaml-the-configuration-layer)
5. [Template Functions](#5-template-functions)
6. [Conditional Rendering](#6-conditional-rendering)
7. [_helpers.tpl: Reusable Functions](#7-helperstpl-reusable-functions)
8. [Helm Commands](#8-helm-commands)
9. [The --reuse-values Trap](#9-the---reuse-values-trap)
10. [Helm Hooks](#10-helm-hooks)
11. [Multi-Service Chart Organization](#11-multi-service-chart-organization)
12. [Hands-On Exercises](#12-hands-on-exercises)
13. [The Template Pipeline](#13-the-template-pipeline)
14. [What Helm Actually Gives You (And What It Doesn't)](#14-what-helm-actually-gives-you-and-what-it-doesnt)
15. [Resource Decision Framework](#15-resource-decision-framework)
16. [What You've Learned](#16-what-youve-learned)

---

## 1. What is Helm?

### The Problem Helm Solves

In Level 4, you learned about Deployments, Services, Ingress, ConfigMaps, Secrets, etc. Each is a raw Kubernetes YAML file:

```yaml
# A raw K8s Deployment — no Helm, just plain YAML
apiVersion: apps/v1
kind: Deployment
metadata:
  name: task-manager
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: task-manager
      app.kubernetes.io/instance: task-manager
      app.kubernetes.io/component: app
  template:
    spec:
      containers:
        - name: task-manager
          image: "ralf090102/task-manager-app:latest"
          env:
            - name: DATABASE_URL
              value: "postgresql://postgres:postgres@db:5432/taskmanager"
```

This works for ONE service. But this project has **11 services**. That means:

```
Without Helm — 40+ raw YAML files:

deploy-notification.yaml
deploy-realtime.yaml
deploy-webhook.yaml
deploy-file-service.yaml
deploy-search-sync.yaml
deploy-analytics.yaml
deploy-team-service.yaml
deploy-app.yaml
svc-notification.yaml
svc-realtime.yaml
svc-webhook.yaml
... (and 30 more)

Problems:
  ├── Massive duplication (same labels, same patterns)
  ├── No variables (hardcode image tags, secrets, URLs)
  ├── No conditional logic (can't say "only deploy if enabled")
  ├── No rollback, no versioning
  └── Updating one value = edit 11 files
```

### The Helm Solution

Helm is a **template engine + package manager** for Kubernetes. You write templates with **variables**, and Helm generates the raw YAML for you:

```
Helm Chart (templates with variables)        Raw Kubernetes YAML (generated)
──────────────────────────────────────        ──────────────────────────────────

{{ .Values.replicaCount }}            →       replicas: 1

"{{ .Values.image.repository }}       →       image: "ralf090102/task-manager-app:latest
 :{{ .Values.image.tag }}"                    

{{- if .Values.notification.enabled }} →      (entire notification Deployment included)
  <notification deployment>                   (or completely omitted if disabled)
{{- end }}

{{ .Values.secrets.databaseUrl         →       database-url: cG9zdGdyZXNxbDovL...
 | b64enc | quote }}                          (base64-encoded, quoted)
```

**One** `helm upgrade` **command** generates and applies all 40+ YAML manifests from templates.

### Helm vs kubectl apply

```
kubectl apply (Level 4):              Helm (Level 5):

Write raw YAML files                  Write template files (.yaml.tpl)
  deployment.yaml                       deployment.yaml (with {{ }})
  service.yaml                          service.yaml (with {{ }})
                                        values.yaml (variables)

kubectl apply -f deployment.yaml     helm install task-manager ./helm-chart
  → applies ONE file                   → generates ALL yaml from templates
  → no variables                       → applies ALL at once
  → no rollback                        → variables from values.yaml + --set
  → manual management                  → helm rollback, helm upgrade
```

### The Mental Model

```
┌──────────────────────────────────────────────────────────────────┐
│                    HELM WORKFLOW                                 │
│                                                                  │
│  You write:                    Helm does:                        │
│                                                                  │
│  Chart.yaml ──────────────→  Reads chart metadata                │
│                              (name, version)                     │
│                                                                  │
│  values.yaml ──────────────→  Reads default values               │
│                                (image, ports, resources)         │
│                                                                  │
│  --set key=value ──────────→  Overrides values from CLI          │
│                                (secrets, image tags)             │
│                                                                  │
│  templates/*.yaml ────────→  Renders each template               │
│                                (replaces {{ }} with values)      │
│                                                                  │
│                              Sends rendered YAML to Kubernetes   │
│                                (kubectl apply under the hood)    │
│                                                                  │
│  Kubernetes ───────────────→  Creates Pods, Services, etc.       │
│                                (exactly like Level 4)            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Chart Structure

Every Helm chart has this structure:

```
task-manager/helm-chart/
├── Chart.yaml              ← Chart metadata (name, version)
├── values.yaml             ← Default configuration values
├── templates/              ← Kubernetes YAML templates
│   ├── _helpers.tpl        ← Reusable template functions
│   ├── secret.yaml         ← Shared secrets (DB URL, etc.)
│   ├── task-manager/       ← Main app (4 templates)
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── ingress.yaml
│   │   └── servicemonitor.yaml
│   ├── scheduler/          ← CronJob (1 template)
│   │   └── cronjob.yaml
│   ├── notification/       ← Notification service (3 templates)
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── secret.yaml
│   ├── minio/              ← MinIO storage (4 templates)
│   │   ├── statefulset.yaml
│   │   ├── headless-service.yaml
│   │   ├── service.yaml
│   │   └── secret.yaml
│   ├── file-service/       ← File service (2 templates)
│   ├── search/             ← Meilisearch (4 templates)
│   ├── search-sync/        ← Search sync (2 templates)
│   ├── realtime/           ← Realtime (2 templates)
│   ├── analytics/          ← Analytics (3 templates)
│   ├── webhook/            ← Webhook (3 templates)
│   └── team-service/       ← Team service (3 templates)
│       ├── deployment.yaml
│       ├── service.yaml
│       └── db-migration-job.yaml
```

### Chart.yaml

```yaml
# helm-chart/Chart.yaml

apiVersion: v2          # Helm 3 chart format
name: task-manager      # Chart name
description: Task Manager Web Application
type: application       # "application" (not a library chart)
version: 1.0.0          # CHART version (bump when templates change)
appVersion: "1.0.0"     # APP version (what's in the Docker image)
```

**Two version numbers?**

- `version: 1.0.0` — The chart itself changed (new template, new value, bug fix)
- `appVersion: "1.0.0"` — The application code changed (new feature in the Docker image)

These are independent — you might change the chart (add a new annotation) without changing the app, or vice versa.

### The Template Naming Convention

```
_templates/                          ← Underscore files are NOT rendered
  _helpers.tpl                         Helm ignores files starting with _

templates/                           ← Everything else IS rendered
  secret.yaml                          → generates a Secret
  task-manager/deployment.yaml         → generates a Deployment
  scheduler/cronjob.yaml               → generates a CronJob
```

---

## 3. The Template Engine: Templates to YAML

This is the most important section. It bridges Level 4 (raw K8s concepts) to Level 5 (Helm templates).

### Side-by-Side: Template vs Generated YAML

Here's the main app's Deployment **template** and the **YAML it generates**:

```
TEMPLATE (what you write)                    GENERATED YAML (what K8s receives)
─────────────────────────                    ──────────────────────────────────

apiVersion: apps/v1                         apiVersion: apps/v1
kind: Deployment                            kind: Deployment
metadata:                                   metadata:
  name: {{ include "task-manager              name: task-manager
    .fullname" . }}                         labels:
  labels:                                       helm.sh/chart: task-manager-1.0.0
    {{- include "task-manager                   app.kubernetes.io/name: task-manager
    .labels" . | nindent 4 }}                   app.kubernetes.io/instance: task-manager
spec:                                          app.kubernetes.io/version: "1.0.0"
  replicas: {{ .Values.replicaCount }}         app.kubernetes.io/managed-by: Helm
  selector:                                 spec:
    matchLabels:                              replicas: 1
      {{- include "task-manager               selector:
      .selectorLabels" . | nindent 6 }}         matchLabels:
      app.kubernetes.io/component: app             app.kubernetes.io/name: task-manager
  template:                                        app.kubernetes.io/instance: task-manager
    metadata:                                      app.kubernetes.io/component: app
      labels:                                  template:
        {{- include "task-manager                 metadata:
        .selectorLabels" . | nindent 8 }}           labels:
        app.kubernetes.io/component: app               app.kubernetes.io/name: task-manager
    spec:                                              app.kubernetes.io/instance: task-manager
      containers:                                      app.kubernetes.io/component: app
        - name: {{ .Chart.Name }}              spec:
          image: "{{ .Values.image                containers:
            .repository }}:{{ .Values               - name: task-manager
            .image.tag }}"                            image: "ralf090102/task-manager-app
          imagePullPolicy: {{ .Values                  :latest"
            .image.pullPolicy }}                     imagePullPolicy: Never
          ports:                                     ports:
            - name: http                               - name: http
              containerPort: 3000                        containerPort: 3000
```

**Every** `{{ }}` **was replaced with a value.** That's the core of Helm.

### How Template Variables Work

```
Template variable:              {{ .Values.image.repository }}

Values.yaml has:                image:
                                  repository: ralf090102/task-manager-app

Result after rendering:         ralf090102/task-manager-app
```

```
Template variable:              {{ .Values.replicaCount }}

Values.yaml has:                replicaCount: 1

Result after rendering:         1
```

### The Dot (.) — What It Means

The `.` in `{{ .Values.X }}` is the **current context** — a data structure Helm passes to every template:

```
. (the dot — the entire Helm context)
├── .Values          ← From values.yaml + --set flags
├── .Chart           ← From Chart.yaml (name, version, appVersion)
├── .Release         ← About this deployment (name, namespace, revision)
├── .Template        ← About the current template file
└── .Files           ← Files in the chart directory
```

Common usages:

```
{{ .Values.image.tag }}         → "latest" (from values.yaml)
{{ .Chart.Name }}               → "task-manager" (from Chart.yaml)
{{ .Release.Name }}             → "task-manager" (from helm install command)
{{ .Release.Namespace }}        → "task-manager" (from --namespace flag)
```

### The Pipeline Operator (|)

Helm uses `|` to chain functions, similar to Unix pipes:

```
Without pipeline:                    With pipeline:

{{ quote .Values.image.repository }}  {{ .Values.image.repository | quote }}
                                      ↓ same as above

{{ b64enc .Values.secrets.databaseUrl }}  {{ .Values.secrets.databaseUrl | b64enc }}
                                          ↓ base64-encode the value

Multiple functions:                  {{ .Values.secrets.databaseUrl | b64enc | quote }}
                                     ↓ base64-encode, then add quotes
                                     "cG9zdGdyZXNxbDovL..."
```

---

## 4. values.yaml: The Configuration Layer

`values.yaml` is the **single source of truth** for all configurable parameters. Every service reads from it:

```yaml
# helm-chart/values.yaml (abbreviated)

# ─── Main App ───
replicaCount: 1                    # {{ .Values.replicaCount }}

image:
  repository: ralf090102/task-manager-app
  pullPolicy: IfNotPresent
  tag: latest                      # {{ .Values.image.tag }}

service:
  type: ClusterIP
  port: 3000                       # {{ .Values.service.port }}

resources:                         # {{ .Values.resources }}
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

# ─── Scheduler (CronJob) ───
scheduler:
  enabled: true                    # {{ .Values.scheduler.enabled }}
  schedule: "*/5 * * * *"          # {{ .Values.scheduler.schedule }}
  image:
    repository: ralf090102/scheduler-service
    pullPolicy: IfNotPresent
    tag: latest

# ─── Notification Service ───
notification:
  enabled: false                   # {{ .Values.notification.enabled }}
  image:
    repository: ralf090102/notification-service
    # ...
  smtp:
    host: ""                       # {{ .Values.notification.smtp.host }}

# ─── Each microservice follows the same pattern ───
# realtime, webhook, fileService, minio, meilisearch, etc.
```

### How Values Flow into Templates

```
values.yaml                      Template                          Kubernetes receives
──────────                       ──────────                         ────────────────────

notification:                    {{- if .Values.notification        (if enabled: true)
  enabled: false                   .enabled }}                       apiVersion: apps/v1
  image:                          apiVersion: apps/v1                kind: Deployment
    repository: ralf090102/       kind: Deployment                   metadata:
      notification-service          metadata:                           name: task-manager-notification
    tag: latest                     name: {{ include                      ...
                                   "task-manager.fullname" .
                                    }}-notification                   (if enabled: false)
                                   ...                                ← ENTIRELY OMITTED
                                   {{- end }}                           (no YAML generated)
```

### Overriding Values at Deploy Time

You don't edit `values.yaml` directly for secrets. Instead, use `--set` flags:

```bash
helm install task-manager ./helm-chart \
  --namespace task-manager \
  --set image.pullPolicy=Never \
  --set secrets.databaseUrl="postgresql://postgres:..." \
  --set notification.enabled=true \
  --set notification.image.repository=ralf090102/notification-service \
  --set notification.image.tag=latest
```

```
Precedence (highest to lowest):

  --set flag (CLI)           ← Overrides everything
    ↓
  --values custom.yaml       ← Overrides defaults
    ↓
  values.yaml (chart)        ← Default values

Example:
  values.yaml says:    notification.enabled: false
  --set says:          notification.enabled=true
  Result:              true (--set wins)
```

---

## 5. Template Functions

Helm has 60+ built-in functions. Here are the ones used in this project:

### quote — Add Double Quotes

```yaml
# Template:
schedule: {{ .Values.scheduler.schedule | quote }}

# values.yaml:
schedule: "*/5 * * * *"

# Rendered:
schedule: "*/5 * * * *"
```

**Why?** YAML interprets `*` and `:` specially. `quote` ensures values are treated as strings.

### b64enc — Base64 Encode

```yaml
# Template (secret.yaml):
data:
  database-url: {{ .Values.secrets.databaseUrl | b64enc | quote }}

# values.yaml:
secrets:
  databaseUrl: "postgresql://postgres:postgres@db:5432/taskmanager"

# Rendered:
data:
  database-url: "cG9zdGdyZXNxbDovL3Bvc3RncmVzO3Bvc3RncmVzQGRiOjU0MzIvdGFza21hbmFnZXI="
```

**Why?** Kubernetes Secrets require base64-encoded values. `b64enc` handles this automatically.

### toYaml — Convert to YAML

```yaml
# Template (deployment.yaml):
          resources:
            {{- toYaml .Values.resources | nindent 12 }}

# values.yaml:
resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

# Rendered:
          resources:
            limits:
              cpu: 500m
              memory: 512Mi
            requests:
              cpu: 250m
              memory: 256Mi
```

**Why?** `toYaml` converts a nested YAML object back into properly indented YAML text. Without it, Helm would render it as a Go map string.

### nindent — Newline + Indent

```yaml
# Template:
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}

# "include" returns multi-line text:
#   helm.sh/chart: task-manager-1.0.0
#   app.kubernetes.io/name: task-manager

# nindent 4 adds a newline + 4 spaces before each line:
  labels:
    helm.sh/chart: task-manager-1.0.0
    app.kubernetes.io/name: task-manager
```

**Why?** Template functions output text without indentation. `nindent N` ensures proper YAML indentation by adding a newline and N spaces.

### default — Fallback Value

```yaml
# Template:
MAX_ATTEMPTS: "{{ .Values.webhook.retry.maxAttempts | default 5 }}"

# If values.yaml has webhook.retry.maxAttempts: 5  → renders "5"
# If values.yaml omits it entirely                  → renders "5" (default)
```

### join — Join Array to String

```yaml
# Template (webhook configmap):
BACKOFF_INTERVALS: "{{ join "," (.Values.webhook.retry.intervals
                      | default (list 1 5 30 120 600)) }}"

# values.yaml:
webhook:
  retry:
    intervals: [1, 5, 30, 120, 600]

# Rendered:
BACKOFF_INTERVALS: "1,5,30,120,600"
```

---

## 6. Conditional Rendering

### The if/end Block

This is how services are enabled or disabled:

```yaml
# notification/deployment.yaml

{{- if .Values.notification.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "task-manager.fullname" . }}-notification
  # ... entire Deployment spec ...

{{- end }}
```

```
If notification.enabled = true:          If notification.enabled = false:

  apiVersion: apps/v1                      (nothing — entire file is empty)
  kind: Deployment                          Helm generates NO YAML for this
  metadata:                                 service at all
    name: task-manager-notification
  ...
```

### How This Controls the Deployment

```bash
# Deploy WITHOUT notification (notification.enabled: false in values.yaml)
helm install task-manager ./helm-chart --namespace task-manager
# → Only main app + scheduler deployed
# → notification templates generate nothing

# Deploy WITH notification
helm install task-manager ./helm-chart \
  --set notification.enabled=true
# → notification Deployment + Service created
```

### Whitespace Control

The dashes in `{{-` and `-}}` trim whitespace:

```yaml
# Without {{- (the dash):
{{ if .Values.x }}
content
{{ end }}

# Renders as (ugly blank lines):
(blank line)
content
(blank line)

# With {{- (trim leading whitespace):
{{- if .Values.x }}
content
{{- end }}

# Renders as (clean):
content
```

**Rule:** Always use `{{-` at the start and `-}}` at the end of control blocks to avoid blank lines in generated YAML.

### Nested Conditionals (Real Example)

The Ingress template conditionally adds WebSocket routing:

```yaml
# ingress.yaml

spec:
  rules:
    - host: {{ .Values.ingress.hosts[0].host | quote }}
      http:
        paths:
          {{- if $.Values.realtime.enabled }}
          - path: /socket.io              # Only if realtime is enabled
            pathType: Prefix
            backend:
              service:
                name: {{ include "task-manager.fullname" $ }}-realtime
                port:
                  number: 3001
          {{- end }}
          - path: /                       # Always present
            pathType: Prefix
            backend:
              service:
                name: {{ include "task-manager.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
```

---

## 7. _helpers.tpl: Reusable Functions

### What Are Helper Templates?

`_helpers.tpl` defines reusable template functions — like functions in programming. They prevent repeating the same labels across 40+ template files:

```yaml
# helm-chart/templates/_helpers.tpl

{{- define "task-manager.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "task-manager.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Chart.Name }}
{{- end }}
{{- end }}

{{- define "task-manager.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "task-manager.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "task-manager.selectorLabels" -}}
app.kubernetes.io/name: {{ include "task-manager.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

### How Helpers Are Used

Every template calls these helpers instead of hardcoding labels:

```yaml
# In ANY template file:

metadata:
  name: {{ include "task-manager.fullname" . }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: app
```

This generates:

```yaml
metadata:
  name: task-manager
  labels:
    helm.sh/chart: task-manager-1.0.0
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/instance: task-manager
    app.kubernetes.io/version: "1.0.0"
    app.kubernetes.io/managed-by: Helm
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: task-manager
      app.kubernetes.io/instance: task-manager
      app.kubernetes.io/component: app
```

**The benefit:** Change a label in `_helpers.tpl` once → it updates across all 40+ templates instantly.

### define vs include

```
define:                    include:
─────────                  ────────
{{- define "name" -}}      {{ include "name" . }}
  (template content)             ↑
{{- end }}                       Calls the defined function
                                 Passes "." (current context)
Creates a reusable
template function          Returns the rendered text
```

---

## 8. Helm Commands

### install — First Deployment

```bash
helm install task-manager ./helm-chart \
  --namespace task-manager \
  --create-namespace \
  --set image.pullPolicy=Never \
  --set secrets.databaseUrl="postgresql://..." \
  --set secrets.nextauthSecret="my-secret" \
  --set secrets.nextauthUrl="http://task-manager.local"
```

```
helm install <release-name> <chart-path>
  --namespace         Where to deploy
  --create-namespace  Create namespace if it doesn't exist
  --set               Override values (key=value)
  --values / -f       Override from a YAML file
```

### upgrade — Update an Existing Release

```bash
# Upgrade with new values
helm upgrade task-manager ./helm-chart \
  --namespace task-manager \
  --reuse-values \
  --set notification.enabled=true \
  --set notification.image.repository=ralf090102/notification-service \
  --set notification.image.tag=latest \
  --set notification.image.pullPolicy=Never
```

```
helm upgrade <release-name> <chart-path>
  --reuse-values   Keep all values from previous release
                   (only change what --set overrides)
  --set            Override specific values
```

`upgrade --install` — Install if not exists, upgrade if exists:

```bash
helm upgrade --install task-manager ./helm-chart \
  --namespace task-manager \
  --set image.pullPolicy=Never
```

### Other Essential Commands

```bash
# List all releases
helm list -n task-manager

# Show release status
helm status task-manager -n task-manager

# View release history (every upgrade = a revision)
helm history task-manager -n task-manager
# REVISION  STATUS      AGE   DESCRIPTION
# 1         superseded  10m   Install complete
# 2         deployed    2m    Upgrade complete  ← current

# Rollback to previous revision
helm rollback task-manager 1 -n task-manager
# Goes back to revision 1

# Uninstall (delete everything)
helm uninstall task-manager -n task-manager

# Render templates WITHOUT applying (dry run — for debugging)
helm template task-manager ./helm-chart \
  --namespace task-manager \
  --set notification.enabled=true
# Prints all generated YAML to stdout
# Great for understanding what Helm generates

# Get values for a running release
helm get values task-manager -n task-manager
# Shows all --set values currently in effect
```

---

## 9. The --reuse-values Trap

### What --reuse-values Does

`--reuse-values` tells Helm: "Keep all values from the previous release, only change what I explicitly `--set`."

```bash
# First install: sets ALL values
helm install task-manager ./helm-chart \
  --set secrets.databaseUrl="postgresql://..." \
  --set notification.enabled=true \
  --set notification.image.repository=ralf090102/notification-service

# Later upgrade: only changes ONE thing, keeps everything else
helm upgrade task-manager ./helm-chart \
  --reuse-values \
  --set notification.image.tag=v2.0
```

### The Trap: New values.yaml Keys Are NOT Picked Up

This is the #1 Helm gotcha in this project:

```
Scenario: You add a new service "webhook" to values.yaml

values.yaml (UPDATED):
  webhook:                          ← NEW section
    enabled: false
    image:
      repository: ralf090102/webhook-service
      tag: latest

You run:
  helm upgrade task-manager ./helm-chart \
    --reuse-values \
    --set webhook.enabled=true

What happens:
  --reuse-values loads values from the PREVIOUS release
  The previous release didn't have "webhook" in its values
  webhook.* keys DON'T EXIST in the stored values
  --set webhook.enabled=true sets one key
  BUT webhook.image.repository, webhook.image.tag, etc. are EMPTY

Result: Webhook pod fails with ImagePullBackOff
  (empty image name)
```

### The Solution

For new services, pass ALL values via `--set` on the first deploy:

```bash
helm upgrade task-manager ./helm-chart \
  --reuse-values \
  --set webhook.enabled=true \
  --set webhook.image.repository=ralf090102/webhook-service \
  --set webhook.image.tag=latest \
  --set webhook.image.pullPolicy=Never \
  --set webhook.resources.limits.cpu=250m \
  --set webhook.resources.limits.memory=256Mi \
  --set webhook.resources.requests.cpu=100m \
  --set webhook.resources.requests.memory=128Mi

# Subsequent upgrades only need:
helm upgrade task-manager ./helm-chart --reuse-values
# (values are now persisted from the first explicit deploy)
```

```
┌────────────────────────────────────────────────────────────────┐
│  RULE: --reuse-values reads the PREVIOUS release's values,     │
│  NOT the current values.yaml file.                             │
│                                                                │
│  New keys in values.yaml are invisible to --reuse-values.      │
│  Always pass ALL new keys via --set on first deploy.           │
└────────────────────────────────────────────────────────────────┘
```

---

## 10. Helm Hooks

### What Are Hooks?

Hooks are templates that run at specific points in the release lifecycle — NOT during normal rendering:

```
Normal template:    Rendered during helm install/upgrade
                    (Deployments, Services, etc.)

Hook template:      Runs BEFORE or AFTER install/upgrade
                    (migrations, cleanup, tests)
```

### Hook Types


| Annotation                   | When It Runs                               |
| ---------------------------- | ------------------------------------------ |
| `helm.sh/hook: pre-install`  | Before any resources are created           |
| `helm.sh/hook: pre-upgrade`  | Before any resources are updated           |
| `helm.sh/hook: post-install` | After all resources are created            |
| `helm.sh/hook: post-upgrade` | After all resources are updated            |
| `helm.sh/hook-weight: "-5"`  | Lower weights run first (range: -10 to 10) |


### Real Example: DB Migration Hook

```yaml
# team-service/db-migration-job.yaml

apiVersion: batch/v1
kind: Job
metadata:
  name: task-manager-db-migration
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install     # Run BEFORE upgrade/install
    "helm.sh/hook-weight": "-5"                 # Run before other hooks
    "helm.sh/hook-delete-policy": before-hook-creation
spec:
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: migrate
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          command: ["npx", "prisma", "db", "push", "--accept-data-loss"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: task-manager-secrets
                  key: database-url
```

### Hook Execution Order

```
helm upgrade task-manager ./helm-chart

  1. Pre-upgrade hooks run (hook-weight: -10 to 10)
     ├── db-migration Job (weight: -5)
     │   └── Runs prisma db push
     │   └── Waits for completion before continuing
     │
  2. Normal templates rendered and applied
     ├── Deployments updated (rolling update)
     ├── Services updated
     └── ConfigMaps/Secrets updated
     │
  3. Post-upgrade hooks run (if any)
```

```
Without hooks:                       With hooks:

helm upgrade                         helm upgrade
  → new pods start                    → migration runs FIRST
  → new code expects                    (old pods still running,
    new DB columns                       new code not deployed yet)
  → CRASH (column doesn't exist)      → DB schema updated
  → manual migration needed           → new pods start with correct schema
                                       → zero downtime, no crashes
```

**Note:** This project skips the hook during Minikube deploys (`--no-hooks`) because Supabase's pgbouncer connection doesn't support DDL operations. Schema pushes are done manually via the direct connection.

---

## 11. Multi-Service Chart Organization

### One Chart, Eleven Services

All services live in ONE Helm chart — not separate charts per service:

```
Why one chart?

✅ Single helm install deploys everything
✅ Shared secrets (DATABASE_URL used by 7 services)
✅ Shared _helpers.tpl (same label functions)
✅ Cross-service dependencies (app → notification, file-service → minio)
✅ Conditional enabling (--set notification.enabled=true)
✅ One rollback undoes everything at once
```

### Template Directory Structure

Each service gets its own subdirectory:

```
templates/
├── _helpers.tpl              ← Shared by ALL services
├── secret.yaml               ← Shared by ALL services (DATABASE_URL)
├── task-manager/             ← Main app
│   ├── deployment.yaml       ← Always rendered
│   ├── service.yaml
│   ├── ingress.yaml
│   └── servicemonitor.yaml   ← Only if monitoring.enabled
├── scheduler/
│   └── cronjob.yaml          ← Only if scheduler.enabled
├── notification/
│   ├── deployment.yaml       ← Only if notification.enabled
│   ├── service.yaml
│   └── secret.yaml           ← SMTP credentials
├── minio/
│   ├── statefulset.yaml      ← Only if minio.enabled
│   ├── headless-service.yaml
│   ├── service.yaml
│   └── secret.yaml
├── file-service/
│   ├── deployment.yaml       ← Only if fileService.enabled
│   └── service.yaml
├── search/                   ← Meilisearch
├── search-sync/
├── realtime/
├── analytics/
├── webhook/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml        ← Retry config (no rebuild needed)
└── team-service/
    ├── deployment.yaml
    ├── service.yaml
    └── db-migration-job.yaml ← Helm hook
```

### Shared Resources vs Service-Specific

```
Shared (at templates/ root):            Service-specific (in subdirectory):

secret.yaml                             notification/secret.yaml
  ├── DATABASE_URL                        ├── SMTP_USER
  ├── NEXTAUTH_SECRET                     └── SMTP_PASSWORD
  ├── NEXTAUTH_URL
  └── AUTH_TRUST_HOST                   minio/secret.yaml
                                          ├── accessKey
Used by: app + 6 services                 └── secretKey
(postgres-connected services)
                                        meilisearch/secret.yaml
                                          └── masterKey
```

### Conditional Environment Variables

The main app's Deployment conditionally includes env vars based on which services are enabled:

```yaml
# task-manager/deployment.yaml (env section)

env:
  - name: DATABASE_URL              # Always present
    valueFrom: ...

  {{- if .Values.meilisearch.enabled }}
  - name: MEILI_URL                 # Only if Meilisearch is deployed
    value: "http://{{ include "task-manager.fullname" . }}-meilisearch:7700"
  - name: MEILI_MASTER_KEY
    valueFrom:
      secretKeyRef:
        name: {{ include "task-manager.fullname" . }}-meilisearch-secret
        key: masterKey
  {{- end }}

  {{- if .Values.realtime.enabled }}
  - name: REALTIME_URL              # Only if realtime is deployed
    value: "http://{{ include "task-manager.fullname" . }}-realtime:3001"
  {{- end }}

  {{- if .Values.webhook.enabled }}
  - name: WEBHOOK_URL               # Only if webhook is deployed
    value: "http://{{ include "task-manager.fullname" . }}-webhook:3003"
  {{- end }}
```

This means the app only tries to call services that are actually running — no connection errors to non-existent services.

---

## 12. Hands-On Exercises

### Exercise 1: Render Templates (Dry Run)

See exactly what YAML Helm generates — WITHOUT applying anything:

```bash
cd task-manager

# Render with defaults (most services disabled)
helm template task-manager ./helm-chart \
  --namespace task-manager | less

# Render with notification enabled
helm template task-manager ./helm-chart \
  --namespace task-manager \
  --set notification.enabled=true | less

# Search for the notification deployment in the output
helm template task-manager ./helm-chart \
  --namespace task-manager \
  --set notification.enabled=true | grep -A 20 "kind: Deployment"
```

**This is the best way to learn Helm.** You see the exact YAML that Kubernetes receives.

### Exercise 2: View What's Running

```bash
# List Helm releases
helm list -n task-manager

# Show values currently in effect
helm get values task-manager -n task-manager

# Show release history
helm history task-manager -n task-manager

# Show all resources created by this release
helm get manifest task-manager -n task-manager | less
```

### Exercise 3: Upgrade with a New Value

```bash
# Enable the webhook service
helm upgrade task-manager ./helm-chart \
  --namespace task-manager \
  --reuse-values \
  --set webhook.enabled=true \
  --set webhook.image.repository=ralf090102/webhook-service \
  --set webhook.image.tag=latest \
  --set webhook.image.pullPolicy=Never \
  --set webhook.resources.limits.cpu=250m \
  --set webhook.resources.limits.memory=256Mi \
  --set webhook.resources.requests.cpu=100m \
  --set webhook.resources.requests.memory=128Mi

# Watch the webhook pod start
kubectl get pods -n task-manager -l app.kubernetes.io/component=webhook -w
```

### Exercise 4: Rollback

```bash
# Check history
helm history task-manager -n task-manager

# Rollback to previous revision
helm rollback task-manager 1 -n task-manager

# Verify webhook is gone (if it was added in revision 2)
kubectl get deployments -n task-manager
```

### Exercise 5: Debug a Template

```bash
# Render a specific template and inspect it
helm template task-manager ./helm-chart \
  --namespace task-manager \
  --set notification.enabled=true \
  --set notification.smtp.host="smtp.gmail.com" \
  | grep -A 30 "name: task-manager-notification$"

# Check if environment variables are correct
helm template task-manager ./helm-chart \
  --namespace task-manager \
  --set realtime.enabled=true \
  | grep "REALTIME_URL"
# Should show: value: "http://task-manager-realtime:3001"
```

### Exercise 6: Understand --reuse-values

```bash
# Get current values
helm get values task-manager -n task-manager

# Notice which services are enabled vs disabled
# Try upgrading with just --reuse-values (no changes)
helm upgrade task-manager ./helm-chart \
  --namespace task-manager --reuse-values

# Check history — a new revision was created
helm history task-manager -n task-manager
```

---

## 13. The Template Pipeline

> **This section ties Level 4 (K8s concepts) and Level 5 (Helm templates) together.**

### From Code to Running Pod: The Complete Journey

```
┌───────────────────────────────────────────────────────────────────┐
│  1. DEVELOPER WRITES CODE                                         │
│                                                                   │
│  services/notification/src/index.ts     (TypeScript source)       │
│  services/notification/Dockerfile       (Container instructions)  │
│  helm-chart/templates/notification/     (K8s templates)           │
│    deployment.yaml                                                │
│  helm-chart/values.yaml                (Default config)           │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  2. DOCKER BUILD (Level 3)                                       │
│                                                                  │
│  docker build -t ralf090102/notification-service:latest \        │
│    -f services/notification/Dockerfile .                         │
│                                                                  │
│  Input:  source code + Dockerfile                                │
│  Output: Docker image (node:22-slim + compiled app)              │
│  Store:  Docker Hub (ralf090102/notification-service:latest)     │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│  3. HELM RENDER (Level 5 — THIS LEVEL)                                 │
│                                                                        │
│  helm upgrade task-manager ./helm-chart \                              │
│    --reuse-values \                                                    │
│    --set notification.enabled=true \                                   │
│    --set notification.image.repository=ralf090102/notification-service │
│    --set notification.image.tag=latest                                 │
│                                                                        │
│  Helm reads:                                                           │
│  ├── values.yaml (defaults)                                            │
│  ├── previous release values (--reuse-values)                          │
│  └── --set flags (overrides)                                           │
│                                                                        │
│  Helm renders templates/notification/deployment.yaml:                  │
│  ├── {{ .Values.notification.enabled }}  → true                        │
│  ├── {{ include "task-manager.fullname" . }}-notification              │
│  │   → task-manager-notification                                       │
│  ├── {{ .Values.notification.image.repository }}                       │
│  │   → ralf090102/notification-service                                 │
│  └── {{ toYaml .Values.notification.resources | nindent 12 }}          │
│      → limits: / requests: (YAML block)                                │
│                                                                        │
│  Output: Raw K8s YAML (Deployment + Service)                           │
└───────────────────────────┬────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. KUBERNETES APPLIES (Level 4)                                 │
│                                                                  │
│  Helm sends the rendered YAML to K8s API server                  │
│  K8s creates resources:                                          │
│  ├── Deployment: task-manager-notification                       │
│  │   └── Creates Pod with container from Docker image            │
│  ├── Service: task-manager-notification (ClusterIP)              │
│  │   └── Stable DNS name for other pods to call                  │
│  └── (if new) Secret: SMTP credentials                           │
│                                                                  │
│  K8s ensures:                                                    │
│  ├── Pod is running (restarts if it crashes)                     │
│  ├── Readiness probe passes (/health → 200)                      │
│  └── Resource limits enforced (250m CPU, 256Mi RAM)              │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. APP IS RUNNING                                               │
│                                                                  │
│  Other pods can now reach:                                       │
│  http://task-manager-notification:3004/health                    │
│                                                                  │
│  Main app sends events:                                          │
│  POST http://task-manager-notification:3004/notify/due-soon      │
│  ├── Creates in-app Notification in database                     │
│  └── Sends email (if SMTP configured)                            │
└──────────────────────────────────────────────────────────────────┘
```

### Template → YAML → K8s: A Concrete Trace

Here's exactly what happens when you enable the webhook service:

```
Step 1: You type
  helm upgrade task-manager ./helm-chart \
    --reuse-values --set webhook.enabled=true \
    --set webhook.image.repository=ralf090102/webhook-service

Step 2: Helm reads values
  Previous release values: { ..., webhook: undefined }
  --set overrides: { webhook: { enabled: true, image: { repository: "ralf090102/..." } } }
  Merged values: { webhook: { enabled: true, image: { repository: "ralf090102/...", tag: "latest" } } }

Step 3: Helm renders webhook/deployment.yaml
  {{- if .Values.webhook.enabled }}      → true → INCLUDE template
  name: {{ include                       → "task-manager-webhook"
    "task-manager.fullname" . }}-webhook
  image: "{{ .Values.webhook.image       → "ralf090102/webhook-service:latest"
    .repository }}:{{ .Values.webhook
    .image.tag }}"

Step 4: Helm renders webhook/service.yaml
  (same conditional check → included)

Step 5: Helm renders webhook/configmap.yaml
  MAX_ATTEMPTS: "{{ .Values.webhook      → "5"
    .retry.maxAttempts | default 5 }}"
  BACKOFF_INTERVALS: "{{ join ","        → "1,5,30,120,600"
    (.Values.webhook.retry.intervals
    | default (list 1 5 30 120 600)) }}"

Step 6: Helm sends all rendered YAML to K8s API
  kubectl apply (equivalent):
    Deployment: task-manager-webhook
    Service: task-manager-webhook (ClusterIP :3003)
    ConfigMap: task-manager-webhook-config

Step 7: K8s creates the Pod
  Pulls image: ralf090102/webhook-service:latest
  Starts container: npx tsx src/index.ts
  Webhook service begins polling for pending deliveries
```

### What You've Been Looking At All Along

```
In Level 4, you saw:

  "The Deployment has a selector with component: app"
  "The Service routes to Pods with matching labels"
  "The Ingress routes /socket.io to the realtime service"

You were looking at HELM TEMPLATES the whole time!

  templates/task-manager/deployment.yaml    ← This IS a Helm template
  templates/task-manager/service.yaml       ← This IS a Helm template
  templates/notification/service.yaml       ← This IS a Helm template

Every {{ .Values.* }} was a variable being substituted.
Every {{- if .Values.X.enabled }} was a service being conditionally included.
Every {{ include "task-manager.labels" . }} was a helper function generating labels.

Now you know the full picture:
  Helm template → rendered YAML → Kubernetes → running Pod
```

---

## 14. What Helm Actually Gives You (And What It Doesn't)

A common reaction after building this chart: *"I still have 30+ YAML files. I thought Helm was supposed to simplify things?"*

It did. But the simplification isn't about file count.

### Helm Does NOT Reduce the Number of YAML Files

The same Kubernetes resources must exist whether you use Helm or not:

```
Without Helm:                        With Helm:
─────────────                        ─────────

11 deployment.yaml files             11 deployment.yaml templates
11 service.yaml files                11 service.yaml templates
3 statefulset.yaml files             3 statefulset.yaml templates
2 cronjob.yaml files                 2 cronjob.yaml templates
5 secret.yaml files                  5 secret.yaml templates
...                                  ...

~30 raw YAML files                   ~30 Helm template files
(SAME COUNT)
```

The file count is identical because the Kubernetes resources are identical. Helm doesn't eliminate resources — it eliminates the *complexity of managing them*.

### What Helm Actually Gives You (Ranked)

```
┌────────────────────────────────────────────────────────────────────┐
│  1. CONFIGURATION CONSOLIDATION (values.yaml)                      │
│  ──────────────────────────────────────────                        │
│  One file controls all 11 services. Change an image tag for        │
│  the notification service? Edit one line in values.yaml            │
│  (or use --set). Without Helm, you'd sed through 3 files.          │
│                                                                    │
│  2. TEMPLATING ({{ }} syntax)                                      │
│  ────────────────────────                                          │
│  Write a Deployment ONCE with variables. The same template         │
│  pattern works for notification, webhook, file-service —           │
│  each just reads different values. Without Helm, copy-paste        │
│  the same 80-line Deployment and hand-edit each one.               │
│                                                                    │
│  3. CONDITIONAL LOGIC                                              │
│  ──────────────────                                                │
│  {{- if .Values.notification.enabled }}                            │
│  Entire services included or omitted based on one flag.            │
│  Without Helm, you'd manually kubectl apply / delete.              │
│                                                                    │
│  4. RELEASE MANAGEMENT                                             │
│  ──────────────────                                                │
│  helm upgrade --revision 1, 2, 3...                                │
│  helm rollback task-manager 1                                      │
│  Every upgrade is versioned and reversible. Without Helm,          │
│  there's no rollback — you'd re-apply old YAML manually.           │
│                                                                    │
│  5. LIFECYCLE HOOKS                                                │
│  ────────────────                                                  │
│  Run database migrations BEFORE pods start (pre-upgrade hook).     │
│  Without Helm, you'd manually run migrations, then deploy.         │
│                                                                    │
│  6. PACKAGING & SHARING                                            │
│  ────────────────────                                              │
│  helm package -> produces a .tgz chart artifact                    │
│  Push to a chart registry, share with other teams.                 │
│  Without Helm, you'd share raw YAML files (no versioning).         │
└────────────────────────────────────────────────────────────────────┘
```

### The Real Comparison

| Without Helm | With Helm |
|---|---|
| Copy-paste 11 Deployments, hand-edit each | One template pattern, 11 value blocks |
| `sed` to change an image tag across 3 files | `--set image.tag=v2` |
| Manual `kubectl apply` in dependency order | `helm upgrade` handles ordering |
| No rollback | `helm rollback` to any revision |
| Secrets hardcoded or templated by scripts | `b64enc` function, `--set` at deploy time |
| Different YAML per environment (dev/prod) | Same templates, different values files |
| File count: ~30 | File count: ~30 |

**The cognitive load drops dramatically. The file count stays the same.**

### When values.yaml Becomes the Single Source of Truth

In this project, `values.yaml` is the configuration layer for everything:

```yaml
# Want to change the main app's resource limits?
resources:                    # <- Edit here
  limits:
    memory: 1Gi               # Was 512Mi

# Want to enable MinIO?
minio:
  enabled: true               # <- One flag, 4 templates render

# Want to change the scheduler's cron schedule?
scheduler:
  schedule: "*/10 * * * *"    # <- Edit here

# Want to deploy a new image version?
image:
  tag: "v2.1.0"               # <- Edit here (or --set image.tag=v2.1.0)
```

One file. Every configurable parameter. That IS the single source of truth — but only for *configurable values*. The *structure* (which resources exist, how they're organized) still requires the template files.

---

## 15. Resource Decision Framework

Why does MinIO have 4 YAML files but the webhook service has 3? Why does the scheduler have no Service at all? This section gives you the decision framework.

### The Decision Tree

Walk through this checklist for every new service:

```
START: What kind of workload is this?
|
+- Is it a long-running process that should always be running?
|  |
|  +- YES -> Does it need persistent storage tied to pod identity?
|  |  |
|  |  +- YES -> Use STATEFULSET
|  |  |         +-- Needs a HEADLESS SERVICE (for pod DNS: pod-0.svc)
|  |  |         +-- Needs a regular SERVICE (for clients to connect)
|  |  |         +-- Needs a SECRET (if it has credentials)
|  |  |
|  |  +- NO -> Use DEPLOYMENT
|  |            +-- Needs a SERVICE (stable network address)
|  |            |   +- Session affinity? (WebSocket -> sessionAffinity: ClientIP)
|  |            +-- Needs a SECRET? (if it has credentials)
|  |            +-- Needs a CONFIGMAP? (if it has non-sensitive config)
|  |            +-- Needs an INGRESS? (if external access needed)
|  |            +-- Needs a SERVICEMONITOR? (if metrics scraping)
|  |            +-- Needs an initContainer? (if depends on another service)
|  |
|  +- NO (scheduled, one-shot) -> Use CRONJOB
|                                    +-- NO Service (nobody talks to it)
|
+- Does it need a migration step before deployment?
   +-- YES -> Use a JOB (as a Helm pre-upgrade hook)
```

### Why Each Resource Type Exists

**Deployment** — The default for ~90% of services. Stateless pods that can restart on any node. Rolling updates, replica management, self-healing. If your service doesn't need persistent local storage, use this.

**StatefulSet** — For services where pod identity matters. Each pod gets a stable name (`minio-0`, `minio-1`) and its own disk volume. If a pod dies, the replacement pod reattaches the *same* volume with the *same* data. Use for: databases, message queues, storage engines, search indexes.

**Headless Service** (`clusterIP: None`) — Only used with StatefulSets. A normal Service load-balances across all pods (round-robin). A Headless Service gives each pod its own DNS name: `minio-0.minio-headless.namespace.svc`. Pods use this for peer discovery (e.g., MinIO nodes finding each other to form a cluster).

**Service** — A stable IP + DNS name that routes traffic to pods. Pods are ephemeral (they die and get new IPs). The Service provides a permanent address. If anything in the cluster needs to talk to your service over the network, it needs a Service.

**CronJob** — Scheduled work that runs periodically, does its job, then exits. No incoming network traffic, so no Service. The K8s scheduler creates a new Pod at each interval, it runs, it finishes.

**Secret** — Base64-encoded sensitive data (passwords, API keys, certificates). Mounted as environment variables or files. K8s can enforce RBAC on who can read Secrets. Never put credentials in ConfigMap or inline in a Deployment.

**ConfigMap** — Non-sensitive configuration (retry intervals, timeout values, environment name). Mounted the same way as Secrets. Changeable without rebuilding the Docker image — just `helm upgrade`.

**Ingress** — HTTP/HTTPS routing from outside the cluster to internal Services. Only for services that users (browsers, external API clients) access directly. Most internal microservices never need one.

**ServiceMonitor** — A custom resource from the Prometheus Operator. Tells Prometheus "scrape metrics from this service's /metrics endpoint every 15 seconds." Only needed when monitoring is enabled.

**Job (as Helm hook)** — Runs once at install/upgrade time. Used for database migrations: run `prisma db push` before the new pods start, so the code finds the expected schema on boot.

### This Project Mapped Against the Framework

| Service | Deployment | StatefulSet | CronJob | Service | Headless | Secret | ConfigMap | Ingress | Why |
|---|---|---|---|---|---|---|---|---|---|
| Main app | Y | | | Y | | | | Y | User-facing web UI, needs external access |
| Scheduler | | | Y | | | | | | Scheduled batch job, no network endpoint |
| Notification | Y | | | Y | | Y | | | Long-running, internal, has SMTP creds |
| File service | Y | | | Y | | | | | Long-running, internal, initContainer waits for MinIO |
| MinIO | | Y | | Y | Y | Y | | | Persistent storage, pods need stable identity + own disks |
| Search sync | Y | | | Y | | | | | Long-running, internal, initContainer waits for Meilisearch |
| Meilisearch | | Y | | Y | Y | Y | | | Persistent storage, master key secret |
| Analytics | Y | | Y | Y | | | | | Long-running API + scheduled weekly report CronJob |
| Realtime | Y | | | Y | | | | | Long-running, Service has sessionAffinity for WebSocket |
| Webhook | Y | | | Y | | | Y | | Long-running, retry config in ConfigMap |
| Team service | Y | | | Y | | | | | Long-running, Job hook for DB migration |

### The Three Patterns to Remember

**Pattern 1: Every StatefulSet gets TWO services**

```
StatefulSet (minio)
+-- Headless Service (minio-headless)  <- clusterIP: None
|   Provides: minio-0.minio-headless.svc  (per-pod DNS for peer discovery)
|
+-- Regular Service (minio)             <- clusterIP: 10.96.x.x
    Provides: minio:9000  (load-balanced for clients)
```

Why two? Other MinIO pods need to find `minio-0` specifically (peer discovery), but application pods just want to talk to "MinIO" (any healthy pod). The Headless Service gives per-pod DNS; the regular Service gives load-balanced DNS.

**Pattern 2: CronJobs get NO Service**

```
Scheduler CronJob
+-- CronJob  Y
+-- Service  X  <- Nobody calls the scheduler. It calls the database.
+-- Secret   Y  <- Needs DATABASE_URL (but uses the shared secret)
+-- ConfigMap X
```

CronJobs are one-shot: they wake up, do work, and exit. There's nothing to route traffic *to*. The scheduler doesn't have a `/health` endpoint because nobody needs to check if it's alive — it's not always running.

**Pattern 3: Deployments always get a Service, never a Headless Service**

```
Notification Deployment
+-- Deployment Y
+-- Service    Y  <- Other pods call http://task-manager-notification:3004
+-- Headless   X  <- No per-pod DNS needed (stateless, any pod works)
+-- Secret     Y  <- SMTP credentials
+-- Ingress    X  <- Internal only (ClusterIP)
```

Deployments are stateless — any pod is interchangeable. There's no need for per-pod DNS because no one cares which pod they reach. One Service load-balances across all replicas.

### What Makes a Service Need Each Resource

```
Needs Secret?          -> Has credentials (DB password, API key, SMTP password)
                         7 services have this (DATABASE_URL is shared)

Needs ConfigMap?       -> Has tunable non-sensitive config (retry intervals, timeouts)
                         Only webhook has this (MAX_ATTEMPTS, BACKOFF_INTERVALS)

Needs Ingress?         -> External clients need to reach it from outside the cluster
                         Only the main app (NGINX routes / and /socket.io to it)

Needs Headless Service?-> Uses StatefulSet (needs per-pod DNS for identity/storage)
                         Only MinIO and Meilisearch

Needs StatefulSet?     -> Has persistent storage that must survive pod restarts
                         Only MinIO (file storage) and Meilisearch (search index)

Needs CronJob?         -> Scheduled, one-shot work (not always running)
                         Scheduler (every 5 min) + Analytics weekly report

Needs initContainer?   -> Depends on another service being ready first
                         File service waits for MinIO; search-sync waits for Meilisearch

Needs ServiceMonitor?  -> Should be scraped by Prometheus for metrics
                         Only the main app (/api/metrics endpoint)

Needs Job (hook)?      -> Database schema must migrate before new code deploys
                         Only team-service (pre-upgrade prisma db push)
```

---

## 16. What You've Learned

### Technologies Mastered

- Helm chart structure (Chart.yaml, values.yaml, templates/)
- Go template syntax (`{{ }}`, `{{- }}`, pipelines)
- Template functions (quote, b64enc, toYaml, nindent, default, join)
- Conditional rendering (`{{- if .Values.X.enabled }}`)
- Helper templates (`_helpers.tpl`, define, include)
- Helm lifecycle commands (install, upgrade, rollback, template)
- The `--reuse-values` trap (new keys need explicit `--set`)
- Helm hooks (pre-upgrade db migration)
- Multi-service chart organization (one chart, eleven services)

### Core Concepts

- **Helm = template engine for K8s:** Templates + values = rendered YAML
- **values.yaml is defaults:** `--set` overrides at deploy time
- **Conditionals enable/disable services:** Entire Deployments included or omitted
- **Helpers prevent duplication:** Labels generated once, used everywhere
- `helm template` **is your debugger:** See exactly what YAML gets generated
- `--reuse-values` **reads old values:** NOT the new values.yaml file
- **Hooks run outside normal flow:** Pre-upgrade migrations before pod updates

### The Three-Level Stack

```
Level 3 (Docker):     Dockerfile → Docker image
Level 4 (K8s):        YAML manifests → Pods, Services, Deployments
Level 5 (Helm):       Templates + values → YAML manifests

Each level wraps the previous:
  Helm template (Level 5)
    → generates K8s YAML (Level 4)
      → references Docker image (Level 3)
        → runs your code (Levels 1-2)
```

---

## Next Steps

After completing Level 5, you're ready for:

**Level 6: Microservices Architecture** - 10 hours

- How each of the 8 microservices works internally
- Service-to-service communication patterns
- Shared Prisma schema pattern
- StatefulSets for databases (MinIO, Meilisearch)
- Background workers (webhook delivery)
- Fire-and-forget patterns (realtime, webhook)
- Polyglot services (Python analytics)

You now understand the deployment infrastructure (Levels 3-5). Level 6 dives into the microservice code itself — what each service does and how they communicate.

Continue with `Level-6.md` when you're ready!

---

**Happy learning!**