FROM node:22-slim AS base
WORKDIR /app
COPY services/realtime/package.json services/realtime/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM base AS builder
COPY services/realtime/tsconfig.json ./
COPY services/realtime/src/ ./src/
COPY services/realtime/scripts/ ./scripts/

FROM base AS runner
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3001
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/scripts/ ./scripts/
CMD ["npx", "tsx", "src/index.ts"]
