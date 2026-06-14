# Task Manager Web Application - Agent Roadmap

## Project Overview

**Goal**: Build a production-ready Task Manager application demonstrating full-stack development, containerization, CI/CD, and Kubernetes orchestration.

**Current Status**: Planning phase - no code implementation yet

**Tech Stack Validation**: ✅ **Excellent choice for your DevOps learning goals**

- **Next.js**: Industry-standard for full-stack React apps, strong community support, built-in API routes, excellent performance with SSR/SSG, widely used in production
- **Prisma**: Modern, type-safe ORM with excellent PostgreSQL support, strong migration system, great developer experience
- **Supabase**: Managed PostgreSQL database with built-in authentication, real-time subscriptions, and excellent developer experience
- **Resume Value**: Demonstrates modern web development + DevOps skills highly valued by employers

## Prerequisites & Initial Setup

### Required Tools

```bash
# Node.js (LTS version 18+)
node --version

# npm
npm --version

# Docker Desktop
docker --version

# Docker Compose
docker-compose --version

# Minikube
minikube version

# kubectl
kubectl version

# Git
git --version

# Supabase CLI (optional, for local development)
supabase --version

# PostgreSQL client (optional, for direct db access)
psql --version
```

### Project Initialization

```bash
# Create Next.js app with TypeScript
npx create-next-app@latest task-manager \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

# Navigate to project
cd task-manager

# Initialize Prisma
npx prisma init

# Install additional dependencies
npm install @prisma/client next-auth@beta bcryptjs zod react-hook-form

# Install dev dependencies
npm install -D @types/bcryptjs prisma @types/node

# Install testing libraries
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

## Phase 1: Development Foundation (Weeks 1-2)

### Objectives

- Set up Next.js + TypeScript + Prisma stack
- Implement core CRUD functionality
- Add user authentication
- Establish testing framework

### Step-by-Step Implementation

#### 1.1 Database Schema Design

```bash
# Edit prisma/schema.prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tasks     Task[]
}

model Task {
  id          String   @id @default(uuid())
  title       String
  description String?
  status      TaskStatus @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  dueDate     DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  userId      String
  user        User     @relation(fields: [userId], references: [id])
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  COMPLETED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}
```

```bash
# Generate Prisma client and create migration
npx prisma generate
npx prisma db push

# Verify database setup
npx prisma studio

# Your DATABASE_URL should be in this format (from Supabase):
# postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
# Make sure to set this in your .env file
```

#### 1.2 Authentication Implementation

```typescript
// src/lib/auth.ts - NextAuth configuration
import NextAuth, { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Invalid credentials")
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })
        if (!user || !user.password) {
          throw new Error("Invalid credentials")
        }
        const isValid = await bcrypt.compare(
          credentials.password,
          user.password
        )
        if (!isValid) throw new Error("Invalid credentials")
        return user
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string
      }
      return session
    }
  }
}

export const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

#### 1.3 API Routes Setup

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { authOptions } from "@/lib/auth"
import NextAuth from "next-auth"

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }

// src/app/api/tasks/route.ts - GET (list), POST (create)
// src/app/api/tasks/[id]/route.ts - GET (detail), PUT (update), DELETE

// Example: Create task
import { getServerSession } from "next-auth"
import prisma from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { title, description, status, priority, dueDate } = await req.json()

  const task = await prisma.task.create({
    data: {
      title,
      description,
      status: status || "TODO",
      priority: priority || "MEDIUM",
      dueDate: dueDate ? new Date(dueDate) : null,
      userId: session.user.id
    }
  })

  return NextResponse.json(task, { status: 201 })
}
```

#### 1.4 Frontend Implementation

```typescript
// src/components/TaskList.tsx
// src/components/TaskForm.tsx
// src/app/layout.tsx - authentication wrapper
// src/app/page.tsx - task management interface

// Auth provider setup
import { SessionProvider } from "next-auth/react"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
```

#### 1.5 Testing Setup

```bash
# jest.config.js
module.exports = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom'
}

# jest.setup.js
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
afterEach(cleanup)

# Test examples
# src/components/__tests__/TaskList.test.tsx
```

### Verification & Quality Gates

```bash
# Run linter
npm run lint

# Run type checker
npm run type-check

# Run tests
npm test

