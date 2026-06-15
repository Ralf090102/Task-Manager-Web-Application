#!/usr/bin/env bash
#
# Cluster setup script for the Task Manager microservices expansion.
# Deletes and recreates the Minikube cluster with adequate resources,
# then deploys the task-manager app and monitoring stack from scratch.
#
# This script automates the full "Prerequisites & Initial Setup" from
# Project-Roadmap2.md. It is idempotent — safe to re-run.
#
# Steps:
#   1. Delete & recreate Minikube (4 CPU, 7GB RAM, K8s v1.35.1)
#      [--skip-recreate: keep existing cluster, just verify it's running]
#   2. Enable NGINX Ingress controller
#   3. Verify cluster health
#   4. Create services/ directory structure (8 microservice subdirs)
#   5. Build task-manager Docker image inside Minikube
#   6. Deploy task-manager via Helm (monitoring disabled initially)
#   7. Install kube-prometheus-stack (Prometheus, Grafana, Alertmanager)
#   8. Upgrade task-manager with monitoring enabled (ServiceMonitor)
#   9. Verify: pod status, metrics scraping, Ingress
#
# Usage:
#   Full teardown + rebuild:  ./setup-cluster.sh
#   Reuse existing cluster:   ./setup-cluster.sh --skip-recreate
#
# Prerequisites:
#   - Docker Desktop (with at least 7GB memory allocated)
#   - Minikube, kubectl, Helm installed and on PATH
#   - Hosts file entry: 127.0.0.1 task-manager.local
#
# After running:
#   - Open a SEPARATE terminal and run:  minikube tunnel
#   - Then open http://task-manager.local in your browser
#   - Grafana: kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80
#     (login: admin / admin)

set -euo pipefail

# ============================================================================
# Parse Arguments
# ============================================================================

SKIP_RECREATE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-recreate|-SkipRecreate)
            SKIP_RECREATE=true
            shift
            ;;
        *)
            echo "  [!!] Unknown argument: $1"
            echo "  Usage: $0 [--skip-recreate]"
            exit 1
            ;;
    esac
done

# ============================================================================
# Configuration — adjust these if your credentials change
# ============================================================================

# Project root (parent of the task-manager/ directory)
PROJECT_ROOT="D:/GitHub/Task-Manager-Web-Application"

# Minikube cluster resources
# 4 CPUs and 7GB RAM needed for the multi-service cluster (10+ pods)
# Note: Docker Desktop limits total memory; 8192MB may exceed what's available
MINIKUBE_CPU=4
MINIKUBE_MEMORY_MB=7168       # 7 GB (fits within Docker Desktop's ~7.9GB default)
KUBERNETES_VERSION="v1.35.1"

# Docker image name for the main app
APP_NAME="ralf090102/task-manager-app"
APP_TAG="latest"

# Monitoring (kube-prometheus-stack) Helm release details
MONITORING_NAMESPACE="monitoring"
MONITORING_RELEASE="monitoring"
MONITORING_GRAFANA_PWD="admin"

# Application namespace
APP_NAMESPACE="task-manager"
APP_RELEASE="task-manager"

# Secrets — read from the .env file automatically
ENV_FILE="${PROJECT_ROOT}/task-manager/.env"

# ============================================================================
# Helper Functions
# ============================================================================

write_step() {
    echo ""
    echo -e "\033[36m==========================================\033[0m"
    echo -e "\033[36m  $1\033[0m"
    echo -e "\033[36m==========================================\033[0m"
}

write_ok() {
    echo -e "  \033[32m[OK]\033[0m $1"
}

write_info() {
    echo -e "  \033[33m[..]\033[0m $1"
}

write_err() {
    echo -e "  \033[31m[!!]\033[0m $1"
}

