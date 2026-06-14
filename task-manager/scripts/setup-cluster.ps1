<#
.SYNOPSIS
    Cluster setup script for the Task Manager microservices expansion.
    Deletes and recreates the Minikube cluster with adequate resources,
    then deploys the task-manager app and monitoring stack from scratch.

.DESCRIPTION
    This script automates the full "Prerequisites & Initial Setup" from
    Project-Roadmap2.md. It is idempotent — safe to re-run.

    Steps:
      1. Delete & recreate Minikube (4 CPU, 7GB RAM, K8s v1.35.1)
         [-SkipRecreate: keep existing cluster, just verify it's running]
      2. Enable NGINX Ingress controller
      3. Verify cluster health
      4. Create services/ directory structure (8 microservice subdirs)
      5. Build task-manager Docker image inside Minikube
      6. Deploy task-manager via Helm (monitoring disabled initially)
      7. Install kube-prometheus-stack (Prometheus, Grafana, Alertmanager)
      8. Upgrade task-manager with monitoring enabled (ServiceMonitor)
      9. Verify: pod status, metrics scraping, Ingress

.PARAMETER SkipRecreate
    Skip Step 1 (delete + recreate Minikube). The script will instead verify
    that the existing cluster is running and start it if stopped.
    Use this flag for subsequent runs when the cluster already exists and
    you just want to rebuild the image and redeploy.

    Example:
      .\setup-cluster.ps1                  # Full teardown + rebuild
      .\setup-cluster.ps1 -SkipRecreate    # Reuse existing cluster

.NOTES
    Prerequisites:
      - Docker Desktop (with at least 7GB memory allocated)
      - Minikube, kubectl, Helm installed and on PATH
      - Hosts file entry: 127.0.0.1 task-manager.local
      - This script run from an admin terminal (for hosts file)

    After running:
      - Open a SEPARATE terminal and run:  minikube tunnel
      - Then open http://task-manager.local in your browser
      - Grafana: kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
        (login: admin / admin)
#>

param(
    [switch]$SkipRecreate
)

# ============================================================================
# Configuration — adjust these if your credentials change
# ============================================================================

# Project root (parent of the task-manager/ directory)
$ProjectRoot = "D:\GitHub\Task-Manager-Web-Application"

# Minikube cluster resources
# 4 CPUs and 7GB RAM needed for the multi-service cluster (10+ pods)
# Note: Docker Desktop limits total memory; 8192MB may exceed what's available
$MinikubeCpu       = 4
$MinikubeMemoryMB  = 7168       # 7 GB (fits within Docker Desktop's ~7.9GB default)
$KubernetesVersion = "v1.35.1"

# Docker image name for the main app
$AppName     = "ralf090102/task-manager-app"
$AppTag      = "latest"

# Monitoring (kube-prometheus-stack) Helm release details
$MonitoringNamespace  = "monitoring"
$MonitoringRelease    = "monitoring"
$MonitoringGrafanaPwd = "admin"

# Application namespace
$AppNamespace = "task-manager"
$AppRelease   = "task-manager"

# Secrets — read from the .env file automatically
$EnvFile = Join-Path $ProjectRoot "task-manager\.env"

# Database URL (Supabase connection pooler)
$DatabaseUrl = $null

# NextAuth secret (shared between app and future microservices)
$NextAuthSecret = $null

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Step([string]$Message) {
    <#
        Prints a numbered step header so the output is easy to follow.
    #>
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Info([string]$Message) {
    Write-Host "  [..] $Message" -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host "  [!!] $Message" -ForegroundColor Red
}

function Test-Command([string]$Cmd) {
    <#
        Checks whether a command exists on PATH.
        Returns $true/$false.
    #>
    return [bool](Get-Command $Cmd -ErrorAction SilentlyContinue)
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

Write-Step "Pre-flight Checks"

# Verify required tools are installed before doing anything destructive
foreach ($tool in @("minikube", "kubectl", "helm", "docker")) {
    if (-not (Test-Command $tool)) {
        Write-Err "$tool is not installed or not on PATH. Aborting."
        exit 1
    }
    Write-Ok "$tool found"
}

# Parse the .env file to extract DATABASE_URL and AUTH_SECRET
# This avoids hardcoding secrets in the script
if (Test-Path $EnvFile) {
    Write-Info "Reading credentials from $EnvFile"
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*DATABASE_URL\s*=\s*"([^"]+)"') {
            $script:DatabaseUrl = $Matches[1]
        }
        if ($_ -match '^\s*AUTH_SECRET\s*=\s*"([^"]+)"') {
            $script:NextAuthSecret = $Matches[1]
        }
    }
}