# Run all quality checks
npm run quality
```

## Phase 2: Containerization (Weeks 3-4) ⭐ **PRIORITY**

### Objectives

- Understand Docker fundamentals
- Containerize application and database
- Implement Docker Compose orchestration
- Manage environments and dependencies

### Docker Fundamentals

**Key Concepts:**

- **Images**: Read-only templates with application code + dependencies
- **Containers**: Running instances of images
- **Volumes**: Persistent storage that survives container restarts
- **Networks**: Isolated communication channels between containers

### Step-by-Step Implementation

#### 2.1 Next.js Dockerfile (Multi-Stage)

```dockerfile
# development.Dockerfile
FROM node:18-alpine AS development

WORKDIR /app

COPY package*.json ./
COPY . .

RUN npm ci

ENV NEXT_TELEMETRY_DISABLED 1

# Expose port
EXPOSE 3000

# Start dev server
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]

# production.Dockerfile
FROM node:18-alpine AS production

WORKDIR /app

COPY package*.json ./
COPY . .

RUN npm ci --only=production

ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

#### 2.2 Docker Compose Configuration

```dockerfile
# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: task-manager-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - task-manager-network

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: task-manager-app
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: redis://redis:6379
      NEXTAUTH_URL: http://localhost:3000
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
    ports:
      - "3000:3000"
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./src:/app/src
      - ./public:/app/public
    networks:
      - task-manager-network

volumes:
  redis_data:

networks:
  task-manager-network:
    driver: bridge
```

#### 2.3 Environment Configuration

```bash
# .env.local
# Supabase DATABASE_URL format:
# postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
REDIS_URL=redis://localhost:6379
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-super-secret-key-change-this-in-production

# .env.production
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
REDIS_URL=redis://redis:6379
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-production-secret-key

# .dockerignore
node_modules
.next
.git
.env
.env.local
.env.*.local
coverage
dist
build
```

#### 2.4 Docker Compose Commands

```bash
# Development setup
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Production build
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# View logs
docker-compose logs -f app
docker-compose logs -f redis

# Stop all containers
docker-compose down

# Stop and remove volumes (destructive!)
docker-compose down -v

# View running containers
docker-compose ps

# Execute command in container
docker-compose exec app npm run dev

# Rebuild without cache
docker-compose build --no-cache
```

#### 2.5 Verification & Best Practices

**Health Checks:**

```bash
# Verify all services are healthy
docker-compose ps

# Check container logs for errors
docker-compose logs

# Test application
curl http://localhost:3000

# Run security scan
docker scan task-manager-app:latest

# Test Supabase connection (optional, requires psql)
psql $DATABASE_URL -c "SELECT version();"
```

**Best Practices:**

- Use multi-stage builds to minimize image size
- Always include `.dockerignore` to reduce build context
- Set proper resource limits: `deploy.resources.limits.memory`
- Use health checks for dependency management
- Separate development and production configurations
- Implement secret management (Docker Secrets or environment variables)
- Regular image updates for security patches

**Common Pitfalls:**

- ❌ Mounting entire project directory (too large)
- ❌ Not using volumes for persistent data
- ❌ Hardcoding secrets in Dockerfiles
- ❌ Forgetting to expose ports correctly

## Phase 3: CI/CD Pipeline (Weeks 5-6) ⭐ **PRIORITY**

### Objectives

- Automate testing and validation
- Build container images
- Implement security scanning
- Enable automated deployment
- Understand GitOps principles

### Step-by-Step Implementation

#### 3.1 GitHub Actions Workflow Structure

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  DOCKER_IMAGE: task-manager-app
  DOCKER_REGISTRY: docker.io/yourusername
  NODE_VERSION: '18'

jobs:
  # Job 1: Quality Checks
  quality:
    name: Quality Gates
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Run tests
        run: npm test -- --coverage --watchAll=false

      - name: Upload coverage
        uses: codecov/codecov-action@v3

  # Job 2: Security Scanning
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: 'trivy-results.sarif'

  # Job 3: Build Docker Image
  build:
    name: Build Docker Image
    runs-on: ubuntu-latest
    needs: [quality, security]
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.DOCKER_REGISTRY }}/${{ env.DOCKER_IMAGE }}

      - name: Build and push image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # Job 4: Deploy to Kubernetes
  deploy:
    name: Deploy to Kubernetes
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    environment:
      name: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    steps:
      - uses: actions/checkout@v4

      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          config-path: ./.kube/config
          context: ${{ secrets.K8S_CONTEXT }}

      - name: Deploy with Helm
        run: |
          helm upgrade --install task-manager ./helm-chart \
            --namespace task-manager \
            --create-namespace \
            --set image.repository=${{ env.DOCKER_REGISTRY }}/${{ env.DOCKER_IMAGE }} \
            --set image.tag=${{ github.sha }} \
            --set image.pullPolicy=IfNotPresent

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/task-manager -n task-manager
          kubectl get pods -n task-manager
