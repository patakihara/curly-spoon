# One container, one port: the server serves the API and web's built assets on the same origin.
ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable
WORKDIR /app

# Every workspace dependency, dev ones included, to build web. No compiler: better-sqlite3
# ships a prebuilt musl binary (scripts/repo/install.test.mjs).
FROM base AS deps
COPY . .
RUN --mount=type=cache,id=auralis-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @auralis/web build

# Only what the server needs at runtime.
FROM base AS prod-deps
COPY . .
RUN --mount=type=cache,id=auralis-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@auralis/server..."

FROM node:${NODE_VERSION} AS final
RUN addgroup -S auralis && adduser -S auralis -G auralis
WORKDIR /app

COPY --from=prod-deps --chown=auralis:auralis /app/node_modules ./node_modules
COPY --from=prod-deps --chown=auralis:auralis /app/server/node_modules ./server/node_modules
COPY --from=prod-deps --chown=auralis:auralis /app/schema/node_modules ./schema/node_modules
COPY --chown=auralis:auralis schema/package.json ./schema/package.json
COPY --chown=auralis:auralis schema/src ./schema/src
COPY --chown=auralis:auralis server/package.json ./server/package.json
# server/src arrives as main.ts and what it imports: .dockerignore keeps out its tests, the
# recordings and the recorder (scripts/guards/image.test.mjs).
COPY --chown=auralis:auralis server/src ./server/src
COPY --from=build --chown=auralis:auralis /app/web/dist ./web/dist

# The commit this image is built from, which /api/health reports. Declared here, last, so a new
# commit rebuilds only the layers below it. CI, Publish and Release pass it.
ARG AURALIS_COMMIT
ENV AURALIS_COMMIT=${AURALIS_COMMIT} \
    NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/web/dist

RUN mkdir -p /data && chown auralis:auralis /data
VOLUME ["/data"]

USER auralis
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node itself is PID 1, with tsx as its loader, so docker stop's SIGTERM reaches main.ts, which
# closes the database before it exits. The tsx CLI would relay it and SIGKILL a slow child.
WORKDIR /app/server
CMD ["node", "--import", "tsx", "src/main.ts"]
