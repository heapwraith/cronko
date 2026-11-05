FROM node:24-alpine AS deps

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile --filter @cronko/api...

FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY . .

RUN pnpm --filter @cronko/api build

FROM node:24-alpine AS runner

RUN addgroup -S nodejs && adduser -S cronko -G nodejs

WORKDIR /app

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/database/src/migrations ./packages/database/src/migrations

RUN mkdir -p /app/data && chown cronko:nodejs /app/data

ENV DATABASE_URL=file:/app/data/cronko.db
VOLUME /app/data

USER cronko

EXPOSE 3001

CMD ["node", "dist/index.js"]