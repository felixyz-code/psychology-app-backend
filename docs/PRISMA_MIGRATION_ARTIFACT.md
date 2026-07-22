# Certified Prisma migration artifact

## Purpose

`Dockerfile.prisma-migrate` builds the one-shot Prisma command image used for
the certified POST-GO-LIVE schema procedure. It is intentionally separate from
the NestJS runtime image and does not apply migrations by default.

The image contains only package metadata, the Prisma CLI and generated engines,
`prisma.config.ts`, `prisma/schema.prisma`, and the versioned migration chain.
The repository `.dockerignore` excludes `.env`, host `node_modules`, Git
metadata, runtime uploads, and logs from its build context.

## Certified release identity

For POST-GO-LIVE.2.0, the workflow accepts only backend commit
`cd669fd3e6ef2c5193ae1532a41b797c42ac21ce`. The immutable revision tag is:

```text
ghcr.io/felixyz-code/psychology-app-prisma-migrate:cd669fd3e6ef
```

The published image digest is the production execution identity. A later
production availability phase must reference that digest and supply
`DATABASE_URL` through its approved secret channel; it must not bake a URL into
an image or command-line report.

## Local verification

Build with OCI identity labels:

```bash
docker build -f Dockerfile.prisma-migrate \
  --build-arg VCS_REF=cd669fd3e6ef2c5193ae1532a41b797c42ac21ce \
  --build-arg SOURCE_URL=https://github.com/felixyz-code/psychology-app-backend \
  --build-arg CREATED=2026-07-21T00:00:00Z \
  -t psychology-app-prisma-migrate:cd669fd3e6ef .
```

Verify the image against a disposable PostgreSQL 16 database:

```bash
bash scripts/test-prisma-migration-image-postgres16.sh \
  psychology-app-prisma-migrate:cd669fd3e6ef
```

The test requires a new database, confirms pending migrations, applies all
three, verifies the SaaS tables, and repeats `migrate deploy` to prove
idempotence. It removes only the Docker container and network it created.

No approved local legacy snapshot is bundled with this repository. The empty
PostgreSQL 16 test is therefore complemented by the previously certified
legacy recovery rehearsal; it does not use or download the production backup.

## Publication

Run **Build certified Prisma migration artifact** manually in GitHub Actions
with the exact certified backend SHA. The workflow verifies the repository
revision and migration checksum, builds and tests the image, publishes the
immutable revision tag to GHCR, obtains a manifest digest, and revalidates the
pulled digest. It never connects to production, deploys the runtime backend,
or runs a production migration.
