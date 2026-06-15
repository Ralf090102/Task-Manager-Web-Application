FROM node:22-slim AS deps
WORKDIR /app
COPY services/scheduler/package.json services/scheduler/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim AS builder
WORKDIR /app
COPY services/scheduler/package.json services/scheduler/package-lock.json* ./
RUN npm ci
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/scheduler/prisma.config.ts ./
RUN npx prisma generate
COPY services/scheduler/tsconfig.json ./
COPY services/scheduler/src/ ./src/

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