if (-not $DatabaseUrl -or -not $NextAuthSecret) {
    Write-Err "Could not find DATABASE_URL or AUTH_SECRET in $EnvFile"
    Write-Err "Make sure the .env file exists with these variables."
    exit 1
}
Write-Ok "Credentials loaded from .env"

# ============================================================================
# Step 1: Delete & Recreate Minikube Cluster (or verify existing)
# ============================================================================

if ($SkipRecreate) {
    # ------------------------------------------------------------------
    # -SkipRecreate mode: keep the existing cluster, just make sure
    # it's running. This avoids the 2-3 minute teardown + recreate cycle.
    # ------------------------------------------------------------------
    Write-Step "Step 1: Verify Existing Minikube Cluster (SkipRecreate)"

    # Check if Minikube is running by querying its status.
    # If the host/kubelet/apiserver are stopped, we start the cluster.
    $minikubeStatus = minikube status --format "{{$state := .Host}}" 2>&1

    if ($minikubeStatus -match "Running") {
        Write-Ok "Minikube is already running — skipping recreate"
    } else {
        # Cluster exists but is stopped — start it without deleting.
        # `minikube start` on an existing stopped cluster resumes it
        # with the same configuration (CPU, memory, K8s version).
        Write-Info "Minikube is stopped — starting existing cluster..."
        minikube start 2>&1 | Out-Null

        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to start existing Minikube cluster."
            Write-Err "Run without -SkipRecreate to recreate from scratch."
            exit 1
        }
        Write-Ok "Existing Minikube cluster started"
    }
} else {
    # ------------------------------------------------------------------
    # Default mode: delete and recreate from scratch.
    # ------------------------------------------------------------------
    Write-Step "Step 1: Delete & Recreate Minikube Cluster"

    # Delete the existing cluster to start fresh.
    # This wipes all deployments, services, PVCs, and configurations.
    # Safe to do because everything is defined in Helm charts and Docker images.
    Write-Info "Deleting existing Minikube cluster (if any)..."
    minikube delete 2>&1 | Out-Null
    Write-Ok "Old cluster deleted"

    # Create a new cluster with more resources than the default (2 CPU / 2GB).
    # 4 CPUs and 7GB RAM are needed because the final microservices cluster
    # will run 10+ pods simultaneously (task-manager + 8 microservices +
    # MinIO + Meilisearch + monitoring stack).
    #
    # --driver=docker      : Uses Docker Desktop as the VM provider (recommended on Windows)
    # --cpus=4             : 4 virtual CPUs allocated to the Minikube VM
    # --memory=7168        : 7 GB RAM (Docker Desktop typically has ~7.9GB available)
    # --kubernetes-version : Pin to v1.35.1 for reproducibility
    Write-Info "Creating new Minikube cluster ($MinikubeCpu CPUs, $MinikubeMemoryMB MB RAM)..."

    minikube start `
        --driver=docker `
        --cpus=$MinikubeCpu `
        --memory=$MinikubeMemoryMB `
        --kubernetes-version=$KubernetesVersion 2>&1 | Out-Null

    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to start Minikube. Check Docker Desktop memory allocation."
        exit 1
    }
    Write-Ok "Minikube cluster created"
}

# ============================================================================
# Step 2: Enable NGINX Ingress Controller
# ============================================================================

Write-Step "Step 2: Enable NGINX Ingress Controller"

