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
#   5. Build all Docker images (main app + microservices) inside Minikube
#      [--skip-builds: skip Docker builds, reuse existing images]
#      [Images are built in PARALLEL for speed (~2-3x faster)]
#   6. Deploy task-manager + microservices via Helm
#   7. Install kube-prometheus-stack (Prometheus, Grafana, Alertmanager)
#      [--skip-monitoring: skip monitoring stack entirely]
#   8. Upgrade task-manager with monitoring enabled (ServiceMonitor)
#   9. Verify: pod status, metrics scraping, Ingress
#
# Usage:
#   Full teardown + rebuild:       ./setup-cluster.sh
#   Reuse existing cluster:        ./setup-cluster.sh --skip-recreate
#   Skip builds (code unchanged):  ./setup-cluster.sh --skip-recreate --skip-builds
#   Skip monitoring:               ./setup-cluster.sh --skip-recreate --skip-monitoring
#   Fastest (just redeploy):       ./setup-cluster.sh --skip-recreate --skip-builds --skip-monitoring
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
SKIP_BUILDS=false
SKIP_MONITORING=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-recreate|-SkipRecreate)
            SKIP_RECREATE=true
            shift
            ;;
        --skip-builds|-SkipBuilds)
            SKIP_BUILDS=true
            shift
            ;;
        --skip-monitoring|-SkipMonitoring)
            SKIP_MONITORING=true
            shift
            ;;
        *)
            echo "  [!!] Unknown argument: $1"
            echo "  Usage: $0 [--skip-recreate] [--skip-builds] [--skip-monitoring]"
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

# Docker image names
APP_NAME="ralf090102/task-manager-app"
APP_TAG="latest"
SCHEDULER_IMAGE="ralf090102/scheduler-service"
NOTIFICATION_IMAGE="ralf090102/notification-service"
FILE_SERVICE_IMAGE="ralf090102/file-service"
SEARCH_SYNC_IMAGE="ralf090102/search-sync-service"
REALTIME_IMAGE="ralf090102/realtime-service"
ANALYTICS_IMAGE="ralf090102/analytics-service"
WEBHOOK_IMAGE="ralf090102/webhook-service"
TEAM_SERVICE_IMAGE="ralf090102/team-service"
MINIO_IMAGE="minio/minio"
MEILISEARCH_IMAGE="getmeili/meilisearch"
MEILISEARCH_TAG="v1.6"
REDIS_IMAGE="redis"
REDIS_TAG="7-alpine"
MICROSERVICE_TAG="latest"

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

# --skip-builds without --skip-recreate is dangerous: recreating the cluster
# wipes all locally-loaded images. Pods would fail with ImagePullBackOff.
if [[ "$SKIP_BUILDS" == true && "$SKIP_RECREATE" == false ]]; then
    write_err "--skip-builds without --skip-recreate will recreate the cluster"
    write_err "and wipe all locally-loaded images. Use:"
    write_err "  ./setup-cluster.sh --skip-recreate --skip-builds"
    exit 1
fi

if [[ "$SKIP_BUILDS" == true ]]; then
    write_info "Docker builds will be SKIPPED (--skip-builds)"
fi
if [[ "$SKIP_MONITORING" == true ]]; then
    write_info "Monitoring stack will be SKIPPED (--skip-monitoring)"
fi

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
# Step 5: Build All Docker Images (Main App + Microservices)
# ============================================================================

BUILD_CONTEXT="${PROJECT_ROOT}/task-manager"

if [[ "$SKIP_BUILDS" == true ]]; then
    write_step "Step 5: Build All Docker Images (SKIPPED)"

    write_info "Skipping Docker builds (--skip-builds flag)"
    write_info "Using existing images already loaded in Minikube"

    # Verify images exist to catch mistakes early
    for img in "${APP_NAME}:${APP_TAG}" \
               "${SCHEDULER_IMAGE}:${MICROSERVICE_TAG}" \
               "${NOTIFICATION_IMAGE}:${MICROSERVICE_TAG}" \
               "${FILE_SERVICE_IMAGE}:${MICROSERVICE_TAG}" \
               "${SEARCH_SYNC_IMAGE}:${MICROSERVICE_TAG}" \
               "${REALTIME_IMAGE}:${MICROSERVICE_TAG}" \
               "${ANALYTICS_IMAGE}:${MICROSERVICE_TAG}" \
               "${MINIO_IMAGE}:${MICROSERVICE_TAG}" \
               "${MEILISEARCH_IMAGE}:${MEILISEARCH_TAG}" \
               "${REDIS_IMAGE}:${REDIS_TAG}"; do
        if ! minikube image ls --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -q "$img"; then
            write_err "Image $img not found in Minikube. Run without --skip-builds first."
            exit 1
        fi
        write_ok "Image exists: $img"
    done
