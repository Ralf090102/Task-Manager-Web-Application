# Level 4: Kubernetes Fundamentals

**Duration:** 6 hours  
**Goal:** Understand how Kubernetes orchestrates containers into a scalable, self-healing cluster

---

## Table of Contents

1. [What is Kubernetes?](#1-what-is-kubernetes)
2. [Minikube: Local Cluster Setup](#2-minikube-local-cluster-setup)
3. [Pods: The Atom of Kubernetes](#3-pods-the-atom-of-kubernetes)
4. [Deployments: Managing Pod Lifecycle](#4-deployments-managing-pod-lifecycle)
5. [Services: Internal Networking](#5-services-internal-networking)
6. [Ingress: External Access](#6-ingress-external-access)
7. [ConfigMaps and Secrets](#7-configmaps-and-secrets)
8. [Probes: Liveness vs Readiness](#8-probes-liveness-vs-readiness)
9. [Resource Management](#9-resource-management)
10. [Workload Types](#10-workload-types)
11. [kubectl: The Command Reference](#11-kubectl-the-command-reference)
12. [Hands-On Exercises](#12-hands-on-exercises)
13. [The Kubernetes Pipeline](#13-the-kubernetes-pipeline)
14. [Kubernetes Operators](#14-kubernetes-operators)
15. [What You've Learned](#15-what-youve-learned)

---



## 1. What is Kubernetes?



### The Problem Kubernetes Solves

In Level 3, Docker Compose ran 2 containers on 1 machine. But production needs more:

```
Docker Compose (Level 3):          Production Reality:

┌───────────────────────────┐      ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  1 Machine                │      │  Server 1   │  │  Server 2   │  │  Server 3   │
│                           │      │             │  │             │  │             │
│  ┌─────────┐ ┌─────────┐  │      │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │
│  │ app     │ │ db      │  │      │ │ app #1  │ │  │ │ app #2  │ │  │ │ app #3  │ │
│  └─────────┘ └─────────┘  │      │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │
│                           │      │ ┌─────────┐ │  │             │  │ ┌─────────┐ │
│  If the machine dies,     │      │ │ realtime│ │  │             │  │ │ webhook │ │
│  EVERYTHING dies.         │      │ └─────────┘ │  │             │  │ └─────────┘ │
│                           │      │ ┌─────────┐ │  │             │  │             │
│  No auto-restart.         │      │ │ notif.  │ │  │             │  │             │
│  No scaling.              │      │ └─────────┘ │  │             │  │             │
│  No rolling updates.      │      └─────────────┘  └─────────────┘  └─────────────┘
└───────────────────────────┘
                                   Who decides which server gets which container?
                                   What if Server 2 crashes? Who restarts app #2?
                                   How do you update app without downtime?
```



### The Kubernetes Solution

Kubernetes (K8s) is a **container orchestrator** — it manages containers across multiple machines, handling scheduling, scaling, self-healing, and rolling updates automatically:

```
┌──────────────────────────────────────────────────────────────────┐
│                    KUBERNETES CLUSTER                            │
│                                                                  │
│   ┌──────────┐                                                   │
│   │ kubectl  │ ← You (the operator) give commands                │
│   └────┬─────┘                                                   │
│        │                                                         │
│   ┌────▼──────────────┐                                          │
│   │ Control Plane     │ ← The "brain" — makes all decisions      │
│   │ (API Server)      │                                          │
│   │ (Scheduler)       │                                          │
│   │ (Controller Mgr)  │                                          │
│   │ (etcd)            │ ← Cluster state stored here              │
│   └────┬──────┬───────┘                                          │
│        │      │                                                  │
│   ┌────▼──┐ ┌─▼────────┐ ┌───────────┐                           │
│   │ Node 1│ │  Node 2  │ │  Node 3   │ ← Worker machines         │
│   │       │ │          │ │           │                           │
│   │┌─────┐│ │┌─────┐   │ │┌─────┐    │                           │
│   ││app  ││ ││app  │   │ ││app  │    │← Pods (running containers)│
│   ││ #1  ││ ││ #2  │   │ ││ #3  │    │                           │
│   │└─────┘│ │└─────┘   │ │└─────┘    │                           │
│   │┌─────┐│ │          │ │┌─────┐    │                           │
│   ││notif││ │          │ ││webhk│    │                           │
│   │└─────┘│ │          │ │└─────┘    │                           │
│   └───────┘ └──────────┘ └───────────┘                           │
│                                                                  │
│   If Node 2 crashes → Control Plane notices                      │
│   → reschedules app #2 to Node 1 or Node 3                       │
│   → users never notice                                           │
└──────────────────────────────────────────────────────────────────┘
```



### K8s vs Docker Compose


| Feature           | Docker Compose            | Kubernetes                |
| ----------------- | ------------------------- | ------------------------- |
| Machines          | 1                         | Many (cluster)            |
| Auto-restart      | `restart: unless-stopped` | Self-healing (automatic)  |
| Scaling           | Manual (change replicas)  | Horizontal Pod Autoscaler |
| Load balancing    | None built-in             | Service (built-in)        |
| Rolling updates   | No                        | Yes (zero-downtime)       |
| Rollback          | No                        | `kubectl rollout undo`    |
| Config management | `environment:`            | ConfigMaps + Secrets      |
| External access   | `ports:`                  | Ingress + Service         |
| Storage           | Named volumes             | PersistentVolumeClaims    |




### Key Vocabulary


| Term              | Meaning                                   | Analogy              |
| ----------------- | ----------------------------------------- | -------------------- |
| **Cluster**       | A set of machines running K8s             | A data center        |
| **Node**          | A single machine in the cluster           | One server           |
| **Control Plane** | The brain managing the cluster            | The manager's office |
| **Pod**           | Smallest deployable unit (1+ containers)  | A shipping container |
| **Deployment**    | Manages a set of Pods (replicas, updates) | A shipping schedule  |
| **Service**       | Stable network address for Pods           | A phone number       |
| **Ingress**       | Routes external HTTP traffic to Services  | A receptionist       |
| **Namespace**     | Logical partition of the cluster          | A department         |


---



## 2. Minikube: Local Cluster Setup



### What is Minikube?

Minikube runs a **single-node Kubernetes cluster** on your laptop. It creates a virtual machine (or uses Docker) with the full K8s control plane + worker on one machine.

### Starting a Cluster

```bash
# Start Minikube with Docker driver and enough resources
minikube start --driver=docker --cpus=4 --memory=7168 --kubernetes-version=v1.35.1

# Check status
minikube status

# Enable NGINX Ingress controller (routes external traffic)
minikube addons enable ingress

# Open the K8s dashboard (visual overview)
minikube dashboard
```



### Why 4 CPU / 7GB RAM?

This project runs 10+ pods simultaneously (main app + 8 microservices + databases + monitoring). Minikube's VM needs enough resources:

```
Default (2 CPU / 2GB):           Our config (4 CPU / 7GB):

2GB shared among ALL pods        7GB shared among ALL pods
├── main app: ~256MB              ├── main app: ~256MB
├── notification: ~128MB          ├── notification: ~128MB
├── realtime: ~128MB              ├── realtime: ~128MB
├── webhook: ~128MB               ├── webhook: ~128MB
├── ...                           ├── ...
→ OOM kills, pod crashes          → Everything runs comfortably
```



### Loading Docker Images

Minikube has its own Docker daemon — separate from Docker Desktop. Images built on Docker Desktop must be explicitly loaded:

```bash
# Build with Docker Desktop (fast, lots of RAM)
docker build -t ralf090102/task-manager-app:latest -f Dockerfile .

# Load into Minikube's daemon (pods can now use it)
minikube image load ralf090102/task-manager-app:latest

# IMPORTANT: Force-remove stale images before re-loading
# Minikube caches by tag, not digest — without this, old code persists
minikube ssh "docker rmi -f ralf090102/task-manager-app:latest"
minikube image load ralf090102/task-manager-app:latest
```



### Accessing the Cluster

Minikube runs inside a VM — your browser can't reach it directly. Two methods:

```
Method 1: minikube tunnel (used for Ingress)
┌────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Browser   │────→│ minikube tunnel  │────→│ Ingress     │
│ localhost  │     │ (routes to VM)   │     │ Controller  │
└────────────┘     └──────────────────┘     └──────┬──────┘
                                                   │
                    Hosts file:                    ▼
                    127.0.0.1 task-manager.local  ┌─Pod──┐
                                                  │ app  │
                                                  └──────┘

Method 2: kubectl port-forward (used for individual services)
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
→ Open http://localhost:3001
```

---



## 3. Pods: The Atom of Kubernetes



### What is a Pod?

A Pod is the smallest deployable unit in K8s. It wraps one or more containers:

```
┌──────────────────────────────────┐
│            Pod                   │
│                                  │
│  ┌──────────────┐                │
│  │  Container   │  ← Your Docker │
│  │  (app)       │    image       │
│  │              │                │
│  │  node server │                │
│  └──────────────┘                │
│                                  │
│  Shared:                         │
│  ├── IP address (10.244.1.5)     │
│  ├── Port 3000                   │
│  ├── Volumes (if mounted)        │
│  └── Network namespace           │
└──────────────────────────────────┘
```

**Pod vs Container:** You never deploy a "container" in K8s — you deploy a Pod that contains a container. The Pod provides the networking and storage wrapper.

### Pods Are Ephemeral

```
Pod lifecycle:
  Created → Running → (crash/node failure) → Destroyed
                                              │
              Kubernetes creates a NEW Pod ←──┘
              with a NEW IP address

  Old Pod: 10.244.1.5  (gone)
  New Pod: 10.244.1.8  (different IP!)

  This is why you NEVER connect directly to Pod IPs.
  You connect to a Service (stable address), which routes to Pods.
```



### Pod Definition (Inside a Deployment)

Pods are rarely created directly. They're created by Deployments:

```yaml
# From task-manager-deployment.yaml (simplified)

spec:
  template:              # ← Pod template
    metadata:
      labels:
        app.kubernetes.io/name: task-manager
        app.kubernetes.io/component: app
    spec:
      containers:
        - name: task-manager
          image: "ralf090102/task-manager-app:latest"
          imagePullPolicy: Never        # Use local image (Minikube)
          ports:
            - name: http
              containerPort: 3000       # Container listens here
          env:                          # Environment variables
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: task-manager-secrets
                  key: database-url
          livenessProbe:                # Health checks
            httpGet:
              path: /
              port: http
          resources:                    # CPU/memory limits
            limits:
              cpu: 500m
              memory: 512Mi
```



### Multi-Container Pods (initContainers)

Some Pods have helper containers that run before the main container:

```yaml
# From file-service-deployment.yaml

spec:
  initContainers:                    # Runs FIRST, must succeed
    - name: wait-for-minio
      image: busybox:1.35
      command:
        - sh
        - -c
        - 'until wget -q -O /dev/null http://task-manager-minio:9000/minio/health/live; do echo "waiting"; sleep 2; done'
      # ↑ Keeps retrying until MinIO is healthy
      # Prevents file-service from starting before its dependency

  containers:                        # Runs AFTER initContainers finish
    - name: file-service
      image: "ralf090102/file-service:latest"
      # ...
```

```
Pod startup sequence:

  initContainer (wait-for-minio)     → main container (file-service)
  ┌────────────────────────────┐     ┌──────────────────────────┐
  │ wget minio:9000/health     │     │ Starts Fastify server    │
  │ Failed? sleep 2, retry     │     │ Connects to MinIO        │
  │ Success? container exits   │     │ Handles file uploads     │
  └────────────────────────────┘     └──────────────────────────┘
         ↑ Must finish first                  ↑ Then starts
```

---



## 4. Deployments: Managing Pod Lifecycle



### What is a Deployment?

A Deployment is a controller that manages Pods. You tell it "I want 3 replicas of this Pod" and it makes sure 3 are always running:

```
You create a Deployment:
  "I want 1 replica of task-manager-app"

Deployment Controller watches:
  ┌──────────────────────────────────────────┐
  │  Desired: 1 replica                      │
  │  Actual:   0 replicas                    │
  │  → Creates 1 Pod                         │
  │                                          │
  │  Pod crashes?                            │
  │  Actual drops to 0 → Creates a new Pod   │
  │                                          │
  │  Node dies?                              │
  │  Pod disappears → Creates Pod elsewhere  │
  └──────────────────────────────────────────┘
```



### Deployment Structure

```yaml
# task-manager/templates/task-manager/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: task-manager               # Deployment name
  labels:
    app.kubernetes.io/name: task-manager
spec:
  replicas: 1                      # How many Pods to run
  selector:                        # How to find THIS Deployment's Pods
    matchLabels:
      app.kubernetes.io/name: task-manager
      app.kubernetes.io/component: app    # ← CRITICAL: unique per service
  template:                        # The Pod blueprint
    metadata:
      labels:
        app.kubernetes.io/name: task-manager
        app.kubernetes.io/component: app    # Must match selector
    spec:
      containers:
        - name: task-manager
          image: "ralf090102/task-manager-app:latest"
          # ... (ports, env, probes, resources)
```



### The Selector-Label System

Deployments find their Pods using **labels**. This is how K8s knows which Pods belong to which Deployment:

```
Deployment selector:              Pod labels:
  app.kubernetes.io/name:           app.kubernetes.io/name: task-manager
    task-manager                    app.kubernetes.io/instance: task-manager
  app.kubernetes.io/instance:       app.kubernetes.io/component: app  ← THIS!
    task-manager                  ↑
  app.kubernetes.io/component:    Must match the selector
    app

If two Deployments have the same labels but different component labels:
  task-manager Deployment  → selector: component=app      → matches app pods only
  notification Deployment  → selector: component=notif    → matches notification pods only

If you FORGET the component label:
  task-manager Service selector matches BOTH app and notification pods
  → Traffic goes to both → 50% of requests hit the wrong service → 404 errors
```

**This is the #1 most common K8s bug.** Every Deployment + Service pair needs a unique `app.kubernetes.io/component` label.

### Rolling Updates

When you change the image, K8s updates Pods one at a time:

```
Before update (v1):         During update:              After update (v2):

┌──────────┐               ┌──────────┐               ┌──────────┐
│ Pod v1   │               │ Pod v2   │ ← new         │ Pod v2   │
│ Running  │               │ Starting │               │ Running  │
└──────────┘               └──────────┘               └──────────┘
┌──────────┐               ┌──────────┐               ┌──────────┐
│ Pod v1   │               │ Pod v1   │               │ Pod v2   │
│ Running  │               │ Running  │               │ Running  │
└──────────┘               └──────────┘               └──────────┘
┌──────────┐               ┌──────────┐               ┌──────────┐
│ Pod v1   │               │ Pod v1   │               │ Pod v2   │
│ Running  │               │ Running  │               │ Running  │
└──────────┘               └──────────┘               └──────────┘

                           Zero downtime: old pods serve traffic
                           until new pods pass readiness probe
```

```bash
# Trigger a rolling update
kubectl set image deployment/task-manager task-manager=ralf090102/task-manager-app:v2

# Watch it happen
kubectl rollout status deployment/task-manager

# Rollback if something goes wrong!
kubectl rollout undo deployment/task-manager
```

---



## 5. Services: Internal Networking



### The Problem Services Solve

Pods have **ephemeral IPs** — they change when Pods are recreated. Services provide a **stable address** that routes to Pods:

```
Without Service:                    With Service:

Pod dies, new Pod created           Service: task-manager-notification
  Old IP: 10.244.1.5                  └── Stable DNS: task-manager-notification
  New IP: 10.244.1.9                      ClusterIP: 10.96.34.122
                                          Port: 3004
Everything that connected to            │
10.244.1.5 is now broken!               │ routes to (load-balanced)
                                        │
                                        ├── Pod 1: 10.244.1.5 (may change)
                                        └── Pod 2: 10.244.1.9 (may change)

                                       Other pods just call:
                                       http://task-manager-notification:3004
                                       DNS resolves to the Service, never changes
```



### Service Types



#### ClusterIP (Internal Only)

The default — only accessible from inside the cluster:

```yaml
# task-manager/templates/notification/service.yaml

apiVersion: v1
kind: Service
metadata:
  name: task-manager-notification
spec:
  type: ClusterIP              # Internal only (no external access)
  ports:
    - port: 3004               # Service port (what callers connect to)
      targetPort: http         # Container port (named "http" = 3004)
      name: http
  selector:                    # Which Pods this Service routes to
    app.kubernetes.io/name: task-manager
    app.kubernetes.io/component: notification
```

```
┌───────────────────────────────────────────────────────┐
│                 Kubernetes Cluster                    │
│                                                       │
│  ┌──────────────┐    ┌──────────────────────────┐     │
│  │ main app     │    │ Service: notification    │     │
│  │              │    │ ClusterIP: 10.96.34.122  │     │
│  │ fetch(       │───→│ Port: 3004               │     │
│  │   "http://   │    │                          │     │
│  │    task-     │    │ Routes to Pods with:     │     │
│  │    manager-  │    │  component: notification │     │
│  │    notif-    │    └──────────┬───────────────┘     │
│  │    ication:  │               │                     │
│  │    3004/     │               ▼                     │
│  │    health")  │    ┌──────────────────────────┐     │
│  └──────────────┘    │ Pod: notification        │     │
│                      │ IP: 10.244.1.5 (hidden)  │     │
│  External browsers   └──────────────────────────┘     │
│  CANNOT reach this                                    │
│  Service (no Ingress)                                 │
└───────────────────────────────────────────────────────┘
```

All microservices use ClusterIP — they're internal only. Only the main app gets an Ingress.

#### Headless Service (For StatefulSets)

Used by StatefulSets (MinIO, Meilisearch). Returns Pod IPs directly instead of load-balancing:

```yaml
# task-manager/templates/minio/headless-service.yaml

apiVersion: v1
kind: Service
metadata:
  name: task-manager-minio-headless
spec:
  clusterIP: None              # ← Headless! No load-balancing
  ports:
    - port: 9000
      name: api
  selector:
    app.kubernetes.io/component: minio
```

```
ClusterIP Service:               Headless Service:
DNS: task-manager-notification    DNS: task-manager-minio-headless
→ Returns: 10.96.34.122          → Returns: 10.244.1.5 (Pod IP directly)
  (the Service IP)                  StatefulSets need stable Pod identities
  (load-balanced)                   for stable storage
```



### Service DNS

K8s has built-in DNS. Services are reachable by name:

```bash
# Inside any Pod in the cluster:

# Full DNS name:
http://task-manager-notification.task-manager.svc.cluster.local:3004
#                   ^service          ^namespace

# Short name (same namespace):
http://task-manager-notification:3004

# This is how the main app calls microservices:
DATABASE_URL connects to external Supabase (not a Service)
REALTIME_URL = "http://task-manager-realtime:3001"
WEBHOOK_URL  = "http://task-manager-webhook:3003"
```

---



## 6. Ingress: External Access



### What is Ingress?

Services are internal (ClusterIP). Ingress exposes HTTP routes from outside the cluster:

```
Internet (browser)               Without Ingress:            With Ingress:
     │                           ┌───────────┐              ┌─────────────────────────────────────┐
     ▼                           │ Cluster   │              │ Cluster                             │
 http://task-manager.local       │           │              │                                     │
     │                           │ No entry  │              │  ┌─────────────┐                    │
     ▼                           │ point for │              │  │  Ingress    │                    │
┌──────────┐                     │ external  │              │  │  Controller │                    │
│ Browser  │                     │ traffic   │              │  │  (NGINX)    │                    │
└──────────┘                     └───────────┘              │  └──────┬──────┘                    │
                                                            │         │                           │
                                                            │  routes by path                     │
                                                            │  ┌──────┴──────┐                    │
                                                            │  │             │                    │
                                                            │  ▼             ▼                    │
                                                            │ / ──→ app    /socket.io → realtime  │
                                                            │ (Service)     (Service)             │
                                                            └─────────────────────────────────────┘
```



### Ingress Configuration

```yaml
# task-manager/templates/task-manager/ingress.yaml

apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: task-manager
  annotations:
    # When realtime is enabled, extend WebSocket timeouts
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
spec:
  ingressClassName: nginx          # Use NGINX Ingress controller
  rules:
    - host: task-manager.local     # Match this hostname
      http:
        paths:
          # WebSocket traffic → realtime service
          - path: /socket.io
            pathType: Prefix
            backend:
              service:
                name: task-manager-realtime
                port:
                  number: 3001
          # Everything else → main app
          - path: /
            pathType: Prefix
            backend:
              service:
                name: task-manager
                port:
                  number: 3000
```



### How Ingress Routing Works

```
Browser request: http://task-manager.local/socket.io/
                    │
                    ▼
┌──────────────────────────────────────┐
│  NGINX Ingress Controller            │
│                                      │
│  Host: task-manager.local            │
│  ├── /socket.io → realtime:3001      │  ← WebSocket upgrade
│  └── /          → task-manager:3000  │  ← All other traffic
│                                      │
└──────┬──────────────────┬────────────┘
       │                  │
       ▼                  ▼
┌──────────────┐  ┌──────────────────┐
│ realtime     │  │ task-manager app │
│ Service      │  │ Service          │
│ → Pod(s)     │  │ → Pod(s)         │
└──────────────┘  └──────────────────┘
```



### The Full Access Chain

```
Your Browser
  │
  │  1. DNS: task-manager.local → 127.0.0.1
  │     (hosts file entry)
  │
  │  2. minikube tunnel: 127.0.0.1:80 → Minikube VM
  │
  │  3. NGINX Ingress Controller (inside cluster)
  │     Reads Host header, matches path
  │
  │  4. Service: task-manager (ClusterIP)
  │     Load-balances across Pods
  │
  │  5. Pod: task-manager-xxx-yyy
  │     Container: node server.js (port 3000)
  │
  ▼
  Response flows back: Pod → Service → Ingress → tunnel → Browser
```

**Why** `minikube tunnel` **is required on Windows/Docker driver:**

Minikube's Docker driver doesn't expose ports directly to the host. `minikube tunnel` creates a route from `127.0.0.1` into the Minikube VM, allowing the Ingress controller to receive traffic.

---



## 7. ConfigMaps and Secrets



### ConfigMaps: Non-Sensitive Configuration

ConfigMaps store configuration data that's **not secret**:

```yaml
# task-manager/templates/webhook/configmap.yaml

apiVersion: v1
kind: ConfigMap
metadata:
  name: task-manager-webhook-config
data:
  MAX_ATTEMPTS: "5"
  BACKOFF_INTERVALS: "1,5,30,120,600"
  POLL_INTERVAL_MS: "2000"
  DELIVERY_TIMEOUT_MS: "10000"
```

**Why ConfigMaps?** Change retry config without rebuilding the Docker image. Update the ConfigMap, restart the Pod, and the new values take effect.

### Secrets: Sensitive Data

Secrets store sensitive data (passwords, API keys, tokens). They're base64-encoded (not encrypted — just encoded):

```yaml
# task-manager/templates/secret.yaml

apiVersion: v1
kind: Secret
metadata:
  name: task-manager-secrets
type: Opaque
data:
  # Values are base64-encoded
  database-url: <base64 of DATABASE_URL>
  nextauth-secret: <base64 of AUTH_SECRET>
  nextauth-url: <base64 of NEXTAUTH_URL>
  auth-trust-host: <base64 of "true">
```



### How Pods Consume ConfigMaps and Secrets

```yaml
# Inside a Deployment's container spec:

env:
  # From Secret
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: task-manager-secrets
        key: database-url

  # From ConfigMap
  - name: MAX_ATTEMPTS
    valueFrom:
      configMapKeyRef:
        name: task-manager-webhook-config
        key: MAX_ATTEMPTS

  # Inline (hardcoded)
  - name: SMTP_PORT
    value: "587"
```



### ConfigMap vs Secret vs Inline


| Method         | Use For                 | Example                     | Changeable            |
| -------------- | ----------------------- | --------------------------- | --------------------- |
| **ConfigMap**  | Non-sensitive config    | Retry intervals, timeouts   | Without rebuild       |
| **Secret**     | Passwords, keys, tokens | DATABASE_URL, SMTP_PASSWORD | Without rebuild       |
| **Inline env** | Constants, defaults     | Port numbers, feature flags | Requires Helm upgrade |


---



## 8. Probes: Liveness vs Readiness



### Why Probes Matter

Without probes, K8s only knows if a Pod's **process** is running — not whether the app is **actually working**:

```
Without probes:                    With probes:

Pod starts                         Pod starts
  process running                    process running
  K8s: "It's alive!"                 K8s asks: "Are you ready?"
  Reality: still booting up          → HTTP GET /health → 503
  → sends traffic anyway             → K8s: "Not ready, don't send traffic"
  → users get errors                 → App finishes starting
                                     → HTTP GET /health → 200
                                     → K8s: "Ready! Send traffic"
                                     → users get responses
```



### Liveness Probe

"Is the app alive? If not, restart it."

```yaml
# From task-manager-deployment.yaml

livenessProbe:
  httpGet:
    path: /                     # Hit the homepage
    port: http                  # Port 3000 (named "http")
  initialDelaySeconds: 30       # Wait 30s before first check
  periodSeconds: 10             # Check every 10s
```

```
Liveness check flow:

  Every 10s: HTTP GET http://<pod-ip>:3000/
    │
    ├── 200 OK → do nothing, app is alive
    │
    ├── 500 or timeout → mark as unhealthy
    │   └── After 3 consecutive failures → KILL the Pod
    │       └── Deployment creates a new Pod (self-healing)
    │
    └── initialDelaySeconds: 30 → skip checks for first 30s
        (app needs time to boot)
```



### Readiness Probe

"Is the app ready to serve traffic? If not, remove it from the Service."

```yaml
# From task-manager-deployment.yaml

readinessProbe:
  httpGet:
    path: /
    port: http
  initialDelaySeconds: 5        # Start checking after 5s
  periodSeconds: 5              # Check every 5s
```

```
Readiness check flow:

  Every 5s: HTTP GET http://<pod-ip>:3000/
    │
    ├── 200 OK → Pod is READY → Service sends traffic to it
    │
    ├── 500 or timeout → Pod is NOT READY → Service removes it
    │   (Pod keeps running, but gets no traffic)
    │   (Other Pods handle requests instead)
    │
    └── When it recovers → 200 OK → Pod is READY again → traffic resumes
```



### Liveness vs Readiness Summary


| Probe         | Question                    | Fail Action          | Purpose               |
| ------------- | --------------------------- | -------------------- | --------------------- |
| **Liveness**  | Is the app dead?            | Restart the Pod      | Self-healing          |
| **Readiness** | Can the app serve requests? | Stop sending traffic | Zero-downtime updates |


```
Scenario: Database connection drops

  Liveness: app still responds to / → 200 → not restarted
  Readiness: app can't query DB → /ready → 503 → removed from Service
  → Users don't get errors (traffic goes to other Pods)
  → App reconnects → readiness passes → traffic resumes

Scenario: App deadlock (process running but frozen)

  Liveness: /health times out → 3 failures → Pod killed → new Pod created
  → App restarts fresh, deadlock cleared
```



### Microservice Health Endpoints

Each microservice exposes `/health` for probes:


| Service            | Liveness/Readiness Path | Port |
| ------------------ | ----------------------- | ---- |
| Main app (Next.js) | `/`                     | 3000 |
| Notification       | `/health`               | 3004 |
| File service       | `/health`               | 3005 |
| Search sync        | `/health`               | 3006 |
| Realtime           | `/health`               | 3001 |
| Analytics          | `/health`               | 8000 |
| Webhook            | `/health`               | 3003 |
| MinIO              | `/minio/health/live`    | 9000 |
| Meilisearch        | `/health`               | 7700 |


---



## 9. Resource Management



### Why Resources Matter

Without limits, one Pod can consume all cluster resources, starving everything else:

```yaml
# From values.yaml (main app)

resources:
  limits:           # Maximum the Pod can use
    cpu: 500m       # 0.5 CPU cores
    memory: 512Mi   # 512 MB RAM
  requests:         # Guaranteed minimum (used for scheduling)
    cpu: 250m       # 0.25 CPU cores
    memory: 256Mi   # 256 MB RAM
```



### CPU and Memory Units

```
CPU:
  1         = 1 full CPU core (1000 millicores)
  500m      = 0.5 CPU cores (500 millicores)
  250m      = 0.25 CPU cores

Memory:
  1Mi       = 1 Mebibyte (1,048,576 bytes)
  256Mi     = 256 MB
  1Gi       = 1 Gibibyte (1,073,741,824 bytes)
```



### Requests vs Limits

```
Request = 250m CPU, 256Mi memory
Limit   = 500m CPU, 512Mi memory

  ┌──────────────────────────────────────────┐
  │  Pod's resource usage                    │
  │                                          │
  │  0 ──────────────────────────────── ∞    │
  │  │         │              │              │
  │  │    REQUEST          LIMIT             │
  │  │    (guaranteed)     (max allowed)     │
  │  │                                       │
  │  │←── guaranteed ──→│                    │
  │  │                   │← can burst ──→    │
  │  │                   │  (if available)   │
  │  │                                       │
  │  └── Exceeds LIMIT?                      │
  │      CPU: throttled (slowed down)        │
  │      Memory: OOMKILLED (pod restarted)   │
  └──────────────────────────────────────────┘
```

**Request** is used for **scheduling** — K8s places Pods on Nodes that have enough unrequested capacity.

**Limit** is enforced at **runtime** — cgroups prevent the Pod from exceeding it.

### What Happens When Limits Are Exceeded

```
CPU limit exceeded:
  Container is throttled (CPU time is restricted)
  App becomes slow but doesn't crash
  No restart needed

Memory limit exceeded:
  Container is OOMKILLED (Out of Memory)
  Pod dies and is restarted by the Deployment
  kubectl describe pod shows: "OOMKilled"
```



### This Project's Resource Allocation

```
Pod                   Request (CPU/Mem)    Limit (CPU/Mem)
─────────────────────────────────────────────────────────────
Main app              250m / 256Mi         500m / 512Mi
Notification          100m / 128Mi         250m / 256Mi
Realtime              100m / 128Mi         250m / 256Mi
Webhook               100m / 128Mi         250m / 256Mi
File service          100m / 128Mi         250m / 256Mi
Search sync           100m / 128Mi         250m / 256Mi
Team service          100m / 128Mi         250m / 256Mi
Analytics             100m / 128Mi         250m / 256Mi
MinIO                 100m / 256Mi         250m / 512Mi
Meilisearch           100m / 256Mi         250m / 512Mi
─────────────────────────────────────────────────────────────
Total minimum:        ~1.0 CPU / ~1.8 GB
Total maximum:        ~2.5 CPU / ~3.6 GB
```

Minikube has 4 CPU / 7GB → everything fits with room to spare.

---



## 10. Workload Types

Different workloads need different K8s resource types:

### Deployment (Stateless Apps)

For apps that don't store data locally. Used by most services:

```
  Deployment
  └── ReplicaSet (current version)
      ├── Pod 1 (ephemeral, no local data)
      ├── Pod 2
      └── Pod 3

  Any Pod can be killed and recreated without data loss.
  All data is in external PostgreSQL (Supabase).
```

**Used by:** main app, notification, realtime, webhook, file-service, search-sync, team-service, analytics

### StatefulSet (Stateful Apps)

For apps that need **stable identity** and **persistent storage**. Used by databases:

```yaml
# From minio-statefulset.yaml

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: task-manager-minio
spec:
  serviceName: task-manager-minio-headless    # Required for StatefulSet
  replicas: 1
  # ...
  volumeClaimTemplates:                       # Each Pod gets its own volume
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi                     # 10 GB persistent volume
```

```
StatefulSet vs Deployment:

Deployment:                       StatefulSet:
  Pod names: random                  Pod names: ordered (minio-0, minio-1)
  Volumes: shared                    Volumes: per-Pod (minio-0 gets vol-0)
  Kill any Pod, no data loss         Kill Pod → volume reattaches to replacement
  Scaling: creates random Pods       Scaling: ordered, sequential

  Used for: stateless web apps       Used for: databases, queues, search engines
```

**Used by:** MinIO (S3-compatible storage), Meilisearch (search engine)

### CronJob (Scheduled Tasks)

For tasks that run on a schedule:

```yaml
# From scheduler-cronjob.yaml

apiVersion: batch/v1
kind: CronJob
metadata:
  name: task-manager-scheduler
spec:
  schedule: "*/5 * * * *"         # Every 5 minutes (cron syntax)
  concurrencyPolicy: Forbid        # Don't overlap runs
  successfulJobsHistoryLimit: 3    # Keep last 3 successful Jobs
  failedJobsHistoryLimit: 1        # Keep last 1 failed Job
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: scheduler
              image: "ralf090102/scheduler-service:latest"
```

```
CronJob lifecycle (every 5 minutes):

  Schedule triggers
    │
    ▼
  Creates a Job
    │
    ▼
  Job creates a Pod
    │
    ▼
  Pod runs the scheduler
  (checks for recurring tasks, creates them)
    │
    ├── Success → Pod exits (0), Job marked complete
    │             Old Jobs cleaned up (keep last 3)
    │
    └── Failure → Pod restarts (OnFailure)
                  Eventually marked failed (keep last 1)

  concurrencyPolicy: Forbid
    If previous run is still going, SKIP this trigger
    Prevents duplicate task creation
```

**Cron syntax cheat sheet:**

```
*/5 * * * *     Every 5 minutes
0 * * * *       Every hour (at minute 0)
0 9 * * 1       Every Monday at 9:00 AM      ← analytics weekly report
0 0 * * *       Every day at midnight
*/30 * * * *   Every 30 minutes

  │  │  │  │  │
  │  │  │  │  └── day of week (0-7, Sun=0)
  │  │  │  └───── month (1-12)
  │  │  └──────── day of month (1-31)
  │  └─────────── hour (0-23)
  └────────────── minute (0-59)
```

---



## 11. kubectl: The Command Reference



### Pod Management

```bash
# List all pods in a namespace
kubectl get pods -n task-manager

# List pods across ALL namespaces
kubectl get pods --all-namespaces

# See pod details (events, resource usage, container status)
kubectl describe pod <pod-name> -n task-manager

# View pod logs
kubectl logs <pod-name> -n task-manager

# Follow logs (tail -f)
kubectl logs -f <pod-name> -n task-manager

# Multiple containers in a pod? Specify which:
kubectl logs <pod-name> -c <container-name> -n task-manager

# Execute command inside a pod
kubectl exec -it <pod-name> -n task-manager -- sh

# Test internal HTTP from inside a pod
kubectl exec deployment/task-manager -n task-manager -- \
  node -e "fetch('http://task-manager-notification:3004/health').then(r=>r.json()).then(j=>console.log(j))"
```



### Deployment Management

```bash
# List deployments
kubectl get deployments -n task-manager

# Restart a deployment (picks up new image)
kubectl rollout restart deployment/task-manager -n task-manager

# Check rollout status
kubectl rollout status deployment/task-manager -n task-manager

# Rollback to previous version
kubectl rollout undo deployment/task-manager -n task-manager

# Scale replicas
kubectl scale deployment task-manager --replicas=3 -n task-manager
```



### Cluster-Wide Commands

```bash
# See everything in a namespace
kubectl get all -n task-manager

# List services
kubectl get svc -n task-manager

# List ingresses
kubectl get ingress -n task-manager

# List configmaps
kubectl get configmap -n task-manager

# List secrets (names only, not values)
kubectl get secret -n task-manager

# List persistent volume claims
kubectl get pvc -n task-manager

# List statefulsets
kubectl get statefulset -n task-manager

# List cronjobs
kubectl get cronjob -n task-manager

# Watch resources (auto-refresh)
kubectl get pods -n task-manager -w
```



### Debugging Commands

```bash
# Why is a pod failing?
kubectl describe pod <pod-name> -n task-manager | tail -30
# Look at "Events:" section at the bottom

# Common failure reasons:
#   ImagePullBackOff  → wrong image name or pullPolicy
#   CrashLoopBackOff  → app crashes on startup (check logs)
#   OOMKilled         → memory limit too low
#   Pending           → not enough resources on any Node

# Port-forward to access a service locally
kubectl port-forward svc/task-manager-notification 3004:3004 -n task-manager
# Now accessible at localhost:3004

# Trigger a CronJob manually
kubectl create job --from=cronjob/task-manager-scheduler manual-test -n task-manager
kubectl logs job/manual-test -n task-manager

# Check resource usage
kubectl top pods -n task-manager
kubectl top nodes
```

---



## 12. Hands-On Exercises



### Exercise 1: Start Minikube and Explore

```bash
# Start cluster
minikube start --driver=docker --cpus=4 --memory=7168

# Enable ingress
minikube addons enable ingress

# Check nodes
kubectl get nodes

# Check what's running
kubectl get pods --all-namespaces

# Open dashboard
minikube dashboard
```



### Exercise 2: Deploy the Main App

```bash
# Build and load image
docker build -t ralf090102/task-manager-app:latest -f Dockerfile .
minikube image load ralf090102/task-manager-app:latest

# Deploy with Helm
helm install task-manager ./helm-chart \
  --namespace task-manager --create-namespace \
  --set image.pullPolicy=Never \
  --set secrets.databaseUrl="<your-supabase-url>" \
  --set secrets.nextauthSecret="<your-secret>" \
  --set secrets.nextauthUrl=http://task-manager.local

# Watch the pod start
kubectl get pods -n task-manager -w

# Check events if pod isn't starting
kubectl describe pod -l app.kubernetes.io/component=app -n task-manager
```



### Exercise 3: Explore a Running Pod

```bash
# Get a shell inside the pod
kubectl exec -it deployment/task-manager -n task-manager -- sh

# Inside the pod:
ls -la
whoami
echo $NODE_ENV
echo $DATABASE_URL | head -c 20  # (should show your DB URL prefix)
node -e "console.log(process.version)"
exit
```



### Exercise 4: Test the Self-Healing

```bash
# Find your app pod
kubectl get pods -n task-manager

# Delete it manually (simulate a crash)
kubectl delete pod <pod-name> -n task-manager

# Watch K8s create a new one instantly
kubectl get pods -n task-manager -w

# The app should be back within seconds
```



### Exercise 5: Access the App

```bash
# Start tunnel in a SEPARATE terminal
minikube tunnel

# Add hosts entry (run as admin)
# Windows: Add to C:\Windows\System32\drivers\etc\hosts
# Linux/Mac: Add to /etc/hosts
127.0.0.1 task-manager.local

# Open in browser
start http://task-manager.local    # Windows
open http://task-manager.local     # Mac
```



### Exercise 6: Trigger the Scheduler Manually

```bash
# Create a one-time Job from the CronJob
kubectl create job --from=cronjob/task-manager-scheduler manual-run -n task-manager

# Watch it run
kubectl get jobs -n task-manager

# View the logs
kubectl logs job/manual-run -n task-manager

# Clean up
kubectl delete job manual-run -n task-manager
```

---



## 13. The Kubernetes Pipeline

> **This section connects Level 3's Docker pipeline to Kubernetes.** It shows what happens when containers are orchestrated by K8s.



### Before Kubernetes (Level 3)

```
┌──────────────────────────────────────────┐
│  Docker Compose (single machine)         │
│                                          │
│  ┌──────────┐       ┌───────────────┐    │
│  │ app      │ ────→ │ db            │    │
│  │ :3000    │       │ :5432         │    │
│  └──────────┘       └───────────────┘    │
│                                          │
│  Browser → localhost:3000 → app → db     │
│                                          │
│  Limitations:                            │
│  - No Ingress (just port mapping)        │
│  - No self-healing (manual restart)      │
│  - No rolling updates                    │
│  - No probes                             │
│  - No resource limits                    │
└──────────────────────────────────────────┘
```



### After Kubernetes (Level 4)

```
┌────────────────────────────────────────────────────────────────────┐
│  Kubernetes Cluster (Minikube)                                     │
│                                                                    │
│  Internet                                                          │
│    │                                                               │
│    ▼                                                               │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ minikube tunnel (127.0.0.1 → cluster)                     │     │
│  └──────────────────────────┬────────────────────────────────┘     │
│                             │                                      │
│  ┌──────────────────────────▼─────────────────────────────────┐    │
│  │ Ingress: task-manager.local                                │    │
│  │ ├── /socket.io → realtime Service (3001)                   │    │
│  │ └── /          → task-manager Service (3000)               │    │
│  └──────────────────────────┬─────────────────────────────────┘    │
│                             │                                      │
│  ┌──────────────────────────▼────────────────────────────────┐     │
│  │ Service: task-manager (ClusterIP)                         │     │
│  │ Routes to Pods with: component: app                       │     │
│  └──────────────────────────┬────────────────────────────────┘     │
│                             │                                      │
│  ┌──────────────────────────▼────────────────────────────────┐     │
│  │ Deployment: task-manager (1 replica)                      │     │
│  │ Ensures 1 Pod is always running                           │     │
│  │ Pod dies? → Creates a new one automatically               │     │
│  └──────────────────────────┬────────────────────────────────┘     │
│                             │                                      │
│  ┌──────────────────────────▼───────────────────────────────┐      │
│  │ Pod: task-manager-xxx-yyy                                │      │
│  │ ┌────────────────────────────────────────────────────┐   │      │
│  │ │ Container: ralf090102/task-manager-app:latest      │   │      │
│  │ │                                                    │   │      │
│  │ │  node server.js (port 3000)                        │   │      │
│  │ │  ├── DATABASE_URL from Secret                      │   │      │
│  │ │  ├── livenessProbe: GET / every 10s                │   │      │
│  │ │  ├── readinessProbe: GET / every 5s                │   │      │
│  │ │  └── Resources: 250m-500m CPU, 256Mi-512Mi Mem     │   │      │
│  │ └────────────────────────────────────────────────────┘   │      │
│  └──────────────────────────────────────────────────────────┘      │
│                             │                                      │
│                             ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐     │
│  │ External PostgreSQL (Supabase cloud)                      │     │
│  │ Connected via DATABASE_URL in Secret                      │     │
│  └───────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
```



### What Kubernetes Adds to Docker


| Layer              | Docker Compose              | Kubernetes                         |
| ------------------ | --------------------------- | ---------------------------------- |
| Container          | Docker image                | Docker image (same!)               |
| Pod wrapper        | N/A                         | Pod (networking + storage)         |
| Replica management | Manual                      | Deployment (auto-restart, scaling) |
| Network address    | Container IP                | Service (stable ClusterIP + DNS)   |
| External access    | Port mapping (-p 3000:3000) | Ingress (hostname-based routing)   |
| Config             | `environment:` in YAML      | ConfigMap + Secret (changeable)    |
| Health checks      | `healthcheck` in compose    | Liveness + Readiness probes        |
| Resources          | Unlimited by default        | Requests + Limits per Pod          |
| Updates            | Stop + rebuild              | Rolling update (zero downtime)     |
| Rollback           | Re-run old command          | `kubectl rollout undo`             |




### The Same Task Creation Pipeline, Now in K8s

The pipeline from Level 2 is identical. The only difference is **infrastructure**:

```
Browser
  │ fetch(POST /api/tasks)
  │
  ▼
Ingress (NGINX)
  │ Matches host: task-manager.local
  │ Routes path: / → task-manager Service
  │
  ▼
Service: task-manager (ClusterIP)
  │ Load-balances to healthy Pods
  │ (only Pods passing readinessProbe)
  │
  ▼
Pod: task-manager-xxx
  │ ┌─ Container ────────────────────┐
  │ │ Next.js API Route              │
  │ │ ├── auth() → JWT from cookie   │
  │ │ ├── Zod validation             │
  │ │ ├── prisma.task.create()       │
  │ │ │     ──→ Supabase (external)  │
  │ │ ├── emitToRealtime()           │──→ Service: realtime (ClusterIP)
  │ │ ├── triggerWebhook()           │──→ Service: webhook (ClusterIP)
  │ │ └── logger.info()              │──→ stdout (collected by K8s)
  │ │                                │
  │ │ Readiness probe passed → 200   │
  │ │ Resources: ≤500m CPU, ≤512Mi   │
  │ └────────────────────────────────┘
  │
  ▼
Returns 201 Created
  │
  ▼
Browser updates UI
```

**The code hasn't changed.** K8s wraps the same Docker container in self-healing, scalable, observable infrastructure.

### What's Next: Helm Charts

You've been using `helm install` commands, but we haven't explained **how** Helm works. Every YAML file we discussed is actually a **Helm template** with `{{ .Values.* }}` variables.

Level 5 covers Helm in depth — how to write templates, manage values, and deploy the full multi-service stack with one command.

---



## 14. Kubernetes Operators



### The Problem Operators Solve

Everything you've learned so far uses **built-in** Kubernetes resources: Deployments, Services, ConfigMaps, Secrets, Ingress. But what if you want K8s to manage something it doesn't natively understand?

```
Built-in resources (K8s knows these natively):
  Deployment  → manages Pods
  Service     → manages networking
  ConfigMap   → manages configuration
  Secret      → manages sensitive data

But K8s doesn't know about:
  - "A Prometheus instance" (with scrape configs, alert rules)
  - "A PostgreSQL cluster" (with backups, replication, failover)
  - "A certificate" (with auto-renewal before expiry)
  - "A message queue" (with partitions, consumers)

  These need DOMAIN-SPECIFIC knowledge:
    "When a certificate is about to expire, renew it."
    "When a database primary fails, promote a replica."
    "When a new ServiceMonitor appears, add it to Prometheus config."

  A Deployment can't do this — it only knows "keep N pods running."
```



### What is an Operator?

An Operator is a **custom Kubernetes controller** that encodes human operational knowledge into software. It extends K8s with a new resource type and a control loop that manages it:

```
Operator = Custom Resource Definition (CRD) + Custom Controller

  ┌───────────────────────────────────────────────────────┐
  │                   OPERATOR                            │
  │                                                       │
  │  ┌─────────────┐         ┌──────────────────────┐     │
  │  │ Custom      │         │ Custom Controller    │     │
  │  │ Resource    │         │ (a Pod running your  │     │
  │  │ Definition  │         │  controller code)    │     │
  │  │ (CRD)       │         │                      │     │
  │  │             │         │ Watches the CRD      │     │
  │  │ Defines a   │         │ Reconciles state     │     │
  │  │ NEW kind of │         │ Creates/updates      │     │
  │  │ resource    │         │   Deployments,       │     │
  │  │             │         │   Services, etc.     │     │
  │  └─────────────┘         └──────────────────────┘     │
  └───────────────────────────────────────────────────────┘

Example: Prometheus Operator
  CRD:  ServiceMonitor (defines which services to scrape)
  Controller: watches ServiceMonitors → updates Prometheus config → reloads Prometheus
```



### Custom Resource Definitions (CRDs)

A CRD tells Kubernetes: "Hey, there's a new type of resource." After you create a CRD, you can create instances of that custom resource just like any built-in resource:

```yaml
# Step 1: Define the CRD (this is installed once by the Operator)

apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: servicemonitors.monitoring.coreos.com
spec:
  group: monitoring.coreos.com           # API group
  names:
    kind: ServiceMonitor                 # This is what you'll use in YAML
    plural: servicemonitors
    shortNames:
      - smon                             # kubectl get smon
  scope: Namespaced
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:                 # Validation rules (like Zod for K8s)
          type: object
          properties:
            spec:
              type: object
              properties:
                endpoints:               # Which endpoints to scrape
                  type: array
                  items:
                    type: object
                selector:                # Which Services to match
                  type: object
```

```yaml
# Step 2: Create an instance of the custom resource (like creating a Pod)

apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor                     # ← This is YOUR custom resource!
metadata:
  name: task-manager-app
  labels:
    release: monitoring                  # Prometheus Operator looks for this
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: task-manager   # Scrape Services with this label
  endpoints:
    - port: http                         # Scrape the "http" port
      path: /api/metrics                 # Metrics endpoint
      interval: 15s                      # Every 15 seconds
```

```
After the CRD is installed, kubectl works with it natively:

  kubectl get servicemonitors -n task-manager
  kubectl get smon -n task-manager          # short name works too
  kubectl describe servicemonitor task-manager-app -n task-manager

  K8s API server treats it like any other resource.
  But K8s itself doesn't KNOW what to do with it.
  That's the Operator's job.
```



### The Reconciliation Loop

The controller's core mechanism is the **reconciliation loop** — it continuously compares the **desired state** (what you declared in the custom resource) with the **actual state** (what's running), and fixes any differences:

```
                    RECONCILIATION LOOP
                    (runs continuously)

         ┌──────────────────────────────────┐
         │                                  │
         ▼                                  │
    ┌─────────────┐                         │
    │   WATCH     │  "Did a ServiceMonitor  │
    │             │   get created/updated/  │
    │             │   deleted?"             │
    └──────┬──────┘                         │
           │                                │
           │ Change detected                │
           ▼                                │
    ┌─────────────┐                         │
    │  COMPARE    │  "Desired: scrape       │
    │             │   task-manager every    │
    │             │   15s                   │
    │             │   Actual: Prometheus    │
    │             │   config doesn't        │
    │             │   include it"           │
    └──────┬──────┘                         │
           │                                │
           │ Mismatch found                 │
           ▼                                │
    ┌─────────────┐                         │
    │   ACT       │  "Update Prometheus     │
    │             │   config to include     │
    │             │   the new target,       │
    │             │   then trigger a        │
    │             │   config reload"        │
    └──────┬──────┘                         │
           │                                │
           │ Fixed                          │
           ▼                                │
    └───────────────────────────────────────┘
           (loop back to watching)

    This is the SAME pattern as a Deployment:
      Deployment:    "Desired: 3 replicas. Actual: 2. Create 1 more."
      Operator:     "Desired: scrape app. Actual: not scraping. Add config."
```



### Operator vs Helm: What's the Difference?

You already use Helm (Level 5). Helm and Operators both extend K8s, but in fundamentally different ways:

```
Helm:  Template engine + package manager
       ─────────────────────────────────
       Renders YAML templates → applies them → DONE.

       helm install task-manager ./helm-chart
         → Creates Deployments, Services, Ingress, etc.
         → Walks away. Helm does NOT watch them.

       If you manually delete a Pod, Helm doesn't care.
       The Deployment controller (built-in) will recreate it.
       But if you delete the entire Deployment, Helm won't restore it.

Operator:  Running controller (always active)
           ──────────────────────────────────
           Watches custom resources → reconciles continuously → NEVER stops.

           Create a ServiceMonitor
             → Operator sees it → configures Prometheus → DONE
             → Someone deletes the Prometheus config?
             → Operator notices → RE-CREATES the config
             → Operator is ALWAYS watching
```


| Aspect                   | Helm                                                 | Operator                                |
| ------------------------ | ---------------------------------------------------- | --------------------------------------- |
| **When it runs**         | Once (at install/upgrade time)                       | Continuously (always watching)          |
| **What it does**         | Renders templates → creates resources                | Watches resources → reconciles state    |
| **Self-healing?**        | No (if you delete a resource, Helm won't restore it) | Yes (recreates resources if they drift) |
| **Domain knowledge?**    | No (just templates)                                  | Yes (encodes operational expertise)     |
| **Reactive to runtime?** | No (doesn't know what happens after install)         | Yes (responds to cluster state changes) |
| **Complexity**           | Low (templates + values)                             | High (write a controller in Go/Python)  |


```
Analogy:

  Helm = a recipe book
         You follow the recipe once, cook the meal, done.
         If someone eats your meal, the book doesn't cook more.

  Operator = a personal chef
         Always in the kitchen, watching.
         If someone eats the meal, the chef cooks more.
         If an ingredient is missing, the chef orders more.
         The chef has DOMAIN KNOWLEDGE (knows HOW to cook).
```



### You're Already Using an Operator

The **Prometheus Operator** is installed in your cluster via `kube-prometheus-stack`. You've been using it without realizing it:

```bash
# Check if the Prometheus Operator is running
kubectl get pods -n monitoring | Select-String "operator"

# Expected:
#   prometheus-operator-xxxx    1/1   Running
```

```bash
# List the CRDs that the Prometheus Operator installed
kubectl get crd | Select-String "monitoring.coreos"

# Expected:
#   alertmanagerconfigs.monitoring.coreos.com
#   alertmanagers.monitoring.coreos.com
#   podmonitors.monitoring.coreos.com
#   probes.monitoring.coreos.com
#   prometheusagents.monitoring.coreos.com
#   prometheuses.monitoring.coreos.com
#   prometheusrules.monitoring.coreos.com
#   servicemonitors.monitoring.coreos.com    ← YOU CREATED THIS!
#   thanosrulers.monitoring.coreos.com
```

```bash
# Your ServiceMonitor is a custom resource managed by the Operator
kubectl get servicemonitor -n task-manager

# Expected:
#   NAME               AGE
#   task-manager-app   5d
```

```
What happens when you create that ServiceMonitor:

  1. You apply servicemonitor.yaml (kubectl/helm)
       │
       ▼
  2. K8s API server stores it (it's a valid resource — CRD exists)
       │
       ▼
  3. Prometheus Operator DETECTS the new ServiceMonitor
     (it has a watch on all ServiceMonitor resources)
       │
       ▼
  4. Operator reads the ServiceMonitor spec:
     "Scrape services with label app.kubernetes.io/name: task-manager
      on port http, path /api/metrics, every 15s"
       │
       ▼
  5. Operator GENERATES Prometheus configuration
     (adds a new scrape target to prometheus.yml)
       │
       ▼
  6. Operator TRIGGERS a Prometheus config reload
     (sends SIGHUP or calls the reload API)
       │
       ▼
  7. Prometheus starts scraping /api/metrics on your app

  If you DELETE the ServiceMonitor:
    → Operator detects the deletion
    → Removes the scrape target from Prometheus config
    → Triggers reload
    → Prometheus stops scraping

  All of this happens AUTOMATICALLY. No manual config editing.
```



### The Operator Ecosystem

Operators are everywhere in the Kubernetes world. Common examples:

```
Operator                    CRD                What it manages
─────────────────────────────────────────────────────────────
Prometheus Operator         Prometheus         Prometheus instances
                            ServiceMonitor     Scrape configurations
                            PrometheusRule     Alerting rules

Cert Manager                Certificate        TLS certificates
                            (auto-renews before expiry)

Strimzi (Kafka)             Kafka              Kafka clusters
                            KafkaTopic         Topics within clusters
                            KafkaUser          User credentials

CloudnativePG               Cluster            PostgreSQL HA clusters
                            Backup             Scheduled backups

Argo CD                     Application        GitOps deployments

MySQL Operator              MySQLCluster       MySQL replication clusters
```

Each Operator encodes years of operational expertise:

- Cert Manager knows "renew certificates 30 days before expiry"
- CloudnativePG knows "promote a replica if primary fails"
- Strimzi knows "create partitions when scaling a topic"

Without Operators, you'd need humans to do all this manually.

### When Would You Write Your Own Operator?

For a learning project like Task Manager, you **wouldn't**. Built-in resources + Helm are sufficient. But in production systems, you might write an Operator when:

```
✓ You have domain-specific automation that runs continuously
  (not just "deploy these YAMLs once")

✓ You need to react to cluster events in real-time
  ("when a node joins, register it with my service")

✓ You're managing stateful resources with complex lifecycles
  ("create a database, run migrations, set up replication")

✓ You want to expose a simple API to users
  ("users create a `TaskApp` resource → Operator handles everything")

When NOT to write an Operator:

✗ A one-time setup script (use Helm or kubectl)
✗ Simple templating (use Helm)
✗ Batch jobs (use CronJob or Job)
✗ Configuration management (use ConfigMaps)
```



### Operators vs Other K8s Patterns

```
Pattern          Runs when?       Self-heals?    Domain knowledge?
──────────────────────────────────────────────────────────────────
Deployment       Always (loop)    Yes            No (generic)
CronJob          On schedule      No             No
Helm             On command       No             No (just templates)
initContainer    At pod startup   No             No
sidecar          Always           Yes            No
Operator         Always (loop)    Yes            YES (specific app)
```

Operators are the most powerful extension pattern — but also the most complex to build. Most teams use existing Operators (like Prometheus Operator) rather than writing their own.

### Hands-On: Explore the Prometheus Operator

```bash
# 1. See the Operator pod (it's a controller running in the cluster)
kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus-operator

# 2. See the CRDs it registered
kubectl get crd | findstr "monitoring.coreos"

# 3. See your ServiceMonitor (a custom resource instance)
kubectl get servicemonitor -A

# 4. Describe it to see the full spec
kubectl describe servicemonitor task-manager-app -n task-manager

# 5. Check what Prometheus is actually scraping
#    (the Operator generated this configuration)
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
# Open http://localhost:9090 → Status → Configuration
# Look for your task-manager-app in the scrape_configs

# 6. Delete the ServiceMonitor and watch what happens
kubectl delete servicemonitor task-manager-app -n task-manager
# → Check Prometheus config again — the scrape target disappeared!
# → The Operator reacted to the deletion

# 7. Re-create it with Helm (helm upgrade will re-apply the template)
helm upgrade task-manager ./helm-chart --namespace task-manager --reuse-values
# → The Operator detects the new ServiceMonitor → re-adds the scrape target
```



### Key Takeaways

```
1. Operators = CRD + Custom Controller
   CRD defines a new resource type
   Controller manages it with a reconciliation loop

2. Operators encode operational knowledge
   "How to run Prometheus properly" → Prometheus Operator
   "How to manage certificates" → Cert Manager

3. You're already using one
   Prometheus Operator manages your monitoring stack
   Your ServiceMonitor is a custom resource

4. Operators vs Helm
   Helm: templates + one-time install
   Operator: continuous reconciliation + domain expertise
   They're complementary, not alternatives

5. Most teams use existing Operators
   Writing your own requires Go + K8s controller framework
   The ecosystem has Operators for most common software
```

---



## 15. What You've Learned



### Technologies Mastered

- Kubernetes cluster architecture (Control Plane, Nodes, Pods)
- Minikube local cluster setup
- Deployments (replica management, rolling updates, self-healing)
- Services (ClusterIP, Headless, DNS-based discovery)
- Ingress (NGINX, hostname/path routing, WebSocket support)
- ConfigMaps and Secrets (configuration management)
- Liveness and Readiness probes
- Resource management (requests vs limits)
- Workload types (Deployment, StatefulSet, CronJob)
- Kubernetes Operators (CRDs, reconciliation loop, Prometheus Operator)
- kubectl command reference



### Core Concepts

- **Pods are ephemeral** — never connect to Pod IPs directly
- **Services provide stable addresses** — always connect via Service DNS
- **Selectors match labels** — unique `component` labels prevent routing bugs
- **Liveness = restart if dead** — Readiness = route traffic if healthy**
- **Requests = scheduling** — Limits = enforcement**
- **StatefulSets for databases** — Deployments for stateless apps**
- **Ingress for external access** — ClusterIP for internal communication**



### K8s Debugging Checklist

When something doesn't work, check in this order:

1. `kubectl get pods -n task-manager` — Is the Pod running?
2. `kubectl describe pod <name> -n task-manager` — Check Events at bottom
3. `kubectl logs <name> -n task-manager` — Check application logs
4. `kubectl get svc -n task-manager` — Does the Service exist?
5. `kubectl get ingress -n task-manager` — Does the Ingress exist?
6. `kubectl exec <pod> -- env` — Are environment variables set correctly?
7. Is `minikube tunnel` running? — Required for Ingress access

---