# The Ingress controller routes external HTTP traffic to the correct
# Kubernetes Service based on the hostname (task-manager.local).
# Without it, the Ingress resource has no controller to process it.
#
# This addon deploys the ingress-nginx-controller pod in the ingress-nginx
# namespace. It listens on port 80 (and 443 for TLS) inside the cluster.
Write-Info "Enabling NGINX Ingress addon..."
minikube addons enable ingress 2>&1 | Out-Null
Write-Ok "Ingress controller enabled"

# ============================================================================
# Step 3: Verify Cluster Health
# ============================================================================

Write-Step "Step 3: Verify Cluster Health"

# Wait for the NGINX Ingress controller pod to be Running.
# This is critical — if the controller isn't up, Ingress resources won't work.
Write-Info "Waiting for NGINX Ingress controller to be ready..."
kubectl wait --namespace ingress-nginx `
    --for=condition=ready pod `
    --selector=app.kubernetes.io/component=controller `
    --timeout=120s 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Err "Ingress controller did not become ready in time"
    exit 1
}
Write-Ok "Ingress controller is running"

# Show cluster node info — confirms K8s version and node status (should be "Ready")
$nodeStatus = kubectl get nodes -o jsonpath='{.items[0].status.nodeInfo.kubeletVersion}' 2>&1
Write-Ok "Node ready: $nodeStatus"

# ============================================================================
# Step 4: Create services/ Directory Structure
# ============================================================================

Write-Step "Step 4: Create services/ Directory Structure"

# Each microservice gets its own directory under services/.
# This mirrors the Helm template subdirectory structure and keeps
# each service's code (package.json, tsconfig, src/, Dockerfile) isolated.
$ServicesDir = Join-Path $ProjectRoot "task-manager\services"
$ServiceNames = @(
    "notification",    # Module 1: Email/in-app notifications
    "file-service",    # Module 2: File upload/download via MinIO
    "analytics",       # Module 3: Python/FastAPI analytics + reports
    "realtime",        # Module 4: WebSocket gateway (Socket.io)
    "search-sync",     # Module 5: Meilisearch sync service
    "webhook",         # Module 6: Webhook delivery with retry
    "scheduler",       # Module 7: Recurring task CronJob
    "team-service"     # Module 8: Team & workspace management
)

foreach ($svc in $ServiceNames) {
    $path = Join-Path $ServicesDir $svc
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}
Write-Ok "Created $($ServiceNames.Count) service directories under services/"

# ============================================================================
# Step 5: Build task-manager Docker Image in Minikube
# ============================================================================

Write-Step "Step 5: Build task-manager Docker Image"

# Build the Next.js Docker image directly inside Minikube's Docker daemon.
# This avoids pushing to a remote registry — the image is available locally
# to the cluster immediately.
#
# We use `minikube image build` instead of `docker build` because Minikube
# with the Docker driver has its own internal Docker daemon. Images built
# with the host Docker daemon are NOT visible to Minikube pods.
#
# The build context is the full task-manager/ directory (needs package.json,
# next.config.ts, prisma/, src/, public/, etc.)
# The Dockerfile uses a 3-stage build: deps -> builder -> runner
$BuildContext = Join-Path $ProjectRoot "task-manager"
$Dockerfile   = Join-Path $BuildContext "Dockerfile"

Write-Info "Building image ${AppName}:${AppTag} (this takes ~1-2 minutes)..."
Write-Info "  Context:   $BuildContext"
Write-Info "  Dockerfile: $Dockerfile"

minikube image build -t "${AppName}:${AppTag}" -f $Dockerfile $BuildContext 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker build failed"
    exit 1
}
Write-Ok "Image built: ${AppName}:${AppTag}"

# ============================================================================
# Step 6: Deploy task-manager
# ============================================================================

Write-Step "Step 6: Deploy task-manager via Helm"

# Check if the ServiceMonitor CRD already exists in the cluster.
# On a fresh cluster (Step 1 ran), it won't exist yet — deploy with
# monitoring disabled to avoid a Helm error.
# On an existing cluster (-SkipRecreate, monitoring already installed),
# the CRD exists — deploy with monitoring enabled directly.
$monitoringCrd = kubectl get crd servicemonitors.monitoring.coreos.com 2>&1
$hasMonitoringCrd = ($LASTEXITCODE -eq 0)

if ($hasMonitoringCrd) {
    # Monitoring stack already installed — deploy with monitoring ON directly.
    # This skips the disable/enable dance of Steps 7-8 below.
    Write-Info "Monitoring CRD detected — deploying with monitoring enabled"
    $monitoringFlag = $true
} else {
    # Fresh cluster — deploy WITHOUT monitoring first (CRD doesn't exist yet).
    # Step 7 installs the monitoring stack + CRD.
    # Step 8 re-upgrades with monitoring enabled.
    Write-Info "Monitoring CRD not found — deploying with monitoring disabled (will enable in Step 8)"
    $monitoringFlag = $false
}

# `helm upgrade --install` handles both cases:
#   - Fresh release -> installs it
#   - Existing release -> upgrades it
# This makes the script idempotent for -SkipRecreate runs.
#
# --set image.pullPolicy=Never
#   Critical for Minikube local dev: tells K8s to NEVER pull from Docker Hub.
#   The image was loaded directly into Minikube's daemon (Step 5), so it
#   exists locally. Without "Never", K8s tries to pull from Docker Hub
#   and gets ImagePullBackOff.
#
# --set monitoring.enabled=$monitoringFlag
#   Conditionally enable the ServiceMonitor template based on CRD existence
#
# --set-string secrets.authTrustHost="true"
#   NextAuth v5 security setting for non-HTTPS environments.
#   MUST use --set-string (not --set) because Helm parses "true" as a boolean,
#   and b64enc in the secret template expects a string.

Write-Info "Deploying Helm release '$AppRelease' (upgrade --install)..."

helm upgrade --install $AppRelease `
    (Join-Path $ProjectRoot "task-manager\helm-chart") `
    --namespace $AppNamespace `
    --create-namespace `
    --set image.pullPolicy=Never `
    --set monitoring.enabled=$monitoringFlag `
    --set monitoring.serviceMonitor.scrapeInterval=15s `
    --set monitoring.serviceMonitor.labels.release=monitoring `
    --set "secrets.databaseUrl=$DatabaseUrl" `
    --set "secrets.nextauthSecret=$NextAuthSecret" `
    --set 'secrets.nextauthUrl=http://task-manager.local' `
    --set-string 'secrets.authTrustHost=true' 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Err "Helm deploy failed"
    exit 1
}
Write-Ok "Helm release deployed"