```

#### 3.2 GitHub Secrets Configuration

```bash
# In GitHub repository settings:
# Settings > Secrets and variables > Actions

# Required secrets:
- DOCKER_USERNAME: Your Docker Hub username
- DOCKER_PASSWORD: Your Docker Hub access token
- DATABASE_URL: Your Supabase connection string
- NEXTAUTH_SECRET: Generate with: openssl rand -base64 32
- K8S_CONTEXT: Your kubectl context name (for local Minikube)
```

#### 3.3 GitHub Actions Commands

```bash
# Trigger pipeline manually (if disabled on push)
gh workflow run ci-cd.yml

# View workflow runs
gh run list

# View specific run
gh run view <run-id>

# Retry failed workflow
gh run rerun <run-id>

# Download artifacts from workflow
gh run download <run-id>
```

#### 3.4 Verification & Best Practices

**Quality Gates:**

```bash
# Check if pipeline failed (CI/CD must pass)
gh run list --workflow=ci-cd.yml --limit=5

# Verify security scan passed
gh run view --log
```

**Pipeline Best Practices:**

- Cache npm dependencies to speed up builds
- Use matrix builds for multi-platform support (amd64, arm64)
- Implement branch protection rules (no direct commits to main)
- Use environment secrets for sensitive data
- Separate staging and production deployments
- Implement automatic rollback on deployment failure
- Add deployment notifications (Slack, email, etc.)

**Common Pitfalls:**

- ❌ Forgetting to push secrets
- ❌ Using hardcoded credentials in workflow files
- ❌ Not checking database migrations in CI
- ❌ Skipping security scans in CI
- ❌ Not testing deployment to staging first

## Phase 4: Kubernetes Deployment (Weeks 7-8) ⭐ **PRIORITY**

### Objectives

- Understand Kubernetes fundamentals
- Deploy application to Kubernetes
- Implement Helm chart
- Configure networking and services
- Set up monitoring and scaling

### Kubernetes Fundamentals

**Key Concepts:**

- **Pods**: Smallest deployable units (containers)
- **Services**: Stable network endpoints for pods
- **Deployments**: Manage pod replicas and updates
- **Ingress**: External access routing
- **ConfigMap**: Configuration data
- **Secrets**: Sensitive configuration data
- **StatefulSet**: Deployments for stateful applications
- **Horizontal Pod Autoscaler**: Auto-scaling based on metrics

### Step-by-Step Implementation

#### 4.1 Minikube Setup

```bash
# Install Minikube (if not already installed)
# macOS: brew install minikube
# Windows: winget install minikube
# Linux: curl -Lo minikube https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64 && chmod +x minikube && sudo mv minikube /usr/local/bin/

# Start Minikube with proper settings
minikube start \
  --driver=docker \
  --cpus=4 \
  --memory=8192 \
  --dns-enhancer \
  --ingress-class=nginx

# Enable ingress addon
minikube addons enable ingress

# Enable metrics server (for HPA)
minikube addons enable metrics-server

# Verify installation
kubectl cluster-info
kubectl get nodes
```

#### 4.2 Helm Chart Structure

```bash
# Initialize Helm
helm create helm-chart

# Rename and organize chart
# helm-chart/
# ├── Chart.yaml
# ├── values.yaml
# ├── values-dev.yaml
# ├── values-prod.yaml
# ├── templates/
# │   ├── deployment.yaml
# │   ├── service.yaml
# │   ├── ingress.yaml
# │   ├── configmap.yaml
# │   ├── secret.yaml
# │   ├── hpa.yaml
# │   ├── statefulset.yaml
# │   ├── persistentvolumeclaim.yaml
# │   ├── serviceaccount.yaml
# │   └── service-monitor.yaml
# └── _helpers.tpl
```

#### 4.3 Helm Chart Configuration

**Chart.yaml:**

```yaml
apiVersion: v2
name: task-manager
description: Task Manager Web Application
type: application
version: 1.0.0
appVersion: "1.0.0"
```

**values.yaml:**

```yaml
replicaCount: 1

