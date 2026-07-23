# ADR: Tenant Data Isolation Strategy

## Status

Accepted as the future module-conversion contract. This document makes no runtime, Prisma, or schema change.

## Decision

Tenant isolation will use tenant-aware repositories and an authorization policy service. Each protected operation receives server-validated scope; services must not reconstruct scope from request input. Repositories apply tenant predicates and policies decide capability plus ownership or assignment conditions.

## Mandatory query rules

* Every tenant-owned root query includes `organizationId` from scope.
* `findUnique({ where: { id } })` is prohibited for tenant-owned resources unless the same scoped authorization happened in the same transaction. Prefer `findFirst({ where: { id, organizationId } })`.
* Mutations use `updateMany` or `deleteMany` with `id + organizationId + any ownership/assignment predicate`; `count !== 1` maps to `404`.
* Creates derive `organizationId` from scope; DTOs cannot set it.
* Relation IDs are authorized in the same tenant before create/update. A patient, case file, appointment, document, or transaction cannot bridge organizations.
* Nested relation reads, workspace projections, counts, groupBy, aggregate, report, export, and dashboard queries carry the tenant predicate.
* Cross-tenant reads and writes return `404`, not `403`, after valid context.

## Ownership and assignments

Tenant scope is the outer boundary. Legacy `psychologistId` remains a temporary compatibility condition during conversion but never broadens tenant scope. `PatientAssignment` is a secondary clinical policy condition and never substitutes for active membership.

## Prisma options

Repositories are the primary defense because scope is explicit and testable. Client Extensions may provide narrow helpers but cannot be the sole control: they are bypassable by alternate client use, nested writes, raw SQL, or an unscoped model. Global Prisma middleware is not adopted because it cannot reliably distinguish tenant models, public operations, and relation semantics.

Raw SQL is forbidden for tenant data unless it receives security review, parameterizes values, accepts explicit scope, and has a cross-tenant contract test. Transactions pass the same scope to every repository operation and revalidate relationships inside the transaction where races matter.

PostgreSQL RLS may be evaluated later as defense in depth only. It needs `SET LOCAL` context in each transaction, safe pool reset design, raw-SQL policy, migration ownership, and production rehearsal. It does not replace application authorization.

## Testing gate

Every converted module must prove list/read/create/update/delete isolation, foreign relation rejection, aggregate/export scope, null legacy behavior, and parallel two-organization requests. Tests must cover direct IDs and included relations; happy-path filtering is insufficient.