# Wait for the task-manager pod to be Running and pass its readiness probe.
# The readiness probe hits "/" (the Next.js homepage) — if it returns 200,
# the pod is ready to serve traffic.
Write-Info "Waiting for task-manager pod to be ready..."
kubectl wait --namespace $AppNamespace `
    --for=condition=ready pod `
    --selector=app.kubernetes.io/instance=$AppRelease `
    --timeout=120s 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Err "task-manager pod did not become ready"
    kubectl get pods -n $AppNamespace
    exit 1
}
Write-Ok "task-manager pod is running"

# ============================================================================
# Step 7: Install kube-prometheus-stack (Monitoring) — fresh cluster only
# ============================================================================

# This step only runs on a fresh cluster where the monitoring CRD doesn't
# exist yet. On subsequent runs with -SkipRecreate, the CRD already exists
# and Step 6 already deployed task-manager with monitoring enabled.
if ($hasMonitoringCrd) {
    Write-Step "Step 7: Install Monitoring Stack (skipped — already installed)"
    Write-Ok "Monitoring stack detected from previous run"
} else {
    Write-Step "Step 7: Install Monitoring Stack"

    # Add the Prometheus community Helm chart repository.
    # This is where kube-prometheus-stack is hosted.
    # `helm repo update` fetches the latest chart index.
    Write-Info "Adding Prometheus Helm repository..."
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>&1 | Out-Null
    helm repo update 2>&1 | Out-Null
    Write-Ok "Helm repo updated"

    # kube-prometheus-stack installs a FULL monitoring stack:
    #   - Prometheus Operator        : Manages Prometheus instances via CRDs
    #   - Prometheus                 : Scrapes and stores metrics (time-series DB)
    #   - Grafana                    : Dashboards and visualization (admin/admin)
    #   - Alertmanager               : Routes alerts to email/Slack/etc
    #   - Node Exporter              : Host-level metrics (CPU, memory, disk)
    #   - Kube State Metrics         : Kubernetes object metrics (pods, deployments)
    #
    # It also installs the ServiceMonitor CRD, which is required for our
    # task-manager ServiceMonitor template to work.
    #
    # --set grafana.adminPassword=admin
    #   Sets the Grafana login to admin/admin for local dev
    Write-Info "Installing kube-prometheus-stack (this takes ~2-3 minutes for image pulls)..."

    helm install $MonitoringRelease `
        prometheus-community/kube-prometheus-stack `
        --namespace $MonitoringNamespace `
        --create-namespace `
        --set grafana.adminPassword=$MonitoringGrafanaPwd 2>&1 | Out-Null

    if ($LASTEXITCODE -ne 0) {
        Write-Err "Monitoring stack installation failed"
        exit 1
    }
    Write-Ok "Monitoring stack installed"
}

# Wait for all monitoring pods to be Running.
# Prometheus is the critical one — the operator and Grafana depend on it.
# This wait runs regardless of whether we just installed or already had it,
# to ensure Prometheus is ready before Step 8 tries to create a ServiceMonitor.
Write-Info "Waiting for Prometheus pod to be ready..."
kubectl wait --namespace $MonitoringNamespace `
    --for=condition=ready pod `
    --selector=app.kubernetes.io/name=prometheus `
    --timeout=300s 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Err "Prometheus pod did not become ready in time"
    Write-Info "Check pod status: kubectl get pods -n $MonitoringNamespace"
    exit 1
}
Write-Ok "Prometheus is running"

