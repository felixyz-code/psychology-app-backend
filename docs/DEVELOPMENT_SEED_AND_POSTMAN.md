# Development Seed and Postman

> POST-GO-LIVE.2.2 - Tenant Development Seed and Postman Collection Refresh.

## Proposito

Este documento describe el seed tenant-aware de desarrollo y la coleccion
Postman local asociada. Ambos artefactos son herramientas de DX posteriores a
la certificacion tenant de POST-GO-LIVE.2. No habilitan POST-GO-LIVE.3, no
crean APIs administrativas nuevas y no deben usarse contra produccion.

POST-GO-LIVE.2.2 queda dividido documentalmente:

| Subetapa          | Alcance                    | Estado                                |
| ----------------- | -------------------------- | ------------------------------------- |
| POST-GO-LIVE.2.2A | Tenant Development Seed    | CERTIFICADO                           |
| POST-GO-LIVE.2.2B | Postman Collection Refresh | IMPLEMENTADO Y VALIDADO ESTATICAMENTE |

La ejecucion funcional integral de la coleccion mediante runner Postman queda
diferida por ausencia de un runner local aprobado. Esta documentacion no afirma
que la coleccion haya pasado un run funcional.

## Requisitos

- Node.js compatible con el proyecto.
- Docker Desktop operativo con el contexto local `desktop-linux`.
- PostgreSQL local o contenedor local.
- `DATABASE_URL` apuntando a una base descartable.
- `JWT_SECRET` para ejecutar la API local.
- `SEED_DEMO_PASSWORD` opcional. Si no existe, el seed usa el fallback local
  `LocalSeedPassword123!`.

## Docker Desktop

Validar Docker antes de certificar:

```powershell
docker version
docker context ls
docker info
docker ps
```

El flujo usa solo PostgreSQL local. No requiere frontend, despliegues ni
infraestructura remota.

## PostgreSQL

El contenedor local esperado usa PostgreSQL 16. Si se usa Docker Compose del
repositorio, levantar solo el servicio de base cuando sea posible:

```powershell
$env:JWT_SECRET="<local-only-jwt-secret>"
docker compose up -d postgres
```

Confirmar que el contenedor de PostgreSQL este saludable y que el puerto 5432
corresponda al entorno local.

## Base Local

Para certificacion se usa una base descartable:

```powershell
psychology_app_seed_certification_test
```

No usar credenciales, datos ni URLs productivas.

Crear la base desde cero en PostgreSQL local. Si existe por una certificacion
interrumpida, eliminar solo esta base descartable y recrearla:

```powershell
docker exec <postgres-container> psql -U psychology_user -d postgres -c "DROP DATABASE IF EXISTS psychology_app_seed_certification_test WITH (FORCE)"
docker exec <postgres-container> psql -U psychology_user -d postgres -c "CREATE DATABASE psychology_app_seed_certification_test"
```

## Migraciones