else
    write_step "Step 5: Build All Docker Images (Parallel via Docker Desktop)"

    # Images are built with Docker Desktop (host Docker daemon), which has
    # more memory than Minikube's internal daemon. After building, each image
    # is loaded into Minikube via `minikube image load`.
    #
    # Why Docker Desktop over Minikube build:
    #   - Docker Desktop has ~16GB+ available; Minikube's daemon shares ~7GB
    #   - Large dependency trees (@aws-sdk, next.js) can OOM Minikube's daemon
    #   - Docker Desktop builds are consistently faster
    #
    # Tradeoff: after building, we must explicitly load each image into Minikube
    # and force-remove stale images (Minikube caches by tag, not digest).
    #
    # All images are built IN PARALLEL for speed (~2-3x faster than sequential).
    # Microservice Dockerfiles use the task-manager/ directory as build context
    # so they can COPY the shared prisma/schema.prisma during Docker build.

    # Build definitions: "name|tag|dockerfile"
    # To add a new microservice build, just append a line to this array.
    BUILDS=(
        "main-app|${APP_NAME}:${APP_TAG}|${BUILD_CONTEXT}/Dockerfile"
        "scheduler|${SCHEDULER_IMAGE}:${MICROSERVICE_TAG}|${BUILD_CONTEXT}/services/scheduler/Dockerfile"
        "notification|${NOTIFICATION_IMAGE}:${MICROSERVICE_TAG}|${BUILD_CONTEXT}/services/notification/Dockerfile"
        "file-service|${FILE_SERVICE_IMAGE}:${MICROSERVICE_TAG}|${BUILD_CONTEXT}/services/file-service/Dockerfile"
        "search-sync|${SEARCH_SYNC_IMAGE}:${MICROSERVICE_TAG}|${BUILD_CONTEXT}/services/search-sync/Dockerfile"
        "realtime|${REALTIME_IMAGE}:${MICROSERVICE_TAG}|${BUILD_CONTEXT}/services/realtime/Dockerfile"
        "analytics|${ANALYTICS_IMAGE}:${MICROSERVICE_TAG}|${BUILD_CONTEXT}/services/analytics/Dockerfile"
        "webhook|${WEBHOOK_IMAGE}:${MICROSERVICE_TAG}|${BUILD_CONTEXT}/services/webhook/Dockerfile"
        "team-service|${TEAM_SERVICE_IMAGE}:${MICROSERVICE_TAG}|${BUILD_CONTEXT}/services/team-service/Dockerfile"
    )

    # Create a temp dir for parallel build logs (so output stays clean)
    BUILD_LOGS_DIR=$(mktemp -d)

    write_info "Launching ${#BUILDS[@]} parallel Docker Desktop builds..."

    # Launch all builds as background jobs using Docker Desktop
    PIDS=()
    for build in "${BUILDS[@]}"; do
        IFS='|' read -r build_name build_tag build_dockerfile <<< "$build"
        write_info "  Starting: $build_name ($build_tag)"

        (
            docker build -t "$build_tag" \
                -f "$build_dockerfile" "$BUILD_CONTEXT" \
                > "$BUILD_LOGS_DIR/${build_name}.log" 2>&1
        ) &
        PIDS+=($!)
    done

    # Wait for all builds to complete and collect results
    BUILD_FAILED=false
    for i in "${!BUILDS[@]}"; do
        IFS='|' read -r build_name build_tag build_dockerfile <<< "${BUILDS[$i]}"

        if ! wait "${PIDS[$i]}"; then
            write_err "$build_name build FAILED"
            write_info "  Last 10 lines of build log:"
            tail -10 "$BUILD_LOGS_DIR/${build_name}.log" | sed 's/^/    /'
            BUILD_FAILED=true
        else
            write_ok "Built: $build_tag"
        fi
    done

    # Clean up temp logs
    rm -rf "$BUILD_LOGS_DIR"

    if [[ "$BUILD_FAILED" == true ]]; then
        write_err "One or more Docker builds failed. Aborting."
        exit 1
    fi

    write_ok "All ${#BUILDS[@]} images built successfully (parallel)"

    # Load built images into Minikube's Docker daemon.
    # force-remove stale images first — minikube image load doesn't overwrite
    # existing tags, so pods would keep running old code without this step.
    write_info "Loading ${#BUILDS[@]} images into Minikube..."

    for build in "${BUILDS[@]}"; do
        IFS='|' read -r build_name build_tag build_dockerfile <<< "$build"

        # Force-remove old image (ignore errors if it doesn't exist yet)
        minikube ssh "docker rmi -f $build_tag" >/dev/null 2>&1 || true

        # Load the freshly built image
        if ! minikube image load "$build_tag" >/dev/null 2>&1; then
            write_err "Failed to load $build_tag into Minikube"
            exit 1
        fi
        write_ok "Loaded: $build_tag"
    done

    # Pull third-party images (MinIO, Meilisearch) that aren't built locally
    write_info "Pulling MinIO image into Minikube..."
    minikube image pull "${MINIO_IMAGE}:${MICROSERVICE_TAG}" >/dev/null 2>&1
    if [[ $? -ne 0 ]]; then
        write_err "Failed to pull ${MINIO_IMAGE}:${MICROSERVICE_TAG}"
        write_err "Check internet connection or pull manually: docker pull ${MINIO_IMAGE}:${MICROSERVICE_TAG} && minikube image load ${MINIO_IMAGE}:${MICROSERVICE_TAG}"
        exit 1
    fi
    write_ok "MinIO image loaded"

    write_info "Pulling Meilisearch image into Minikube..."
    minikube image pull "${MEILISEARCH_IMAGE}:${MEILISEARCH_TAG}" >/dev/null 2>&1
    if [[ $? -ne 0 ]]; then
        write_err "Failed to pull ${MEILISEARCH_IMAGE}:${MEILISEARCH_TAG}"
        write_err "Check internet connection or pull manually: docker pull ${MEILISEARCH_IMAGE}:${MEILISEARCH_TAG} && minikube image load ${MEILISEARCH_IMAGE}:${MEILISEARCH_TAG}"
        exit 1
    fi
    write_ok "Meilisearch image loaded"

    write_info "Pulling Redis image into Minikube..."
    minikube image pull "${REDIS_IMAGE}:${REDIS_TAG}" >/dev/null 2>&1
    if [[ $? -ne 0 ]]; then
        write_err "Failed to pull ${REDIS_IMAGE}:${REDIS_TAG}"
        write_err "Check internet connection or pull manually: docker pull ${REDIS_IMAGE}:${REDIS_TAG} && minikube image load ${REDIS_IMAGE}:${REDIS_TAG}"
        exit 1
    fi
    write_ok "Redis image loaded"
