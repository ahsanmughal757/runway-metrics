# syntax=docker/dockerfile:1

# Runway build.
#
# Two deployable images come out of this one file, and only two:
#   docker build --target api .   -> the NestJS API, non-root, with its native deps
#   docker build --target web .   -> the built SPA behind a stock nginx
# Every other stage exists to be a parent of one of those. They share a context
# and an install layer, not a runtime, which is why they belong in one file
# instead of one Dockerfile each.
#
# glibc (bookworm-slim) rather than alpine, deliberately. Two native
# dependencies decide it. bcrypt ships a prebuilt napi binary for
# linux-x64-glibc and falls back to compiling from source with node-gyp on musl,
# which would mean python3 + build-essential in the builder; and Prisma's query
# engine is a single .node linked against a specific libc. Alpine would cost a
# ~1 GB toolchain in the builder to save ~150 MB of libc in the runtime, and the
# toolchain has to be present at `pnpm install` time, not just at build time, so
# the saving is paid twice. Rejected: alpine + a `node:22-alpine` base.
#
# Node is pinned to the .nvmrc value, and the base image is the one place a
# Node upgrade is declared. pnpm's version is *not* pinned here: corepack reads
# it from the root package.json `packageManager` field, and a second copy of that
# number here would be a second place to forget on upgrade.

ARG NODE_VERSION=22.12.0

FROM node:${NODE_VERSION}-bookworm-slim AS base

# CI=true, not for the "C" in continuous integration: it makes pnpm refuse to
# prompt and to fail rather than guess when a lockfile is out of date, which is
# the behaviour a build wants. Without it a `pnpm install` in a build can sit
# waiting on an interactive question with no terminal to answer it.
ENV CI=true
# corepack, upgraded from the version bundled with this Node, because that one
# cannot build this project. The bundled corepack carries npm's signing keys from
# before the January 2025 rotation, so it fails every pnpm download with
# "Cannot find matching keyid" - a stale keyring, not a bad tarball.
#
# The alternative, `ENV COREPACK_INTEGRITY_KEYS=0`, is not used: it works, and it
# also switches off the signature check that makes downloading a package manager
# from a registry safer than curling a shim. This repo does not turn off a
# control to get past a bug, and the upgrade is a one-line fix for the same
# problem. corepack still resolves the pnpm version from `packageManager`, so
# the pin stays in package.json.
RUN npm install --global corepack@latest \
    && corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

# The one full install in this file. Full, not --prod, because this stage's only
# job is to give the next two stages a toolchain: TypeScript, the Nest CLI, and
# the Prisma CLI that `postinstall` (pnpm runs the backend's `postinstall:
# prisma generate` here) needs to produce the client the app imports.
#
# Manifests are copied before the install so this layer survives any source
# edit. Editing a .ts file invalidates the build stage alone; editing
# package.json correctly invalidates this one.
FROM base AS api-deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Every workspace importer's manifest, because the lockfile records all of them
# and --frozen-lockfile compares against all of them. Copying only backend/ makes
# pnpm fail with a lockfile mismatch, which reads like a dependency problem and
# is not one.
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile

FROM api-deps AS api-build

# COPY merges rather than replaces, so backend/node_modules and the generated
# .prisma client inside it survive this. .dockerignore keeps node_modules and
# backend/dist out of the context, so nothing here overwrites them either.
COPY backend ./backend
# `nest build` (tsconfig.build.json includes src/**/*.ts and excludes test) also
# runs with deleteOutDir, so a stale dist from a previous stage cannot survive.
RUN pnpm --filter runway-backend run build

FROM node:${NODE_VERSION}-bookworm-slim AS api

ENV NODE_ENV=production
# Spelled out rather than left to the env.ts default, because deploy/nginx/
# hardcodes `server api:4000` in its upstream block. A default that silently
# moved to 5001 would turn that into a 502 with no other symptom.
ENV PORT=4000

# A dedicated unprivileged account, not the `node` user the base image happens to
# ship. uid 10001 is fixed here so it can be named in a bind mount or a security
# policy later without having to re-derive it; the base image's uid 1000 is a
# Node convention, not a guarantee.
RUN groupadd --gid 10001 runway \
    && useradd --uid 10001 --gid 10001 --home-dir /app --shell /usr/sbin/nologin runway

WORKDIR /app/backend

# The dependency tree is copied wholesale, in two pieces, and the two-piece part
# matters: pnpm's node_modules is full of *relative* symlinks, so
# backend/node_modules/@prisma/client -> ../../node_modules/.pnpm/... resolves
# only if both halves keep their relative positions. Copying one and not the
# other produces an image that builds cleanly and fails on the first import.
#
# Rejected: `pnpm deploy --filter runway-backend --prod /out`, which is the
# usual answer and is the wrong one for this dependency tree. The generated
# client is not a package: Prisma writes it to
# node_modules/.pnpm/@prisma+client@<v>_prisma@<v>/node_modules/.prisma, a
# directory it creates at generate time and that is in no store, so a pruned
# deploy has no copy of it and no copy of the query engine binary inside it. The
# app then boots and throws "Cannot find module .prisma/client/default" on the
# first query. The cost of this route is that devDependencies come along, which
# is real and is a known size regression, not a subtlety: the image carries
# typescript, jest and the Nest CLI. The fix, when it is worth doing, is a prod
# stage that runs `prisma generate` *inside* the deploy output - the CLI has to
# be present there, which --prod by definition does not provide.
COPY --from=api-build /app/node_modules /app/node_modules
COPY --from=api-build /app/backend/node_modules /app/backend/node_modules
COPY --from=api-build /app/backend/dist ./dist
COPY --from=api-build /app/backend/package.json ./package.json
# Not needed to serve a request - the compiled client never reads it - but the
# schema and the committed migrations are what make the image the unit that gets
# deployed, and shipping them means the running version and the migrations
# targeting it cannot be different artefacts.
COPY --from=api-build /app/backend/prisma ./prisma

