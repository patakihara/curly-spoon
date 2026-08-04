# Auralis ships as one image: the Fastify BFF serves both `/api/v1` and the
# built web app on the same origin and port (docs/ARCHITECTURE.md, § Topology;
# docs/ROADMAP.md § 4). The server runs its TypeScript directly via `tsx`
# (apps/server/package.json's "start" script) rather than a compiled JS output
# — that mirrors how every workspace package here already ships (no package in
# this repo has a build step that emits JS; `packages/core`/`packages/abs-client`
# are consumed as source even by their own unit tests), so this image does the
# same rather than being the one place with a different pipeline. The web app
# is the one thing that *does* get built — a static bundle has no equivalent
# "just run the source" option.

ARG NODE_VERSION=22-alpine

# -----------------------------------------------------------------------------
# base — shared starting point: pnpm via corepack, nothing project-specific yet.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
RUN corepack enable

# -----------------------------------------------------------------------------
# deps — the full workspace install, devDependencies included. Needed to build
# the web app, and this is also where better-sqlite3's native addon compiles
# (build tools live only in this stage and the one below, never in `final`).
# -----------------------------------------------------------------------------
FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=auralis-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# build — the one real build step: the static web bundle (apps/web/dist).
# -----------------------------------------------------------------------------
FROM deps AS build
RUN pnpm --filter @auralis/web build

# -----------------------------------------------------------------------------
# prod-deps — a second, independent install with `--prod`, so devDependencies
# (vite, vitest, typescript, the whole toolchain) never reach the final image.
# Filtered to `@auralis/server...` (the server plus the workspace packages it
# actually depends on) — apps/web's and packages/ui's own runtime dependencies
# (react, etc.) are irrelevant here; only the *built* web assets are shipped.
# -----------------------------------------------------------------------------
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=auralis-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@auralis/server..."

# -----------------------------------------------------------------------------
# final — the runtime image. Non-root, only what's needed to run.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS final
RUN addgroup -S auralis && adduser -S auralis -G auralis

WORKDIR /app

# Production node_modules (hoisted root + the server's own local bin/links),
# plus the workspace source `@auralis/core`/`@auralis/abs-client` actually run
# from (see the top-of-file note — nothing in this repo ships compiled JS).
COPY --from=prod-deps --chown=auralis:auralis /app/node_modules ./node_modules
COPY --from=prod-deps --chown=auralis:auralis /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=prod-deps --chown=auralis:auralis /app/packages/core/package.json ./packages/core/package.json
COPY --from=prod-deps --chown=auralis:auralis /app/packages/core/src ./packages/core/src
COPY --from=prod-deps --chown=auralis:auralis /app/packages/abs-client/package.json ./packages/abs-client/package.json
COPY --from=prod-deps --chown=auralis:auralis /app/packages/abs-client/src ./packages/abs-client/src
# pnpm's layout is isolated, not hoisted: a workspace package's dependencies are
# reachable only through its *own* node_modules, which holds relative symlinks
# into the root `.pnpm` store. Copying the root node_modules is therefore not
# enough — without this line `packages/abs-client/src/client.ts` cannot resolve
# `zod` and the container exits on its first import. Any workspace package that
# gains an external dependency needs the same line; `packages/core` has none
# today, and pnpm creates no node_modules for it at all, so COPY would fail.
COPY --from=prod-deps --chown=auralis:auralis /app/packages/abs-client/node_modules ./packages/abs-client/node_modules
# @auralis/jellyfin-client — same reasoning as abs-client above: apps/server
# imports it at runtime (`apps/server/src/jellyfinUpstream.ts`), tsx runs the
# source directly with no compile step, and its own `zod` dependency needs its
# own node_modules copied for the same isolated-layout reason.
COPY --from=prod-deps --chown=auralis:auralis /app/packages/jellyfin-client/package.json ./packages/jellyfin-client/package.json
COPY --from=prod-deps --chown=auralis:auralis /app/packages/jellyfin-client/src ./packages/jellyfin-client/src
COPY --from=prod-deps --chown=auralis:auralis /app/packages/jellyfin-client/node_modules ./packages/jellyfin-client/node_modules
COPY --chown=auralis:auralis apps/server/package.json ./apps/server/package.json
COPY --chown=auralis:auralis apps/server/src ./apps/server/src

# The built web app — this is the one artifact from the `build` stage; nothing
# from apps/web's own node_modules (react, vite, …) is needed at runtime.
COPY --from=build --chown=auralis:auralis /app/apps/web/dist ./apps/web/dist

ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/apps/web/dist

RUN mkdir -p /data && chown auralis:auralis /data
VOLUME ["/data"]

USER auralis
EXPOSE 8787

# Unauthenticated and always-200-if-the-process-is-answering (apps/server/src/routes/health.ts)
# — exactly what a container healthcheck wants: "is this process alive and
# serving", not "is Audiobookshelf also up" (the route itself reports that
# separately, in the body, without affecting the status code).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/server

# Exec form, and `tsx` directly rather than `pnpm start` / `npm start`: both of
# those interpose a shell + an extra process that do not reliably forward
# SIGTERM to the Node process underneath, which is exactly what makes
# `docker stop` hang for the full grace period before a SIGKILL. `tsx`'s own
# CLI forwards SIGINT/SIGTERM to the process it spawns, and `main.ts` installs
# its own graceful-shutdown handler on top of that (closes the DB, then exits) —
# together those two are what make `docker stop` return promptly and cleanly.
CMD ["node_modules/.bin/tsx", "src/main.ts"]