image:
  repository: docker.io/yourusername/task-manager-app
  pullPolicy: IfNotPresent
  tag: latest

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podAnnotations: {}
podSecurityContext: {}
securityContext: {}

service:
  type: ClusterIP
  port: 3000

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rewrite-target: /
  hosts:
    - host: task-manager.local
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: task-manager-tls
      hosts:
        - task-manager.local

database:
  enabled: true
  host: task-manager-db
  port: 5432
  database: task_manager
  username: postgres
  password: postgres
  # Use Kubernetes secrets for production passwords

redis:
  enabled: true
  host: task-manager-redis
  port: 6379

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

nodeSelector: {}

tolerations: []

affinity: {}
```

**templates/deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "task-manager.fullname" . }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "task-manager.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
      {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
      {{- end }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "task-manager.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
      - name: {{ .Chart.Name }}
        securityContext:
          {{- toYaml .Values.securityContext | nindent 10 }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: 3000
          protocol: TCP
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: {{ include "task-manager.fullname" . }}-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: {{ include "task-manager.fullname" . }}-secrets
              key: redis-url
        - name: NEXTAUTH_URL
          value: "http://task-manager.local"
        - name: NEXTAUTH_SECRET
          valueFrom:
            secretKeyRef:
              name: {{ include "task-manager.fullname" . }}-secrets
              key: nextauth-secret
        livenessProbe:
          httpGet:
            path: /
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

**templates/ingress.yaml:**

```yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "task-manager.fullname" . }}
  annotations:
    {{- toYaml .Values.ingress.annotations | nindent 4 }}
    cert-manager.io/cluster-issuer: {{ .Values.ingress.tls[0].certIssuer | default "letsencrypt-staging" }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
  {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
  {{- end }}
  {{- end }}
  rules:
  {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "task-manager.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
  {{- end }}
{{- end }}
```

**Note**: Since we're using Supabase (managed PostgreSQL), we don't need a StatefulSet or PersistentVolumeClaim for the database. Supabase handles database management, backups, and scaling automatically.

**If you need a local PostgreSQL for testing**, you can add a separate deployment, but for production, use Supabase.

**templates/hpa.yaml:**

```yaml
{{- if .Values.autoscaling.enabled -}}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "task-manager.fullname" . }}
  labels:
    {{- include "task-manager.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "task-manager.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
{{- end }}
```

#### 4.4 Deployments & Management

**Install Helm Chart:**

```bash
# Install development version
helm install task-manager ./helm-chart \
  --namespace task-manager \
  --create-namespace \
  -f values-dev.yaml

# Install production version
helm install task-manager ./helm-chart \
  --namespace task-manager \
  -f values-prod.yaml
```

**Monitor Deployment:**

```bash
# Check pods status
kubectl get pods -n task-manager
kubectl describe pod <pod-name> -n task-manager

# Check deployment status
kubectl rollout status deployment/task-manager -n task-manager

# Check logs
kubectl logs -f deployment/task-manager -n task-manager

# View events
kubectl get events -n task-manager --sort-by='.lastTimestamp'
```

**Rollout Management:**

```bash
# Check rollout status
kubectl rollout status deployment/task-manager -n task-manager

# View rollout history
kubectl rollout history deployment/task-manager -n task-manager

# Rollback to previous version
kubectl rollout undo deployment/task-manager -n task-manager

# Rollback to specific revision
kubectl rollout undo deployment/task-manager -n task-manager --to-revision=2
```

**Scale Application:**

```bash
# Manual scale
kubectl scale deployment/task-manager --replicas=3 -n task-manager

# Auto-scale (already configured in HPA)
kubectl get hpa -n task-manager
```

**Delete Deployment:**

```bash
# Uninstall Helm chart
helm uninstall task-manager -n task-manager

# Delete namespace (cleanup)
kubectl delete namespace task-manager
```

**Access Application:**

```bash
# Get ingress URL
kubectl get ingress task-manager -n task-manager

# Access application via Minikube
minikube service task-manager -n task-manager --url

# Port forward (for local testing)
kubectl port-forward svc/task-manager 3000:3000 -n task-manager
```

#### 4.5 Verification & Best Practices

**Kubernetes Best Practices:**

- Always use resource limits to prevent OOM kills
- Implement health checks (liveness, readiness, startup)
- Use secrets for sensitive data (never hardcode)
- Configure autoscaling for production workloads
- Use persistent storage for stateful applications
- Implement network policies for security
- Monitor logs and metrics continuously
- Use Helm for template management

**Common Pitfalls:**

- ❌ Not setting resource limits (can cause OOM kills)
- ❌ Using plaintext passwords in ConfigMaps
- ❌ Forgetting health checks
- ❌ Not testing rollout procedures
- ❌ Scaling without monitoring metrics
- ❌ Using local images instead of registry

**Kubernetes Commands Cheatsheet:**

```bash
# Pod management
kubectl get pods
kubectl describe pod <name>
kubectl logs <pod-name>
kubectl exec -it <pod-name> -- sh

# Service management
kubectl get services
kubectl describe service <name>

# Deployment management
kubectl get deployments
kubectl rollout status deployment/<name>
kubectl rollout undo deployment/<name>

# Namespace management
kubectl get namespaces
kubectl create namespace <name>
kubectl delete namespace <name>

# Logs and debugging
kubectl logs -f <pod-name> -c <container-name>
kubectl exec -it <pod-name> -- /bin/sh

# Monitoring
kubectl top pods
kubectl top nodes
kubectl top hpa
```

## Phase 5: Monitoring & Observability (Weeks 9-10)

### Objectives

- Implement application metrics
- Set up infrastructure monitoring
- Configure logging aggregation
- Create monitoring dashboards
- Set up alerting

### Step-by-Step Implementation

#### 5.1 Prometheus & Grafana Setup

**values.yaml additions:**

```yaml
monitoring:
  enabled: true
  prometheus:
    enabled: true
  grafana:
    enabled: true

# Add Prometheus Operator if using managed Kubernetes
# Or use Prometheus Operator for self-hosted monitoring
```

**ServiceMonitor configuration:**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: task-manager
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: task-manager
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

#### 5.2 Application Metrics Implementation

```typescript
// src/lib/metrics.ts
import { register, Counter, Histogram } from 'prom-client'

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
})

const taskCounter = new Counter({
  name: 'task_operations_total',
  help: 'Total number of task operations',
  labelNames: ['operation', 'status']
})

export async function trackRequest(req: Request, res: Response) {
  const start = Date.now()
  res.on('finish', () => {
    requestDuration.observe({
      method: req.method,
      route: req.route?.path || 'unknown',
      status_code: res.statusCode
    })
  })
}

export function trackTaskOperation(operation: string, status: string) {
  taskCounter.inc({ operation, status })
}

export const register = register
```

**API integration:**

```typescript
import { trackTaskOperation, register } from '@/lib/metrics'

export async function GET() {
  trackTaskOperation('get_tasks', 'success')
  // ... existing code
}

export async function POST(req: Request) {
  trackTaskOperation('create_task', 'success')
  // ... existing code
}
```

#### 5.3 Logging Configuration

**Dockerfile additions:**

```dockerfile
# Add logging configuration
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV NODE_ENV=production
```

**structured logging with Winston:**

```typescript
// src/lib/logger.ts
import winston from 'winston'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
})

