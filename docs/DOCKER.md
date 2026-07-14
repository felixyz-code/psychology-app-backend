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
* Executes `prisma db push` during startup.
* Starts the backend using `node dist/main`.
* Exposes port `3000`.

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
JWT_SECRET=change_me
JWT_EXPIRES_IN=1d
UPLOADS_PATH=/app/uploads
PORT=3000
```

The Compose `JWT_SECRET` value is a local placeholder and is not a production
secret. Real deployments must provide a strong `JWT_SECRET` with at least 32
characters. The backend does not provide a JWT secret fallback.

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
```

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

## Why `prisma db push`?

The current MVP provisions new databases using the Prisma schema.

Versioned Prisma migrations are planned for future releases.

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
