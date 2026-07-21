# Kubernetes Nuances: What Tutorials Don't Teach You

A practical field guide based on real debugging sessions from the Task Manager project. Every concept here comes from an actual problem we hit and solved.

---

## Table of Contents

1. [The Core Mental Model](#the-core-mental-model)
2. [Pods Are Ephemeral — Nothing Persists](#pods-are-ephemeral--nothing-persists)
3. [Helm Upgrades Don't Always Take Effect](#helm-upgrades-dont-always-take-effect)
4. [Immutable Fields: When](#immutable-fields-when-helm-upgrade-silently-fails) `helm upgrade` [Silently Fails](#immutable-fields-when-helm-upgrade-silently-fails)
5. [Labels and Selectors: The Invisible Routing Layer](#labels-and-selectors-the-invisible-routing-layer)
6. [The](#the---reuse-values-trap) `--reuse-values` [Trap](#the---reuse-values-trap)
7. [Image Caching: Why Your New Code Isn't Running](#image-caching-why-your-new-code-isnt-running)
8. [Probes: Liveness vs Readiness vs Startup](#probes-liveness-vs-readiness-vs-startup)
9. [Env Vars: Build-Time vs Runtime](#env-vars-build-time-vs-runtime)
10. [ConfigMaps and Secrets: The Mount Problem](#configmaps-and-secrets-the-mount-problem)
11. [Service DNS: How Pods Find Each Other](#service-dns-how-pods-find-each-other)
12. [CronJobs: The Silent Workload](#cronjobs-the-silent-workload)
13. [StatefulSets: Ordered, Sticky, Different](#statefulsets-ordered-sticky-different)
14. [The](#the-kubectl-exec-targeting-problem) `kubectl exec` [Targeting Problem](#the-kubectl-exec-targeting-problem)
15. [Port-Forwarding vs Ingress vs minikube tunnel](#port-forwarding-vs-ingress-vs-minikube-tunnel)
16. [Helm Hooks: The Hidden Scripts](#helm-hooks-the-hidden-scripts)
17. [initContainers: Boot Order Matters](#initcontainers-boot-order-matters)
18. [Graceful Shutdown and terminationGracePeriodSeconds](#graceful-shutdown-and-terminationgraceperiodseconds)
19. [Troubleshooting Playbook](#troubleshooting-playbook)
20. [Cheat Sheet: Every Command You Need](#cheat-sheet-every-command-you-need)

---



## The Core Mental Model

Before diving into nuances, you need to understand the hierarchy. Kubernetes is layers of abstraction, each managed by a different controller:

```
Helm Release  →  manages  →  Kubernetes Manifests (YAML)
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼              ▼
              Deployment    StatefulSet      CronJob
                    │             │              │
                    ▼             ▼              ▼
             ReplicaSet     Pod (ordered)    Job → Pod
                    │
                    ▼
                  Pod  (the actual running container)
                    │
                    ▼
              Container(s)  (your app code)
```

**Key insight**: Helm does NOT deploy your app. Helm generates YAML and sends it to Kubernetes. Kubernetes controllers (Deployment controller, StatefulSet controller, etc.) read that YAML and create/destroy Pods. You almost never interact with Pods directly — you interact with the controllers that manage them.

This is why changes sometimes don't take effect: you updated the Helm chart, Helm updated the Deployment spec, but the Deployment controller hasn't created a new Pod yet.

---



## Pods Are Ephemeral — Nothing Persists



### The Concept

A Pod is the smallest deployable unit in Kubernetes. It runs one or more containers. **Pods are designed to be disposable** — they can be killed and recreated at any time.

```
Pod lifecycle:
  Pending → ContainerCreating → Running → Terminating → (gone)
```

When a Pod dies:

- Its filesystem is **destroyed** (unless using PersistentVolumes)
- Its IP address **changes**
- Its environment is **rebuilt from the Deployment spec**
- Any in-memory state is **lost**



### What This Means in Practice

**Don't store data in the Pod filesystem.** If your app writes logs to `/app/logs/`, those logs vanish when the Pod restarts. This is why:

- We use PersistentVolumeClaims (PVCs) for MinIO and Meilisearch data
- We use stdout logging (pino → `console.log`) so logs go to the container runtime
- We use an external PostgreSQL (Supabase) instead of an in-cluster database



### Commands

```bash
# See all pods in a namespace
kubectl get pods -n task-manager

# See detailed info about a specific pod
kubectl describe pod <pod-name> -n task-manager

# Watch pods in real-time (useful during rollouts)
kubectl get pods -n task-manager -w

# See which node a pod runs on
kubectl get pods -n task-manager -o wide

# Get the pod's IP address
kubectl get pod <pod-name> -n task-manager -o jsonpath='{.status.podIP}'

# See pod resource usage (requires metrics-server)
kubectl top pod <pod-name> -n task-manager
```



### Gotcha: Pod IP Changes on Restart

```bash
# Before restart
kubectl get pod task-manager-abc123 -o jsonpath='{.status.podIP}'
# → 10.244.0.77

# After restart (new pod)
kubectl get pod task-manager-xyz789 -o jsonpath='{.status.podIP}'
# → 10.244.0.85  ← DIFFERENT IP
```

This is why **Services exist** — they provide a stable DNS name (`task-manager-notification`) that always routes to the current Pod IP, regardless of restarts.

---



## Helm Upgrades Don't Always Take Effect



### The Problem

You ran `helm upgrade`, it said "Happy Helming!", but your app behaves exactly the same as before. What happened?

### The Explanation

`helm upgrade` updates the **desired state** (the Kubernetes manifests). It does NOT force Pods to restart. Here's the chain:

```
helm upgrade
  → Updates Deployment spec in Kubernetes API
  → Deployment controller compares new spec vs running Pods
  → IF pod template hash changed → creates new ReplicaSet → rolls out new Pods
  → IF pod template hash is same → DOES NOTHING (Pods keep running old code)
```

The "pod template hash" is computed from the `spec.template` section of the Deployment. If your change doesn't affect `spec.template` (e.g., you only changed a comment or a label outside the template), no new Pods are created.

### When This Bites You

**Scenario 1: Changed a value but Pods didn't restart**

```bash
helm upgrade task-manager ./helm-chart -n task-manager \
  --reuse-values --set image.tag=v2.0
# "Happy Helming!" ...but Pods still run v1.0
```

This happens when the image tag in `values.yaml` was already `latest` and you set it to `latest` again — the template didn't change.

**Scenario 2: New ConfigMap/Secret values not picked up**

```bash
helm upgrade task-manager ./helm-chart -n task-manager \
  --reuse-values --set secrets.databaseUrl="new-url"
# Secret updated... but app still uses old URL
```

Secrets mounted as env vars are read at Pod startup. Updating the Secret doesn't restart the Pod.

### The Fix

Force a rollout restart after Helm upgrade:

```bash
# Option 1: kubectl rollout restart (recommended)
helm upgrade task-manager ./helm-chart -n task-manager --reuse-values --set ...
kubectl rollout restart deployment/task-manager -n task-manager

# Option 2: Add a changing annotation to force template hash change
helm upgrade task-manager ./helm-chart -n task-manager \
  --reuse-values \
  --set podAnnotations.restartTrigger="$(date +%s)"
```



### Commands

```bash
# Check if a rollout is in progress
kubectl rollout status deployment/task-manager -n task-manager

# See rollout history
kubectl rollout history deployment/task-manager -n task-manager

# Rollback to previous version
kubectl rollout undo deployment/task-manager -n task-manager

# Rollback to specific revision
kubectl rollout undo deployment/task-manager -n task-manager --to-revision=2

# Force restart (picks up new ConfigMap/Secret values)
kubectl rollout restart deployment/task-manager -n task-manager
```



### Gotcha: `rollout restart` on CronJobs

```bash
kubectl rollout restart cronjob/task-manager-scheduler -n task-manager
# ERROR: cronjobs.batch "task-manager-scheduler" restarting is not supported
```

CronJobs don't support rolling restarts. The new image is picked up automatically on the **next scheduled run**. To trigger immediately:

```bash
# Create a one-time Job from the CronJob
kubectl create job --from=cronjob/task-manager-scheduler manual-run-1 -n task-manager
```

---



## Immutable Fields: When `helm upgrade` Silently Fails



### The Problem

You changed a Deployment selector in your Helm chart, ran `helm upgrade`, it said "Happy Helming!" — but nothing changed. No error, no new Pod, nothing.

### The Explanation

Some Kubernetes fields are **immutable** — they cannot be changed after creation. The most common ones:


| Resource    | Immutable Field         | What Happens If You Try         |
| ----------- | ----------------------- | ------------------------------- |
| Deployment  | `spec.selector`         | API silently ignores the change |
| StatefulSet | `spec.selector`         | API silently ignores the change |
| Service     | `spec.clusterIP`        | API returns error               |
| Service     | `spec.type` (sometimes) | API returns error               |
| Namespace   | `metadata.name`         | Cannot be renamed               |


When you change an immutable field via `helm upgrade`, Kubernetes silently keeps the old value. The Helm release shows as "deployed" but the change never took effect.

### Real Example from This Project

The task-manager Deployment selector was originally:

```yaml
selector:
  matchLabels:
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/instance: task-manager
```

We needed to add `app.kubernetes.io/component: app` to prevent `kubectl exec` from landing in random pods. But `helm upgrade` couldn't change the selector — it silently kept the old one.

### The Fix

Delete the resource, then re-deploy:

```bash
# Delete the Deployment (Pods are immediately killed)
kubectl delete deployment task-manager -n task-manager

# Re-run Helm — creates Deployment with new selector
helm upgrade task-manager ./helm-chart -n task-manager --reuse-values
```

For a cleaner approach, use `helm uninstall` + `helm install`:

```bash
# Uninstall everything (all resources deleted)
helm uninstall task-manager -n task-manager

# Reinstall from scratch
helm install task-manager ./helm-chart -n task-manager \
  --set secrets.databaseUrl=... \
  --set secrets.nextauthSecret=...
```

> **Warning**: `helm uninstall` deletes everything — Deployments, Services, PVCs (if not retained), Secrets. Use `kubectl delete` for surgical control.

---



## Labels and Selectors: The Invisible Routing Layer



### The Concept

Labels are key-value pairs attached to Kubernetes resources. Selectors are queries that match labels. Together, they form the **invisible routing layer** that determines:

- Which Pods receive traffic from a Service
- Which Pods a Deployment manages
- Which Pods `kubectl exec` targets
- Which Pods are included in `kubectl get pods -l ...`



### How Labels Connect Resources

```
Deployment (selector: app=task-manager, component=app)
  │
  └─creates Pods with labels─→  Pod (labels: app=task-manager, component=app)
                                       ↑
Service (selector: app=task-manager, component=app)
  │
  └─routes traffic to─→  any Pod matching the selector
```

If labels don't match, things silently break:

- Service routes to wrong Pods (or no Pods)
- `kubectl exec` lands in the wrong container
- `kubectl logs` shows logs from a different service



### The Label Bug That Broke Search

**The setup:**

```yaml
# Main app Deployment (BEFORE fix)
selector:
  matchLabels:
    app.kubernetes.io/name: task-manager       # ← matches ALL pods
    app.kubernetes.io/instance: task-manager    # ← matches ALL pods
```

**The problem:** Every service pod (notification, meilisearch, webhook, etc.) has these same base labels from the Helm helper template. The main app Deployment selector matched ALL of them.

**The symptom:**

```bash
kubectl exec deployment/task-manager -- hostname
# Expected: task-manager-abc123 (the Next.js app)
# Actual:   task-manager-meilisearch-0  ← WRONG POD!
```

**The fix:**

```yaml
# Main app Deployment (AFTER fix)
selector:
  matchLabels:
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/instance: task-manager
    app.kubernetes.io/component: app    # ← NOW only matches app pods
```



### Commands for Debugging Labels

```bash
# See labels on all pods
kubectl get pods -n task-manager --show-labels

# Filter pods by label
kubectl get pods -n task-manager -l app.kubernetes.io/component=app

# See which pods a Service routes to
kubectl get endpoints task-manager -n task-manager
# BEFORE fix: 10.244.0.77:3000, 10.244.0.75:7700  ← TWO endpoints (wrong!)
# AFTER fix:  10.244.0.85:3000                    ← ONE endpoint (correct)

# See which pods a Deployment manages
kubectl get pods -n task-manager -l app.kubernetes.io/name=task-manager,app.kubernetes.io/instance=task-manager
# Returns ALL pods (because selector is too broad)

kubectl get pods -n task-manager -l app.kubernetes.io/name=task-manager,app.kubernetes.io/instance=task-manager,app.kubernetes.io/component=app
# Returns ONLY app pods (correct)

# Check a specific pod's labels
kubectl get pod <pod-name> -n task-manager -o jsonpath='{.metadata.labels}'
```



### Gotcha: Every Service Needs a Unique Component Label


| Service      | Component Label                             |
| ------------ | ------------------------------------------- |
| Main app     | `app.kubernetes.io/component: app`          |
| Notification | `app.kubernetes.io/component: notification` |
| MinIO        | `app.kubernetes.io/component: minio`        |
| Meilisearch  | `app.kubernetes.io/component: meilisearch`  |
| Webhook      | `app.kubernetes.io/component: webhook`      |
| ...          | ...                                         |


If you forget to add the component label to BOTH the pod template AND the selector, you'll get cross-routing between services.

---



## The `--reuse-values` Trap



### The Problem

You added a new section to `values.yaml`, ran `helm upgrade --reuse-values`, and got:

```
Error: nil pointer evaluating interface {}.user
```

Or the new values were silently ignored.

### The Explanation

`--reuse-values` uses the **previous release's values**, NOT the current `values.yaml` file:

```
values.yaml on disk (has new keys)     ← NOT read by --reuse-values
              ↓
previous Helm release values           ← Used instead (missing new keys)
```

This means:

- New keys added to `values.yaml` are invisible to `--reuse-values`
- Deleted keys from `values.yaml` still exist in the release
- Changed defaults in `values.yaml` don't take effect



### When This Bites You

**Scenario: Deploying a new microservice**

```yaml
# You added this to values.yaml:
notification:
  enabled: true
  image:
    repository: ralf090102/notification-service
    tag: latest
```

```bash
helm upgrade task-manager ./helm-chart -n task-manager \
  --reuse-values --set notification.enabled=true
# Error: nil pointer evaluating interface {}.user
# Because notification.smtp.user doesn't exist in the PREVIOUS release values
```



### The Fix

On first deploy of a new service, pass ALL its values via `--set`:

```bash
helm upgrade task-manager ./helm-chart -n task-manager \
  --reuse-values \
  --set notification.enabled=true \
  --set notification.image.repository=ralf090102/notification-service \
  --set notification.image.tag=latest \
  --set notification.image.pullPolicy=Never \
  --set notification.smtp.host="" \
  --set notification.smtp.port="587" \
  --set notification.smtp.user="" \
  --set notification.smtp.password="" \
  --set notification.resources.limits.cpu=250m \
  --set notification.resources.limits.memory=256Mi \
  --set notification.resources.requests.cpu=100m \
  --set notification.resources.requests.memory=128Mi
```

After this first deploy, the values are **persisted** in the release. Subsequent upgrades only need `--reuse-values`:

```bash
helm upgrade task-manager ./helm-chart -n task-manager --reuse-values
```



### Alternative: `--reset-values`

`--reset-values` re-reads `values.yaml` from scratch, picking up new keys automatically. But you must re-pass ALL overrides (secrets, pull policies):

```bash
helm upgrade task-manager ./helm-chart -n task-manager \
  --reset-values \
  --set secrets.databaseUrl=<URL> \
  --set secrets.nextauthSecret=<SECRET> \
  --set image.pullPolicy=Never \
  # ... (every override must be re-specified)
```



### Commands

```bash
# See what values are stored in the current release
helm get values task-manager -n task-manager

# See all values (including defaults) for the current release
helm get values task-manager -n task-manager --all

# Compare with values.yaml on disk
helm template task-manager ./helm-chart -n task-manager | grep "something"

# See release history
helm history task-manager -n task-manager

# Rollback to a previous release
helm rollback task-manager 3 -n task-manager
```

---



## Image Caching: Why Your New Code Isn't Running



### The Problem

You rebuilt your Docker image with new code, loaded it into Minikube, but the app still shows old behavior.

### The Explanation

Minikube caches Docker images by **tag**, not by **content**. When you run:

```bash
docker build -t ralf090102/task-manager-app:latest .
minikube image load ralf090102/task-manager-app:latest
```

Minikube sees `task-manager-app:latest` already exists and **silently keeps the old version**. Your new code never reaches the cluster.

### The Fix

**Always force-remove the old image before loading the new one:**

```bash
# Step 1: Build new image
docker build -t ralf090102/task-manager-app:latest .

# Step 2: Remove old image from Minikube (CRITICAL)
minikube ssh "docker rmi -f ralf090102/task-manager-app:latest"

# Step 3: Load new image
minikube image load ralf090102/task-manager-app:latest

# Step 4: Restart deployment to pick up new image
kubectl rollout restart deployment/task-manager -n task-manager
```



### The `pullPolicy` Factor

The Kubernetes `imagePullPolicy` affects behavior:


| Policy         | When to Use                  | Behavior                               |
| -------------- | ---------------------------- | -------------------------------------- |
| `Always`       | Remote registry (Docker Hub) | Always pulls image, even if tag exists |
| `IfNotPresent` | Default for tagged images    | Uses cached image if it exists         |
| `Never`        | Minikube local images        | Never pulls; only uses local images    |


**For Minikube development, always use** `pullPolicy: Never`**:**

```yaml
# values.yaml or --set image.pullPolicy=Never
image:
  pullPolicy: Never
```

This tells Kubernetes: "Don't try to pull from Docker Hub; the image is already loaded locally." Without `Never`, Kubernetes tries to pull from Docker Hub and gets `ImagePullBackOff`.

### When `--no-cache` Is Needed

Sometimes even the Docker build itself uses stale cached layers:

```bash
# Normal build (may use stale cache)
docker build -t ralf090102/task-manager-app:latest .

# Force fresh build (no cache at all)
docker build --no-cache -t ralf090102/task-manager-app:latest .
```

Use `--no-cache` when:

- You changed code but the `COPY . .` layer was cached
- You updated `package.json` but `npm ci` was cached
- Builds are inexplicably producing old code



### Commands

```bash
# Check what image a pod is actually running
kubectl get pod <pod-name> -n task-manager -o jsonpath='{.spec.containers[0].image}'

# Check if image exists in Minikube
minikube image ls | grep task-manager-app

# Check image pull policy
kubectl get deployment task-manager -n task-manager -o jsonpath='{.spec.template.spec.containers[0].imagePullPolicy}'

# See image pull errors
kubectl describe pod <pod-name> -n task-manager | grep -A5 "Events:"
```

---



## Probes: Liveness vs Readiness vs Startup



### The Three Probe Types


| Probe         | Purpose                          | Failure Consequence                          | When to Use                                 |
| ------------- | -------------------------------- | -------------------------------------------- | ------------------------------------------- |
| **Liveness**  | "Is the app alive?"              | Pod is **restarted**                         | Detect deadlocks, infinite loops            |
| **Readiness** | "Is the app ready to serve?"     | Pod is **removed from Service** (no traffic) | App is starting up, temporarily can't serve |
| **Startup**   | "Has the app finished starting?" | Disables liveness/readiness until success    | Slow-starting apps (JVM, large migrations)  |




### How They Interact

```
Pod starts
  → Startup probe begins (if configured)
  → Startup passes → Liveness + Readiness probes activate

  → Readiness probe fails → Pod NOT in Service endpoints (no traffic)
  → Readiness passes → Pod IS in Service endpoints (receives traffic)

  → Liveness probe fails → Pod is killed and restarted
  → Liveness passes → Pod keeps running
```



### The CrashLoopBackOff Problem

If `initialDelaySeconds` is too short, the probe starts before the app is ready:

```
Pod starts
  → Probe fires immediately (too early)
  → Probe fails (app still starting)
  → Liveness → Pod killed
  → Pod restarts
  → Probe fires → fails → killed
  → CrashLoopBackOff
```

**Fix:** Increase `initialDelaySeconds` or use a Startup probe:

```yaml
# BAD: Liveness fires before app is ready
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 0    # ← Too aggressive
  periodSeconds: 10

# GOOD: Give app time to start
livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 30   # ← 30 seconds to boot
  periodSeconds: 10
```



### Real Example: The `readinessProbe` = Health Check

In this project, every microservice has a `/health` endpoint:

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 5
  periodSeconds: 10
```

This means `kubectl wait --for=condition=ready pod ...` is effectively a health check — it waits until the `/health` endpoint returns 200. No need for separate `kubectl exec` health checks.

### Commands

```bash
# Check probe status
kubectl describe pod <pod-name> -n task-manager | grep -A10 "Liveness\|Readiness"

# See why a pod is not ready
kubectl describe pod <pod-name> -n task-manager | grep -A5 "Conditions:"

# Check readiness conditions
kubectl get pod <pod-name> -n task-manager -o jsonpath='{.status.conditions}' | jq .

# Watch pods become ready
kubectl get pods -n task-manager -w
```

---



## Env Vars: Build-Time vs Runtime



### The Problem

You added a new env var to the Deployment, ran `helm upgrade`, but the app doesn't see it.

### The Explanation

Environment variables are injected at **Pod creation time**. Updating the Deployment spec doesn't update already-running Pods:

```
helm upgrade → Updates Deployment spec (adds env var)
  → Existing Pod still running with OLD env vars
  → New Pod (after rollout) gets NEW env vars
```



### Real Example: MEILI_URL Not Available

The Meilisearch env vars were conditionally added:

```yaml
{{- if .Values.meilisearch.enabled }}
- name: MEILI_URL
  value: "http://task-manager-meilisearch:7700"
{{- end }}
```

When `meilisearch.enabled` was first set to `true` via Helm, the Deployment spec was updated — but the running Pod still had the old spec without `MEILI_URL`. Only after `kubectl rollout restart` did the new Pod pick up the env var.

### Build-Time vs Runtime Env Vars in Next.js

Next.js has a special nuance: `NEXT_PUBLIC_*` **env vars are baked in at build time**.

```
Runtime env vars (DATABASE_URL, MEILI_URL):
  → Read by Node.js at runtime via process.env
  → Can be changed by updating Deployment + restarting Pod

Build-time env vars (NEXT_PUBLIC_API_URL):
  → Hardcoded into the JavaScript bundle during `npm run build`
  → Changing the Deployment env var does NOT change the value
  → Must rebuild the Docker image
```



### Commands

```bash
# Check env vars on a running pod
kubectl exec <pod-name> -n task-manager -- env

# Check specific env var
kubectl exec <pod-name> -n task-manager -- printenv DATABASE_URL

# Check env vars in the Deployment spec
kubectl get deployment task-manager -n task-manager -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}={.value}{"\n"}{end}'

# Check if env var comes from a Secret
kubectl get deployment task-manager -n task-manager -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}: {.valueFrom.secretKeyRef}{"\n"}{end}'
```

---



## ConfigMaps and Secrets: The Mount Problem



### The Problem

You updated a ConfigMap, but the Pod still sees the old values.

### Two Ways to Inject ConfigMaps/Secrets

**Method 1: Environment Variables (most common in this project)**

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: task-manager-secrets
        key: database-url
```

Env vars are read at Pod startup. Updating the Secret doesn't restart the Pod.

**Method 2: Volume Mount**

```yaml
volumes:
  - name: config
    configMap:
      name: my-config
volumeMounts:
  - name: config
    mountPath: /etc/config
```

Volume-mounted ConfigMaps are **automatically updated** by Kubernetes (typically within 60-120 seconds). But the application must re-read the file to pick up changes.

### Commands

```bash
# List all ConfigMaps
kubectl get configmaps -n task-manager

# List all Secrets
kubectl get secrets -n task-manager

# See ConfigMap contents
kubectl get configmap <name> -n task-manager -o yaml

# See Secret contents (base64-encoded)
kubectl get secret <name> -n task-manager -o yaml

# Decode a Secret value
kubectl get secret <name> -n task-manager -o jsonpath='{.data.database-url}' | base64 --decode

# Update a Secret (then restart Pods)
kubectl edit secret task-manager-secrets -n task-manager
kubectl rollout restart deployment/task-manager -n task-manager
```

---



## Service DNS: How Pods Find Each Other



### The Concept

Kubernetes has a built-in DNS server (CoreDNS). Every Service gets a DNS name that pods can use to communicate:

```
<service-name>.<namespace>.svc.cluster.local
# Or just <service-name> (if in the same namespace)
```



### DNS Resolution Flow

```
Main app calls: http://task-manager-notification:3004/health
                                        ↓
CoreDNS resolves: task-manager-notification → 10.106.103.26 (ClusterIP)
                                        ↓
ClusterIP load-balances to: 10.244.0.71:3004 (Pod IP)
                                        ↓
Notification service responds: {"status":"ok"}
```



### Service Types


| Type                             | Accessibility                      | Use Case                   |
| -------------------------------- | ---------------------------------- | -------------------------- |
| **ClusterIP** (default)          | Inside cluster only                | Internal microservices     |
| **NodePort**                     | Cluster + Node IP:port             | Dev access without Ingress |
| **LoadBalancer**                 | External (cloud LB)                | Production external access |
| **Headless** (`clusterIP: None`) | Direct pod DNS (no load balancing) | StatefulSets               |




### Why Headless Services for StatefulSets

StatefulSets (MinIO, Meilisearch) use headless services so each pod gets its own DNS name:

```
minio-0.minio-headless.task-manager.svc.cluster.local → 10.244.0.70
```

This gives stable, predictable DNS names for stateful pods.

### Commands

```bash
# List all services
kubectl get svc -n task-manager

# See service details (endpoints, type, selector)
kubectl describe svc task-manager-notification -n task-manager

# Check which pods a service routes to
kubectl get endpoints task-manager -n task-manager

# Test DNS resolution from inside a pod
kubectl exec <pod-name> -n task-manager -- nslookup task-manager-notification

# Test HTTP connectivity between pods
kubectl exec <pod-name> -n task-manager -- node -e "fetch('http://task-manager-notification:3004/health').then(r=>r.text()).then(console.log)"
```



### Gotcha: Service Selectors Must Match Pod Labels

```bash
# If Service has wrong selector, endpoints will be empty
kubectl get endpoints task-manager-notification -n task-manager
# NAME                      ENDPOINTS       AGE
# task-manager-notification <none>          5m    ← EMPTY = wrong selector

# Check Service selector
kubectl get svc task-manager-notification -o jsonpath='{.spec.selector}'
# Check Pod labels
kubectl get pods -n task-manager --show-labels | grep notification
```

---



## CronJobs: The Silent Workload



### The Concept

CronJobs run on a schedule and exit. They don't have Services, don't receive traffic, and don't show up in `kubectl get deployments`. If something goes wrong, you might not notice for hours.

### The CronJob Lifecycle

```
Schedule triggers (e.g., */5 * * * *)
  → Creates a Job
    → Creates a Pod
      → Pod runs, does work, exits (exit code 0 = success)
      → Pod stays as "Completed" until history limit is reached
```



### Commands

```bash
# List CronJobs
kubectl get cronjobs -n task-manager

# List Jobs (created by CronJobs)
kubectl get jobs -n task-manager

# List completed pods (from CronJobs)
kubectl get pods -n task-manager | grep Completed

# See CronJob schedule and history limits
kubectl describe cronjob task-manager-scheduler -n task-manager

# Trigger a manual run (without waiting for schedule)
kubectl create job --from=cronjob/task-manager-scheduler manual-test-1 -n task-manager

# View logs from a CronJob pod
kubectl logs job/manual-test-1 -n task-manager

# View logs from a completed pod
kubectl logs <pod-name> -n task-manager
```



### Gotcha: CronJobs Don't Support `rollout restart`

```bash
kubectl rollout restart cronjob/task-manager-scheduler -n task-manager
# ERROR: restarting is not supported

# Instead, trigger a manual run to use the new image:
kubectl create job --from=cronjob/task-manager-scheduler test-new-image -n task-manager
```



### Gotcha: Completed Pods Stick Around

CronJob pods stay in `Completed` state until `successfulJobsHistoryLimit` is reached (default: 3). This is for debugging — you can view logs from past runs. Old pods are automatically cleaned up.

---



## StatefulSets: Ordered, Sticky, Different



### The Concept

StatefulSets are for stateful applications (databases, search engines, object storage). Unlike Deployments, they provide:

- **Stable pod names** (not random): `minio-0`, `minio-1`, ...
- **Stable storage** (PVC per pod, survives restarts)
- **Ordered startup/shutdown** (pod-0 starts first, then pod-1, ...)



### StatefulSet vs Deployment


| Aspect        | Deployment                  | StatefulSet                    |
| ------------- | --------------------------- | ------------------------------ |
| Pod names     | Random (`minio-abc123`)     | Ordered (`minio-0`)            |
| Pod identity  | Disposable, interchangeable | Stable, unique                 |
| Storage       | Shared or none              | Per-pod PVC (persistent)       |
| Startup order | Parallel (all at once)      | Sequential (0, then 1, then 2) |
| Use case      | Web servers, APIs           | Databases, search engines      |




### volumeClaimTemplates

```yaml
volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi
```

Each pod gets its own PVC: `data-minio-0`, `data-minio-1`, etc. If `minio-0` is deleted and recreated, it **reattaches to the same PVC** — data survives.

### Commands

```bash
# List StatefulSets
kubectl get statefulsets -n task-manager

# See PVCs (storage) for StatefulSets
kubectl get pvc -n task-manager

# Check which PV (physical volume) a PVC uses
kubectl get pv | grep minio

# Describe a StatefulSet
kubectl describe statefulset task-manager-minio -n task-manager

# Watch StatefulSet pods start in order
kubectl get pods -n task-manager -l app.kubernetes.io/component=minio -w
```



### Gotcha: Deleting a StatefulSet Does NOT Delete PVCs

```bash
kubectl delete statefulset task-manager-minio -n task-manager
# PVCs still exist! Data is preserved.
kubectl get pvc -n task-manager
# data-minio-0   Bound   ...   10Gi

# To truly delete data:
kubectl delete pvc data-minio-0 -n task-manager
```

This is by design — accidental StatefulSet deletion shouldn't destroy data.

---



## The `kubectl exec` Targeting Problem



### The Problem

`kubectl exec deployment/<name>` finds a pod managed by that deployment and opens a shell inside it. But if the Deployment selector is too broad, `exec` might land in a **different service's pod**.

### Real Example

```bash
kubectl exec deployment/task-manager -- hostname
# Expected: task-manager-75c6c546bb-hcphp (Next.js app)
# Actual:   task-manager-meilisearch-0    (Meilisearch!)
```

This happened because the Deployment selector matched all pods with `name=task-manager, instance=task-manager` — which includes every pod from every service in the Helm release.

### How `kubectl exec` Resolves Targets

```
kubectl exec deployment/task-manager
  1. Finds Deployment named "task-manager"
  2. Reads Deployment's selector (matchLabels)
  3. Finds all Pods matching the selector
  4. Picks one randomly
  5. Opens a shell in that Pod's container
```

If the selector is too broad, step 3 returns pods from other services.

### The Fix

**Option 1: Fix the Deployment selector (permanent fix)**

```yaml
selector:
  matchLabels:
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/instance: task-manager
    app.kubernetes.io/component: app  # ← Unique per service
```

**Option 2: Target a specific pod directly (workaround)**

```bash
# Get the exact pod name
kubectl get pods -n task-manager -l app.kubernetes.io/component=app

# Exec into that specific pod
kubectl exec task-manager-75c6c546bb-hcphp -n task-manager -- env
```

**Option 3: Use labels to target**

```bash
kubectl exec -n task-manager -l app.kubernetes.io/component=app -- env
```

---



## Port-Forwarding vs Ingress vs minikube tunnel



### Three Ways to Access Your App


| Method              | Command                        | Scope                      | Use Case                            |
| ------------------- | ------------------------------ | -------------------------- | ----------------------------------- |
| **Port-forward**    | `kubectl port-forward svc/...` | Single service, localhost  | Debugging a specific service        |
| **Ingress**         | Configured in Helm chart       | All HTTP routes via domain | Production-like access              |
| **minikube tunnel** | `minikube tunnel`              | All LoadBalancer/Ingress   | Accessing Ingress on local Minikube |




### Port-Forwarding

Creates a tunnel from your local port to a Kubernetes Service:

```bash
# Access Grafana
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
# Open http://localhost:3001

# Access Prometheus
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
# Open http://localhost:9090

# Access the app directly (bypass Ingress)
kubectl port-forward -n task-manager svc/task-manager 3000:3000
# Open http://localhost:3000
```

**Characteristics:**

- Temporary (stops when you Ctrl+C)
- Only accessible from localhost
- Bypasses Ingress rules
- One port at a time per command



### Ingress

Routes HTTP traffic based on hostname and path:

```yaml
# Ingress rule
host: task-manager.local
  → /          → task-manager service (port 3000)
  → /socket.io → task-manager-realtime service (port 3001)
```

Requires:

- NGINX Ingress controller running (`minikube addons enable ingress`)
- `minikube tunnel` running (for Docker driver on Windows)
- Hosts file entry: `127.0.0.1 task-manager.local`



### minikube tunnel

On Windows with Docker driver, Minikube doesn't have an external IP. `minikube tunnel` creates a network route from localhost to the Minikube cluster's LoadBalancer services and Ingress controller:

```bash
# Terminal 1 (must keep running)
minikube tunnel

# Terminal 2 (now you can access the app)
curl http://task-manager.local
```

Without `minikube tunnel`, the Ingress controller has no reachable IP address.

---



## Helm Hooks: The Hidden Scripts



### The Concept

Helm hooks are Kubernetes Jobs/ConfigMaps that run at specific points in the Helm release lifecycle. They're marked with annotations:

```yaml
annotations:
  "helm.sh/hook": pre-upgrade,pre-install
  "helm.sh/hook-weight": "-5"
  "helm.sh/hook-delete-policy": before-hook-creation
```



### Hook Types


| Hook           | When It Runs                     |
| -------------- | -------------------------------- |
| `pre-install`  | Before any resources are created |
| `post-install` | After all resources are created  |
| `pre-upgrade`  | Before any resources are updated |
| `post-upgrade` | After all resources are updated  |
| `pre-delete`   | Before any resources are deleted |
| `pre-rollback` | Before rollback                  |




### Real Example: The DB Migration Hook

The team-service has a Helm hook that runs `prisma db push` before each upgrade:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: task-manager-db-migration
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"
```



### The Problem: Hooks That Hang

The DB migration hook connects to Supabase via the pgbouncer URL (port 6543), which doesn't support Prisma's DDL operations. The hook hangs indefinitely, blocking the entire Helm upgrade.

### The Fix: `--no-hooks`

```bash
helm upgrade task-manager ./helm-chart -n task-manager --reuse-values --no-hooks
```

`--no-hooks` skips ALL hook execution. Schema pushes are done manually:

```bash
set DATABASE_URL=postgresql://...:5432/postgres  # Direct connection (not pgbouncer)
npx prisma db push
```



### Commands

```bash
# See if hooks are defined in your chart
grep -r "helm.sh/hook" helm-chart/templates/

# List hook Jobs
kubectl get jobs -n task-manager

# Check hook logs
kubectl logs job/task-manager-db-migration -n task-manager

# Delete a stuck hook manually
kubectl delete job task-manager-db-migration -n task-manager
```

---



## initContainers: Boot Order Matters



### The Concept

`initContainers` run **before** the main container starts. They must complete successfully (exit code 0) before the main container begins. If an initContainer fails, the Pod never starts.

### Real Example: Waiting for Dependencies

The file-service depends on MinIO. If MinIO isn't ready, the file-service crashes on startup. The initContainer waits:

```yaml
spec:
  initContainers:
    - name: wait-for-minio
      image: busybox:1.35
      command:
        - sh
        - -c
        - 'until wget -q -O /dev/null http://task-manager-minio:9000/minio/health/live; do echo "waiting for MinIO"; sleep 2; done'
  containers:
    - name: file-service
      # ... main container
```



### How It Works

```
Pod starts
  → initContainer: wait-for-minio runs
    → Loops: wget MinIO health endpoint
    → If fails: wait 2 seconds, retry
    → If succeeds: exit 0
  → Main container: file-service starts (MinIO is guaranteed ready)
```



### Commands

```bash
# Check initContainer status
kubectl describe pod <pod-name> -n task-manager | grep -A10 "Init Containers"

# See initContainer logs
kubectl logs <pod-name> -n task-manager -c wait-for-minio

# Check if initContainer is blocking startup
kubectl get pod <pod-name> -n task-manager
# STATUS: Init:0/1  ← initContainer hasn't completed yet
```



### Gotcha: initContainer Image Must Exist

```yaml
initContainers:
  - name: wait-for-deps
    image: busybox:1.35    # ← Must exist in Minikube!
```

If `busybox:1.35` isn't loaded in Minikube, the Pod gets stuck in `Init:ImagePullBackOff`.

---



## Graceful Shutdown and terminationGracePeriodSeconds



### The Problem

When you update a Deployment, old Pods are killed. If the Pod is in the middle of processing a request (e.g., delivering a webhook), the request is interrupted.

### The Shutdown Sequence

```
1. Pod receives SIGTERM signal
2. App should stop accepting new requests, finish in-flight work
3. Kubernetes waits terminationGracePeriodSeconds (default: 30s)
4. If still running after grace period → SIGKILL (forced kill)
5. Pod is removed
```



### Real Example: Webhook Service

The webhook service has a background delivery loop. When the Pod receives SIGTERM:

```typescript
process.on("SIGTERM", async () => {
  console.log("[webhook] Shutting down gracefully...");
  // Stop accepting new deliveries
  // Wait for in-flight HTTP requests to complete
  // Close database connection
  // Close Fastify server
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
});
```

And in the Deployment:

```yaml
spec:
  terminationGracePeriodSeconds: 35  # Give 35s for graceful shutdown
```



### Commands

```bash
# Check terminationGracePeriodSeconds
kubectl get pod <pod-name> -n task-manager -o jsonpath='{.spec.terminationGracePeriodSeconds}'

# Watch pod termination during rollout
kubectl get pods -n task-manager -w
# You'll see:
# task-manager-old  1/1  Running   → task-manager-old  1/1  Terminating
# task-manager-new  1/1  Running

# Force delete a stuck pod (bypasses grace period)
kubectl delete pod <pod-name> -n task-manager --grace-period=0 --force
```

---



## Troubleshooting Playbook



### Pod Stuck in `Pending`

```bash
# Check events
kubectl describe pod <pod-name> -n task-manager | tail -20

# Common causes:
# - Not enough resources (CPU/memory)
# - PVC not bound (no storage available)
# - ImagePullBackOff (image doesn't exist)
# - NodeSelector/tolerations don't match any node
```



### Pod Stuck in `ContainerCreating`

```bash
# Check events
kubectl describe pod <pod-name> -n task-manager | tail -20

# Common causes:
# - Volume mount failed (PVC doesn't exist or wrong path)
# - ConfigMap/Secret doesn't exist
# - Image can't be pulled
```



### Pod in `CrashLoopBackOff`

```bash
# Check logs
kubectl logs <pod-name> -n task-manager
kubectl logs <pod-name> -n task-manager --previous  # Logs from before crash

# Common causes:
# - App throws unhandled error on startup
# - Database connection fails
# - Probe starts too early (initialDelaySeconds too low)
# - Env var missing or wrong
```



### Service Returns 404

```bash
# Check endpoints
kubectl get endpoints <service-name> -n task-manager

# If empty: selector doesn't match any pods
kubectl get svc <service-name> -n task-manager -o jsonpath='{.spec.selector}'
kubectl get pods -n task-manager --show-labels | grep <selector-key>

# If wrong pods: selector matches too many pods (label collision)
```



### Helm Upgrade Has No Effect

```bash
# 1. Check if Deployment spec actually changed
helm get manifest task-manager -n task-manager | grep -A20 "kind: Deployment"

# 2. Force restart
kubectl rollout restart deployment/task-manager -n task-manager

# 3. Check for immutable field changes (selectors)
helm diff revision task-manager <prev-rev> <new-rev> -n task-manager
```



### Wrong Pod Receives Traffic

```bash
# 1. Check Service endpoints
kubectl get endpoints <service-name> -n task-manager
# Multiple IPs? → Selector too broad

# 2. Check Service selector
kubectl get svc <service-name> -n task-manager -o jsonpath='{.spec.selector}'

# 3. Fix: add component label to selector
```

---



## Cheat Sheet: Every Command You Need



### Pod Operations

```bash
kubectl get pods -n <ns>                          # List pods
kubectl get pods -n <ns> -w                       # Watch pods
kubectl get pods -n <ns> -o wide                  # Pod details with IP/node
kubectl get pods -n <ns> --show-labels            # Show pod labels
kubectl describe pod <name> -n <ns>               # Full pod details
kubectl logs <name> -n <ns>                       # Pod logs
kubectl logs <name> -n <ns> --previous            # Previous container logs
kubectl logs <name> -n <ns> -f                    # Follow logs
kubectl exec -it <name> -n <ns> -- sh             # Open shell
kubectl exec <name> -n <ns> -- env                # Check env vars
kubectl delete pod <name> -n <ns>                 # Force pod recreation
kubectl top pod <name> -n <ns>                    # Resource usage
```



### Deployment Operations

```bash
kubectl get deployments -n <ns>                   # List deployments
kubectl rollout status deployment/<name> -n <ns>   # Check rollout
kubectl rollout restart deployment/<name> -n <ns>  # Force restart
kubectl rollout history deployment/<name> -n <ns>  # See revisions
kubectl rollout undo deployment/<name> -n <ns>     # Rollback
kubectl scale deployment/<name> --replicas=3 -n <ns>  # Manual scale
```



### Service Operations

```bash
kubectl get svc -n <ns>                           # List services
kubectl describe svc <name> -n <ns>               # Service details
kubectl get endpoints <name> -n <ns>              # Check routing targets
kubectl port-forward svc/<name> <local>:<remote> -n <ns>  # Port forward
```



### Helm Operations

```bash
helm list -n <ns>                                 # List releases
helm history <release> -n <ns>                    # Release history
helm get values <release> -n <ns>                 # Current values
helm get values <release> -n <ns> --all           # All values (incl defaults)
helm rollback <release> <revision> -n <ns>        # Rollback to revision
helm upgrade <release> ./chart -n <ns> --reuse-values  # Upgrade
helm upgrade <release> ./chart -n <ns> --no-hooks      # Skip hooks
```



### Debugging

```bash
kubectl get events -n <ns> --sort-by='.lastTimestamp'  # Recent events
kubectl describe pod <name> -n <ns> | tail -30         # Pod events
kubectl get endpoints <svc> -n <ns>                     # Service routing
kubectl exec <pod> -n <ns> -- nslookup <service-name>   # DNS test
kubectl exec <pod> -n <ns> -- env | grep MEILI          # Env var check
```



### Minikube Operations

```bash
minikube start --driver=docker                     # Start cluster
minikube stop                                      # Stop cluster
minikube delete                                    # Delete cluster
minikube tunnel                                    # Ingress access (keep running)
minikube ssh "docker rmi -f <image>"              # Remove image from Minikube
minikube image load <image>                        # Load image into Minikube
minikube image ls                                  # List images in Minikube
minikube addons enable ingress                     # Enable Ingress controller
```



### Resource Inspection

```bash
kubectl get all -n <ns>                            # Everything in namespace
kubectl get configmaps -n <ns>                     # List ConfigMaps
kubectl get secrets -n <ns>                        # List Secrets
kubectl get pvc -n <ns>                            # List PVCs (storage)
kubectl get statefulsets -n <ns>                   # List StatefulSets
kubectl get cronjobs -n <ns>                       # List CronJobs
kubectl get jobs -n <ns>                           # List Jobs
kubectl get ingress -n <ns>                        # List Ingress rules
kubectl get servicemonitors -n <ns>               # List ServiceMonitors
```

---



## Key Takeaways

1. **Helm upgrade updates the spec, not the Pods.** Always follow with `kubectl rollout restart` if you need Pods to pick up changes immediately.
2. **Immutable fields silently fail.** Deployment/StatefulSet selectors cannot be changed via `helm upgrade`. Delete and recreate.
3. `--reuse-values` **uses old values.** New keys in `values.yaml` are invisible. Pass new keys via `--set` on first deploy.
4. **Labels control everything.** Wrong labels = wrong routing, wrong exec targeting, wrong Service endpoints. Always add `app.kubernetes.io/component` to selectors.
5. **Minikube caches by tag, not content.** Always `minikube ssh "docker rmi -f <image>"` before loading a new build.
6. **CronJobs can't be restarted.** Trigger a manual Job instead: `kubectl create job --from=cronjob/<name>`.
7. **Env vars are read at Pod startup.** Updating Secrets/ConfigMaps doesn't update running Pods. Restart the Deployment.
8. **initContainers gate startup.** If an initContainer fails, the main container never starts. Check init container logs.
9. **Probes control traffic and restarts.** Failed readiness = no traffic. Failed liveness = restart. Set `initialDelaySeconds` appropriately.
10. `minikube tunnel` **is required on Windows/Docker.** Without it, Ingress has no reachable IP.

