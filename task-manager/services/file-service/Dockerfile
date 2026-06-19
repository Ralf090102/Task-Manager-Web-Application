FROM node:22-slim AS base
WORKDIR /app
COPY services/file-service/package.json services/file-service/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM base AS builder
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/file-service/prisma.config.ts ./
RUN npx prisma generate
COPY services/file-service/tsconfig.json ./
COPY services/file-service/src/ ./src/
COPY services/file-service/scripts/ ./scripts/

FROM base AS runner
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3005
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/scripts/ ./scripts/
CMD ["npx", "tsx", "src/index.ts"]
