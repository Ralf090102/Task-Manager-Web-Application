FROM node:22-slim AS deps
WORKDIR /app
COPY services/webhook/package.json services/webhook/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim AS builder
WORKDIR /app
COPY services/webhook/package.json services/webhook/package-lock.json* ./
RUN npm ci
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/webhook/prisma.config.ts ./
RUN npx prisma generate
COPY services/webhook/tsconfig.json ./
COPY services/webhook/src/ ./src/

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3003
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
