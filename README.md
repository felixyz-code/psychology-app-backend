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

These commands are prepared for future CI quality gates, but CI workflows have
not been changed yet.

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
```

Required variables:

- `DATABASE_URL`: PostgreSQL connection string used by Prisma at runtime.
- `JWT_SECRET`: signing secret for JWT access tokens. Use a strong value with at least 32 characters.

Optional variables:

- `JWT_EXPIRES_IN`: JWT duration accepted by the JWT library, such as `15m`, `1h` or `1d`. Default: `1d`.
- `PORT`: HTTP port. Default: `3000`.
- `NODE_ENV`: `development`, `test` or `production`. Default: `development`.
- `UPLOADS_PATH`: local filesystem upload root. Default: `uploads`; Infra can provide `/app/uploads`.
- `CORS_ORIGIN`: comma-separated allowed origins. Default: `http://localhost:4200,http://localhost:4201`.
- `SWAGGER_ENABLED`: `true` or `false`. Default: `true`, preserving the current `/api/docs` behavior.

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

## Project Notes

This backend handles sensitive clinical information.

Do not expose passwords, JWTs, clinical notes or personal patient data in logs or error messages.

End of document.