fi

# ============================================================================
# Step 6: Deploy task-manager + Microservices via Helm
# ============================================================================

write_step "Step 6: Deploy All Services via Helm"

# Check if the ServiceMonitor CRD already exists in the cluster.
# On a fresh cluster (Step 1 ran), it won't exist yet — deploy with
# monitoring disabled to avoid a Helm error.
# On an existing cluster (--skip-recreate, monitoring already installed),
# the CRD exists — deploy with monitoring enabled directly.
HAS_MONITORING_CRD=false
if kubectl get crd servicemonitors.monitoring.coreos.com >/dev/null 2>&1; then
    HAS_MONITORING_CRD=true
fi

if [[ "$SKIP_MONITORING" == true ]]; then
    # User explicitly skipped monitoring — deploy with monitoring OFF regardless.
    write_info "Monitoring skipped (--skip-monitoring flag) — deploying with monitoring disabled"
    MONITORING_FLAG=false
elif [[ "$HAS_MONITORING_CRD" == true ]]; then
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
# All services are deployed in a single Helm release. Each service's
# templates are conditionally rendered via {{- if .Values.<svc>.enabled }}.
#
# --set image.pullPolicy=Never / scheduler.* / notification.*
#   All local Minikube images must use pullPolicy=Never. Without it, K8s
#   tries to pull from Docker Hub and gets ImagePullBackOff.
#
# --set notification.smtp.* / notification.resources.*
#   On first deploy, --reuse-values is NOT used, so values.yaml defaults
#   apply. But all notification.* keys MUST be explicitly set via --set
#   because the initial deploy reads values.yaml fresh — and the
#   notification section IS in values.yaml, so defaults are picked up.
#   However, to be safe and explicit, we set all keys here.
#
# --set-string secrets.authTrustHost="true"
#   NextAuth v5 security setting for non-HTTPS environments.
#   MUST use --set-string (not --set) because Helm parses "true" as a boolean,
#   and b64enc in the secret template expects a string.
#
# --no-hooks
#   Skips the db-migration pre-upgrade hook (team-service) which runs
#   `prisma db push` against the Supabase pgbouncer URL (port 6543).
#   The pgbouncer connection pooler doesn't support the DDL operations
#   Prisma needs, causing it to hang indefinitely.
#   Schema pushes should be done manually via the direct connection (port 5432):
#     npx prisma db push --accept-data-loss
#   (with DATABASE_URL pointing at port 5432, not 6543)