test_command() {
    command -v "$1" >/dev/null 2>&1
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

write_step "Pre-flight Checks"

# Verify required tools are installed before doing anything destructive
for tool in minikube kubectl helm docker; do
    if ! test_command "$tool"; then
        write_err "$tool is not installed or not on PATH. Aborting."
        exit 1
    fi
    write_ok "$tool found"
done

# Parse the .env file to extract DATABASE_URL and AUTH_SECRET
# This avoids hardcoding secrets in the script
DATABASE_URL=""
NEXTAUTH_SECRET=""

if [[ -f "$ENV_FILE" ]]; then
    write_info "Reading credentials from $ENV_FILE"
    # Extract values between double quotes for DATABASE_URL and AUTH_SECRET
    DATABASE_URL=$(grep -E '^\s*DATABASE_URL\s*=' "$ENV_FILE" | sed -E 's/.*=\s*"([^"]*)".*/\1/' | head -1)
    NEXTAUTH_SECRET=$(grep -E '^\s*AUTH_SECRET\s*=' "$ENV_FILE" | sed -E 's/.*=\s*"([^"]*)".*/\1/' | head -1)
else
    write_err ".env file not found at $ENV_FILE"
    exit 1
fi

if [[ -z "$DATABASE_URL" || -z "$NEXTAUTH_SECRET" ]]; then
    write_err "Could not find DATABASE_URL or AUTH_SECRET in $ENV_FILE"
    write_err "Make sure the .env file exists with these variables."
    exit 1
fi
write_ok "Credentials loaded from .env"

# ============================================================================
# Step 1: Delete & Recreate Minikube Cluster (or verify existing)
# ============================================================================

if [[ "$SKIP_RECREATE" == true ]]; then
    # ------------------------------------------------------------------
    # --skip-recreate mode: keep the existing cluster, just make sure
    # it's running. This avoids the 2-3 minute teardown + recreate cycle.
    # ------------------------------------------------------------------
    write_step "Step 1: Verify Existing Minikube Cluster (SkipRecreate)"

    # Check if Minikube is running by querying its status.
    # If the host/kubelet/apiserver are stopped, we start the cluster.
    MINIKUBE_STATUS=$(minikube status --format "{{.Host}}" 2>/dev/null || echo "")

    if [[ "$MINIKUBE_STATUS" == "Running" ]]; then
        write_ok "Minikube is already running — skipping recreate"
    else
        # Cluster exists but is stopped — start it without deleting.
        # `minikube start` on an existing stopped cluster resumes it
        # with the same configuration (CPU, memory, K8s version).
        write_info "Minikube is stopped — starting existing cluster..."
        minikube start >/dev/null 2>&1

        if [[ $? -ne 0 ]]; then
            write_err "Failed to start existing Minikube cluster."
            write_err "Run without --skip-recreate to recreate from scratch."
            exit 1
        fi
        write_ok "Existing Minikube cluster started"
    fi
else
    # ------------------------------------------------------------------
    # Default mode: delete and recreate from scratch.
    # ------------------------------------------------------------------
    write_step "Step 1: Delete & Recreate Minikube Cluster"

    # Delete the existing cluster to start fresh.
    # This wipes all deployments, services, PVCs, and configurations.
    # Safe to do because everything is defined in Helm charts and Docker images.
    write_info "Deleting existing Minikube cluster (if any)..."
    minikube delete >/dev/null 2>&1 || true
    write_ok "Old cluster deleted"

    # Create a new cluster with more resources than the default (2 CPU / 2GB).
    # 4 CPUs and 7GB RAM are needed because the final microservices cluster
    # will run 10+ pods simultaneously (task-manager + 8 microservices +
    # MinIO + Meilisearch + monitoring stack).
    #
    # --driver=docker      : Uses Docker Desktop as the VM provider (recommended)
    # --cpus=4             : 4 virtual CPUs allocated to the Minikube VM
    # --memory=7168        : 7 GB RAM (Docker Desktop typically has ~7.9GB available)
    # --kubernetes-version : Pin to v1.35.1 for reproducibility
    write_info "Creating new Minikube cluster ($MINIKUBE_CPU CPUs, $MINIKUBE_MEMORY_MB MB RAM)..."

    minikube start \
        --driver=docker \
        --cpus="$MINIKUBE_CPU" \
        --memory="$MINIKUBE_MEMORY_MB" \
        --kubernetes-version="$KUBERNETES_VERSION" >/dev/null 2>&1

    if [[ $? -ne 0 ]]; then
        write_err "Failed to start Minikube. Check Docker memory allocation."
        exit 1
    fi
    write_ok "Minikube cluster created"
fi

# ============================================================================
# Step 2: Enable NGINX Ingress Controller
# ============================================================================

write_step "Step 2: Enable NGINX Ingress Controller"

# The Ingress controller routes external HTTP traffic to the correct
# Kubernetes Service based on the hostname (task-manager.local).
# Without it, the Ingress resource has no controller to process it.
#
# This addon deploys the ingress-nginx-controller pod in the ingress-nginx
# namespace. It listens on port 80 (and 443 for TLS) inside the cluster.
write_info "Enabling NGINX Ingress addon..."
minikube addons enable ingress >/dev/null 2>&1
write_ok "Ingress controller enabled"

# ============================================================================
# Step 3: Verify Cluster Health
# ============================================================================

write_step "Step 3: Verify Cluster Health"

# Wait for the NGINX Ingress controller pod to be Running.
# This is critical — if the controller isn't up, Ingress resources won't work.
write_info "Waiting for NGINX Ingress controller to be ready..."
kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s >/dev/null 2>&1

if [[ $? -ne 0 ]]; then
    write_err "Ingress controller did not become ready in time"
    exit 1
fi
write_ok "Ingress controller is running"

# Show cluster node info — confirms K8s version and node status (should be "Ready")
NODE_STATUS=$(kubectl get nodes -o jsonpath='{.items[0].status.nodeInfo.kubeletVersion}' 2>/dev/null)
write_ok "Node ready: $NODE_STATUS"

# ============================================================================
# Step 4: Create services/ Directory Structure
# ============================================================================

write_step "Step 4: Create services/ Directory Structure"

# Each microservice gets its own directory under services/.
# This mirrors the Helm template subdirectory structure and keeps
# each service's code (package.json, tsconfig, src/, Dockerfile) isolated.
SERVICES_DIR="${PROJECT_ROOT}/task-manager/services"
SERVICE_NAMES=(
    "notification"    # Module 1: Email/in-app notifications
    "file-service"    # Module 2: File upload/download via MinIO
    "analytics"       # Module 3: Python/FastAPI analytics + reports
    "realtime"        # Module 4: WebSocket gateway (Socket.io)
    "search-sync"     # Module 5: Meilisearch sync service
    "webhook"         # Module 6: Webhook delivery with retry
    "scheduler"       # Module 7: Recurring task CronJob
    "team-service"    # Module 8: Team & workspace management
)

for svc in "${SERVICE_NAMES[@]}"; do
    mkdir -p "${SERVICES_DIR}/${svc}"
done
write_ok "Created ${#SERVICE_NAMES[@]} service directories under services/"

# ============================================================================
# Step 5: Build task-manager Docker Image in Minikube
# ============================================================================

write_step "Step 5: Build task-manager Docker Image"

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
BUILD_CONTEXT="${PROJECT_ROOT}/task-manager"
DOCKERFILE="${BUILD_CONTEXT}/Dockerfile"

write_info "Building image ${APP_NAME}:${APP_TAG} (this takes ~1-2 minutes)..."
write_info "  Context:   $BUILD_CONTEXT"
write_info "  Dockerfile: $DOCKERFILE"

minikube image build -t "${APP_NAME}:${APP_TAG}" -f "$DOCKERFILE" "$BUILD_CONTEXT" >/dev/null 2>&1

if [[ $? -ne 0 ]]; then
    write_err "Docker build failed"
    exit 1
fi
write_ok "Image built: ${APP_NAME}:${APP_TAG}"

# ============================================================================
# Step 6: Deploy task-manager
# ============================================================================

write_step "Step 6: Deploy task-manager via Helm"

# Check if the ServiceMonitor CRD already exists in the cluster.
# On a fresh cluster (Step 1 ran), it won't exist yet — deploy with
# monitoring disabled to avoid a Helm error.
# On an existing cluster (--skip-recreate, monitoring already installed),
# the CRD exists — deploy with monitoring enabled directly.
HAS_MONITORING_CRD=false
if kubectl get crd servicemonitors.monitoring.coreos.com >/dev/null 2>&1; then
    HAS_MONITORING_CRD=true
fi

if [[ "$HAS_MONITORING_CRD" == true ]]; then
    # Monitoring stack already installed — deploy with monitoring ON directly.
    # This skips the disable/enable dance of Steps 7-8 below.
    write_info "Monitoring CRD detected — deploying with monitoring enabled"
    MONITORING_FLAG=true
else
    # Fresh cluster — deploy WITHOUT monitoring first (CRD doesn't exist yet).
    # Step 7 installs the monitoring stack + CRD.
    # Step 8 re-upgrades with monitoring enabled.
    write_info "Monitoring CRD not found — deploying with monitoring disabled (will enable in Step 8)"
    MONITORING_FLAG=false
fi

# `helm upgrade --install` handles both cases:
#   - Fresh release -> installs it
#   - Existing release -> upgrades it
# This makes the script idempotent for --skip-recreate runs.
#
# --set image.pullPolicy=Never
#   Critical for Minikube local dev: tells K8s to NEVER pull from Docker Hub.
#   The image was loaded directly into Minikube's daemon (Step 5), so it
#   exists locally. Without "Never", K8s tries to pull from Docker Hub
#   and gets ImagePullBackOff.
#
# --set monitoring.enabled=$MONITORING_FLAG
#   Conditionally enable the ServiceMonitor template based on CRD existence
#
# --set-string secrets.authTrustHost="true"
#   NextAuth v5 security setting for non-HTTPS environments.
#   MUST use --set-string (not --set) because Helm parses "true" as a boolean,
#   and b64enc in the secret template expects a string.

write_info "Deploying Helm release '$APP_RELEASE' (upgrade --install)..."

helm upgrade --install "$APP_RELEASE" \
    "${PROJECT_ROOT}/task-manager/helm-chart" \
    --namespace "$APP_NAMESPACE" \
    --create-namespace \
    --set image.pullPolicy=Never \
    --set "monitoring.enabled=${MONITORING_FLAG}" \
    --set monitoring.serviceMonitor.scrapeInterval=15s \
    --set monitoring.serviceMonitor.labels.release=monitoring \
    --set "secrets.databaseUrl=${DATABASE_URL}" \
    --set "secrets.nextauthSecret=${NEXTAUTH_SECRET}" \
    --set 'secrets.nextauthUrl=http://task-manager.local' \
    --set-string 'secrets.authTrustHost=true' >/dev/null 2>&1

if [[ $? -ne 0 ]]; then
    write_err "Helm deploy failed"
    exit 1
fi
write_ok "Helm release deployed"

# Wait for the task-manager pod to be Running and pass its readiness probe.
# The readiness probe hits "/" (the Next.js homepage) — if it returns 200,
# the pod is ready to serve traffic.
write_info "Waiting for task-manager pod to be ready..."
kubectl wait --namespace "$APP_NAMESPACE" \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/instance="$APP_RELEASE" \
    --timeout=120s >/dev/null 2>&1

if [[ $? -ne 0 ]]; then
    write_err "task-manager pod did not become ready"
    kubectl get pods -n "$APP_NAMESPACE"
    exit 1
fi
write_ok "task-manager pod is running"

# ============================================================================
# Step 7: Install kube-prometheus-stack (Monitoring) — fresh cluster only
# ============================================================================

# This step only runs on a fresh cluster where the monitoring CRD doesn't
# exist yet. On subsequent runs with --skip-recreate, the CRD already exists
# and Step 6 already deployed task-manager with monitoring enabled.
if [[ "$HAS_MONITORING_CRD" == true ]]; then
    write_step "Step 7: Install Monitoring Stack (skipped — already installed)"
    write_ok "Monitoring stack detected from previous run"
else
    write_step "Step 7: Install Monitoring Stack"

    # Add the Prometheus community Helm chart repository.
    # This is where kube-prometheus-stack is hosted.
    # `helm repo update` fetches the latest chart index.
    write_info "Adding Prometheus Helm repository..."
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
    helm repo update >/dev/null 2>&1
    write_ok "Helm repo updated"

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
    write_info "Installing kube-prometheus-stack (this takes ~2-3 minutes for image pulls)..."

    helm install "$MONITORING_RELEASE" \
        prometheus-community/kube-prometheus-stack \
        --namespace "$MONITORING_NAMESPACE" \
        --create-namespace \
        --set "grafana.adminPassword=${MONITORING_GRAFANA_PWD}" >/dev/null 2>&1

    if [[ $? -ne 0 ]]; then
        write_err "Monitoring stack installation failed"
        exit 1
    fi
    write_ok "Monitoring stack installed"
fi

# Wait for all monitoring pods to be Running.
# Prometheus is the critical one — the operator and Grafana depend on it.
# This wait runs regardless of whether we just installed or already had it,
# to ensure Prometheus is ready before Step 8 tries to create a ServiceMonitor.
write_info "Waiting for Prometheus pod to be ready..."
kubectl wait --namespace "$MONITORING_NAMESPACE" \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/name=prometheus \
    --timeout=300s >/dev/null 2>&1

if [[ $? -ne 0 ]]; then
    write_err "Prometheus pod did not become ready in time"
    write_info "Check pod status: kubectl get pods -n $MONITORING_NAMESPACE"
    exit 1
fi
write_ok "Prometheus is running"

# ============================================================================
# Step 8: Upgrade task-manager with Monitoring Enabled — fresh cluster only
# ============================================================================

# This step only runs on a fresh cluster. On subsequent runs, Step 6 already
# deployed with monitoring enabled.
if [[ "$HAS_MONITORING_CRD" == true ]]; then
    write_step "Step 8: Enable Monitoring for task-manager (skipped — already enabled)"
    write_ok "ServiceMonitor already active from Step 6"
else
    write_step "Step 8: Enable Monitoring for task-manager"

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
    write_info "Upgrading Helm release with monitoring enabled..."

    helm upgrade "$APP_RELEASE" \
        "${PROJECT_ROOT}/task-manager/helm-chart" \
        --namespace "$APP_NAMESPACE" \
        --reuse-values \
        --set monitoring.enabled=true \
        --set monitoring.serviceMonitor.scrapeInterval=15s \
        --set monitoring.serviceMonitor.labels.release=monitoring >/dev/null 2>&1

    if [[ $? -ne 0 ]]; then
        write_err "Helm upgrade failed"
        exit 1
    fi
    write_ok "Monitoring enabled for task-manager"
fi

# ============================================================================
# Step 9: Final Verification
# ============================================================================

write_step "Step 9: Final Verification"

# --- 9a: All task-manager resources ---
write_info "task-manager namespace resources:"
kubectl get all -n "$APP_NAMESPACE"

# --- 9b: ServiceMonitor created ---
if kubectl get servicemonitor -n "$APP_NAMESPACE" 2>/dev/null | grep -q "task-manager"; then
    write_ok "ServiceMonitor created"
else
    write_err "ServiceMonitor not found"
fi

# --- 9c: Metrics endpoint responding ---
# Test the /api/metrics endpoint from inside the pod.
# We use Node.js fetch() because the minimal Next.js standalone image
# doesn't include curl or wget.
write_info "Testing /api/metrics endpoint..."
METRICS_OUTPUT=$(kubectl exec -n "$APP_NAMESPACE" deployment/"$APP_RELEASE" \
    -- node -e "fetch('http://localhost:3000/api/metrics').then(r=>r.text()).then(t=>console.log(t.split('\n')[0]))" 2>/dev/null || echo "")

if echo "$METRICS_OUTPUT" | grep -q "HELP"; then
    write_ok "Metrics endpoint responding (prom-client format)"
else
    write_err "Metrics endpoint not responding correctly"
fi

# --- 9d: Prometheus scraping task-manager ---
# Check that Prometheus has discovered our ServiceMonitor and is actively
# scraping the /api/metrics endpoint. We port-forward Prometheus to localhost
# temporarily and query its targets API.
write_info "Checking if Prometheus is scraping task-manager..."

# Start a background port-forward to Prometheus (port 9090)
kubectl port-forward -n "$MONITORING_NAMESPACE" \
    svc/monitoring-kube-prometheus-prometheus 9090:9090 >/dev/null 2>&1 &
PF_PID=$!

sleep 3

cleanup_port_forward() {
    kill "$PF_PID" >/dev/null 2>&1 || true
}
trap cleanup_port_forward EXIT

# Query Prometheus targets API
if command -v curl >/dev/null 2>&1; then
    PROMETHEUS_RESPONSE=$(curl -s "http://localhost:9090/api/v1/targets" 2>/dev/null || echo "")
else
    PROMETHEUS_RESPONSE=$(wget -qO- "http://localhost:9090/api/v1/targets" 2>/dev/null || echo "")
fi

if [[ -n "$PROMETHEUS_RESPONSE" ]]; then
    # Check if any active target contains "task" in its scrapeUrl and has health "up"
    TASK_UP=$(echo "$PROMETHEUS_RESPONSE" | grep -o '"scrapeUrl":"[^"]*task[^"]*"' || echo "")
    TASK_HEALTH=$(echo "$PROMETHEUS_RESPONSE" | grep -o '"scrapeUrl":"[^"]*task[^"]*"' | head -1 | grep -o '"health":"[^"]*"' || echo "")

    if [[ -n "$TASK_UP" ]]; then
        if echo "$TASK_HEALTH" | grep -q '"health":"up"'; then
            write_ok "Prometheus target is UP"
        else
            write_info "Prometheus target found but health is: $TASK_HEALTH"
            write_info "  (may take 15-30s for first scrape — re-check later)"
        fi
    else
        write_info "Prometheus has not discovered the target yet"
        write_info "  (ServiceMonitor discovery can take up to 30s — re-check later)"
    fi
else
    write_info "Could not query Prometheus API (port-forward may need more time)"
fi

cleanup_port_forward

# --- 9e: Cluster resource overview ---
write_info "Cluster pod count by namespace:"
for ns in kube-system ingress-nginx "$APP_NAMESPACE" "$MONITORING_NAMESPACE"; do
    POD_COUNT=$(kubectl get pods -n "$ns" --no-headers 2>/dev/null | wc -l)
    echo -e "    \033[90m$ns : $POD_COUNT pods\033[0m"
done

# ============================================================================
# Done
# ============================================================================

write_step "Setup Complete!"

cat << 'EOF'
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
EOF

echo ""
echo -e "  \033[90mUsage:\033[0m"
echo -e "    \033[90mFull teardown + rebuild:  ./setup-cluster.sh\033[0m"
echo -e "    \033[90mReuse existing cluster:   ./setup-cluster.sh --skip-recreate\033[0m"
echo ""
echo -e "  \033[90mTo tear down everything:\033[0m"
echo -e "    \033[90mminikube delete\033[0m"
echo ""
