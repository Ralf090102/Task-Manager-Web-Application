FROM node:22-slim AS base
WORKDIR /app
COPY services/search-sync/package.json services/search-sync/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM base AS builder
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/search-sync/prisma.config.ts ./
RUN npx prisma generate
COPY services/search-sync/tsconfig.json ./
COPY services/search-sync/src/ ./src/
COPY services/search-sync/scripts/ ./scripts/

FROM base AS runner
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3006
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/scripts/ ./scripts/
CMD ["npx", "tsx", "src/index.ts"]
