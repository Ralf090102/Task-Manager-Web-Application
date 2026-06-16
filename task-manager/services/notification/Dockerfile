FROM node:22-slim AS deps
WORKDIR /app
COPY services/notification/package.json services/notification/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim AS builder
WORKDIR /app
COPY services/notification/package.json services/notification/package-lock.json* ./
RUN npm ci
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY services/notification/prisma.config.ts ./
RUN npx prisma generate
COPY services/notification/tsconfig.json ./
COPY services/notification/src/ ./src/

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3004
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src/ ./src/
CMD ["npx", "tsx", "src/index.ts"]
