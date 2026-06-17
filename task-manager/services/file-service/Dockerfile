FROM node:22-slim AS deps
WORKDIR /app
COPY services/file-service/package.json services/file-service/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim AS builder
WORKDIR /app
COPY services/file-service/package.json services/file-service/package-lock.json* ./
RUN npm ci
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/file-service/prisma.config.ts ./
RUN npx prisma generate
COPY services/file-service/tsconfig.json ./
COPY services/file-service/src/ ./src/

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3005
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
