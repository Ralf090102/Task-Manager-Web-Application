FROM node:22-slim AS base
WORKDIR /app
COPY services/team-service/package.json services/team-service/package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/team-service/prisma.config.ts ./
RUN npx prisma generate
COPY services/team-service/tsconfig.json ./
COPY services/team-service/src/ ./src/

FROM base AS runner
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3002
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
