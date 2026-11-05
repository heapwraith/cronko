# syntax=docker/dockerfile:1

# ---- build: install, build the web app and the API bundle -------------------
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
# Only needed if better-sqlite3 has no prebuilt binary for this platform.
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @cronko/web build && pnpm --filter @cronko/api build
# Production-only node_modules for the API (native better-sqlite3 included).
RUN pnpm --filter @cronko/api deploy --prod /prod/api

# ---- runtime: one process serves the API and the web app --------------------
FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000 \
    DATABASE_URL=file:/app/data/cronko.db \
    AUTO_MIGRATE=true
WORKDIR /app

COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/web/dist ./web
COPY --from=build /app/packages/database/src/migrations ./packages/database/src/migrations
COPY scripts/db.mjs ./scripts/db.mjs

RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "dist/index.mjs"]