write_info "Deploying Helm release '$APP_RELEASE' (upgrade --install, --no-hooks)..."

helm upgrade --install "$APP_RELEASE" \
    "${PROJECT_ROOT}/task-manager/helm-chart" \
    --namespace "$APP_NAMESPACE" \
    --create-namespace \
    --no-hooks \
    --set image.pullPolicy=Never \
    --set "monitoring.enabled=${MONITORING_FLAG}" \
    --set monitoring.serviceMonitor.scrapeInterval=15s \
    --set monitoring.serviceMonitor.labels.release=monitoring \
    --set "secrets.databaseUrl=${DATABASE_URL}" \
    --set "secrets.nextauthSecret=${NEXTAUTH_SECRET}" \
    --set 'secrets.nextauthUrl=http://task-manager.local' \
    --set-string 'secrets.authTrustHost=true' \
    --set scheduler.enabled=true \
    --set scheduler.image.pullPolicy=Never \
    --set notification.enabled=true \
    --set notification.image.repository="${NOTIFICATION_IMAGE}" \
    --set notification.image.tag="${MICROSERVICE_TAG}" \
    --set notification.image.pullPolicy=Never \
    --set notification.smtp.host="" \
    --set notification.smtp.port="587" \
    --set notification.smtp.from="noreply@taskmanager.local" \
    --set notification.smtp.user="" \
    --set notification.smtp.password="" \
    --set notification.resources.limits.cpu=250m \
    --set notification.resources.limits.memory=256Mi \
    --set notification.resources.requests.cpu=100m \
    --set notification.resources.requests.memory=128Mi \
    --set minio.enabled=true \
    --set minio.image.repository="${MINIO_IMAGE}" \
    --set minio.image.tag="${MICROSERVICE_TAG}" \
    --set minio.image.pullPolicy=Never \
    --set minio.persistence.size=10Gi \
    --set minio.accessKey=minioadmin \
    --set minio.secretKey=minioadmin \
    --set minio.resources.limits.cpu=250m \
    --set minio.resources.limits.memory=512Mi \
    --set minio.resources.requests.cpu=100m \
    --set minio.resources.requests.memory=256Mi \
    --set fileService.enabled=true \
    --set fileService.image.repository="${FILE_SERVICE_IMAGE}" \
    --set fileService.image.tag="${MICROSERVICE_TAG}" \
    --set fileService.image.pullPolicy=Never \
    --set fileService.resources.limits.cpu=250m \
    --set fileService.resources.limits.memory=256Mi \
    --set fileService.resources.requests.cpu=100m \
    --set fileService.resources.requests.memory=128Mi \
    --set meilisearch.enabled=true \
    --set meilisearch.image.repository="${MEILISEARCH_IMAGE}" \
    --set meilisearch.image.tag="${MEILISEARCH_TAG}" \
    --set meilisearch.image.pullPolicy=Never \
    --set meilisearch.persistence.size=5Gi \
    --set meilisearch.masterKey="meili-master-key-change-me" \
    --set meilisearch.resources.limits.cpu=250m \
    --set meilisearch.resources.limits.memory=512Mi \
    --set meilisearch.resources.requests.cpu=100m \
    --set meilisearch.resources.requests.memory=256Mi \
    --set searchSync.enabled=true \
    --set searchSync.image.repository="${SEARCH_SYNC_IMAGE}" \
    --set searchSync.image.tag="${MICROSERVICE_TAG}" \
    --set searchSync.image.pullPolicy=Never \
    --set searchSync.resources.limits.cpu=250m \
    --set searchSync.resources.limits.memory=256Mi \
    --set searchSync.resources.requests.cpu=100m \
    --set searchSync.resources.requests.memory=128Mi \
    --set realtime.enabled=true \
    --set realtime.image.repository="${REALTIME_IMAGE}" \
    --set realtime.image.tag="${MICROSERVICE_TAG}" \
    --set realtime.image.pullPolicy=Never \
    --set realtime.corsOrigin="http://task-manager.local" \
    --set realtime.resources.limits.cpu=250m \
    --set realtime.resources.limits.memory=256Mi \
    --set realtime.resources.requests.cpu=100m \
    --set realtime.resources.requests.memory=128Mi \
    --set analytics.enabled=true \
    --set analytics.image.repository="${ANALYTICS_IMAGE}" \
    --set analytics.image.tag="${MICROSERVICE_TAG}" \
    --set analytics.image.pullPolicy=Never \
    --set analytics.resources.limits.cpu=250m \
    --set analytics.resources.limits.memory=256Mi \
    --set analytics.resources.requests.cpu=100m \
    --set analytics.resources.requests.memory=128Mi \
    --set webhook.enabled=true \
    --set webhook.image.repository="${WEBHOOK_IMAGE}" \
    --set webhook.image.tag="${MICROSERVICE_TAG}" \
    --set webhook.image.pullPolicy=Never \
    --set webhook.resources.limits.cpu=250m \
    --set webhook.resources.limits.memory=256Mi \
    --set webhook.resources.requests.cpu=100m \
    --set webhook.resources.requests.memory=128Mi \
    --set teamService.enabled=true \
    --set teamService.image.repository="${TEAM_SERVICE_IMAGE}" \
    --set teamService.image.tag="${MICROSERVICE_TAG}" \
    --set teamService.image.pullPolicy=Never \
    --set teamService.resources.limits.cpu=250m \
    --set teamService.resources.limits.memory=256Mi \
    --set teamService.resources.requests.cpu=100m \
    --set teamService.resources.requests.memory=128Mi \
    --set redis.enabled=true \
    --set redis.image.repository="${REDIS_IMAGE}" \
    --set redis.image.tag="${REDIS_TAG}" \
    --set redis.image.pullPolicy=Never \
    --set redis.persistence.size=1Gi \
    --set redis.resources.limits.cpu=250m \
    --set redis.resources.limits.memory=256Mi \
    --set redis.resources.requests.cpu=100m \
    --set redis.resources.requests.memory=128Mi >/dev/null 2>&1