export default logger
```

**Usage in application:**

```typescript
import logger from '@/lib/logger'

export async function GET() {
  logger.info('Fetching tasks', { userId: session.user.id })
  try {
    const tasks = await prisma.task.findMany()
    logger.info('Tasks fetched successfully', { count: tasks.length })
    return NextResponse.json(tasks)
  } catch (error) {
    logger.error('Failed to fetch tasks', { error, stack: error.stack })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

#### 5.4 Monitoring Dashboard Setup

**Grafana Dashboard Configuration:**

```json
{
  "dashboard": {
    "title": "Task Manager Application",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_request_duration_seconds_count[5m])"
          }
        ]
      },
      {
        "title": "Request Duration (p99)",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))"
          }
        ]
      },
      {
        "title": "Task Operations",
        "targets": [
          {
            "expr": "sum(task_operations_total) by (operation, status)"
          }
        ]
      }
    ]
  }
}
```

#### 5.5 Verification & Best Practices

**Monitor Setup:**

```bash
# Check Prometheus pods
kubectl get pods -n monitoring -l app=prometheus

# Access Grafana (via port forward)
kubectl port-forward svc/grafana 3001:80 -n monitoring
# Login: admin/admin

# Check metrics endpoint
kubectl port-forward deployment/task-manager 3000:3000 -n task-manager
curl http://localhost:3000/metrics

# View logs
kubectl logs -f deployment/task-manager -n task-manager --tail=100
```

**Monitoring Best Practices:**

- Use standard metrics naming conventions (OpenMetrics)
- Log at appropriate levels (error, warn, info, debug)
- Include structured context in logs
- Implement log rotation to prevent disk full
- Set up alerting for critical issues
- Use dashboards for visual monitoring
- Monitor both application and infrastructure metrics

**Common Pitfalls:**

- ❌ Not setting up proper log levels
- ❌ Forgetting to log errors
- ❌ Not implementing log rotation
- ❌ Collecting too many metrics (monitoring overhead)
- ❌ Not monitoring database performance
- ❌ Not setting up alerts

## Phase 6: Production Readiness (Weeks 11-12)

### Objectives

- Optimize performance
- Implement security hardening
- Set up backup strategy
- Create documentation
- Prepare for production deployment

### Step-by-Step Implementation

#### 6.1 Performance Optimization

**Next.js optimization:**

```typescript
// next.config.js
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['your-cdn-domain.com'],
    formats: ['image/avif', 'image/webp']
  },
  compress: true,
  poweredByHeader: false,
  headers: [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY'
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff'
        }
      ]
    }
  ]
}

module.exports = nextConfig
```

**Database optimization:**

```prisma
// Add indexes for better query performance
model Task {
  // ... existing fields
  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([dueDate])
}

// Add query optimization
const tasks = await prisma.task.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' },
  take: 20,
  skip: page * 20
})
```

#### 6.2 Security Hardening

**Security Headers:**

```typescript
// next.config.js
securityHeaders: [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' https://cdn.jsdelivr.net;"
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  }
]
```

**Security checks:**

```bash
# Run security audit
npm audit
npm audit fix

# OWASP Dependency Check
npm install -D @npmcli/template-oss audit-severity

# Container security scan
docker scan task-manager-app:latest
```

#### 6.3 Backup & Disaster Recovery

**Database backup script (Supabase):**

```bash
#!/bin/bash
# scripts/backup-db.sh

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database (requires psql and DATABASE_URL in .env)
pg_dump $DATABASE_URL > "$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Compress backup
gzip "$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Clean old backups (keep last 7 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
```

**Cron job for automatic backups:**

```bash
# crontab -e
# Daily backup at 2 AM
0 2 * * * /path/to/scripts/backup-db.sh >> /var/log/db-backup.log 2>&1
```

#### 6.4 Documentation

**Create comprehensive documentation:**

```markdown
# Task Manager Deployment Guide
## Prerequisites
## Installation Steps
## Environment Configuration
## Troubleshooting
## Security Checklist
## Performance Metrics
## Backup & Recovery
```

#### 6.5 Load Testing

**k6 load testing script:**

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Login
  let loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: 'test@example.com',
    password: 'testpass123'
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'has token': (r) => JSON.parse(r.body).token !== undefined,
  });

  let token = JSON.parse(loginRes.body).token;

  // Get tasks
  let tasksRes = http.get(`${BASE_URL}/api/tasks`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  check(tasksRes, {
    'get tasks successful': (r) => r.status === 200,
  });

  sleep(1);
}
```

**Run load test:**

```bash
k6 run --out json=results.json load-test.js
```

### Verification & Quality Gates

**Pre-production checklist:**

```bash
# ✅ Security checks
npm audit
docker scan image

