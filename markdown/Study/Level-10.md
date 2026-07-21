# Stage 3 Modules E, F, G — GitOps, HPA & Canary Deployments: Detailed Learning Guide

This document explains every concept, pattern, and implementation detail behind the three deployment-automation modules added in Stage 3. It covers GitOps principles, ArgoCD architecture, the Application CRD, self-healing, the Prometheus Adapter, custom metrics API, HPA scaling behavior, Argo Rollouts, canary strategy, NGINX traffic splitting, AnalysisTemplates, and the critical coexistence rules between ArgoCD, HPA, and Rollouts — all with real code from the codebase.

---

## Table of Contents

### Module F: GitOps with ArgoCD

1. [The Deployment Problem: Why GitOps?](#1-the-deployment-problem-why-gitops)
2. [What Is GitOps? Core Principles](#2-what-is-gitops-core-principles)
3. [ArgoCD Architecture: How It Works](#3-argocd-architecture-how-it-works)
4. [The Application CRD: Declarative Application Definition](#4-the-application-crd-declarative-application-definition)
5. [Adapting the Helm Chart for GitOps](#5-adapting-the-helm-chart-for-gitops)
6. [Installing ArgoCD](#6-installing-argocd)
7. [Deploying the Application CRD](#7-deploying-the-application-crd)
8. [The GitOps Workflow in Practice](#8-the-gitops-workflow-in-practice)
9. [Self-Healing: Drift Detection and Reversion](#9-self-healing-drift-detection-and-reversion)
10. [ignoreDifferences: When ArgoCD Should NOT Self-Heal](#10-ignoredifferences-when-argocd-should-not-self-heal)

### Module E: Horizontal Pod Autoscaler

11. [Why Autoscale? The Limits of Static Replica Counts](#11-why-autoscale-the-limits-of-static-replica-counts)
12. [Types of Kubernetes Autoscaling](#12-types-of-kubernetes-autoscaling)
13. [Custom Metrics: Beyond CPU and Memory](#13-custom-metrics-beyond-cpu-and-memory)
14. [Prometheus Adapter: Bridging Metrics to Kubernetes](#14-prometheus-adapter-bridging-metrics-to-kubernetes)
15. [HPA Resource: How Kubernetes Scales Based on Metrics](#15-hpa-resource-how-kubernetes-scales-based-on-metrics)
16. [The Autoscaling Algorithm: How HPA Decides to Scale](#16-the-autoscaling-algorithm-how-hpa-decides-to-scale)
17. [Load Testing: Verifying Autoscaling Works](#17-load-testing-verifying-autoscaling-works)
18. [Cooldown and Stabilization: Preventing Thrashing](#18-cooldown-and-stabilization-preventing-thrashing)
19. [Production Autoscaling Considerations](#19-production-autoscaling-considerations)

### Module G: Canary Deployments with Argo Rollouts

20. [The Deployment Dilemma: All-at-Once vs. Progressive](#20-the-deployment-dilemma-all-at-once-vs-progressive)
21. [Deployment Strategies Compared](#21-deployment-strategies-compared)
22. [Canary Deployments: Theory and Trade-offs](#22-canary-deployments-theory-and-trade-offs)
23. [Argo Rollouts: The Kubernetes-Native Solution](#23-argo-rollouts-the-kubernetes-native-solution)
24. [The Rollout CRD: Replacing Deployment](#24-the-rollout-crd-replacing-deployment)
25. [Canary Strategy: Traffic Splitting with NGINX](#25-canary-strategy-traffic-splitting-with-nginx)
26. [AnalysisTemplate: Automated Quality Gates](#26-analysistemplate-automated-quality-gates)
27. [Services: Stable vs. Canary](#27-services-stable-vs-canary)
28. [HPA Integration: Scaling a Rollout](#28-hpa-integration-scaling-a-rollout)
29. [Happy Path: Successful Canary Promotion](#29-happy-path-successful-canary-promotion)
30. [Sad Path: Automatic Abort and Rollback](#30-sad-path-automatic-abort-and-rollback)
31. [The Traffic Generator Problem](#31-the-traffic-generator-problem)
32. [Canary Operations: Manual Control](#32-canary-operations-manual-control)

### Reference

33. [Verification: What Was Tested](#33-verification-what-was-tested)
34. [Troubleshooting](#34-troubleshooting)
35. [Key Patterns and Best Practices](#35-key-patterns-and-best-practices)

---

## Module F: GitOps with ArgoCD

## 1. The Deployment Problem: Why GitOps?

### The Old Workflow (Stages 1-2)

Throughout Stages 1 and 2, deploying the application meant running manual commands:

```bash
# Build the Docker image
docker build -t ralf090102/task-manager-app:latest -f Dockerfile .

# Load it into Minikube
minikube image load ralf090102/task-manager-app:latest

# Deploy via Helm
helm upgrade task-manager ./helm-chart --namespace task-manager \
  --reuse-values --no-hooks \
  --set image.tag=latest
```

This approach has several problems:

| Problem | Impact |
|---------|--------|
| **No audit trail** | "Who deployed what, when?" — only Helm secrets store release history, and they're hard to query |
| **No automatic rollback** | If a deployment breaks the app, you must manually `helm rollback` — hoping you remember the last good revision |
| **Drift goes undetected** | Someone runs `kubectl edit deployment` to tweak a CPU limit, and the change persists invisibly until the next `helm upgrade` overwrites it |
| **Tribal knowledge** | "You need to pass `--no-hooks` because the pgbouncer URL hangs" — this knowledge lives in a developer's head, not in version control |
| **Hard to reproduce** | Setting up the same cluster state on a new Minikube instance requires remembering every `--set` flag ever used |

### The GitOps Solution

**GitOps** turns Git into the single source of truth for cluster state. Instead of running commands to deploy, you push code. An automated controller (ArgoCD) detects the change and reconciles the cluster to match:

```
BEFORE (manual deployments):            AFTER (GitOps):

  Developer                               Developer
    │ edit Helm chart                       │ edit Helm chart
    │                                       │
    ▼                                       ▼
  Terminal                                git commit && git push
    │ helm upgrade --set ...                │
    │                                       ▼
    ▼                                     ArgoCD detects change
  Kubernetes cluster                      (polls Git every ~3 min)
    │ pods restart                          │
    │                                       ▼
    ▼                                     ArgoCD runs helm template
  Done?                                   applies rendered YAML
    │                                       │
    ▼                                       ▼
  If broken:                              Kubernetes cluster
  helm rollback (manual)                    │ pods restart
                                            │
                                            ▼
                                          If broken:
                                          git revert && git push
                                          (ArgoCD rolls back automatically)
```

### Why Git Is the Right Source of Truth

Git already has everything we need for managing infrastructure state:

| Git Feature | Infrastructure Use Case |
|-------------|------------------------|
| **Version history** | Every deployment change is a commit — full audit trail |
| **Branching** | Test changes on a branch before merging to production |
| **Pull requests** | Code review for infrastructure changes — someone else approves before deploy |
| **Revert** | One command to roll back: `git revert HEAD && git push` |
| **Blame/annotate** | "Who added this CPU limit and why?" — `git blame values.yaml` |
| **Diff** | See exactly what changed between deployments |

---

## 2. What Is GitOps? Core Principles

GitOps is a set of principles for managing infrastructure using Git. The term was coined by Weaveworks in 2017. Four core principles define GitOps:

### Principle 1: Declarative System Description

The entire desired state of the system is described declaratively — in this case, as a Helm chart in Git:

```yaml
# values.yaml — the desired state
replicaCount: 1
image:
  repository: ralf090102/task-manager-app
  tag: latest

autoscaling:
  enabled: true
  minReplicas: 1
  maxReplicas: 3
```

No imperative commands (`kubectl scale`, `kubectl edit`). The desired state is a file that anyone can read and understand.

### Principle 2: Versioned and Immutable Storage

The declarative description is stored in a version control system (Git) that provides:
- **Immutability**: A commit's content can't change — you can always go back to it
- **History**: Every change has an author, timestamp, and message
- **Branching**: Multiple versions can coexist (dev branch, production branch)

### Principle 3: Automatically Applied

An automated process (ArgoCD) ensures the actual cluster state matches the desired state in Git. No human needs to run `kubectl apply` — the controller handles it.

### Principle 4: Continuously Reconciled

The controller doesn't just apply once — it **continuously checks** that the cluster matches Git. If someone manually changes something (`kubectl edit`), the controller detects the drift and reverts it. This is called **self-healing**.

### Push vs Pull Deployment

| Model | How It Works | Used By |
|-------|-------------|---------|
| **Push** | CI/CD pipeline (Jenkins, GitHub Actions) pushes changes to the cluster | Traditional CI/CD |
| **Pull** | Controller inside the cluster pulls changes from Git | ArgoCD, Flux |

GitOps uses the **pull model**: ArgoCD lives inside the cluster and polls Git. This is more secure because:
1. No external system needs cluster credentials
2. The cluster can be behind a firewall — ArgoCD only makes outbound HTTPS to GitHub
3. Network interruptions don't break deployment — ArgoCD retries on reconnect

---

## 3. ArgoCD Architecture: How It Works

ArgoCD runs inside the Kubernetes cluster as a set of components:

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  argocd namespace                      │   │
│  │                                                       │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │   │
│  │  │ argocd-     │  │ argocd-      │  │ argocd-     │ │   │
│  │  │ server      │  │ repo-server  │  │ application │ │   │
│  │  │             │  │              │  │ controller  │ │   │
│  │  │ (UI + API)  │  │ (Git clone + │  │ (reconcile  │ │   │
│  │  │             │  │  Helm render)│  │  loop)      │ │   │
│  │  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │   │
│  │         │                │                  │        │   │
│  │         └────────────────┼──────────────────┘        │   │
│  │                          │                            │   │
│  │                   ┌──────▼──────┐                     │   │
│  │                   │ argocd-redis│                     │   │
│  │                   │ (cache)     │                     │   │
│  │                   └─────────────┘                     │   │
│  └───────────────────────────────────────────────────────┘   │
│                          │                                    │
│    ┌─────────────────────┼────────────────────────────────┐  │
│    │    task-manager namespace (managed app)               │  │
│    │    Deployments, Services, Ingress, etc.               │  │
│    └───────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS (outbound)
                          ▼
                   ┌──────────────┐
                   │   GitHub      │
                   │   Repo        │
                   │ (helm-chart/) │
                   └──────────────┘
```

### Component Roles

| Component | Role | Analogy |
|-----------|------|---------|
| **argocd-server** | Web UI + REST API + gRPC | The "front desk" — users interact with this |
| **argocd-repo-server** | Clones Git repos, runs `helm template` to render YAML | The "librarian" — fetches and processes the desired state |
| **argocd-application-controller** | Compares desired (Git) vs actual (cluster), applies changes | The "inspector" — detects drift and fixes it |
| **argocd-redis** | Caches application state, speeds up reconciliation | The "short-term memory" |

### The Reconciliation Loop

The application controller runs a continuous loop:

```
Every ~3 minutes (or on webhook notification):

1. Pull desired state:
   → repo-server clones Git repo
   → runs `helm template` to render YAML
   → returns rendered Kubernetes manifests

2. Get actual state:
   → query Kubernetes API for live resources
   → (Deployments, Services, Ingress, etc.)

3. Compare (diff):
   → for each resource in the rendered YAML:
     → does it exist in the cluster?
     → does the spec match?

4. Act:
   → if missing: create it
   → if different: update it (apply)
   → if extra (prune): delete it
```

---

## 4. The Application CRD: Declarative Application Definition

### What Is an Application Resource?

ArgoCD uses a Custom Resource Definition (CRD) called `Application` to define what to deploy and where. The Application lives in the `argocd` namespace (not the app namespace):

```yaml
# task-manager/argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: task-manager
  namespace: argocd                    # Application resource lives in argocd namespace
  finalizers:
    - resources-finalizer.argocd.argoproj.io  # Clean up resources when Application is deleted
spec:
  project: default                      # ArgoCD project (default = no restrictions)
  source:
    repoURL: https://github.com/Ralf090102/Task-Manager-Web-Application
    targetRevision: main                # Track the main branch
    path: task-manager/helm-chart       # Path to the Helm chart within the repo
  destination:
    server: https://kubernetes.default.svc  # The in-cluster API server
    namespace: task-manager             # Where to deploy resources
  syncPolicy:
    automated:                          # Auto-sync without manual approval
      prune: true                       # Delete resources removed from Git
      selfHeal: true                    # Revert manual kubectl changes
    syncOptions:
      - CreateNamespace=true            # Create namespace if it doesn't exist
      - ApplyOutOfSyncOnly=true         # Only apply resources that differ (faster)
  ignoreDifferences:                    # Fields to ignore during diff (see Section 10)
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
```

### Field Breakdown

#### `source` — Where to Get the Desired State

```yaml
source:
  repoURL: https://github.com/Ralf090102/Task-Manager-Web-Application
  targetRevision: main
  path: task-manager/helm-chart
```

- **repoURL**: The Git repository URL. ArgoCD clones this repo to read the manifests
- **targetRevision**: Which branch/tag/commit to track. `main` means "always use the latest main"
- **path**: The directory within the repo containing the Helm chart

When ArgoCD needs to sync, it:
1. Clones the repo at the `main` branch
2. Navigates to `task-manager/helm-chart/`
3. Runs `helm template .` to render the Kubernetes manifests
4. Uses the rendered YAML as the desired state

#### `destination` — Where to Deploy

```yaml
destination:
  server: https://kubernetes.default.svc
  namespace: task-manager
```

- **server**: The target Kubernetes API server. `https://kubernetes.default.svc` means "this cluster"
- **namespace**: The namespace where resources will be created

#### `syncPolicy.automated` — Auto-Sync Configuration

| Setting | What It Does | Without It |
|---------|-------------|------------|
| `automated` | Sync automatically when Git changes | Manual sync required (click button in UI) |
| `prune: true` | Delete resources that were removed from Git | Orphaned resources persist forever |
| `selfHeal: true` | Revert manual `kubectl edit` changes | Manual changes persist (dangerous drift) |

#### `finalizers` — Clean Deletion

```yaml
finalizers:
  - resources-finalizer.argocd.argoproj.io
```

Without this finalizer, deleting the Application resource leaves all managed resources in the cluster. With it, deleting the Application triggers a cascade deletion of everything ArgoCD created.

---

## 5. Adapting the Helm Chart for GitOps

### The Problem: Secrets in Git

ArgoCD renders the Helm chart from Git. If the chart contains Kubernetes Secrets with real passwords, those passwords would be in the Git repo — a critical security breach.

Before GitOps, the Helm chart created Secrets from `values.yaml`:

```yaml
# BEFORE — values.yaml had real secrets (passed via --set)
secrets:
  databaseUrl: "postgresql://postgres:password@host:5432/db"
  nextauthSecret: "my-secret-key"
```

In a GitOps world, `values.yaml` is committed to Git. We can't put real secrets there.

### The Solution: Conditional Secrets

Three changes adapt the chart for GitOps:

**1. `values.yaml`: Disable Secrets by default**

```yaml
secrets:
  enabled: false    # Set to true for manual helm deploys with --set; false for ArgoCD
```

**2. `templates/secret.yaml`: Wrap in conditional**

```yaml
{{- if .Values.secrets.enabled }}
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "task-manager.fullname" . }}-secrets
type: Opaque
stringData:
  database-url: {{ .Values.secrets.databaseUrl | quote }}
  nextauth-secret: {{ .Values.secrets.nextauthSecret | quote }}
{{- end }}
```

When `secrets.enabled: false`, ArgoCD doesn't render the Secret. The app pods reference a Secret that must exist — but ArgoCD doesn't create it.

**3. `templates/team-service/db-migration-job.yaml`: Gate on secrets.enabled**

```yaml
{{- if and .Values.teamService.enabled .Values.secrets.enabled }}
# ... Helm hook for database migration ...
{{- end }}
```

Helm hooks conflict with ArgoCD sync (ArgoCD doesn't execute Helm hooks — they're a Helm-specific concept). Gating on `secrets.enabled` ensures the hook only renders during manual `helm upgrade` deployments, not ArgoCD syncs.

### Two Deployment Modes

| Mode | `secrets.enabled` | Who Creates Secrets | Who Deploys |
|------|-------------------|---------------------|-------------|
| **Manual (Helm)** | `true` | Helm chart (from `--set` values) | `helm upgrade` |
| **GitOps (ArgoCD)** | `false` | Pre-created manually with `kubectl` | ArgoCD (git push) |

This project uses **GitOps mode** — ArgoCD manages everything except Secrets, which are pre-created.

### Managing Secrets in a GitOps World

Since ArgoCD doesn't create Secrets, we must pre-create them manually. The Secret needs to exist before the Application CRD is applied (otherwise the pods will fail to start because they reference non-existent Secret keys):

```bash
# Pre-create the Secret with real values (one-time setup)
kubectl create secret generic task-manager-secrets \
  --namespace=task-manager \
  --from-literal=database-url='postgresql://postgres.<project-ref>:<password>@<host>.supabase.com:6543/postgres?pgbouncer=true' \
  --from-literal=nextauth-secret='<your-nextauth-secret>' \
  --from-literal=nextauth-url='http://task-manager.local' \
  --from-literal=auth-trust-host='true'
```

**Why not just put this in Git?** The database URL contains the Supabase password. If committed to Git (even in a Secret manifest), it would be visible in plain text in the Git history. Even encrypted solutions (Sealed Secrets, SOPS) require an initial setup — for this project, manual pre-creation is the pragmatic choice.

| Secret Management Strategy | Security | Complexity | When to Use |
|---------------------------|----------|------------|-------------|
| **Manual kubectl** (this project) | Medium (only in cluster memory) | Low | Dev/learning environments |
| **Sealed Secrets** | High (encrypted in Git) | Medium | Production with audit needs |
| **External Secrets Operator** | High (pulls from Vault/AWS SM) | High | Enterprise with existing secret vault |

---

## 6. Installing ArgoCD

### Prerequisites

Before installing ArgoCD, the repo must be **public** on GitHub. ArgoCD needs to clone the repo to read manifests — for private repos, you'd need to configure a deploy key or repository credential. Making the repo public is the simplest path for this learning project.

### Installation Steps

**Step 1: Create the namespace and install ArgoCD**

```bash
kubectl create namespace argocd

kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

This installs the four core ArgoCD components (server, repo-server, application-controller, redis) plus their Services, ConfigMaps, and RBAC rules.

**Step 2: Wait for all pods to be ready**

```bash
kubectl wait --for=condition=Ready pod --all -n argocd --timeout=300s
```

**Step 3: Get the initial admin password**

ArgoCD generates a random admin password on first install and stores it in a Secret:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
# Output: okMP9mB6h0nghU7R (your password will differ)
```

**Step 4: Access the UI**

```bash
kubectl port-forward -n argocd svc/argocd-server 8080:443
```

Open `https://localhost:8080` and log in with `admin` and the password from Step 3. (Accept the self-signed certificate warning — ArgoCD uses an internal cert by default.)

### What's Running?

```bash
kubectl get pods -n argocd
```

| Pod | Role |
|-----|------|
| `argocd-application-controller-0` | The reconciliation loop (StatefulSet — there's usually one replica) |
| `argocd-server-xxx` | UI + API server |
| `argocd-repo-server-xxx` | Git fetch + Helm rendering |
| `argocd-redis-xxx` | Cache |
| `argocd-dex-server-xxx` | SSO integration (optional, not used in this project) |
| `argocd-applicationset-controller-xxx` | ApplicationSet controller (optional, not used here) |

---

## 7. Deploying the Application CRD

With ArgoCD installed and Secrets pre-created, deploying the application is a one-command operation:

```bash
kubectl apply -f task-manager/argocd/application.yaml
```

### What Happens Next?

ArgoCD's application controller detects the new Application resource and immediately starts reconciliation:

```
1. Application controller sees new Application "task-manager"
     ↓
2. Asks repo-server to fetch the source
     ↓
3. repo-server clones https://github.com/Ralf090102/Task-Manager-Web-Application
   at branch main, path task-manager/helm-chart/
     ↓
4. repo-server runs `helm template . --values values.yaml`
   → renders ~35 Kubernetes manifests (Deployments, Services, Ingress, etc.)
     ↓
5. Application controller compares rendered manifests with live cluster state
   → detects all 35 resources are missing (cluster is empty)
     ↓
6. Application controller applies all manifests to task-manager namespace
     ↓
7. Initial sync complete — status: Synced
```

### Checking Status

```bash
# High-level status
kubectl get application task-manager -n argocd
# Expected output:
# NAME            CLUSTER                         NAMESPACE      STATUS   HEALTH   SYNCPOLICY
# task-manager    https://kubernetes.default.svc  task-manager   Synced   Healthy  Automated

# Detailed status (all managed resources)
kubectl describe application task-manager -n argocd | findstr /C:"Status Conditions" /C:"Operation"
```

### The Two Status Fields

| Field | Meaning |
|-------|---------|
| **Sync Status** (`Synced` / `OutOfSync`) | Does the cluster match Git? `Synced` = yes, `OutOfSync` = drift detected |
| **Health Status** (`Healthy` / `Progressing` / `Degraded`) | Are the resources working? `Healthy` = all pods ready, `Degraded` = something failed |

A common scenario: **Synced but Degraded** — manifests were applied successfully, but a pod is CrashLooping (e.g., wrong env var). The sync is correct, but the app is unhealthy.

### Forcing an Immediate Refresh

ArgoCD polls Git every ~3 minutes by default. To force an immediate refresh (e.g., after pushing a commit):

```bash
kubectl patch application task-manager -n argocd \
  --type merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'
```

This annotation tells ArgoCD to re-clone Git and re-render immediately.

---

## 8. The GitOps Workflow in Practice

### Making a Change

The GitOps workflow replaces `helm upgrade` with `git commit && git push`:

```
BEFORE (manual Helm):
  Edit values.yaml
  → helm upgrade task-manager ./helm-chart --reuse-values

AFTER (GitOps):
  Edit values.yaml
  → git add helm-chart/values.yaml
  → git commit -m "bump replicas to 2"
  → git push origin main
  → wait ~3 minutes for ArgoCD to detect the change
  → verify: kubectl get pods -n task-manager
```

### Example: Change the Resource Limits

Let's say we want to increase the CPU limit for the main app from 500m to 1000m:

```bash
# 1. Edit values.yaml
# Change: resources.limits.cpu: 500m  →  1000m

# 2. Commit and push
git add task-manager/helm-chart/values.yaml
git commit -m "chore: increase app CPU limit to 1000m"
git push origin main

# 3. Wait for ArgoCD to detect the change (~3 minutes)
#    Or force immediate refresh:
kubectl patch application task-manager -n argocd \
  --type merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'

# 4. Watch the rollout
kubectl get pods -n task-manager --watch
# Pods terminate and restart with new resource limits

# 5. Verify the new limits
kubectl get deployment task-manager -n task-manager \
  -o jsonpath='{.spec.template.spec.containers[0].resources.limits}'
# Output: {"cpu":"1000m","memory":"512Mi"}
```

### The Full Audit Trail

Because every change goes through Git, you have a complete history:

```bash
# See all changes to the Helm chart
git log --oneline -- task-manager/helm-chart/

# See who changed what and when
git log -p --follow task-manager/helm-chart/values.yaml

# Compare two versions of the chart
git diff <old-commit> <new-commit> -- task-manager/helm-chart/
```

---

## 9. Self-Healing: The Magic of Continuous Reconciliation

### What Is Self-Healing?

Self-healing means ArgoCD **reverts manual changes** to keep the cluster matching Git. Without it, someone could `kubectl edit` a resource and the change would persist silently until the next `helm upgrade`. With `selfHeal: true`, ArgoCD detects the drift and reverts within seconds.

### The Self-Healing Demo

Let's deliberately break the cluster state and watch ArgoCD fix it:

```bash
# 1. Check current replica count (from Git: replicaCount: 1)
kubectl get deployment task-manager -n task-manager
# NAME            READY   UP-TO-DATE   AVAILABLE
# task-manager    1/1     1            1

# 2. Manually scale to 3 replicas (this is NOT in Git)
kubectl scale deployment task-manager --replicas=3 -n task-manager

# 3. Verify the change took effect
kubectl get deployment task-manager -n task-manager
# NAME            READY   UP-TO-DATE   AVAILABLE
# task-manager    3/3     3            3

# 4. Wait ~30-60 seconds for ArgoCD to detect drift and self-heal
sleep 35

# 5. Check again — ArgoCD reverted to 1 replica
kubectl get deployment task-manager -n task-manager
# NAME            READY   UP-TO-DATE   AVAILABLE
# task-manager    1/1     1            1
```

### What Happened?

```
T+0s   : kubectl scale --replicas=3
        → Kubernetes API updates Deployment spec
T+0s   : Cluster state: 3 replicas
        → Desired state (Git): 1 replica
        → DRIFT DETECTED
T+0s   : ArgoCD application controller notices the diff
T+1s   : ArgoCD applies the Git version (1 replica)
        → Deployment spec updated back to 1
T+5s   : Kubernetes terminates 2 extra pods
T+30s  : Cluster state: 1 replica — matches Git
```

### Why `selfHeal` Matters in Production

| Without selfHeal | With selfHeal |
|------------------|---------------|
| Someone tweaks a CPU limit to "fix" a crash → the tweak persists → next deploy breaks | Tweak is reverted → forces proper fix via Git |
| `kubectl edit` to change an image tag → drift → hard to debug | Drift auto-fixed → Git stays source of truth |
| Security: someone opens a port → stays open | Port auto-closed → Git enforces security posture |

### When NOT to Use selfHeal

There are legitimate cases for manual intervention (e.g., emergency scaling during an incident). For those, use ArgoCD's `DisableAutoSync` annotation temporarily, or use `ignoreDifferences` to exclude specific fields.

---

## 10. `ignoreDifferences`: Fields ArgoCD Shouldn't Manage

### The Problem: HPA Owns Replicas

The Horizontal Pod Autoscaler (HPA) dynamically adjusts `spec.replicas` on the Deployment based on CPU/custom metrics. But Git says `replicas: 1` (or omits the field entirely when `autoscaling.enabled: true`). Without intervention, ArgoCD would constantly fight the HPA:

```
Every reconciliation cycle:
  HPA scales Deployment to 3 replicas (high load)
  → ArgoCD detects: Git says 1, cluster says 3 → OUT OF SYNC
  → ArgoCD reverts to 1 replica
  → HPA scales back to 3
  → ArgoCD reverts to 1
  → ... infinite loop, HPA never effective
```

### The Solution: Tell ArgoCD to Ignore That Field

```yaml
# In application.yaml
syncPolicy:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas    # HPA manages this, not Git
```

With this, ArgoCD skips `/spec/replicas` when diffing. The HPA can change replicas freely — ArgoCD won't interfere.

### The Expanded ignoreDifferences (with Canary + HPA)

Once we add Argo Rollouts (Module G), the `ignoreDifferences` list grows:

```yaml
ignoreDifferences:
  # HPA manages replicas on both Deployment and Rollout
  - group: apps
    kind: Deployment
    jsonPointers:
      - /spec/replicas
  - group: argoproj.io
    kind: Rollout
    jsonPointers:
      - /spec/replicas

  # Argo Rollouts modifies Service selectors dynamically
  # (adds pod-template-hash for canary routing)
  - group: ""
    kind: Service
    name: task-manager
    jsonPointers:
      - /spec/selector
  - group: ""
    kind: Service
    name: task-manager-canary
    jsonPointers:
      - /spec/selector
```

### Why Each ignoreDifferences Entry Exists

| Resource | Field Ignored | Why |
|----------|---------------|-----|
| `Deployment` | `/spec/replicas` | HPA dynamically scales replicas — Git shouldn't fight it |
| `Rollout` | `/spec/replicas` | Same as above, but for Rollout resources (canary mode) |
| `Service` (task-manager) | `/spec/selector` | Argo Rollouts injects `pod-template-hash` label for canary routing |
| `Service` (task-manager-canary) | `/spec/selector` | Same — Rollouts controls the canary Service selector |

### How `jsonPointers` Work

The `jsonPointers` use RFC 6901 JSON Pointer syntax to point at specific fields within a resource:

```
Deployment YAML structure:
  spec:           ← /spec
    replicas: 1   ← /spec/replicas  (this is what we ignore)
    template:
      spec:
        containers: ...
```

If you needed to ignore multiple fields on the same resource:

```yaml
ignoreDifferences:
  - group: apps
    kind: Deployment
    jsonPointers:
      - /spec/replicas
      - /metadata/annotations/last-applied-configuration
```

---

## Module E: Horizontal Pod Autoscaler

## 11. Why Autoscale? The Limits of Static Replica Counts

### The Fixed-Replica Problem

Throughout Stages 1-2, the Deployment had a fixed replica count:

```yaml
# values.yaml
replicaCount: 1
```

This is fine for development, but has serious limitations in production:

| Scenario | Fixed 1 Replica | Fixed 3 Replicas |
|----------|----------------|------------------|
| **Normal traffic** | Works fine | 3x the cost (wasted resources) |
| **Traffic spike (viral post)** | Pod overloaded → 502 errors | Might still handle it |
| **Overnight (no traffic)** | Wastes 1 pod of resources | Wastes 3 pods of resources |
| **Pod crashes** | Complete outage until restart | Other 2 pods absorb traffic |

A fixed replica count can't adapt to changing load. You need **dynamic scaling** — adding pods when traffic increases, removing them when it decreases.

### The Cost Perspective

Consider a simple cost model (rough AWS pricing for a small pod):

| Replicas | Monthly Cost (approx) |
|----------|----------------------|
| 1 pod (always) | $10 |
| 3 pods (always) | $30 |
| 1-3 pods (autoscaled) | $10-$30 (scales with demand) |

Autoscaling means you pay for capacity when you need it, not all the time. For a task manager app with daytime traffic, this could save 60% compared to running 3 replicas constantly.

### What Autoscaling Looks Like

```
Traffic Load vs. Pod Count over 24 hours:

  Pods
   5 │                              ╱╲
   4 │                          ╱──╯  ╲──╲
   3 │                      ╱──╯         ╲──╲
   2 │              ╱╲  ╱──╯                ╲──╲
   1 │──────────────╯──╯                       ╲────────
   0 └──────────────────────────────────────────────────
    00   04   08   12   16   20   24  (hour)

    Low overnight → 1 pod (minimum)
    Morning ramp → scales up as users log in
    Peak afternoon → 4-5 pods (maximum)
    Evening wind-down → scales back to 1
```

---

## 12. Types of Kubernetes Autoscaling

Kubernetes has three types of autoscaling, operating at different layers:

```
┌────────────────────────────────────────────────────────────────┐
│                    Cluster (Nodes)                              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Cluster Autoscaler (CA)                                │    │
│  │  Adds/removes entire nodes (VMs)                        │    │
│  │  Trigger: pending pods (not enough node capacity)        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │   Pod 1          │  │   Pod 2          │  │   Pod 3      │ │
│  │  ┌────────────┐  │  │  ┌────────────┐  │  │ ┌──────────┐ │ │
│  │  │ HPA        │  │  │  │ HPA        │  │  │ │ HPA      │ │ │
│  │  │ (scales    │  │  │  │ (scales    │  │  │ │ (scales  │ │ │
│  │  │  replicas) │  │  │  │  replicas) │  │  │ │ replicas)│ │ │
│  │  └────────────┘  │  │  └────────────┘  │  │ └──────────┘ │ │
│  │  ┌────────────┐  │  │  ┌────────────┐  │  │ ┌──────────┐ │ │
│  │  │ VPA        │  │  │  │ VPA        │  │  │ │ VPA      │ │ │
│  │  │ (scales    │  │  │  │ (scales    │  │  │ │ (scales  │ │ │
│  │  │  CPU/mem)  │  │  │  │  CPU/mem)  │  │  │ │ CPU/mem) │ │ │
│  │  └────────────┘  │  │  └────────────┘  │  │ └──────────┘ │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

| Autoscaler | Layer | What It Scales | Trigger | This Project |
|------------|-------|----------------|---------|--------------|
| **HPA** (Horizontal Pod Autoscaler) | Pod | Number of pod replicas | CPU, memory, or custom metrics | **YES** |
| **VPA** (Vertical Pod Autoscaler) | Pod | CPU/memory requests per pod | Historical usage | No |
| **CA** (Cluster Autoscaler) | Node | Number of nodes in cluster | Pending pods | No (Minikube has 1 node) |

### Why HPA, Not VPA?

- **HPA** (horizontal scaling) is the most common approach — more pods = more parallel capacity
- **VPA** (vertical scaling) gives each pod more CPU/memory — useful for memory-hungry apps (databases, ML inference)
- They generally **can't be used together** for the same metrics (VPA adjusts requests, HPA reads requests — they'd fight each other)

For a web app like Task Manager, horizontal scaling (more pods) is the right choice — HTTP requests are independent and parallelize naturally.

---

## 13. Custom Metrics: Beyond CPU and Memory

### The Default Metrics Problem

HPA can scale based on CPU and memory out of the box (if `metrics-server` is installed). But for a web app, CPU isn't always the best signal:

| Metric | Pros | Cons |
|--------|------|------|
| **CPU usage** | Easy to measure | High CPU doesn't always mean overloaded (compiling, GC) |
| **Memory usage** | Easy to measure | Memory doesn't drop when traffic drops (JVM, V8 GC) |
| **Request rate** (req/s) | Directly measures load | Requires custom metrics pipeline |
| **Latency** (p99) | Directly measures user impact | Requires custom metrics pipeline |

For Task Manager, the best signal is **requests per second** — if traffic doubles, we want to double pods. CPU might be at 30% during a traffic spike (waiting on database I/O), so CPU-based scaling would be too slow.

### The Custom Metrics API

Kubernetes has a Custom Metrics API that lets HPA scale based on arbitrary metrics. The flow:

```
1. App exposes metrics at /api/metrics (Prometheus format)
2. Prometheus scrapes and stores the metrics
3. Prometheus Adapter translates Prometheus queries → Kubernetes Custom Metrics API
4. HPA queries the Custom Metrics API for the metric value
5. HPA decides to scale based on the value
```

```
┌──────────┐  scrape   ┌──────────────┐  query   ┌──────────────────────┐
│  App     │ ────────► │ Prometheus   │ ◄────── │ Prometheus Adapter   │
│ /metrics │           │ (stores data)│          │ (Kubernetes API      │
└──────────┘           └──────────────┘          │  server)             │
                                                 └──────────┬───────────┘
                                                            │ serves
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │ Custom Metrics API   │
                                                 │ /apis/custom.metrics │
                                                 │ .k8s.io/v1beta1      │
                                                 └──────────┬───────────┘
                                                            │ queries
                                                            ▼
                                                 ┌──────────────────────┐
                                                 │       HPA            │
                                                 │ (scaling decisions)  │
                                                 └──────────────────────┘
```

### The Two Custom Metrics We Use

This project configures Prometheus Adapter with two custom metrics:

1. **`requests_per_second`** — HTTP request rate per pod
   - Source: `rate(http_request_duration_seconds_count[2m])` (prom-client histogram)
   - This is the metric HPA uses for scaling decisions

2. **`task_operations`** — Task API operations per pod
   - Source: `rate(task_operations_total[2m])` (custom prom-client counter)
   - Available for manual inspection/debugging, not used by HPA

---

## 14. Prometheus Adapter: Bridging Metrics to Kubernetes

### What Prometheus Adapter Does

Prometheus Adapter is a bridge between Prometheus (metrics storage) and Kubernetes (HPA consumer). Without it, HPA can only see CPU/memory metrics. With it, HPA can query any Prometheus metric.

### Installing Prometheus Adapter

```bash
# Add the Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install with our custom rules
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  --namespace monitoring \
  --values task-manager/scripts/prometheus-adapter-values.yaml
```

### The Configuration File

`task-manager/scripts/prometheus-adapter-values.yaml` defines how Prometheus queries map to Kubernetes metrics:

```yaml
prometheus:
  url: http://monitoring-kube-prometheus-prometheus.monitoring.svc
  port: 9090

rules:
  # Enable CPU/memory resource metrics from Prometheus
  # (replaces metrics-server, which is disabled in Minikube)
  default: true

  custom:
    # Map Prometheus query → Kubernetes custom metric "requests_per_second"
    - seriesQuery: 'http_request_duration_seconds_count{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace: {resource: "namespace"}
          pod: {resource: "pod"}
      name:
        matches: ""                       # Empty: use the "as" name directly
        as: "requests_per_second"
      metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'

    # Map task_operations_total → "task_operations"
    - seriesQuery: 'task_operations_total{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace: {resource: "namespace"}
          pod: {resource: "pod"}
      name:
        matches: ""
        as: "task_operations"
      metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'
```

### Breaking Down a Rule

```yaml
- seriesQuery: 'http_request_duration_seconds_count{namespace!="",pod!=""}'
```
This tells the adapter: "Find Prometheus time series that match this pattern." The adapter uses this to discover which metrics exist.

```yaml
  resources:
    overrides:
      namespace: {resource: "namespace"}
      pod: {resource: "pod"}
```
This maps Prometheus labels to Kubernetes resources. A series with `pod=task-manager-abc` and `namespace=task-manager` becomes a metric for Kubernetes pod `task-manager-abc` in namespace `task-manager`.

```yaml
  name:
    matches: "^(.*)_count"
    as: "requests_per_second"
```
This renames the metric. The Prometheus series `http_request_duration_seconds_count` is exposed to Kubernetes as `requests_per_second`.

```yaml
  metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'
```
The actual PromQL query template. When HPA asks for `requests_per_second` on pod `task-manager-abc`, the adapter expands:
- `<<.Series>>` → `http_request_duration_seconds_count`
- `<<.LabelMatchers>>` → `namespace="task-manager",pod="task-manager-abc"`
- `<<.GroupBy>>` → `pod`

Resulting in: `sum(rate(http_request_duration_seconds_count{namespace="task-manager",pod="task-manager-abc"}[2m])) by (pod)`

### Verifying the Custom Metrics API

After installation, you can query the Custom Metrics API directly:

```bash
# List all available custom metrics
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1 | jq '.resources[].name'
# Expected:
# "pods/requests_per_second"
# "pods/task_operations"
# "nodes/cpu"  (default resource metrics)

# Query the metric for task-manager pods
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1/namespaces/task-manager/pods/*/requests_per_second"
# Expected:
# {
#   "kind": "MetricValueList",
#   "items": [
#     {
#       "describedObject": { "kind": "Pod", "name": "task-manager-abc", ... },
#       "metricName": "requests_per_second",
#       "timestamp": "...",
#       "value": "500m"   # 0.5 requests per second
#     }
#   ]
# }
```

The `value: "500m"` uses Kubernetes quantity notation — `500m` means 0.5 (milli notation, like CPU millicores).

---

## 15. HPA Resource: How Kubernetes Scales Based on Metrics

### The HPA Manifest

`task-manager/helm-chart/templates/hpa.yaml`:

```yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "task-manager.fullname" . }}
  namespace: {{ .Release.Namespace }}
spec:
  scaleTargetRef:
    {{- if .Values.canary.enabled }}
    apiVersion: argoproj.io/v1alpha1
    kind: Rollout
    {{- else }}
    apiVersion: apps/v1
    kind: Deployment
    {{- end }}
    name: {{ include "task-manager.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    - type: Pods
      pods:
        metric:
          name: requests_per_second
        target:
          type: AverageValue
          averageValue: "{{ .Values.autoscaling.targetRequestsPerSecond }}"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 30
{{- end }}
```

### Field Breakdown

#### `scaleTargetRef` — What to Scale

```yaml
scaleTargetRef:
  apiVersion: apps/v1        # or argoproj.io/v1alpha1 for Rollout
  kind: Deployment           # or Rollout
  name: task-manager
```

HPA modifies the `replicas` field on this target. With canary enabled, we scale the Rollout instead of the Deployment.

#### `minReplicas` / `maxReplicas` — The Bounds

```yaml
minReplicas: 1    # Never go below 1 (avoid complete scale-to-zero)
maxReplicas: 3    # Never go above 3 (cost ceiling)
```

- **minReplicas: 1**: We don't scale to zero because cold starts would add latency. For true scale-to-zero, you'd need Knative or KEDA.
- **maxReplicas: 3**: Cost ceiling. For Minikube (limited resources), 3 is enough to demonstrate scaling.

#### `metrics` — The Scaling Signal

```yaml
metrics:
  - type: Pods
    pods:
      metric:
        name: requests_per_second
      target:
        type: AverageValue
        averageValue: "10"    # target: 10 requests/sec per pod
```

- **type: Pods**: Each pod reports its own metric value (as opposed to `Resource` for CPU/memory, or `External` for queue depth)
- **metric.name**: The custom metric from Prometheus Adapter
- **target.type: AverageValue**: HPA computes the average metric value across all pods
- **target.averageValue: 10**: Target 10 requests per second per pod

**How this works**: If each pod receives 15 req/s and the target is 10 req/s, HPA scales up. The algorithm (see Section 16) calculates: `current/target = 15/10 = 1.5`, so it wants 50% more pods.

#### `behavior` — How Fast to Scale

```yaml
behavior:
  scaleUp:
    stabilizationWindowSeconds: 0    # Scale up immediately
    policies:
      - type: Percent
        value: 100                   # Can double replicas per 15s
        periodSeconds: 15
  scaleDown:
    stabilizationWindowSeconds: 60   # Wait 60s before scaling down
    policies:
      - type: Percent
        value: 50                    # Can remove max 50% of replicas per 30s
        periodSeconds: 30
```

We scale up aggressively (double per 15s) because users care about latency under load. We scale down conservatively (wait 60s, max 50% reduction per 30s) to avoid flapping if traffic momentarily dips.

### The Deployment Change for HPA

When `autoscaling.enabled: true`, the Deployment template omits `replicas`:

```yaml
{{- if and (not .Values.autoscaling.enabled) (not .Values.canary.enabled) }}
  replicas: {{ .Values.replicaCount }}
{{- end }}
```

This is critical: if the Deployment has `replicas: 1` hardcoded, HPA's changes get overwritten on the next ArgoCD sync (or ArgoCD constantly shows OutOfSync). By omitting `replicas`, HPA owns it exclusively.

---

## 16. The Autoscaling Algorithm: How HPA Decides to Scale

### The Core Formula

HPA uses a straightforward ratio to decide desired replicas:

```
desiredReplicas = ceil(currentReplicas * (currentMetricValue / targetMetricValue))
```

### Worked Examples

Assume: `target = 10 req/s per pod`, `minReplicas = 1`, `maxReplicas = 3`

| Current Pods | Current req/s per pod | Calculation | Desired Pods | Action |
|--------------|----------------------|-------------|--------------|--------|
| 1 | 5 | `ceil(1 * 5/10) = ceil(0.5) = 1` | 1 | No change |
| 1 | 10 | `ceil(1 * 10/10) = ceil(1) = 1` | 1 | No change |
| 1 | 15 | `ceil(1 * 15/10) = ceil(1.5) = 2` | 2 | Scale up |
| 2 | 20 | `ceil(2 * 20/10) = ceil(4) = 4` | 4 | Scale up (capped at 3) |
| 3 | 25 | `ceil(3 * 25/10) = ceil(7.5) = 8` | 8 | Scale up (capped at 3) |
| 3 | 3 | `ceil(3 * 3/10) = ceil(0.9) = 1` | 1 | Scale down |

### The Tolerance Window

HPA doesn't act on every tiny change — there's a tolerance (default 10%) to prevent flapping:

```
If |currentMetric - targetMetric| / targetMetric < tolerance (0.1):
    → No action (within tolerance)
```

So with target 10 req/s and tolerance 10%, HPA only acts if the metric is below 9 or above 11.

### The Reconciliation Loop

HPA checks metrics every 15 seconds (configurable via `--horizontal-pod-autoscaler-sync-period`, default 15s on kube-controller-manager):

```
Every 15 seconds:
  1. Query Custom Metrics API for requests_per_second on each pod
  2. Compute average across all pods
  3. Apply the formula: desiredReplicas = ceil(current * avg/target)
  4. Clamp to [minReplicas, maxReplicas]
  5. Check tolerance — skip if within 10% of target
  6. Check stabilization window (see Section 18)
  7. If still need to change → update Deployment.spec.replicas
```

### Watching HPA Decisions

```bash
kubectl get hpa -n task-manager --watch
# Output:
# NAME            REFERENCE                  TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
# task-manager    Deployment/task-manager    15/10     1         3         1          5m
#                                                                ↑          ↑
#                                                                max        current
#                                                                            
# TARGETS column: "current/target" → 15/10 means current is 15, target is 10
# When current > target → scale up
```

The `TARGETS` column shows `<current>/<target>`. When current exceeds target, HPA scales up.

### Detailed Scaling Events

```bash
kubectl describe hpa -n task-manager
# Look at the Events section:
# Events:
#   Type    Reason             Age   From                       Message
#   ----    ------             ----  ----                       -------
#   Normal  SuccessfulRescale  5m    horizontal-pod-autoscaler  New size: 2; reason: pods metric requests_per_second above target
#   Normal  SuccessfulRescale  4m    horizontal-pod-autoscaler  New size: 3; reason: pods metric requests_per_second above target
#   Normal  SuccessfulRescale  1m    horizontal-pod-autoscaler  New size: 1; reason: All metrics below target
```

---

## 17. Load Testing: Verifying Autoscaling Works

### The Challenge of Generating Load

To test autoscaling, we need real HTTP traffic. The app requires authentication (NextAuth), so simply hitting `/api/tasks` returns 401. For load testing:

1. **From inside the cluster** — host DNS resolution to ClusterIP services is complex on Windows/Minikube
2. **Use the FQDN** — `http://task-manager.task-manager.svc.cluster.local:3000/api/tasks` (the short name `task-manager` resolves in the `default` namespace, which fails silently)

### Generating Traffic with autocannon

We run `autocannon` (HTTP load tester) from a temporary pod inside the cluster:

```bash
# Start a temporary pod with Node.js
kubectl run loadtest --rm -it --image=node:22-slim -- bash

# Inside the pod:
npx -y autocannon -c 100 -d 120 \
  http://task-manager.task-manager.svc.cluster.local:3000/api/tasks

# -c 100: 100 concurrent connections
# -d 120: duration 120 seconds
```

### What Happens During the Load Test

In another terminal, watch HPA scale:

```bash
kubectl get hpa -n task-manager --watch
```

Typical progression with 100 concurrent connections:

```
T+0s   : 1 pod, ~5 req/s per pod
        TARGETS: 5/10 → below target, no action

T+10s  : 1 pod, ~80 req/s per pod
        TARGETS: 80/10 → 8x target
        desiredReplicas = ceil(1 * 80/10) = 8 → capped at 3
        → HPA scales to 3 pods

T+20s  : 3 pods starting up (takes ~15s for Next.js to boot)
        TARGETS: 80/10 (still high — new pods aren't ready yet)

T+30s  : 3 pods ready, traffic distributed
        Each pod: ~27 req/s
        TARGETS: 27/10 → still above target but can't scale more (max 3)

T+120s : Load test ends
        TARGETS: 0/10 → below target
        Stabilization window: wait 60s

T+180s : After 60s of low traffic, HPA scales down
        → 3 pods → 1 pod
```

### The Scaling Curve

```
Pods
 3 │                          ╭───────╮
   │                         ╱         ╲
 2 │                   ╭────╯           ╲
   │                  ╱                   ╲
 1 │─────────╭──────╯                     ╲────────
   └─────────┴─────────────────────────────┴──────
    0s       10s     30s     120s   180s  200s

    ↑ Load starts      ↑ 3 pods ready    ↑ Load ends  ↑ Scale down
```

### Verifying via kubectl

```bash
# Check HPA status
kubectl get hpa -n task-manager
# NAME            REFERENCE                  TARGETS   MINPODS   MAXPODS   REPLICAS
# task-manager    Deployment/task-manager    80/10     1         3         3

# Check the pods
kubectl get pods -n task-manager
# NAME                             READY   STATUS    AGE
# task-manager-abc                 1/1     Running   5m
# task-manager-def                 1/1     Running   15s    ← new pod
# task-manager-ghi                 1/1     Running   15s    ← new pod
```

---

## 18. Cooldown and Stabilization: Preventing Thrashing

### The Thrashing Problem

Without stabilization, HPA would constantly oscillate:

```
Without stabilization:
  T+0s:  80 req/s → scale to 3 pods
  T+5s:  Traffic distributed → 27 req/s per pod → scale to 3 (still)
  T+10s: Momentary dip → 8 req/s per pod → scale to 1
  T+15s: Traffic returns → 80 req/s per pod → scale to 3
  T+20s: ... repeat forever
```

This is called **thrashing** — constant scaling up and down, which:
- Wastes resources (pod startup cost ~15s)
- Increases latency (new pods aren't ready immediately)
- Creates instability

### Stabilization Windows

HPA's `behavior` field introduces stabilization windows:

```yaml
behavior:
  scaleUp:
    stabilizationWindowSeconds: 0     # Scale up immediately (latency-sensitive)
  scaleDown:
    stabilizationWindowSeconds: 60    # Wait 60s of low metric before scaling down
```

#### Scale-Up Stabilization: 0s

We scale up immediately because users are experiencing degraded performance right now. Waiting would prolong the issue. The downside (scaling up too early) is acceptable — extra pods cost money but don't hurt users.

#### Scale-Down Stabilization: 60s

We wait 60 seconds of consistently low metric before scaling down. This filters out momentary dips (e.g., a brief network blip) and only scales down when traffic is genuinely low.

```
With 60s stabilization on scale-down:

  req/s
  80 │         ╱──╲
     │        ╱    ╲
  10 │───────╯      ╲      ╱──╲
     │                ╲    ╱    ╲
   0 │                 ╲──╯      ╲────────
     └──────────────────────────────────────
     0s   30s   60s   90s  120s  150s  180s

     Scale-up happens at T+0s (immediate)
     Scale-down waits until T+150s (60s after metric drops below target)
```

### Scaling Policies

Beyond stabilization windows, scaling policies limit how fast HPA can change replicas:

```yaml
behavior:
  scaleUp:
    policies:
      - type: Percent
        value: 100       # Max +100% per 15s (can double)
        periodSeconds: 15
  scaleDown:
    policies:
      - type: Percent
        value: 50        # Max -50% per 30s (can halve)
        periodSeconds: 30
```

#### Scale-Up Policy: 100% per 15s

From 1 pod, HPA can go to 2 pods in 15s (+100%). From 2 pods, it can go to 4 pods in 15s — but maxReplicas is 3, so it goes to 3. This is aggressive — we want fast response to traffic spikes.

#### Scale-Down Policy: 50% per 30s

From 3 pods, HPA can remove 1 pod per 30s (50% of 3 = 1.5, rounded down to 1). From 2 pods, it can remove 1 per 30s. This is conservative — we don't want to scale down too fast in case traffic returns.

### Why Asymmetric Scaling?

| Direction | Speed | Why |
|-----------|-------|-----|
| **Scale up** | Fast (immediate, 100%/15s) | Users are suffering — fix it now |
| **Scale down** | Slow (60s wait, 50%/30s) | Save money, but don't hurt users if traffic returns |

This asymmetry reflects a core principle: **availability over cost**. It's better to waste some resources (extra pods after traffic drops) than to risk latency (scaling down too fast).

---

## 19. Production Autoscaling Considerations

### Setting minReplicas and maxReplicas

| Setting | Too Low | Too High |
|---------|---------|----------|
| **minReplicas** | Scale-to-zero latency on cold start | Wasted resources during low traffic |
| **maxReplicas** | Can't handle traffic spikes | Cost runaway if metric is misconfigured |

**Rule of thumb**: Set `minReplicas` to handle baseline traffic (so you always have headroom). Set `maxReplicas` to the most you're willing to pay for.

For production web apps:
- `minReplicas: 2-3` (always have redundancy — one pod can crash without outage)
- `maxReplicas`: Based on cost budget and peak traffic estimates

### Choosing the Right Metric

| Metric Type | Good For | Bad For |
|-------------|----------|---------|
| **CPU** | CPU-bound apps (computation) | I/O-bound apps (web servers waiting on DB) |
| **Memory** | Memory-hungry apps (caches) | Web servers (memory doesn't track load) |
| **Request rate** | Web APIs | Background workers |
| **Queue depth** | Workers, async processing | Web servers |

Task Manager uses **request rate** because:
1. It's a web API — HTTP requests are the unit of load
2. CPU stays low (30-40%) even under load because pods wait on PostgreSQL
3. Request rate directly correlates with user-perceived load

### The Cold Start Problem

When HPA scales up, new pods take time to become ready:
- Container image pull: 5-30s (cached after first pull)
- Next.js startup: 10-15s
- Readiness probe passes: 5-10s

Total: **20-55 seconds** before a new pod serves traffic.

During this window, existing pods handle all traffic. If traffic is spiking fast, this can lead to cascading overload. Solutions:
- **Pre-scaling** (cron-based): Scale up before expected peaks (e.g., weekday mornings)
- **Higher minReplicas**: Always have headroom
- **Concurrency limits**: Use ingress rate limiting to protect pods

### Multiple Metrics

HPA can use multiple metrics — it takes the **maximum** desired replicas across all metrics:

```yaml
metrics:
  - type: Resource          # CPU
    resource:
      name: cpu
      target: { type: Utilization, averageUtilization: 70 }
  - type: Pods              # Custom: request rate
    pods:
      metric: { name: requests_per_second }
      target: { type: AverageValue, averageValue: 10 }
```

If CPU says "3 pods" and request rate says "5 pods", HPA chooses 5 (the max). This provides defense in depth — if either metric spikes, the app scales up.

### Monitoring the Autoscaler Itself

In production, you should alert on:
- **HPA at maxReplicas for extended periods**: Traffic exceeds capacity — need to raise maxReplicas or optimize the app
- **HPA frequently scaling up and down**: Thrashing — increase stabilization windows
- **HPA unable to fetch metrics**: Prometheus Adapter is down — HPA stops scaling

These alerts would be added to the PrometheusRule from Module D (Alerting).

---

## Module G: Canary Deployments

## 20. The Deployment Dilemma: All-at-Once vs. Progressive

### The All-at-Once Problem

Every deployment so far has been "all-at-once" — when you push a new image, Kubernetes performs a **RollingUpdate**:

```
Deployment with 3 replicas, updating image from v1 → v2:

  T+0s:  [v1] [v1] [v1]            (all old version)
  T+15s: [v1] [v1] [v2]            (1 new pod, 2 old)
  T+30s: [v1] [v2] [v2]            (2 new, 1 old)
  T+45s: [v2] [v2] [v2]            (all new version)
```

Kubernetes replaces pods one at a time (controlled by `maxSurge` and `maxUnavailable`). This is better than "recreate" (take down all, then bring up all), but it has a critical flaw:

**If v2 is broken, ALL users eventually hit the broken version.**

```
RollingUpdate with a broken v2:

  T+0s:  [v1] [v1] [v1]     100% healthy
  T+15s: [v1] [v1] [v2]     33% of users get errors (the ones routed to v2)
  T+30s: [v1] [v2] [v2]     66% of users get errors
  T+45s: [v2] [v2] [v2]     100% of users get errors

  → Someone notices, triggers rollback
  → Reverse the process: another 45s of degraded service
  → Total outage window: ~90s with 66-100% error rate
```

### The Progressive Alternative

**Progressive delivery** routes a small percentage of traffic to the new version first, analyzes metrics, and only proceeds if the new version is healthy:

```
Canary deployment with 5% → 25% → 100% stages:

  Stage 1 (5%):     95% traffic → v1, 5% traffic → v2
    → Analyze error rate for 5 minutes
    → If error rate < 1%: proceed to stage 2
    → If error rate > 1%: abort, rollback to 100% v1

  Stage 2 (25%):    75% traffic → v1, 25% traffic → v2
    → Analyze error rate for 5 minutes
    → If healthy: proceed to stage 3
    → If unhealthy: abort

  Stage 3 (100%):   100% traffic → v2
    → Deployment complete
```

If v2 is broken, only 5% of users are affected before the automatic abort. That's 19x fewer impacted users than all-at-once.

### The Blast Radius Concept

**Blast radius** = the number of users affected when something goes wrong.

| Strategy | Blast Radius (broken deploy) | Detection |
|----------|------------------------------|-----------|
| Recreate (all at once) | 100% immediately | Manual (someone complains) |
| RollingUpdate | Grows 33% → 66% → 100% over ~45s | Manual |
| Canary (5% → 25% → 100%) | 5% max before auto-abort | Automatic (metric analysis) |

---

## 21. Deployment Strategies Compared

### The Four Common Strategies

| Strategy | How It Works | Rollback | Complexity | When to Use |
|----------|-------------|----------|------------|-------------|
| **Recreate** | Kill all old, start all new | Slow (redeploy old) | Low | Dev environments, breaking changes |
| **RollingUpdate** | Replace pods one-by-one | Slow (reverse rolling) | Low (default) | Most deploys |
| **Blue/Green** | Run two envs, switch traffic instantly | Instant (switch back) | Medium (2x resources) | Instant rollback needs |
| **Canary** | Gradual traffic shift with analysis | Fast (shift traffic back) | High (traffic splitting + metrics) | Production, high-stakes deploys |

### Blue/Green vs. Canary

**Blue/Green**:
```
  Blue environment (v1): [pod] [pod] [pod]    ← live traffic
  Green environment (v2): [pod] [pod] [pod]   ← idle, being tested

  Switch: move traffic from Blue to Green instantly
  If broken: switch back to Blue instantly

  Cost: 2x resources (both environments running)
  Speed: instant switch, instant rollback
```

**Canary**:
```
  Shared pool: [v1] [v1] [v1] [v2]
                          ↑ only 5-25% of traffic

  Gradual: increase v2 traffic as confidence grows
  If broken: route 0% to v2 (effectively rollback)

  Cost: minimal (v2 shares the pool)
  Speed: gradual promotion, fast rollback
```

### Why We Chose Canary

For Task Manager, canary is the right choice because:
1. **Minikube has limited resources** — can't run a full Blue/Green duplicate
2. **We have Prometheus metrics** — canary analysis needs metrics to evaluate health
3. **NGINX Ingress supports traffic splitting** — built-in canary annotation support
4. **It's the industry standard** for production Kubernetes deployments

---

## 22. Canary Deployments: Theory and Trade-offs

### The Canary Metaphor

The term comes from coal mining: miners carried caged canaries into mines. Canaries are more sensitive to toxic gases than humans. If the canary stopped singing (or died), miners evacuated before the gas reached dangerous levels for humans.

In software: the canary is the new version serving a small percentage of traffic. If it "dies" (errors spike), we "evacuate" (rollback) before all users are affected.

### How Canary Works in Kubernetes

A canary deployment in Kubernetes requires three pieces:

1. **Two ReplicaSets** (or pod sets): old version (stable) and new version (canary)
2. **Two Services**: one selecting stable pods, one selecting canary pods
3. **Traffic routing**: an Ingress or service mesh that splits traffic between them

```
                    ┌───────────────┐
                    │     Ingress    │
            ┌───────┤   (NGINX)     ├───────┐
            │ 95%   └───────────────┘   5%  │
            ▼                             ▼
    ┌───────────────┐             ┌───────────────┐
    │ Stable Service │             │ Canary Service │
    │ (selector:     │             │ (selector:     │
    │  stable hash)   │             │  canary hash)  │
    └───────┬───────┘             └───────┬───────┘
            │                             │
     ┌──────┴──────┐               ┌──────┴──────┐
     │ [v1 pod]    │               │ [v2 pod]    │
     │ [v1 pod]    │               │             │
     │ [v1 pod]    │               │             │
     └─────────────┘               └─────────────┘
```

### Trade-offs of Canary

| Advantage | Disadvantage |
|-----------|--------------|
| Limits blast radius (few users affected by bad deploy) | Complex setup (traffic splitting, metric analysis) |
| Automatic rollback (no human needed) | Requires good metrics (no metrics = no analysis = no auto-abort) |
| Gradual confidence building | Slower deployment (minutes vs. seconds for rolling) |
| Tests real production traffic | Hard to debug (which version caused the error?) |

### When Canary Is Overkill

Canary shines for high-stakes production deployments. But it's overkill for:
- **Development environments**: Just redeploy
- **Trivial changes** (typo fix, CSS tweak): RollingUpdate is fine
- **No metrics available**: Canary analysis needs metrics — without them, you're just doing slow rolling updates

---

## 23. Argo Rollouts: The Kubernetes-Native Solution

### What Is Argo Rollouts?

**Argo Rollouts** is a Kubernetes controller that provides advanced deployment capabilities (canary, blue/green) as a replacement for the standard Deployment resource. It's part of the Argo project (same family as ArgoCD) but is a separate component.

### Rollout vs. Deployment

| Aspect | Deployment | Rollout |
|--------|-----------|---------|
| API kind | `Deployment` | `Rollout` |
| API group | `apps/v1` | `argoproj.io/v1alpha1` |
| Update strategy | RollingUpdate or Recreate | RollingUpdate, **Canary**, or BlueGreen |
| Traffic splitting | No (kube-proxy round-robin) | Yes (NGINX, Istio, ALB, etc.) |
| Metric analysis | No | Yes (Prometheus, DataDog, Wavefront) |
| Automatic rollback | Manual (`kubectl rollout undo`) | Automatic (analysis fails → abort) |

A Rollout is a **superset** of Deployment — it supports everything Deployment does, plus canary and blue/green.

### Installing Argo Rollouts

Unlike ArgoCD (installed via Helm or manifests), Argo Rollouts is installed via a single manifest:

```bash
# Create namespace and install the controller
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f \
  https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

This installs:
- **Controller pod** (`argo-rollouts-controller`) — watches Rollout resources and manages ReplicaSets
- **CRDs** — Rollout, AnalysisTemplate, AnalysisRun, Experiment

### The kubectl Plugin

For a better CLI experience, install the `kubectl-argo-rollouts` plugin:

```bash
# Download the plugin (Windows example)
curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-windows-amd64
mv kubectl-argo-rollouts-windows-amd64 kubectl-argo-rollouts.exe
mv kubectl-argo-rollouts.exe C:\Users\ralfh\

# Add to PATH for the session
$env:PATH = "C:\Users\ralfh;$env:PATH"

# Verify
kubectl argo rollouts version
```

The plugin provides commands like:
- `kubectl argo rollouts get rollout <name> --watch` — live rollout visualization
- `kubectl argo rollouts promote <name>` — skip to next canary step
- `kubectl argo rollouts abort <name>` — manual abort
- `kubectl argo rollouts retry rollout <name>` — retry after abort

### Argo Rollouts vs. ArgoCD

Don't confuse these two:

| Component | Manages | Purpose |
|-----------|---------|---------|
| **ArgoCD** | Git → Cluster sync | "Apply manifests from Git to cluster" |
| **Argo Rollouts** | Deployment strategy | "How to roll out new pod versions safely" |

They work together: ArgoCD applies the Rollout manifest, Argo Rollouts executes the canary strategy. ArgoCD doesn't know about canary steps — it just sees a Rollout resource and applies it.

---

## 24. The Rollout CRD: Replacing Deployment

### The Rollout Manifest

`task-manager/helm-chart/templates/task-manager/rollout.yaml`:

```yaml
{{- if .Values.canary.enabled }}
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: {{ include "task-manager.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
  template:
    # ... standard pod template (same as Deployment) ...
  strategy:
    canary:
      canaryService: task-manager-canary      # Service for canary pods
      stableService: task-manager             # Service for stable pods
      trafficRouting:
        nginx:
          stableIngress: task-manager          # Main ingress to clone
      steps:
        - setWeight: 20                        # 20% traffic to canary
        - pause: { duration: 30s }             # Wait 30s
        - analysis:                            # Run metric analysis
            templates:
              - templateName: success-rate
        - setWeight: 50                        # 50% traffic to canary
        - pause: { duration: 30s }
        - analysis:
            templates:
              - templateName: success-rate
        - setWeight: 100                       # 100% traffic to canary (promote)
{{- end }}
```

### Key Differences from Deployment

1. **`kind: Rollout`** instead of `kind: Deployment`
2. **`strategy.canary`** instead of `strategy.rollingUpdate`
3. **`canaryService` / `stableService`**: References to two Services that Rollouts manages
4. **`trafficRouting.nginx`**: Tells Rollouts to use NGINX Ingress for traffic splitting
5. **`steps`**: The canary progression (weights, pauses, analyses)

### The Pod Template

The `spec.template` section is identical to a Deployment — it defines the pod spec (image, env, ports, probes). This is why migrating from Deployment to Rollout is straightforward: copy the template, change the kind, add the strategy.

### Conditional Rendering

The Helm chart renders **either** a Deployment **or** a Rollout, never both:

```yaml
# templates/task-manager/deployment.yaml
{{- if not .Values.canary.enabled }}
apiVersion: apps/v1
kind: Deployment
# ...
{{- end }}

# templates/task-manager/rollout.yaml
{{- if .Values.canary.enabled }}
apiVersion: argoproj.io/v1alpha1
kind: Rollout
# ...
{{- end }}
```

When `canary.enabled: true`, only the Rollout exists. When `false`, only the Deployment exists. This avoids resource conflicts (two controllers fighting over the same pods).

---

## 25. Canary Strategy: Traffic Splitting with NGINX

### The `steps` Field

The `steps` array defines the canary progression:

```yaml
steps:
  - setWeight: 20         # Step 1: 20% traffic to canary
  - pause: { duration: 30s }   # Step 2: wait 30s
  - analysis: ...         # Step 3: run Prometheus analysis
  - setWeight: 50         # Step 4: 50% traffic
  - pause: { duration: 30s }   # Step 5: wait 30s
  - analysis: ...         # Step 6: run analysis
  - setWeight: 100        # Step 7: promote to 100%
```

Each step is executed sequentially. If an analysis fails, the rollout aborts (canary scales to 0, 100% traffic returns to stable).

### How NGINX Traffic Routing Works

Argo Rollouts doesn't split traffic itself — it configures NGINX Ingress to do it. The mechanism:

```
1. You have a stable Ingress (task-manager) routing 100% to stable Service
2. Argo Rollouts creates a shadow Ingress with canary annotation:
     nginx.ingress.kubernetes.io/canary: "true"
     nginx.ingress.kubernetes.io/canary-weight: "20"
3. NGINX sees both Ingresses and splits traffic:
     - 80% → stable Service (via original Ingress)
     - 20% → canary Service (via shadow Ingress)
4. As the rollout progresses, Rollouts updates the canary-weight annotation
```

```yaml
trafficRouting:
  nginx:
    stableIngress: task-manager   # The main Ingress to clone for canary routing
```

The `stableIngress` field tells Rollouts which Ingress to use as the template for the canary Ingress. Rollouts creates a new Ingress (named `task-manager-canary`) with the canary annotation.

### The Two Services

```
┌─────────────────────────────────────────────────────────┐
│                   NGINX Ingress Controller                │
│                                                          │
│  Ingress: task-manager          Ingress: task-manager-   │
│  (stable)                       canary (auto-created)    │
│  → routes to Service            → routes to Service      │
│    "task-manager"                 "task-manager-canary"  │
│  → weight: 80%                  → weight: 20%            │
└──────────┬──────────────────────────────┬─────────────────┘
           │                              │
           ▼                              ▼
   ┌───────────────┐              ┌───────────────┐
   │ task-manager  │              │ task-manager- │
   │ Service       │              │ canary Service│
   │ selector:     │              │ selector:     │
   │  stable-hash  │              │  canary-hash  │
   └───────┬───────┘              └───────┬───────┘
           │                              │
    ┌──────┴──────┐                ┌──────┴──────┐
    │ [v1 pod]    │                │ [v2 pod]    │
    │ [v1 pod]    │                │             │
    └─────────────┘                └─────────────┘
```

The key trick: **Rollouts dynamically modifies the Service selectors**. Each Service's selector includes a `pod-template-hash` label that Rollouts injects into pods. When a new revision starts:
- The stable Service selects the old ReplicaSet's pods (old hash)
- The canary Service selects the new ReplicaSet's pods (new hash)

When the canary is promoted to 100%, the hashes swap — the new ReplicaSet becomes stable.

### Step Types

| Step Type | What It Does |
|-----------|-------------|
| `setWeight: N` | Route N% of traffic to canary |
| `pause: { duration: 30s }` | Wait for a fixed duration |
| `pause: {}` | Wait indefinitely (until manual promotion) |
| `analysis: ...` | Run metric analysis (pass/fail) |
| `setCanaryScale: { count: N }` | Set explicit canary replica count |
| `experiment: ...` | Run a short-lived experiment (advanced) |

---

## 26. AnalysisTemplate: Automated Quality Gates

### What Is Analysis?

**Analysis** is the process of querying metrics (Prometheus, DataDog, etc.) and deciding if the canary is healthy. An `AnalysisTemplate` defines:
- What metric to query
- What constitutes "success" (threshold)
- How many times to check
- What constitutes "failure" (error budget)

### The AnalysisTemplate Manifest

`task-manager/helm-chart/templates/analysis-template.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
  namespace: {{ .Release.Namespace }}
spec:
  args:
    - name: service-name
      value: task-manager
  metrics:
    - name: success-rate
      interval: {{ .Values.canary.analysis.interval | quote }}    # "30s"
      count: {{ .Values.canary.analysis.count }}                  # 3
      successCondition: result[0] >= {{ .Values.canary.analysis.successRate }}  # >= 0.95
      failureLimit: {{ .Values.canary.analysis.failureLimit }}    # 1
      consecutiveErrorLimit: 5
      provider:
        prometheus:
          address: http://monitoring-kube-prometheus-prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_request_duration_seconds_count{status_code!~"5..",service="{{`{{args.service-name}}`}}"}[2m]))
            /
            sum(rate(http_request_duration_seconds_count{service="{{`{{args.service-name}}`}}"}[2m]))
            or vector(1)
```

### Field Breakdown

#### `interval` and `count`

```yaml
interval: "30s"
count: 3
```

- **interval**: Time between metric queries (30 seconds)
- **count**: Total number of queries to run (3)

This means: query Prometheus 3 times, 30 seconds apart. Total analysis duration: 90 seconds.

**CRITICAL**: Without `count`, the metric runs indefinitely. This is invalid for step analysis (steps must terminate). The analysis would hang forever, blocking the rollout.

#### `successCondition`

```yaml
successCondition: result[0] >= 0.95
```

This is a Go expression evaluated against the metric result. `result[0]` is the first value returned by the Prometheus query. The condition: success rate must be at least 95% (i.e., fewer than 5% of requests return 5xx errors).

#### `failureLimit`

```yaml
failureLimit: 1
```

How many failed metric evaluations are allowed before the analysis is marked as failed. With `failureLimit: 1`, two consecutive failures (the limit + 1) abort the rollout.

Wait — actually, `failureLimit: 1` means **1 failure is allowed**, and the **2nd failure** triggers abort. Let me clarify:

- `failureLimit: 0` → any single failure aborts
- `failureLimit: 1` → 1 failure tolerated, 2nd failure aborts
- `failureLimit: 3` → 3 failures tolerated, 4th failure aborts

#### `consecutiveErrorLimit`

```yaml
consecutiveErrorLimit: 5
```

An "error" is different from a "failure":
- **Failure**: The metric query succeeds, but `successCondition` evaluates to false
- **Error**: The metric query itself fails (e.g., Prometheus unreachable, query syntax error, empty result)

With `consecutiveErrorLimit: 5`, 5 consecutive errors abort the rollout. This prevents infinite retries if Prometheus is down.

**CRITICAL**: Without `consecutiveErrorLimit`, a query error would abort immediately. With it, transient Prometheus hiccups don't cause false aborts.

#### The Prometheus Query

```promql
sum(rate(http_request_duration_seconds_count{status_code!~"5..", service="task-manager"}[2m]))
/
sum(rate(http_request_duration_seconds_count{service="task-manager"}[2m]))
or vector(1)
```

Breaking it down:

1. **Numerator**: Count of non-5xx requests per second (over 2-minute window)
   - `status_code!~"5.."` — exclude any status starting with 5 (500, 502, 503, etc.)
2. **Denominator**: Total requests per second (all status codes)
3. **Division**: `non-5xx / total` = success rate (0.0 to 1.0)
4. **`or vector(1)`**: If there's no traffic (denominator is 0 or empty), return 1.0 (100% success)

**CRITICAL**: The `or vector(1)` fallback is essential. Without it, if there's no traffic during the analysis window, Prometheus returns an empty result, and `result[0]` causes a "slice index out of range" error — which counts as a consecutive error and eventually aborts the rollout.

### Analysis Outcomes

| Outcome | Condition | Action |
|---------|-----------|--------|
| **Success** | `count` queries completed, `failureLimit` not exceeded | Proceed to next step |
| **Failure** | `failureLimit + 1` failed `successCondition` evaluations | Abort rollout |
| **Error** | `consecutiveErrorLimit + 1` consecutive query errors | Abort rollout |

---

## 27. Services: Stable vs. Canary

### The Canary Service

`task-manager/helm-chart/templates/task-manager/canary-service.yaml`:

```yaml
{{- if .Values.canary.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: task-manager-canary
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  type: ClusterIP
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    # Rollouts will inject the canary pod-template-hash here
    {{- include "task-manager.selectorLabels" . | nindent 4 }}
{{- end }}
```

### How Rollouts Manages the Selectors

Initially, both Services have the same selector (from `selectorLabels`). When a new revision starts, Rollouts:

1. Creates a new ReplicaSet with a unique `pod-template-hash` label
2. **Modifies the canary Service selector** to include `pod-template-hash: <new-hash>`
3. **Modifies the stable Service selector** to include `pod-template-hash: <old-hash>`

```yaml
# After starting a new canary revision:

# Stable Service (modified by Rollouts)
spec:
  selector:
    app.kubernetes.io/name: task-manager
    pod-template-hash: abc123     # ← old ReplicaSet's hash

# Canary Service (modified by Rollouts)
spec:
  selector:
    app.kubernetes.io/name: task-manager
    pod-template-hash: def456     # ← new ReplicaSet's hash
```

This is why ArgoCD must ignore `/spec/selector` on these Services — Rollouts changes them dynamically, and ArgoCD would see this as drift.

### After Promotion

When the canary reaches 100% and is promoted:
1. The old ReplicaSet scales to 0 (stable pods terminated)
2. The new ReplicaSet becomes the stable version
3. Both Services now point to the new ReplicaSet's hash
4. On the next revision, the cycle repeats

### Verification

```bash
# Check the Service selectors
kubectl get svc task-manager -n task-manager -o jsonpath='{.spec.selector}'
# {"app.kubernetes.io/name":"task-manager","pod-template-hash":"abc123"}

kubectl get svc task-manager-canary -n task-manager -o jsonpath='{.spec.selector}'
# {"app.kubernetes.io/name":"task-manager","pod-template-hash":"def456"}

# Check the ReplicaSets
kubectl get replicasets -n task-manager
# NAME                       DESIRED   CURRENT   READY
# task-manager-abc123        1         1         1    ← stable
# task-manager-def456        1         1         1    ← canary
```

---

## 28. HPA Integration: Scaling a Rollout

### The Problem: HPA Targets a Specific Resource

HPA's `scaleTargetRef` specifies which resource to scale. With a Deployment, it's straightforward:

```yaml
scaleTargetRef:
  apiVersion: apps/v1
  kind: Deployment
  name: task-manager
```

But when `canary.enabled: true`, there's no Deployment — there's a Rollout. HPA must target the Rollout instead.

### The Conditional scaleTargetRef

`task-manager/helm-chart/templates/hpa.yaml`:

```yaml
scaleTargetRef:
  {{- if .Values.canary.enabled }}
  apiVersion: argoproj.io/v1alpha1
  kind: Rollout
  {{- else }}
  apiVersion: apps/v1
  kind: Deployment
  {{- end }}
  name: {{ include "task-manager.fullname" . }}
```

When `canary.enabled: true`, the HPA targets the Rollout. When `false`, it targets the Deployment. This lets the same HPA template work in both modes.

### How HPA + Rollout Interact

HPA treats a Rollout just like a Deployment — it modifies `spec.replicas` based on metrics. The Rollout controller respects this and scales the stable ReplicaSet accordingly.

```
HPA watches metrics:
  → request rate high
  → sets Rollout.spec.replicas = 3

Rollout controller:
  → sees replicas: 3
  → scales stable ReplicaSet to 3 pods
  → (canary ReplicaSet scaled separately based on canary weight)
```

During a canary, both ReplicaSets are scaled:
- **Stable**: Scaled by HPA (e.g., 3 pods for 80% of traffic)
- **Canary**: Scaled by Rollouts based on weight (e.g., 1 pod for 20% of traffic)

### The ignoreDifferences Expansion

Because HPA modifies Rollout replicas (just like Deployment replicas), ArgoCD must ignore `/spec/replicas` on Rollouts too:

```yaml
# application.yaml
ignoreDifferences:
  - group: apps
    kind: Deployment
    jsonPointers:
      - /spec/replicas
  - group: argoproj.io        # ← added for canary mode
    kind: Rollout
    jsonPointers:
      - /spec/replicas
```

Without this, ArgoCD would constantly show the Rollout as OutOfSync (HPA changes replicas, Git says 1).

---

## 29. Happy Path: Successful Canary Promotion

### Triggering a New Canary

To trigger a canary, we change the image tag in Git and let ArgoCD + Rollouts handle the rest:

```bash
# 1. Build a new image version (from task-manager/)
docker build -t ralf090102/task-manager-app:v2-canary -f Dockerfile .
minikube ssh "docker rmi -f ralf090102/task-manager-app:v2-canary"
minikube image load ralf090102/task-manager-app:v2-canary

# 2. Update values.yaml to use the new tag
# Change: image.tag: latest  →  v2-canary
git add task-manager/helm-chart/values.yaml
git commit -m "chore: canary deploy v2-canary"
git push origin main

# 3. ArgoCD detects the change (~3 minutes)
#    Applies the updated Rollout manifest
#    Argo Rollouts sees the new image and starts the canary
```

### Watching the Progression

```bash
kubectl argo rollouts get rollout task-manager -n task-manager --watch
```

Output (simplified):

```
Name:            task-manager
Namespace:       task-manager
Status:          ✅ Healthy
Strategy:        Canary
  Step:          7/7
  SetWeight:     100%
  ActualWeight:  100%
Images:          ralf090102/task-manager-app:v2-canary (stable)
Replicas:
  Desired:       1
  Current:       1
  Pod-statuses:  Ready:1/1

Events:
  T+0s    Normal  RolloutUpdated   Rollout updated to v2-canary
  T+0s    Normal  NewReplicaSetCreated  Created ReplicaSet def456 (canary)
  T+0s    Normal  TrafficWeightUpdated  Traffic weight set to 20% for canary
  T+30s   Normal  AnalysisRunStarted    Analysis 'success-rate' started
  T+120s  Normal  AnalysisRunSuccessful Analysis 'success-rate' completed (3/3 passed)
  T+120s  Normal  TrafficWeightUpdated  Traffic weight set to 50% for canary
  T+150s  Normal  AnalysisRunStarted    Analysis 'success-rate' started
  T+240s  Normal  AnalysisRunSuccessful Analysis 'success-rate' completed (3/3 passed)
  T+240s  Normal  TrafficWeightUpdated  Traffic weight set to 100% for canary
  T+245s  Normal  RolloutCompleted      Rollout completed
```

### Timeline

```
T+0s     : New revision starts
           → Rollouts creates canary ReplicaSet (def456)
           → NGINX canary-weight: 20

T+0-30s  : 20% traffic to canary, 80% to stable
           (pause step — letting traffic flow)

T+30s    : Analysis starts (3 checks, 30s apart)

T+30s    : Check 1: success rate = 1.00 ✓
T+60s    : Check 2: success rate = 1.00 ✓
T+90s    : Check 3: success rate = 1.00 ✓
           → Analysis PASSED (3/3)

T+90s    : setWeight: 50
           → NGINX canary-weight: 50

T+90-120s: 50% traffic to canary (pause)

T+120s   : Analysis starts again

T+120s   : Check 1: success rate = 0.98 ✓
T+150s   : Check 2: success rate = 1.00 ✓
T+180s   : Check 3: success rate = 1.00 ✓
           → Analysis PASSED (3/3)

T+210s   : setWeight: 100
           → NGINX canary-weight: 100 (promoted!)
           → Old ReplicaSet (abc123) scales to 0
           → New ReplicaSet (def456) becomes stable
```

### Verification After Promotion

```bash
# Rollout is healthy
kubectl argo rollouts get rollout task-manager -n task-manager
# Status: Healthy, Step: 7/7

# ArgoCD is in sync
kubectl get application task-manager -n argocd
# STATUS: Synced, HEALTH: Healthy

# Pods are running the new image
kubectl get pods -n task-manager -o jsonpath='{.items[*].spec.containers[*].image}'
# ralf090102/task-manager-app:v2-canary
```

---

## 30. Sad Path: Automatic Abort and Rollback

### What Happens When the Canary Fails

If the new version has a bug (e.g., crashes on startup, returns 500s), the analysis detects it and aborts automatically:

```
T+0s     : New revision starts (v3-broken)
           → Canary ReplicaSet created
           → NGINX canary-weight: 20

T+30s    : Analysis starts

T+30s    : Check 1: success rate = 0.45 ✗ (55% errors!)
           failureCount: 1/2 (failureLimit: 1)
T+60s    : Check 2: success rate = 0.40 ✗
           failureCount: 2/2 → FAILURE LIMIT EXCEEDED
           → Analysis FAILED

T+65s    : Rollout ABORTED
           → NGINX canary-weight: 0 (0% to canary)
           → Canary ReplicaSet scales to 0
           → 100% traffic returns to stable (v2-canary)

T+70s    : Users no longer affected — stable version serving all traffic
```

### The Rollout Status

```bash
kubectl argo rollouts get rollout task-manager -n task-manager
```

```
Name:            task-manager
Namespace:       task-manager
Status:          ✖ Aborted
Message:         Rollout aborted due to failed analysis
Strategy:        Canary
  Step:          2/7
Images:          ralf090102/task-manager-app:v2-canary (stable)
                 ralf090102/task-manager-app:v3-broken
Replicas:
  Desired:       1
  Current:       1
  Pod-statuses:  Ready:1/1
```

The key indicator: **Status: Aborted**. The stable image (v2-canary) is still serving traffic. The broken image (v3-broken) is scaled to 0.

### The First Attempt's Bug: Empty Prometheus Result

During initial testing, the first abort wasn't due to a real failure — it was due to **no traffic**:

```
T+0s   : No traffic is flowing to the app
T+30s  : Analysis starts
T+30s  : Prometheus query returns empty result (no data points)
         → result[0] → "slice index out of range"
         → consecutiveErrorCount: 1
T+60s  : Same error → consecutiveErrorCount: 2
...
T+150s : consecutiveErrorCount: 5 → consecutiveErrorLimit exceeded
         → Analysis ERRORED → Rollout ABORTED
```

The Prometheus query had no `or vector(1)` fallback. With no traffic, the denominator was 0, division produced no result, and `result[0]` panicked.

### The Fix: `or vector(1)`

```promql
# BEFORE (broken):
sum(rate(http_request_duration_seconds_count{status_code!~"5.."}[2m]))
/
sum(rate(http_request_duration_seconds_count[2m]))

# AFTER (fixed):
sum(rate(http_request_duration_seconds_count{status_code!~"5.."}[2m]))
/
sum(rate(http_request_duration_seconds_count[2m]))
or vector(1)
```

`or vector(1)` means: "if the previous expression returns nothing, return a single-element vector with value 1.0 (100% success rate)." This is a safety net — when there's no traffic, we assume success (no errors = 100% success) rather than failing the analysis.

### Retrying an Aborted Rollout

After fixing the issue (or confirming it was a false alarm), retry:

```bash
kubectl argo rollouts retry rollout task-manager -n task-manager
```

This restarts the canary from the beginning (20% weight, pause, analysis, etc.).

---

## 31. The Traffic Generator Problem

### Why Canary Analysis Needs Traffic

Analysis queries Prometheus for the success rate over the last 2 minutes. If there's **no traffic**, Prometheus has no data points, and the query returns empty. Without the `or vector(1)` fallback, this causes a "slice index out of range" error.

Even with the fallback, analysis is more meaningful with real traffic — you can't detect errors if there are no requests to error on.

### The Problem in Testing

In a real production environment, there's always background traffic. But in a Minikube dev cluster at 2 AM, there's zero traffic. The analysis would either:
1. (Before fix) Error out and abort
2. (After fix) Always succeed (100% of zero requests is "100% success") — which defeats the purpose

### The Solution: Generate Background Traffic

We run a small pod that continuously sends requests:

```bash
kubectl run traffic-gen \
  --image=node:22-slim \
  --restart=Never \
  --command -- node -e "setInterval(()=>fetch('http://task-manager.task-manager.svc.cluster.local:3000/api/tasks').catch(()=>{}),200)"
```

This sends ~5 requests per second. Not enough to load the app, but enough for Prometheus to have data for analysis.

### Why This Matters

| Without Traffic | With Traffic Generator |
|-----------------|----------------------|
| Prometheus query returns empty | Prometheus has ~300 data points per 2-min window |
| `result[0]` → error (or vector(1) → trivial success) | Real success rate computed |
| Analysis is meaningless | Analysis catches real errors |

In production, you wouldn't need this — real users provide the traffic. For testing canary in a dev cluster, the traffic generator is essential.

### Cleanup

```bash
kubectl delete pod traffic-gen -n task-manager
```

---

## 32. Canary Operations: Manual Control

### Watching the Rollout

The most useful command during a canary:

```bash
kubectl argo rollouts get rollout task-manager -n task-manager --watch
```

This shows a live-updating view with:
- Current step (e.g., "Step 3/7")
- Traffic weights (set vs. actual)
- Replica counts
- Recent events

### Promoting (Skipping Steps)

If you're confident the canary is good and don't want to wait for all pauses/analyses:

```bash
kubectl argo rollouts promote task-manager -n task-manager
```

This skips the current pause/analysis and moves to the next step. Using it repeatedly fast-forwards through all steps to 100%.

### Aborting Manually

If you notice a problem before the analysis catches it:

```bash
kubectl argo rollouts abort task-manager -n task-manager
```

This immediately:
1. Sets canary traffic to 0%
2. Scales the canary ReplicaSet to 0
3. Marks the rollout as Aborted

### Retrying After Abort

```bash
kubectl argo rollouts retry rollout task-manager -n task-manager
```

Restarts the canary from step 1 (20% weight). Use this after fixing the issue that caused the abort.

### Triggering a New Canary

To start a new canary revision, change the image:

```bash
# Via kubectl (bypasses GitOps — for testing only)
kubectl argo rollouts set image task-manager \
  task-manager=ralf090102/task-manager-app:v3-new -n task-manager

# Via GitOps (production):
# Edit values.yaml, commit, push — ArgoCD applies, Rollouts detects new image
```

### The Full Lifecycle

```
Stable (v1) → Trigger new canary (v2)
                ↓
            20% traffic → pause → analysis
                ↓                    ↓
                ↓              Pass → 50% traffic → pause → analysis
                ↓                    ↓                    ↓
                ↓                    ↓              Pass → 100% (promoted)
                ↓                    ↓
                ↓              Fail → ABORT (stay on v1)
                ↓
            Manual abort → stay on v1
```

---

## Reference

## 33. Verification: What Was Tested

### Module E (HPA) — Verified

| Test | Method | Result |
|------|--------|--------|
| Custom metrics API available | `kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1` | `pods/requests_per_second`, `pods/task_operations` present |
| HPA scales up under load | `autocannon -c 100 -d 120` from in-cluster pod | 1 → 2 → 3 pods within ~30s |
| HPA scales down after load | Stop autocannon, wait 60s | 3 → 1 pod |
| HPA respects maxReplicas | Continue load test | Pods stay at 3 (not more) |
| Scale-up is fast | Watch `kubectl get hpa -w` | ~15s between scale events |

### Module F (GitOps) — Verified

| Test | Method | Result |
|------|--------|--------|
| Application syncs from Git | `kubectl apply -f application.yaml` | All ~35 resources created automatically |
| Push triggers deploy | `git commit && git push` | ArgoCD detects in ~3 min, applies changes |
| Self-healing reverts manual changes | `kubectl scale deployment --replicas=3` | Reverted to 1 within ~35s |
| `ignoreDifferences` works | HPA changes replicas | ArgoCD doesn't show OutOfSync |
| Force immediate refresh | Patch annotation | ArgoCD re-syncs within seconds |

### Module G (Canary) — Verified

| Test | Method | Result |
|------|--------|--------|
| Canary happy path | Push v2-canary image | 20% → analysis pass → 50% → analysis pass → 100% |
| Canary sad path (real failure) | Push broken image | Analysis fails → auto-abort → 100% back to stable |
| Canary sad path (no traffic) | No traffic generator | Empty Prometheus result → error → auto-abort |
| `or vector(1)` fix | Add fallback to query | No-traffic scenario no longer aborts |
| Manual abort | `kubectl argo rollouts abort` | Instant rollback to stable |
| Manual promote | `kubectl argo rollouts promote` | Skips to next step |
| Retry after abort | `kubectl argo rollouts retry` | Canary restarts from 20% |
| HPA targets Rollout | Check HPA spec | `scaleTargetRef.kind: Rollout` when canary enabled |

---

## 34. Troubleshooting

### ArgoCD

#### "Application stuck in OutOfSync"

**Cause**: A field ArgoCD manages has been changed outside of Git.

**Diagnosis**:
```bash
kubectl describe application task-manager -n argocd | grep -A 20 "Conditions"
# Look for the diff details
```

**Fixes**:
1. If it's a field HPA/Rollouts manages → add to `ignoreDifferences`
2. If it's a real drift → `kubectl argo rollouts abort` (if canary) or sync manually
3. Force refresh: patch the `argocd.argoproj.io/refresh` annotation

#### "Application shows Degraded"

**Cause**: Resources were applied successfully, but pods are unhealthy.

**Diagnosis**:
```bash
kubectl get pods -n task-manager
kubectl describe pod <pod-name> -n task-manager
kubectl logs <pod-name> -n task-manager
```

**Common causes**:
- Missing Secret (didn't pre-create `task-manager-secrets`)
- Wrong DATABASE_URL (pgbouncer vs direct)
- Image not loaded into Minikube (`minikube image load`)

### HPA

#### "TARGETS shows <unknown>/10"

**Cause**: HPA can't fetch the custom metric.

**Diagnosis**:
```bash
# Check if Prometheus Adapter is running
kubectl get pods -n monitoring | grep adapter

# Check if the metric is available
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1/namespaces/task-manager/pods/*/requests_per_second"

# Check Prometheus has data
# (port-forward Prometheus, query: rate(http_request_duration_seconds_count[2m]))
```

**Fixes**:
- Restart Prometheus Adapter: `kubectl rollout restart deployment/prometheus-adapter -n monitoring`
- Verify the app is exposing metrics: `curl http://task-manager.local/api/metrics`
- Check the adapter rules match your metric names

#### "HPA doesn't scale even under load"

**Cause**: Metric value is below target, or stabilization window hasn't elapsed.

**Diagnosis**:
```bash
kubectl describe hpa -n task-manager
# Check "Metrics" section and "Conditions"
```

### Canary

#### "Rollout stuck at a step"

**Cause**: Pause step waiting, or analysis running.

**Diagnosis**:
```bash
kubectl argo rollouts get rollout task-manager -n task-manager
# Shows current step and phase

# Check analysis runs
kubectl get analysisrun -n task-manager
kubectl describe analysisrun <name> -n task-manager
```

**Fixes**:
- Promote to skip: `kubectl argo rollouts promote task-manager -n task-manager`
- Abort: `kubectl argo rollouts abort task-manager -n task-manager`

#### "Analysis fails with 'slice index out of range'"

**Cause**: Prometheus query returns empty result, `result[0]` panics.

**Fix**: Add `or vector(1)` to the query (see Section 26).

#### "Analysis never terminates"

**Cause**: Missing `count` field in the metric.

**Fix**: Add `count: 3` (or desired number) to the metric spec.

#### "NGINX not splitting traffic"

**Cause**: Canary Ingress not created, or NGINX config issue.

**Diagnosis**:
```bash
kubectl get ingress -n task-manager
# Should see: task-manager (stable) and task-manager-canary

kubectl describe ingress task-manager-canary -n task-manager
# Check annotations: nginx.ingress.kubernetes.io/canary-weight
```

---

## 35. Key Patterns and Best Practices

### GitOps Patterns

| Pattern | Implementation | Why |
|---------|---------------|-----|
| **Git is source of truth** | All manifests in `helm-chart/` | Auditable, versioned, reproducible |
| **No kubectl apply in CI** | ArgoCD pulls from Git | Cluster doesn't need inbound access from CI |
| **Self-healing enabled** | `selfHeal: true` in Application | Prevents configuration drift |
| **Pruning enabled** | `prune: true` in Application | Removes deleted resources automatically |
| **Secrets out of Git** | `secrets.enabled: false`, pre-create manually | Real passwords never in Git history |
| **ignoreDifferences for dynamic fields** | HPA replicas, Rollouts selectors | ArgoCD doesn't fight other controllers |

### Autoscaling Patterns

| Pattern | Implementation | Why |
|---------|---------------|-----|
| **Custom metric over CPU** | `requests_per_second` | Web apps are I/O-bound, CPU is misleading |
| **Asymmetric scaling** | Fast up (100%/15s), slow down (60s wait) | Prioritize availability over cost |
| **Tolerance window** | Default 10% | Prevents flapping on minor metric noise |
| **maxReplicas ceiling** | 3 pods | Cost control — can't scale infinitely |

### Canary Patterns

| Pattern | Implementation | Why |
|---------|---------------|-----|
| **Gradual traffic shift** | 20% → 50% → 100% | Limits blast radius at each stage |
| **Analysis between stages** | Prometheus success-rate query | Automated quality gate, no human needed |
| **`or vector(1)` fallback** | In AnalysisTemplate query | Handles no-traffic scenarios gracefully |
| **`count` field** | `count: 3` in metric spec | Ensures analysis terminates |
| **`consecutiveErrorLimit`** | 5 | Tolerates transient Prometheus issues |
| **Traffic generator for testing** | Background pod sending requests | Analysis needs data to evaluate |
| **Stable + canary Services** | Two Services with hash selectors | Enables precise traffic routing |

### The Three Controllers Working Together

This project demonstrates three Kubernetes controllers cooperating:

```
┌──────────────────────────────────────────────────────────────────┐
│                          Git Repository                           │
│                  (helm-chart/values.yaml, etc.)                   │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               │ poll (every ~3 min)
                               ▼
                    ┌─────────────────────┐
                    │      ArgoCD          │
                    │  (Git → Cluster)     │
                    └──────────┬──────────┘
                               │ applies manifests
                               ▼
    ┌──────────────────────────────────────────────────────┐
    │                  Kubernetes Cluster                   │
    │                                                       │
    │  ┌─────────────┐         ┌──────────────────────┐   │
    │  │     HPA      │ scales  │   Argo Rollouts      │   │
    │  │ (replicas    │────────▶│   (canary strategy)   │   │
    │  │  based on    │         │                       │   │
    │  │  metrics)    │         │   manages:            │   │
    │  └──────┬──────┘         │   - ReplicaSets       │   │
    │         │                 │   - Service selectors │   │
    │         ▼                 │   - NGINX weights     │   │
    │  ┌─────────────┐         │   - AnalysisRuns      │   │
    │  │  Rollout or  │◀────────┘                       │   │
    │  │  Deployment  │                                 │   │
    │  └─────────────┘                                 │   │
    └──────────────────────────────────────────────────────┘
```

1. **ArgoCD** ensures the cluster matches Git (desired state)
2. **HPA** adjusts replicas based on traffic (capacity)
3. **Argo Rollouts** controls how new versions roll out (safety)

They don't conflict because:
- ArgoCD ignores `/spec/replicas` (HPA owns it)
- ArgoCD ignores `/spec/selector` on Services (Rollouts owns it)
- HPA targets whichever resource ArgoCD rendered (Deployment or Rollout)

### Summary: What This Stage Taught

| Module | Core Lesson |
|--------|-------------|
| **E (HPA)** | Custom metrics enable intelligent autoscaling beyond CPU |
| **F (GitOps)** | Git as source of truth eliminates manual deployment errors |
| **G (Canary)** | Progressive delivery limits blast radius of bad deploys |

Together, these three modules transform the deployment workflow from **manual, all-at-once, static** to **automated, progressive, adaptive** — the foundation of a production-grade Kubernetes platform.