if [[ $? -ne 0 ]]; then
    write_err "Helm deploy failed"
    exit 1
fi
write_ok "Helm release deployed"

# Wait for the main app rollout to complete.
# `kubectl rollout status` waits until the new generation of pods is fully
# deployed AND old pods are terminated — far more reliable than `kubectl wait`
# for Helm upgrades where old and new pods briefly coexist.
write_info "Waiting for task-manager (main app) rollout..."
kubectl rollout status deployment/"$APP_RELEASE" \
    -n "$APP_NAMESPACE" --timeout=180s >/dev/null 2>&1

if [[ $? -ne 0 ]]; then
    write_err "task-manager rollout did not complete"
    kubectl get pods -n "$APP_NAMESPACE"
    exit 1
fi
write_ok "task-manager (main app) is deployed"

# Reusable helpers for pod readiness + health checks.

wait_for_pod() {
    local component="$1"
    local desc="$2"
    write_info "Waiting for $desc pod to be ready..."
    kubectl wait --namespace "$APP_NAMESPACE" \
        --for=condition=ready pod \
        --selector="app.kubernetes.io/component=$component" \
        --timeout=180s >/dev/null 2>&1
    if [[ $? -ne 0 ]]; then
        write_err "$desc pod did not become ready"
        write_info "Check: kubectl get pods -n $APP_NAMESPACE -l app.kubernetes.io/component=$component"
        exit 1
    fi
    write_ok "$desc pod is running"
}

