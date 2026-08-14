# Psychology Management System Backend

Backend API for managing authentication, patients, case files, session notes, documents and appointments for a psychology management system.

## Stack

* NestJS 11
* TypeScript
* Prisma ORM
* PostgreSQL
* JWT Authentication
* bcrypt
* Swagger
* Docker Compose

## Main Features

* JWT login
* Public freelancer bootstrap
* Role-based access
* Ownership filtering
* Patient management
* Case file management
* Session notes
* Document upload
* Document download
* Document preview
* Appointment management
* Swagger API documentation
* Dockerized local environment

## Documentation

Project documentation is available in `/docs`.

Recommended reading order:

```text
PROJECT.md
AGENTS.md
docs/README.md
docs/ARCHITECTURE.md
docs/DATA_MODEL.md
docs/API.md
docs/DOCKER.md
docs/ROADMAP.md
```

Current Phase 3 closeout references:

* Functional baseline: `6c65a4d8956723071514c40ec6942ecc39c0dcd2`
* Phase status: `PHASE 3 FUNCTIONAL WORK COMPLETE`
* Formal closeout status: `PHASE 3 CLOSEOUT - REVIEW PENDING`
* Closeout document: `docs/POST_GO_LIVE_3_PHASE_CLOSEOUT.md`

## Local Development

Supported toolchain:

- Node.js `^20.19 || >=22.12 <23`
- npm `>=10 <11`
- Package manager metadata: `npm@10.9.8`

Docker continues to use Node 20. Local development may use Node 20.19+ or
Node 22.12+ inside the supported range.

Install dependencies:

```bash
npm install
```

Run backend locally:

```bash
npm run start:dev
```

Run quality checks:

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test -- --runInBand
```

`lint`, `format:check` and `typecheck` are read-only quality gates. `lint:fix`
and `format` may rewrite files and should be used intentionally during local
development.

The Backend CI workflow runs these quality gates alongside Prisma migration,
PostgreSQL integration and Docker image-build checks.

Run with Docker Compose:

```bash
docker compose up -d
```

View backend logs:

```bash
docker compose logs -f backend
```

Run seed manually:

```bash
docker compose exec backend npm run seed
```

Stop containers:

```bash
docker compose down
```

## Swagger

Swagger UI is available at:

```text
/api/docs
```

Use `POST /auth/login` to obtain a JWT and then use Swagger `Authorize` with Bearer Token.

Swagger also documents the public self-bootstrap route
`POST /auth/freelancer-bootstrap` for the independent freelancer baseline.
The route is served only when
`PUBLIC_FREELANCER_BOOTSTRAP_ENABLED=true`; it remains disabled by default
until an environment enables it explicitly.

## Environment Variables

The backend validates runtime configuration during startup. Errors mention the
invalid variable name but must not print secret values.

```env
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<database>?schema=public"
JWT_SECRET="replace-with-strong-random-secret-minimum-32-characters"
JWT_EXPIRES_IN="1d"
PORT=3000
NODE_ENV="development"
UPLOADS_PATH="uploads"
CORS_ORIGIN="http://localhost:4200,http://localhost:4201"
SWAGGER_ENABLED="true"
TRUST_PROXY_HOPS=0
PUBLIC_FREELANCER_BOOTSTRAP_ENABLED="false"
```

Required variables:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma at runtime.
- `JWT_SECRET`: signing secret for JWT access tokens. Use a strong value with at least 32 characters.

Optional variables:

- `JWT_EXPIRES_IN`: JWT duration accepted by the JWT library, such as `15m`, `1h` or `1d`. Default: `1d`.
- `PORT`: HTTP port. Default: `3000`.
- `NODE_ENV`: `development`, `test` or `production`. Default: `development`.
- `UPLOADS_PATH`: local filesystem upload root. Default: `uploads`. Production requires an explicit absolute path such as `/app/uploads`.
- `CORS_ORIGIN`: comma-separated allowed origins. Default: `http://localhost:4200,http://localhost:4201`; production requires an explicit value.
- `SWAGGER_ENABLED`: `true` or `false`. Defaults to `false` in production and `true` otherwise. Production exposure requires an explicit `true`.
- `TRUST_PROXY_HOPS`: number of explicitly trusted reverse-proxy hops (`0`, `1` or `2`). Default: `0`; do not enable it without an Infra-defined proxy topology.
- `PUBLIC_FREELANCER_BOOTSTRAP_ENABLED`: enables the public freelancer bootstrap route. Default: `false`; set `true` explicitly only in approved environments.

Do not use placeholder values from `.env.example` as real secrets.

`DATABASE_URL` is also required by Prisma tooling through `prisma.config.ts`.
This remains separate from NestJS runtime validation.

Examples for local Prisma commands:

```bash
DATABASE_URL="postgresql://psychology_user:psychology_password@localhost:5432/psychology_app?schema=public" npx prisma generate
```

```powershell
$env:DATABASE_URL="postgresql://psychology_user:psychology_password@localhost:5432/psychology_app?schema=public"; npx.cmd prisma generate
```

Unit tests inject a safe dummy `DATABASE_URL` automatically so they do not require a real database connection just to instantiate `PrismaService`.

## Demo Seed

The seed creates demo users and patients.

Demo password:

```text
ChangeMe123!
```

## Observability & Structured Logging

The backend adopts high-performance asynchronous structured JSON logging powered by `nestjs-pino` and `pino-http`.

Key characteristics:
- **JSON Formatting**: Emits machine-parseable JSON logs to stdout in production, compatible with modern log collectors and Docker `json-file` log rotation.
- **Trace & Request ID Correlation**: Assigns or propagates the `x-request-id` header across all incoming requests and child loggers (`req.id` / `requestId`).
- **Health Probes**: Integrates `@nestjs/terminus` health checks for liveness (`/health`, `/health/live`) and readiness (`/health/ready`), verifying PostgreSQL database connectivity, heap/RSS memory limits, and `/app/uploads` disk space.

### Privacy & Sensitive Field Redaction

To prevent sensitive patient data, credentials, and tokens from leaking into logs:
- **HTTP Header Redaction**: `authorization`, `cookie`, and `set-cookie` headers are automatically stripped.
- **Payload Redaction**: Sensitive property keys (e.g., `password`, `currentPassword`, `newPassword`, `token`, `secret`, `creditCard`, `credentials`) are scrubbed before logging.

## Administrative Audit & Traceability

Administrative and multi-tenant lifecycle mutations are tracked via a dedicated audit architecture:

- **Entity `AuditLog`**: Stores persistent immutable audit records in PostgreSQL (`timestamp`, `organizationId`, `userId`, `action`, `resourceType`, `resourceId`, `ipAddress`, `userAgent`, `details`).
- **Decorator `@AuditLog({ action, resourceType })`**: Declaratively annotates controller mutation methods (organization creation, status transitions, role adjustments, invitation acceptance, and asset updates).
- **Interceptor `AuditInterceptor`**: Automatically extracts the authenticated user ID, resolved organization context, client IP address, and sanitized payload details without blocking primary business logic execution.

## Project Notes

This backend handles sensitive clinical information.

Do not expose passwords, JWTs, clinical notes or personal patient data in logs or error messages.

End of document.