# ✅ Performance tests
k6 run load-test.js

# ✅ Backup verification
# Supabase handles automated backups in the cloud
# You can verify via Supabase dashboard

# ✅ Documentation review
# All guides reviewed and tested

# ✅ Monitoring setup
kubectl get pods -n monitoring
kubectl get pods -n task-manager

# ✅ Backup tests
./scripts/backup-db.sh
```

## Best Practices & Common Pitfalls

### DevOps Anti-Patterns to Avoid

1. **Hardcoding secrets**
  - ❌ Never commit secrets to Git
  - ✅ Use environment variables and secrets management
2. **Not using resource limits**
  - ❌ Let containers consume unlimited resources
  - ✅ Always set CPU and memory limits
3. **Skipping health checks**
  - ❌ Assume containers are healthy
  - ✅ Implement liveness and readiness probes
4. **Manual deployment errors**
  - ❌ Deploy manually using kubectl commands
  - ✅ Use CI/CD automation for consistency
5. **Not monitoring production**
  - ❌ Deploy without monitoring
  - ✅ Set up comprehensive monitoring before deployment
6. **No backup strategy**
  - ❌ Assume data won't be lost
  - ✅ Implement automated backups

### Security Checklist

- All secrets stored in Kubernetes secrets
- Container images scanned for vulnerabilities
- HTTPS enforced via TLS certificates
- Security headers configured
- Input validation implemented
- Rate limiting configured
- SQL injection protection (Prisma)
- XSS protection (React automatically)
- CORS properly configured
- Authentication and authorization implemented

### Performance Optimization Tips

1. **Database:**
  - Add proper indexes
  - Use connection pooling
  - Implement query optimization
  - Cache frequently accessed data
2. **Application:**
  - Implement proper caching
  - Optimize bundle size
  - Use code splitting
  - Implement lazy loading
3. **Infrastructure:**
  - Set proper resource limits
  - Use autoscaling
  - Optimize container images
  - Use CDN for static assets

## Resume-Worthy Skills Checklist

### Web Development

- ✅ Next.js (App Router, Server Components)
- ✅ React.js with TypeScript
- ✅ Prisma ORM
- ✅ PostgreSQL database design (via Supabase)
- ✅ RESTful API design
- ✅ Authentication (NextAuth.js)
- ✅ Form handling and validation

### Containerization

- ✅ Docker fundamentals
- ✅ Multi-stage Docker builds
- ✅ Docker Compose orchestration
- ✅ Image optimization and security scanning
- ✅ Environment configuration management

### CI/CD

- ✅ GitHub Actions workflows
- ✅ Automated testing (Jest, Playwright)
- ✅ Build automation
- ✅ Security scanning integration
- ✅ Docker image publishing
- ✅ Pipeline optimization and caching

### Kubernetes

- ✅ Kubernetes fundamentals (Pods, Services, Deployments)
- ✅ Helm chart development
- ✅ Deployment strategies (RollingUpdate, Recreate)
- ✅ Health checks and probes
- ✅ Resource management (limits, requests)
- ✅ Autoscaling (HPA)
- ✅ Networking (Ingress, Services)
- ✅ Stateful applications
- ✅ ConfigMaps and Secrets

### Monitoring & Observability

- ✅ Prometheus metrics collection
- ✅ Grafana dashboards
- ✅ Application performance monitoring
- ✅ Infrastructure metrics
- ✅ Logging implementation (Winston)
- ✅ Log aggregation
- ✅ Alerting configuration

### DevOps Best Practices

- ✅ Infrastructure as Code
- ✅ GitOps principles
- ✅ Environment separation
- ✅ Backup and disaster recovery
- ✅ Security hardening
- ✅ Performance optimization
- ✅ Continuous improvement

### Project Highlights for Resume

1. **End-to-end implementation**: Built complete application from database to deployment
2. **Containerization expertise**: Demonstrated Docker and Kubernetes skills
3. **CI/CD automation**: Implemented automated testing and deployment pipelines
4. **Production-ready**: Followed best practices and security standards
5. **Monitoring**: Set up comprehensive observability stack
6. **Documentation**: Created comprehensive guides and documentation

## Next Steps

Once implementation begins:

1. Initialize Next.js project with all dependencies
2. Implement Phase 1 (Development Foundation)
3. Move through phases sequentially, following AGENTS.md
4. Update AGENTS.md as new patterns emerge
5. Document learnings and best practices

## Important Notes

- This roadmap is comprehensive but focused on learning. Adjust phases as needed based on progress
- DevOps knowledge is built incrementally - focus on understanding fundamentals
- Production practices are prioritized over shortcuts
- Documentation is as important as code for professional development
- Security and observability are integrated throughout, not just in separate phases

---

**Remember**: The goal is to build a portfolio-worthy project that demonstrates real-world DevOps skills. Focus on understanding concepts deeply, not just completing tasks.