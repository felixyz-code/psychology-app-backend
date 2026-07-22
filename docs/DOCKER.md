# Docker

> Docker development and deployment guide for the Psychology Management System Backend.

---

# Purpose

This document describes how to run the backend using Docker.

It documents:

* Containers
* Volumes
* Environment variables
* Common commands
* Development workflow

Business logic is intentionally outside the scope of this document.

---

# Overview

The backend uses Docker Compose to provide a reproducible local development environment.

Current services:

* Backend (NestJS)
* PostgreSQL

The Docker environment is intended for:

* Local development
* Integration testing
* VPS deployment preparation

---

# Containers

## backend

Responsibilities:

* Builds the NestJS application.
* Runs as the unprivileged `node` user after preparing the mounted uploads volume.
* Starts the backend using `node dist/main` through a signal-safe entrypoint.
* Optionally executes `prisma migrate deploy` only when `MIGRATE_ON_START=true`.
* In production, executes `prisma migrate status` before starting the web process.
* Exposes port `3000`.
* Uses `/health/ready` as its Docker healthcheck.

The image uses Node 20, which remains inside the backend contract when the
resolved image is Node 20.19 or newer. The Dockerfile installs dependencies
with `npm ci` and uses `exec` in its entrypoint so Node receives termination
signals directly.

---

## postgres

Responsibilities:

* Runs PostgreSQL 16.
* Stores application data.
* Exposes port `5432`.

---

# Volumes

## postgres_data

Persists PostgreSQL data between container restarts.

---

## backend_uploads

Persists uploaded clinical documents.

Mounted at:

```text
/app/uploads
```

Compatible with:

```text
UPLOADS_PATH
```

---

# Environment Variables

Runtime configuration is validated by the backend before the HTTP server starts.
Production values are supplied by Infra using the same variable names.

Current Compose variables:

```env
DATABASE_URL=postgresql://psychology_user:psychology_password@postgres:5432/psychology_app?schema=public
JWT_SECRET=<provided-by-your-local-environment>
JWT_EXPIRES_IN=1d
UPLOADS_PATH=/app/uploads
PORT=3000
```

Compose requires `JWT_SECRET` from its environment; it has no fallback.
Use a non-placeholder local value with at least 32 characters. Real deployments
must provide the secret through the approved secret mechanism.

Supported runtime variables:

```env
DATABASE_URL=postgresql://user:password@host:5432/database?schema=public
JWT_SECRET=<strong-secret>
JWT_EXPIRES_IN=1d
PORT=3000
NODE_ENV=production
UPLOADS_PATH=/app/uploads
CORS_ORIGIN=http://localhost:4200,http://localhost:4201
SWAGGER_ENABLED=true
TRUST_PROXY_HOPS=0
MIGRATE_ON_START=false
```

`SWAGGER_ENABLED` is optional. It defaults to `true` in `development` and
`test`, and to `false` when `NODE_ENV=production`. Production deployments must
declare `NODE_ENV=production`, an explicit `CORS_ORIGIN`, and an absolute
`UPLOADS_PATH`; they may explicitly enable Swagger only when that exposure is
intentional. `TRUST_PROXY_HOPS` defaults to `0` and must only be configured
after Infra has verified the proxy topology.

`MIGRATE_ON_START` is consumed by the Docker entrypoint, not by NestJS. The
development Compose service sets it to `true` for an empty disposable database.
Production web services keep it `false` and require a separate, one-shot
`prisma migrate deploy` step before startup.

`DATABASE_URL` is also required by `prisma.config.ts`, so local Prisma CLI commands such as `prisma generate` must run with that variable available.

Example in PowerShell:

```powershell
$env:DATABASE_URL="postgresql://psychology_user:psychology_password@localhost:5432/psychology_app?schema=public"; npx.cmd prisma generate
```

The command only needs a valid-looking connection string for config resolution; it does not require a live database server just to generate the client.

---

# Common Commands

## Start containers

```bash
docker compose up -d
```

---

## Stop containers

```bash
docker compose down
```

---

## Rebuild images

```bash
docker compose build
```

---

## View backend logs

```bash
docker compose logs -f backend
```

---

## Run seed

```bash
docker compose exec backend npm run seed
```

---

## Quality commands

Local backend quality gates:

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test -- --runInBand
```

`lint`, `format:check` and `typecheck` are read-only. `lint:fix` and `format`
may rewrite files. Backend CI runs the quality gates together with Prisma
migration, PostgreSQL integration and Docker image-build checks.

---

# Development Workflow

Typical development cycle:

```text
Modify code
      │
      ▼
docker compose build
      │
      ▼
docker compose up -d
      │
      ▼
Run seed (if required)
      │
      ▼
Test application
```

When only restarting existing containers without rebuilding:

```bash
docker compose start
```

To stop running containers without removing them:

```bash
docker compose stop
```

---

# Current Design Decisions

## Why Docker?

To provide a reproducible development environment.

---

## Why PostgreSQL in Docker?

To keep local environments consistent across developers.

---

## Production startup and migrations

`prisma db push` is prohibited for deployment and is not executed by the
Docker image. The repository contains versioned Prisma migrations.

For a production release:

1. Verify the deployment has a current backup and the approved database target.
2. Run a one-shot container/job with `npx prisma migrate deploy` and the same
   `DATABASE_URL` used by the release.
3. Start the web container with `NODE_ENV=production` and
   `MIGRATE_ON_START=false`.
4. The entrypoint runs `npx prisma migrate status`; startup fails if migration
   history is not reconciled.
5. Validate `/health/live` and `/health/ready` through the reverse proxy.

Do not use `prisma migrate resolve` as a deployment shortcut. Migration status
does not reconcile a database, replace backups, or replace schema comparison.

Rollback is an approved operational decision: roll back the application image
only when its release is compatible with the already-applied schema. Restoring
schema or data requires the verified backup and change procedure; neither
`prisma db push` nor `prisma migrate resolve` is a rollback mechanism.

The POST-GO-LIVE migration procedure uses the dedicated immutable image defined
in `Dockerfile.prisma-migrate`, rather than a web runtime container. Its
workflow and digest-based execution contract are documented in
`PRISMA_MIGRATION_ARTIFACT.md`. The image defaults to `prisma --help`; an
operator must explicitly request `migrate status` or `migrate deploy` in an
approved phase.

## Backend and Infrastructure responsibilities

Backend owns configuration validation, non-root container execution, graceful
shutdown, readiness/liveness endpoints, sanitized structured logs and the
Docker healthcheck.

Infra owns TLS termination, HTTPS redirect, HSTS, the explicit proxy topology,
route-specific rate limits and observability/alerting for reverse-proxy 429s,
container restarts, probe failures and PostgreSQL availability. `/health/live`
and `/health/ready` must never be rate-limited.

---

## Why is the seed manual?

To prevent accidental data recreation during normal container startup.

---

# Future Evolution

Future Docker environments may include:

* Reverse proxy
* Redis
* Object storage
* Background workers
* Production Compose profile
* Monitoring

The current Docker setup intentionally remains lightweight for MVP development.

---

# References

Related documentation:

* PROJECT.md
* ARCHITECTURE.md
* DATA_MODEL.md
* API.md

End of document.