# ============================================================================
# Step 8: Upgrade task-manager with Monitoring Enabled — fresh cluster only
# ============================================================================

# This step only runs on a fresh cluster. On subsequent runs, Step 6 already
# deployed with monitoring enabled.
if ($hasMonitoringCrd) {
    Write-Step "Step 8: Enable Monitoring for task-manager (skipped — already enabled)"
    Write-Ok "ServiceMonitor already active from Step 6"
} else {
    Write-Step "Step 8: Enable Monitoring for task-manager"

    # Now that the ServiceMonitor CRD exists (installed by kube-prometheus-stack),
    # we upgrade the task-manager Helm release to enable monitoring.
    #
    # --reuse-values
    #   Keeps all values from the previous deploy (Step 6): secrets, pullPolicy, etc.
    #   Without this, Helm would reset to values.yaml defaults (empty secrets!).
    #
    # --set monitoring.enabled=true
    #   Enables the ServiceMonitor template (templates/task-manager/servicemonitor.yaml)
    #
    # --set monitoring.serviceMonitor.labels.release=monitoring
    #   CRITICAL: The Prometheus Operator uses this label to discover ServiceMonitors.
    #   Without "release: monitoring", Prometheus ignores our ServiceMonitor entirely.
    #   This must match the Helm release name of kube-prometheus-stack ("monitoring").
    Write-Info "Upgrading Helm release with monitoring enabled..."

    helm upgrade $AppRelease `
        (Join-Path $ProjectRoot "task-manager\helm-chart") `
        --namespace $AppNamespace `
        --reuse-values `
        --set monitoring.enabled=true `
        --set monitoring.serviceMonitor.scrapeInterval=15s `
        --set monitoring.serviceMonitor.labels.release=monitoring 2>&1 | Out-Null

    if ($LASTEXITCODE -ne 0) {
        Write-Err "Helm upgrade failed"
        exit 1
    }
    Write-Ok "Monitoring enabled for task-manager"
}

# ============================================================================
# Step 9: Final Verification
# ============================================================================

Write-Step "Step 9: Final Verification"

# --- 9a: All task-manager resources ---
Write-Info "task-manager namespace resources:"
kubectl get all -n $AppNamespace 2>&1 | Write-Host

# --- 9b: ServiceMonitor created ---
$sm = kubectl get servicemonitor -n $AppNamespace 2>&1
if ($sm -match "task-manager") {
    Write-Ok "ServiceMonitor created"
} else {
    Write-Err "ServiceMonitor not found"
}