Ejecutar las migraciones existentes, sin crear migraciones nuevas:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma migrate status
```

La certificacion debe comprobar que todas las migraciones versionadas del
repositorio estan aplicadas y que `npx.cmd prisma migrate status` reporta el
schema al dia. Como referencia historica, el repositorio contiene 7
migraciones versionadas al domingo 2 de agosto de 2026.

## Ejecucion Del Seed

```powershell
$env:SEED_DEMO_PASSWORD="LocalSeedPassword123!"
npm.cmd run seed
```

El seed:

- crea datos sinteticos `.example.test`;
- crea Organizations A/B y una Organization suspendida;
- crea usuarios y memberships por rol;
- crea assignments clinicos activos donde aplica;
- crea Patients, Case Files, Session Notes, Documents, Appointments y Finance;
- mantiene los Documents deliberadamente escasos mientras puebla las vistas de
  agenda, clinica y reportes con datos sinteticos variados;
- no crea filas con `organizationId = NULL`;
- limpia y recrea sus propios fixtures para ser repetible.

## Idempotencia

El seed borra solo sus fixtures deterministas por IDs, slugs, emails y
relaciones conocidas, luego los recrea. Ejecutarlo dos veces debe dejar los
mismos conteos.

Validacion opt-in:

```powershell
npm.cmd run seed:certify
```

La certificacion Postman/local opt-in para el flujo de preferencia UX:

```powershell
npm.cmd run postman:certify
```

## Segunda Corrida

Para certificar reset determinista controlado:

```powershell
npm.cmd run seed
npm.cmd run seed:certify
npm.cmd run seed
npm.cmd run seed:certify
```

Ambas corridas deben producir los mismos conteos y el mismo Financial Summary.
No debe haber acumulacion de registros ni duplicados.

## Usuarios Locales

Todos usan el password local documentado arriba o `SEED_DEMO_PASSWORD`.

| Rol de membership          | Email                                    |
| -------------------------- | ---------------------------------------- |
| OWNER A                    | `owner.a@example.test`                   |
| ADMIN A                    | `admin.a@example.test`                   |
| PSYCHOLOGIST asignado A    | `psychologist.assigned.a@example.test`   |
| PSYCHOLOGIST no asignado A | `psychologist.unassigned.a@example.test` |
| RECEPTIONIST A             | `receptionist.a@example.test`            |
| BILLING A                  | `billing.a@example.test`                 |
| AUDITOR A                  | `auditor.a@example.test`                 |
| READ_ONLY A                | `readonly.a@example.test`                |
| OWNER B                    | `owner.b@example.test`                   |
| PSYCHOLOGIST B             | `psychologist.b@example.test`            |
| Multi membership A/B       | `multi.member@example.test`              |
| Membership suspendida      | `suspended.membership.a@example.test`    |
| Organization suspendida    | `suspended.organization@example.test`    |
| Sin membership             | `no.membership@example.test`             |

## Roles

El seed representa `OWNER`, `ADMIN`, `PSYCHOLOGIST`, `RECEPTIONIST`,
`BILLING`, `AUDITOR` y `READ_ONLY` mediante `OrganizationMembership.role`.
`User.role` se conserva como rol legacy global.

## Organizations

| Variable            | Slug                   | Estado      |
| ------------------- | ---------------------- | ----------- |
| `tenantAId`         | `tenant-dev-a`         | `ACTIVE`    |
| `tenantBId`         | `tenant-dev-b`         | `ACTIVE`    |
| `suspendedTenantId` | `tenant-dev-suspended` | `SUSPENDED` |

## Datos Generados

| Area                   | Conteo |
| ---------------------- | -----: |
| Organizations          |      3 |
| Users                  |     14 |
| Memberships            |     14 |
| Patients               |     21 |
| Case Files             |     16 |
| Session Notes          |     20 |
| Documents              |      3 |
| Appointments           |     26 |
| Financial Transactions |     26 |

Inventario clinico-operativo por tenant activo:

| Area                   | Tenant A | Tenant B |
| ---------------------- | -------: | -------: |
| Patients               |       15 |        6 |
| Case Files             |       12 |        4 |
| Session Notes          |       15 |        5 |
| Documents              |        2 |        1 |
| Appointments           |       20 |        6 |
| Financial Transactions |       20 |        6 |
| Active Assignments     |       14 |        6 |

## Certificacion Del Seed

POST-GO-LIVE.2.2A esta certificado con PostgreSQL 16 local real:

- todas las migraciones versionadas del repositorio aplicadas y
  `prisma migrate status` al dia;
- seed ejecutado dos veces sobre una base descartable limpia;
- `npm.cmd run seed:certify` aprobado dos veces;
- reset determinista sin acumulacion de registros;
- relaciones tenant verificadas para Tenant A, Tenant B y Organization
  suspendida;
- cero filas legacy-null creadas por el seed;
- datos exclusivamente sinteticos `.example.test`;
- expected Financial Summary estable.

## Expected Financial Summary

Tenant A sin filtros:

```json
{
  "incomeTotal": 7800,
  "expenseTotal": 2370,
  "adjustmentTotal": 250,
  "refundTotal": 450,
  "netTotal": 5230,
  "transactionCount": 20
}
```

Tenant B sin filtros:

```json
{
  "incomeTotal": 2549,
  "expenseTotal": 271,
  "adjustmentTotal": 0,
  "refundTotal": 90,
  "netTotal": 2188,
  "transactionCount": 6
}
```

## Coleccion Postman

Archivos:

- `postman/Psychology App - Tenant Aware.postman_collection.json`
- `postman/Psychology App - Local Tenant.postman_environment.json`

La coleccion conserva el estilo de la coleccion MVP anterior:

- variables de coleccion;
- scripts de login que guardan JWT;
- scripts de creacion que capturan IDs;
- carpetas funcionales por modulo;
- casos positivos y negativos en la misma corrida local.

POST-GO-LIVE.2.2B y POST-GO-LIVE.3.6 tooling local mantienen una coleccion
versionada y un runner local reproducible:

- JSON valido;
- Postman collection schema v2.1;
- 14 carpetas;
- 93 requests;
- las URLs usan `{{baseUrl}}` en `raw` y `host`;
- cada request incluye scripts de test;
- variables dinamicas para JWTs e IDs runtime exportadas vacias;
- fixtures fijos solo para escenarios seed documentados;
- sin tokens, PHI, API keys, URLs productivas, reportes o dumps.

La carpeta `POST-GO-LIVE.3.6 - Preferred Organization` certifica el flujo UX
de preferencia persistida, incluyendo set, switch, clear, independencia de
`X-Organization-Id`, errores redacted e invalid payloads. El comando
`npm.cmd run postman:certify` valida la estructura versionada de la coleccion y
ejecuta un flujo HTTP equivalente in-process contra la app local con el seed
determinista. No requiere Newman, Postman Cloud ni sesiones personales.

## Environment

El environment exportado deja tokens vacios. Las variables locales `.example.test`
son datos sinteticos y no representan secretos productivos.

## Variables

Variables principales:

- `baseUrl`
- `accessToken`
- `ownerAToken`
- `psychologistAssignedAToken`
- `receptionistAToken`
- `billingAToken`
- `tenantHeaderName`
- `tenantAId`
- `tenantBId`
- `suspendedTenantId`
- `patientId`
- `caseFileId`
- `sessionNoteId`
- `documentId`
- `appointmentId`
- `financialTransactionId`
- emails por rol
- `defaultPassword`

## Orden De Ejecucion

1. `00 - Setup`
2. `01 - Auth`
3. `02 - Tenant Context`
4. `03 - Patients`
5. `04 - Case Files & Workspace`
6. `05 - Session Notes`
7. `06 - Documents`
8. `07 - Appointments`
9. `08 - Financial Transactions`
10. `09 - Financial Summary`
11. `10 - Role & Capability Scenarios`
12. `11 - Cross-Tenant Scenarios`
13. `12 - Cleanup`

## Flujos Positivos

- OWNER A: login, contexto, Patient, Case File, Workspace, Session Note,
  Document metadata, Appointment, Finance y Summary.
- PSYCHOLOGIST asignado A: acceso clinico a fixtures asignados.
- RECEPTIONIST A: lectura y operacion de appointments sin notes clinicas.
- BILLING A: Finance CRUD y Summary sin acceso clinico.

## Flujos Negativos

La coleccion cubre:

- password invalido;
- token ausente o invalido en rutas protegidas;
- tenant malformed;
- membership suspendida;
- Organization suspendida;
- falta de capability;
- READ_ONLY default-deny;
- RECEPTIONIST intentando notes;
- PSYCHOLOGIST intentando Finance;
- server-owned fields en Patient, Appointment y Finance.

## Cobertura Estatica De Endpoints

La coleccion se concentra en los endpoints tenant-aware certificados para
Auth, Tenant Context, Patients, Case Files, Workspace, Session Notes,
Documents, Appointments, Financial Transactions y Financial Summary.

| Modulo                 | Cobertura estatica                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Auth                   | Login por rol, password invalido y reutilizacion de JWT dinamico                                 |
| Tenant Context         | Contexto valido, token ausente/invalido, tenant malformed, membership y organization suspendidas |
| Patients               | Create, list, detail, update, cross-tenant y cleanup                                             |
| Case Files             | Create, list, by patient, detail, workspace y update                                             |
| Workspace              | Workspace tenant-scoped incluido en Case Files                                                   |
| Session Notes          | Create, list, by case file, detail, update y cleanup                                             |
| Documents              | Metadata create/list/detail/update, by case file, blob cross-tenant y cleanup                    |
| Appointments           | Create, list, by patient, detail, update, roles y cleanup                                        |
| Financial Transactions | Create, list, filters, detail, update, roles, cross-tenant y cleanup                             |
| Financial Summary      | Summary tenant-scoped y filtro con Patient B excluido                                            |

Los endpoints administrativos de Organizations, Memberships e Invitations no
forman parte de esta coleccion porque POST-GO-LIVE.2.2 es tooling auxiliar para
el dataset tenant-aware y los flujos clinico-financieros convertidos. Esa
exclusion no cambia el contrato de esas APIs ni sustituye sus suites E2E.

Tambien quedan fuera del run Postman actual:

- `GET /`, `GET /health/live` y `GET /health/ready`, porque son checks de
  infraestructura cubiertos por OpenAPI y pruebas de health;
- `POST /documents/upload`, porque requiere multipart con archivo fisico y la
  coleccion 2.2 evita persistir archivos de prueba en exports;
- `GET /documents/:id/view`, porque comparte autorizacion de blob con
  `GET /documents/:id/download`; el escenario cross-tenant de blob usa
  `download` como representante.

## Cross-Tenant Scenarios

La coleccion usa fixtures estables documentados del seed para verificar que un
actor de Tenant A no pueda leer:

- Patient B;
- Document B;
- Blob B;
- Appointment B;
- Financial Transaction B.

Esos IDs son fixtures deterministas del seed y se documentan como excepcion
controlada a la regla general de captura dinamica.

## Runner Postman

El repositorio no depende de un runner Postman cloud ni de un login personal.
La certificacion local aprobada para esta etapa es:

```powershell
npm.cmd run postman:certify
```

### Runner Evaluation and Deferred Certification

Newman 6.2.2 fue evaluado y descartado para esta etapa porque su arbol npm
instalado introdujo una vulnerabilidad critica en la auditoria del proyecto. La
dependencia fue retirada y no queda diff residual en `package-lock.json`.

Postman CLI oficial tambien fue evaluado como herramienta externa firmada. La
instalacion desde el ZIP oficial de Postman fue verificable con firma
Authenticode valida de `Postman, Inc.`, pero la ejecucion local de la coleccion
mostro comportamiento de publicacion cloud al solicitar credenciales para
publicar detalles del run. Por esa razon no queda aprobado como gate local en
esta fase mientras se mantenga la prohibicion de login, API key y Postman Cloud.

Postman Desktop 12.20.4 fue detectado con firma valida, pero no se uso porque
existe una sesion previa del usuario y la certificacion prohibia usar sesiones
personales o sincronizacion cloud. Cerrar esa sesion tampoco resuelve el gate:
el modo sin sesion no satisface la ejecucion completa de Collections y
Environments requerida para este control.

Comandos de verificacion usados durante la evaluacion:

```powershell
Get-Command postman
postman --version
Get-AuthenticodeSignature "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps\postman.exe"
Get-FileHash "$env:USERPROFILE\AppData\Local\Microsoft\WindowsApps\postman.exe" -Algorithm SHA256
```

La coleccion se mantiene como artefacto local versionado y el runner local del
repositorio evita depender de sincronizacion cloud. Postman Desktop y Postman
CLI siguen siendo opcionales para inspeccion manual, no requisitos del gate
local automatizado.

## Limitaciones Diferidas

- Ejecucion mediante Newman o Postman CLI oficial como requisito obligatorio.
- Integracion CI del runner local.
- Uso del artefacto Postman como gate unico de release.

## Cleanup

La carpeta `12 - Cleanup` elimina recursos creados durante la corrida. Si una
ejecucion se interrumpe, volver a correr `npm.cmd run seed` restaura el dataset
base.

## Troubleshooting

- `403` inesperado en clinica: confirmar `X-Organization-Id`, capability y
  assignment. La autorizacion clinica tambien conserva la restriccion temporal
  `psychologistId === userId`.
- `404` en cross-tenant: es el resultado esperado para recursos de otro tenant.
- Summary distinto: verificar si la coleccion creo una transaccion adicional y
  no ejecuto cleanup.
- Blob no encontrado: volver a ejecutar el seed para regenerar archivos locales.

## Seguridad

- Datos exclusivamente sinteticos.
- Emails `.example.test`.
- Tokens no exportados.
- Sin `DATABASE_URL`, `JWT_SECRET`, JWT reales, API keys ni datos clinicos reales
  en Postman.
- No ejecutar contra produccion.

## Fuera De Alcance

- Organization CRUD administrativo.
- Membership CRUD administrativo.
- Invitations.
- Transferencia de OWNER.
- Switch Organization funcional de fase 3.
- Branding productivo.
- Billing comercial.
- Frontend multi-tenant.
- Legacy-null dentro del seed principal.
- Migraciones nuevas o cambios a `prisma/schema.prisma`.