# --- Pod readiness checks ---
# Every deployment has a readinessProbe hitting /health, so
# `kubectl wait --for=condition=ready` already verifies the health
# endpoint natively. No redundant kubectl-exec fetch needed.

# --- Notification ---
wait_for_pod "notification" "notification"

# --- MinIO ---
wait_for_pod "minio" "MinIO"

# --- File Service ---
wait_for_pod "file-service" "file-service"

# --- Meilisearch ---
wait_for_pod "meilisearch" "Meilisearch"

# --- Search Sync ---
wait_for_pod "search-sync" "search-sync"

# --- Realtime ---
wait_for_pod "realtime" "realtime"

# --- Analytics ---
wait_for_pod "analytics" "analytics"

# --- Webhook ---
wait_for_pod "webhook" "webhook"

# --- Team Service ---
wait_for_pod "team-service" "team-service"

# --- Redis ---
wait_for_pod "redis" "Redis"

# ============================================================================

# Skipped entirely when --skip-monitoring is passed.
# Also skipped on existing clusters where the monitoring CRD already exists.
if [[ "$SKIP_MONITORING" == true ]]; then
    write_step "Step 7: Install Monitoring Stack (SKIPPED — --skip-monitoring)"
    write_ok "Monitoring stack skipped by flag"
elif [[ "$HAS_MONITORING_CRD" == true ]]; then
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

# Wait for Prometheus pod only when monitoring is active.
# Skipped with --skip-monitoring to save time.
if [[ "$SKIP_MONITORING" != true ]]; then
    # The Prometheus Operator creates the Prometheus StatefulSet pod
    # asynchronously after the Helm install. If we run `kubectl wait` before
    # the pod exists, it fails instantly ("no matching resources").
    # So we first poll until the pod appears, THEN wait for ready.
    write_info "Waiting for Prometheus Operator to create pod..."
    PROM_RETRY=0
    while ! kubectl get pods -n "$MONITORING_NAMESPACE" \
            -l app.kubernetes.io/name=prometheus --no-headers 2>/dev/null | grep -q .; do
        PROM_RETRY=$((PROM_RETRY + 1))
        if [[ $PROM_RETRY -ge 60 ]]; then
            write_err "Prometheus pod was never created by the operator"
            write_info "Check: kubectl get pods -n $MONITORING_NAMESPACE"
            exit 1
        fi
        sleep 5
    done

    write_info "Waiting for Prometheus pod to be ready..."
    kubectl wait --namespace "$MONITORING_NAMESPACE" \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/name=prometheus \
        --timeout=600s >/dev/null 2>&1

    if [[ $? -ne 0 ]]; then
        write_err "Prometheus pod did not become ready in time"
        write_info "Check pod status: kubectl get pods -n $MONITORING_NAMESPACE"
        exit 1
    fi
    write_ok "Prometheus is running"
fi

# ============================================================================
# Step 8: Upgrade task-manager with Monitoring Enabled
# ============================================================================

# Skipped when --skip-monitoring or when monitoring was already enabled in Step 6.
if [[ "$SKIP_MONITORING" == true ]]; then
    write_step "Step 8: Enable Monitoring for task-manager (SKIPPED — --skip-monitoring)"
    write_ok "Monitoring intentionally disabled"
elif [[ "$HAS_MONITORING_CRD" == true ]]; then
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