# Every load-time failure this image could have is turned into a build failure
# here, where it is a failed build with a readable error, rather than a
# container that accepts a connection and 500s on its first query. Prisma loads
# and instantiates its engine without opening a connection, and bcrypt loads its
# napi binding, so both are proven by this line and neither needs a database.
RUN node -e "require('@prisma/client'); require('bcrypt');"

# No ENTRYPOINT wrapper, on purpose. The one thing a shell wrapper here would do
# is run migrations, and that is a deploy step, not a container start: it belongs
# in the documented sequence (see the api-migrate stage) where its failure is
# visible and it runs once, not on every restart of every replica. `node dist/main`
# in exec form also keeps node as PID 1, so SIGTERM reaches it and
# `app.enableShutdownHooks()` actually drains in-flight requests; a `sh -c`
# wrapper would swallow it and turn every deploy into a hard kill.
USER runway

# /health/ready, not /health. Readiness is the one that answers "should this
# container receive traffic", which is the only question a compose
# `depends_on: service_healthy` gate asks, and in this deployment the answer
# requires the database: ENABLE_DATABASE=true and BYPASS_AUTH=false are refused
# in production, so there is no demo-data fallback to paper over a dead Postgres.
#
# The cost, stated plainly: a database outage marks the API unhealthy even though
# the process is fine. Docker does not restart a container on an unhealthy
# status, so nothing crash-loops; the blast radius is confined to anything that
# gates on health at start time. That is why liveness and readiness are not
# conflated here the way /health's own comment warns against - nothing restarts
# on this result.
#
# node -e rather than curl: the runtime image has no curl, and adding one to get
# a health probe would mean another package in a container that runs as a
# non-root user. Node 22 has a global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/main"]

# The only stage that can apply migrations, and deliberately not part of the api
# image. `migrate deploy` is a command that drops and recreates objects, and a
# long-running image that ships the Prisma CLI is one `docker exec` away from
# running it against production by accident. Here the CLI exists only in a
# build stage, so the deployed api cannot do it even if asked:
#
#   docker build --target api-migrate -t runway-api-migrate .
#   docker run --rm --network runway_default \
#     -e DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@postgres:5432/runway \
#     runway-api-migrate
#
# It is also a separate stage for a correctness reason: it shares api-deps, so
# the CLI version is exactly the one the lockfile resolved and the app was built
# against, rather than whatever a `pnpm dlx prisma` would fetch on deploy day.
FROM api-deps AS api-migrate

WORKDIR /app/backend
COPY --from=api-build /app/backend/prisma ./prisma
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# Web
# ---------------------------------------------------------------------------

# Built from api-deps rather than from base so the two targets share one
# install layer and one pnpm store instead of paying for the install twice. The
# cost is that the frontend build stage can see the backend's node_modules, which
# is harmless: the image that leaves this file is built FROM stock nginx below
# and copies nothing but the dist.
FROM api-deps AS web-build

COPY frontend ./frontend
RUN pnpm --filter runway-frontend run build

# Pinned, because a floating `nginx:alpine` tag means an unattended rebuild can
# change the TLS and HTTP behaviour under a deployed site with no commit.
FROM nginx:1.28-alpine AS web

COPY --from=web-build /app/frontend/dist /usr/share/nginx/html

# This image is the *only* public entrypoint, and that is a correction of the
# obvious two-container design.
#
# The obvious shape is a plain `nginx:alpine` serving `dist` on :80 and a second
# nginx doing TLS and proxying. It does not work, and it fails quietly: the
# front door's `root /usr/share/nginx/html` would be empty in a container that
# has no `dist` in it, so the SPA fallback `try_files $uri $uri/ /index.html`
# would find no index.html and answer every deep link with a 404 — which is
# precisely the bug deploy/nginx/ exists to fix, reintroduced one layer up.
#
# The alternative — proxying the static assets from the front door to a `web`
# service behind it — was rejected as well: every asset becomes a second network
# hop inside the host for no benefit, and it introduces a service whose only job
# is to be a file server.
#
# So there is one nginx, it has the assets, and `root` in default.conf is true.
# The stock image's own server block is replaced, not merged: it would bind :80
# and answer before the included config's own server ever ran.
RUN rm /etc/nginx/conf.d/default.conf
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
# The whole directory, because `security-headers.conf` is included by four
# locations and nginx does not fail usefully when an include is missing — the
# headers simply vanish, which is a security regression with no error anywhere.
COPY deploy/nginx/snippets /etc/nginx/snippets

# Certificates are deliberately NOT copied in. They are per-deployment, they
# rotate, and baking them would put a private key in an image layer that outlives
# the certificate. compose mounts ./deploy/certs read-only instead.
#
# The consequence, which the runbook has to handle: this image cannot start
# without a certificate at /etc/nginx/certs, because `nginx -t` refuses a config
# whose `ssl_certificate` is missing. That is deliberate. A front door that
# comes up without TLS is the failure this whole layer is preventing, and
# silently serving the app on :80 because a cert was forgotten is worse than
# not starting.
EXPOSE 80 443