# --- 9c: Metrics endpoint responding ---
# Test the /api/metrics endpoint from inside the pod.
# We use Node.js fetch() because the minimal Next.js standalone image
# doesn't include curl or wget.
Write-Info "Testing /api/metrics endpoint..."
$metricsOutput = kubectl exec -n $AppNamespace deployment/$AppRelease -- `
    node -e "fetch('http://localhost:3000/api/metrics').then(r=>r.text()).then(t=>console.log(t.split('\n')[0]))" 2>&1

if ($metricsOutput -match "HELP") {
    Write-Ok "Metrics endpoint responding (prom-client format)"
} else {
    Write-Err "Metrics endpoint not responding correctly"
}

# --- 9d: Prometheus scraping task-manager ---
# Check that Prometheus has discovered our ServiceMonitor and is actively
# scraping the /api/metrics endpoint. We port-forward Prometheus to localhost
# temporarily and query its targets API.
Write-Info "Checking if Prometheus is scraping task-manager..."

# Start a background port-forward to Prometheus (port 9090)
$pfProcess = Start-Process -WindowStyle Hidden -PassThru -FilePath kubectl `
    -ArgumentList "port-forward","-n",$MonitoringNamespace,"svc/monitoring-kube-prometheus-prometheus","9090:9090"

Start-Sleep -Seconds 3

try {
    $response = Invoke-RestMethod -Uri "http://localhost:9090/api/v1/targets" -UseBasicParsing
    $taskTarget = $response.data.activeTargets | Where-Object {
        $_.scrapeUrl -like "*task*" -or $_.labels.job -like "*task*"
    }

    if ($taskTarget -and $taskTarget.health -eq "up") {
        Write-Ok "Prometheus target is UP: $($taskTarget.scrapeUrl)"
    } elseif ($taskTarget) {
        Write-Info "Prometheus target found but health is: $($taskTarget.health)"
        Write-Info "  (may take 15-30s for first scrape — re-check later)"
    } else {
        Write-Info "Prometheus has not discovered the target yet"
        Write-Info "  (ServiceMonitor discovery can take up to 30s — re-check later)"
    }
} catch {
    Write-Info "Could not query Prometheus API (port-forward may need more time)"
} finally {
    # Kill the background port-forward process
    if ($pfProcess -and -not $pfProcess.HasExited) {
        Stop-Process -Id $pfProcess.Id -Force -ErrorAction SilentlyContinue
    }
}

# --- 9e: Cluster resource overview ---
Write-Info "Cluster pod count by namespace:"
$namespaces = @("kube-system", "ingress-nginx", $AppNamespace, $MonitoringNamespace)
foreach ($ns in $namespaces) {
    $count = (kubectl get pods -n $ns -o jsonpath='{.items}' 2>&1 | ConvertFrom-Json).Count
    if (-not $count) { $count = 0 }
    Write-Host "    $ns : $count pods" -ForegroundColor Gray
}

# ============================================================================
# Done
# ============================================================================

Write-Step "Setup Complete!"

Write-Host @"
  Cluster is ready. Next steps:

  1. Start minikube tunnel (REQUIRED for Ingress access):
     Open a SEPARATE terminal and run:
       minikube tunnel

  2. Open the app in your browser:
     http://task-manager.local
     (requires hosts file entry: 127.0.0.1 task-manager.local)

  3. Access Grafana dashboards:
     kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
     Open: http://localhost:3001  (login: admin / admin)

  4. Access Prometheus query UI:
     kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
     Open: http://localhost:9090

  Ready for Phase 1: Module 7 (Recurring Task Scheduler) -> Module 1 (Notification Service)
"@ -ForegroundColor White

Write-Host ""
Write-Host "  Usage:" -ForegroundColor DarkGray
Write-Host "    Full teardown + rebuild:  .\setup-cluster.ps1" -ForegroundColor DarkGray
Write-Host "    Reuse existing cluster:   .\setup-cluster.ps1 -SkipRecreate" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  To tear down everything:" -ForegroundColor DarkGray
Write-Host "    minikube delete" -ForegroundColor DarkGray
Write-Host ""