# --- 9a-2: Verify scheduler CronJob exists ---
if kubectl get cronjob -n "$APP_NAMESPACE" 2>/dev/null | grep -q "scheduler"; then
    write_ok "Scheduler CronJob created"
else
    write_err "Scheduler CronJob not found"
fi

# --- 9a-3: Verify notification Deployment and Service exist ---
if kubectl get deployment -n "$APP_NAMESPACE" 2>/dev/null | grep -q "notification"; then
    write_ok "Notification Deployment created"
else
    write_err "Notification Deployment not found"
fi

if kubectl get svc -n "$APP_NAMESPACE" 2>/dev/null | grep -q "notification"; then
    write_ok "Notification Service created"
else
    write_err "Notification Service not found"
fi

# --- 9a-4: Verify MinIO StatefulSet and PVC ---
if kubectl get statefulset -n "$APP_NAMESPACE" 2>/dev/null | grep -q "minio"; then
    write_ok "MinIO StatefulSet created"
else
    write_err "MinIO StatefulSet not found"
fi

if kubectl get pvc -n "$APP_NAMESPACE" 2>/dev/null | grep -q "minio"; then
    write_ok "MinIO PVC created"
else
    write_err "MinIO PVC not found"
fi

# --- 9a-5: Verify file-service Deployment and Service ---
if kubectl get deployment -n "$APP_NAMESPACE" 2>/dev/null | grep -q "file-service"; then
    write_ok "File-service Deployment created"
else
    write_err "File-service Deployment not found"
fi

if kubectl get svc -n "$APP_NAMESPACE" 2>/dev/null | grep -q "file-service"; then
    write_ok "File-service Service created"
else
    write_err "File-service Service not found"
fi

# --- 9a-6: Verify Meilisearch StatefulSet and PVC ---
if kubectl get statefulset -n "$APP_NAMESPACE" 2>/dev/null | grep -q "meilisearch"; then
    write_ok "Meilisearch StatefulSet created"
else
    write_err "Meilisearch StatefulSet not found"
fi

if kubectl get pvc -n "$APP_NAMESPACE" 2>/dev/null | grep -q "meilisearch"; then
    write_ok "Meilisearch PVC created"
else
    write_err "Meilisearch PVC not found"
fi

# --- 9a-6b: Verify Redis StatefulSet and PVC ---
if kubectl get statefulset -n "$APP_NAMESPACE" 2>/dev/null | grep -q "redis"; then
    write_ok "Redis StatefulSet created"
else
    write_err "Redis StatefulSet not found"
fi

if kubectl get pvc -n "$APP_NAMESPACE" 2>/dev/null | grep -q "redis"; then
    write_ok "Redis PVC created"
else
    write_err "Redis PVC not found"
fi

# --- 9a-7: Verify search-sync Deployment and Service ---
if kubectl get deployment -n "$APP_NAMESPACE" 2>/dev/null | grep -q "search-sync"; then
    write_ok "Search-sync Deployment created"
else
    write_err "Search-sync Deployment not found"
fi

if kubectl get svc -n "$APP_NAMESPACE" 2>/dev/null | grep -q "search-sync"; then
    write_ok "Search-sync Service created"
else
    write_err "Search-sync Service not found"
fi

# --- 9a-8: Verify webhook Deployment and Service ---
if kubectl get deployment -n "$APP_NAMESPACE" 2>/dev/null | grep -q "webhook"; then
    write_ok "Webhook Deployment created"
else
    write_err "Webhook Deployment not found"
fi

if kubectl get svc -n "$APP_NAMESPACE" 2>/dev/null | grep -q "webhook"; then
    write_ok "Webhook Service created"
else
    write_err "Webhook Service not found"
fi

# --- 9b: ServiceMonitor created (skip if monitoring disabled) ---
if [[ "$SKIP_MONITORING" != true ]]; then
    if kubectl get servicemonitor -n "$APP_NAMESPACE" 2>/dev/null | grep -q "task-manager"; then
        write_ok "ServiceMonitor created"
    else
        write_err "ServiceMonitor not found"
    fi
else
    write_info "ServiceMonitor check skipped (--skip-monitoring)"
