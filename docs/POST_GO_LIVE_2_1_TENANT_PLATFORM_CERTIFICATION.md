# POST-GO-LIVE.2.1D5 Tenant Platform Certification

## Status

Published for D5-R review. The backend tenant-aware clinical and financial
platform is certified locally on the D5 branch with the existing four Prisma
migrations and disposable PostgreSQL certification databases.

POST-GO-LIVE.2.1D is not closed by this report. Final closure remains pending
D5-R review, controlled merge to `development`, post-merge verification, and
the explicit closure decision.

## Certification Scope

D5 certifies the composed tenant-aware backend platform created by D1 through
D4:

* D1 Patients tenant policy alignment.
* D2 Case Files, Workspace, Session Notes, and Documents tenant conversion.
* D3 Appointments, Financial Transactions, and Financial Summary tenant
  conversion.
* D4 integrated tenant behavior across the converted surfaces.

The D5 suite is an opt-in readiness gate:

```text
RUN_TENANT_PLATFORM_CERTIFICATION_TESTS=true
```

Default Jest and default E2E runs intentionally skip this suite unless the env
gate is set.

## Readiness Decision

The backend tenant platform is ready for D5-R review.

The platform is considered ready for controlled review because the converted
clinical and financial modules now consistently require validated tenant
context, active organization membership, explicit capability grants, scoped
repository predicates, server-owned tenant fields, and clinical assignment
where documented.

## Certified Gates

D5 certifies the following minimum readiness gates:

* Valid tenant context resolves through `/auth/context`.
* Suspended memberships and suspended organizations cannot establish runtime
  tenant authority.
* Cross-tenant Patient detail access returns `404`.
* Clinical Case File and Session Note access requires tenant scope plus active
  clinical assignment.
* `RECEPTIONIST` can perform operational appointment actions without receiving
  or mutating clinical notes.
* `BILLING` can use financial surfaces but cannot read clinical Case Files.
* Document blob download is blocked before filesystem access when metadata is
  cross-tenant.
* Forged `organizationId` and `createdById` payload fields are ignored for
  Financial Transaction creation.
* Financial Summary totals and filters remain isolated by tenant.
* Legacy rows with `organizationId = NULL` remain excluded from tenant-aware
  runtime reads and summaries.
* Unknown or future capabilities default to DENY.
* Representative OpenAPI request schemas keep server-owned fields out of
  client-writable DTO contracts.

## Evidence Commands

The D5 review package expects these local gates to pass against a disposable
PostgreSQL database named `psychology_app_d5_certification_test`:

```text
npx prisma migrate deploy
npx prisma migrate status
RUN_PATIENTS_TENANT_CERTIFICATION_TESTS=true npm run test:e2e -- --runInBand patients-tenant.e2e-spec.ts
RUN_CLINICAL_CORE_DOCUMENTS_TENANT_CERTIFICATION_TESTS=true npm run test:e2e -- --runInBand clinical-core-documents-tenant.e2e-spec.ts
RUN_SCHEDULING_FINANCIAL_TENANT_CERTIFICATION_TESTS=true npm run test:e2e -- --runInBand scheduling-financial-tenant.e2e-spec.ts
RUN_INTEGRATED_TENANT_CONTRACT_TESTS=true npm run test:e2e -- --runInBand integrated-tenant-contract.e2e-spec.ts
RUN_TENANT_PLATFORM_CERTIFICATION_TESTS=true npm run test:e2e -- --runInBand tenant-platform-certification.e2e-spec.ts
RUN_TENANT_CERTIFICATION_TESTS=true npm test -- --runInBand tenant-context.certification.integration.spec.ts
RUN_TENANT_CERTIFICATION_TESTS=true npm run test:e2e -- --runInBand tenant-context.e2e-spec.ts
npm test -- --runInBand openapi-document.spec.ts
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

The migration status gate must show exactly these four migrations:

```text
20260715090000_baseline_current_schema
20260715090100_add_persistence_checks
20260717120000_add_saas_foundation
20260723120000_add_invitation_membership_lifecycle
```

## Non-Goals

D5 does not introduce Prisma schema changes, migrations, production database
access, deployment, data backfill, frontend work, SaaS billing,
organization-administration expansion, patient portal behavior, global Prisma
middleware, PostgreSQL RLS, auto-merge, or POST-GO-LIVE.3 work.

The existing organization, membership, and invitation APIs from
POST-GO-LIVE.2.1C2 remain documented foundation APIs. D5 certification is about
the tenant-aware clinical and financial conversion platform, not new tenant
administration product development.

## Residual Risks

The residual risk for release review is procedural rather than architectural:
the opt-in certification gates must be run explicitly because default test
commands skip them by design. Any production rollout still requires a separate
target-environment rehearsal, legacy data backfill decision, deployment
approval, and post-merge verification.

## Closure Criteria

POST-GO-LIVE.2.1D can only be closed after D5-R review confirms this report,
the D5 opt-in suite, D1 through D4 regression evidence, migration status, and
controlled merge evidence on `development`.