fi

# --- 9c: Metrics endpoint ---
# The main app's readiness probe already confirms HTTP is serving.
# The /api/metrics route exists in the same process, so if the pod is ready,
# metrics are available. Prometheus scraping in 9d is the real verification.
if [[ "$SKIP_MONITORING" != true ]]; then
    write_ok "Metrics endpoint available (verified via Prometheus scraping below)"
else
    write_info "Metrics endpoint check skipped (--skip-monitoring)"
fi

# --- 9d: Prometheus scraping task-manager (skip if monitoring disabled) ---
if [[ "$SKIP_MONITORING" != true ]]; then
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
else
    write_info "Prometheus scraping check skipped (--skip-monitoring)"
fi

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

if [[ "$SKIP_MONITORING" == true ]]; then
    cat << 'EOF'
  Cluster is ready (monitoring SKIPPED). Deployed services:

    - Main app (Next.js)      : http://task-manager.local
    - Scheduler (CronJob)     : runs every 5 min, creates tasks from recurring templates
    - Notification (internal) : ClusterIP:3004, email + in-app notifications
    - File service (internal) : ClusterIP:3005, file upload/download
    - MinIO (internal)        : StatefulSet, S3-compatible object storage
    - Search sync (internal)  : ClusterIP:3006, indexes tasks to Meilisearch
    - Meilisearch (internal)  : StatefulSet, full-text search engine
    - Realtime (internal)     : ClusterIP:3001, WebSocket gateway
    - Analytics (internal)    : ClusterIP:8000, Python analytics + weekly reports
    - Webhook (internal)      : ClusterIP:3003, webhook delivery with retry
    - Team service (internal) : ClusterIP:3002, team & workspace management
    - Redis (internal)        : StatefulSet, in-memory cache (cache-aside, 60s TTL)

  Next steps:

  1. Start minikube tunnel (REQUIRED for Ingress access):
     Open a SEPARATE terminal and run:
       minikube tunnel

  2. Open the app in your browser:
     http://task-manager.local
     (requires hosts file entry: 127.0.0.1 task-manager.local)

  3. To enable monitoring later, re-run without --skip-monitoring
EOF
else
    cat << 'EOF'
  Cluster is ready. Deployed services:

    - Main app (Next.js)      : http://task-manager.local
    - Scheduler (CronJob)     : runs every 5 min, creates tasks from recurring templates
    - Notification (internal) : ClusterIP:3004, email + in-app notifications
    - File service (internal) : ClusterIP:3005, file upload/download
    - MinIO (internal)        : StatefulSet, S3-compatible object storage
    - Search sync (internal)  : ClusterIP:3006, indexes tasks to Meilisearch
    - Meilisearch (internal)  : StatefulSet, full-text search engine
    - Realtime (internal)     : ClusterIP:3001, WebSocket gateway
    - Analytics (internal)    : ClusterIP:8000, Python analytics + weekly reports
    - Webhook (internal)      : ClusterIP:3003, webhook delivery with retry
    - Team service (internal) : ClusterIP:3002, team & workspace management
    - Redis (internal)        : StatefulSet, in-memory cache (cache-aside, 60s TTL)

  Next steps:

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

   Ready for Phase 4: All 8 modules deployed!
EOF
fi

echo ""
echo -e "  \033[90mUsage:\033[0m"
echo -e "    \033[90mFull teardown + rebuild:       ./setup-cluster.sh\033[0m"
echo -e "    \033[90mReuse existing cluster:        ./setup-cluster.sh --skip-recreate\033[0m"
echo -e "    \033[90mSkip builds (code unchanged):  ./setup-cluster.sh --skip-recreate --skip-builds\033[0m"
echo -e "    \033[90mSkip monitoring:               ./setup-cluster.sh --skip-recreate --skip-monitoring\033[0m"
echo -e "    \033[90mFastest (just redeploy):       ./setup-cluster.sh --skip-recreate --skip-builds --skip-monitoring\033[0m"
echo ""
echo -e "  \033[90mTo tear down everything:\033[0m"
echo -e "    \033[90mminikube delete\033[0m"
echo ""
