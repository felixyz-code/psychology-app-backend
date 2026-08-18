import { MembershipRole, OrganizationStatus, UserRole } from '@prisma/client';

import { buildLegacyBackfillPlan, hasChanges } from './legacy-backfill.service';
import {
  ManifestValidationError,
  parseLegacyBackfillManifest,
} from './manifest';
import { buildBackfillReport } from './report';
import {
  assertApplyEnvironment,
  parseBackfillCliOptions,
  redactDatabaseUrls,
} from './safety';

const ownerId = '00000000-0000-4000-8000-000000000001';
const psychologistId = '00000000-0000-4000-8000-000000000002';
const patientId = '00000000-0000-4000-8000-000000000003';
const organizationId = '00000000-0000-4000-8000-000000000004';
const membershipId = '00000000-0000-4000-8000-000000000005';

const manifest = parseLegacyBackfillManifest({
  version: 1,
  organization: {
    slug: 'legacy-test',
    legalName: 'Legacy Test Practice',
    displayName: 'Legacy Test',
    status: 'ACTIVE',
  },
  owner: { userId: ownerId },
});

describe('legacy backfill foundation', () => {
  it('rejects invalid manifests, unknown fields, invalid slugs and absent OWNERs', () => {
    expect(() =>
      parseLegacyBackfillManifest({
        version: 1,
        organization: {
          slug: 'Legacy Test',
          legalName: 'Legacy',
          displayName: 'Legacy',
          status: 'ACTIVE',
        },
        owner: { userId: ownerId },
        unexpected: true,
      }),
    ).toThrow(ManifestValidationError);
    expect(() =>
      parseLegacyBackfillManifest({
        version: 2,
        organization: {
          slug: 'legacy-test',
          legalName: 'Legacy',
          displayName: 'Legacy',
          status: 'ACTIVE',
        },
        owner: {},
      }),
    ).toThrow('version must be exactly 1');
  });

  it('plans all legacy entities, maps ADMIN without clinical membership, and creates PRIMARY assignments', () => {
    const plan = buildLegacyBackfillPlan(legacySnapshot(), manifest);

    expect(plan.blockers).toEqual([]);
    expect(plan.organization.action).toBe('create');
    expect(plan.memberships.create).toEqual([
      { userId: ownerId, role: MembershipRole.OWNER },
      { userId: psychologistId, role: MembershipRole.PSYCHOLOGIST },
    ]);
    expect(plan.profiles.create).toEqual([
      { userId: psychologistId, professionalName: 'Confidential psychologist' },
    ]);
    expect(plan.assignments.create).toEqual([{ patientId, psychologistId }]);
    expect(plan.updates).toEqual({
      patients: [patientId],
      caseFiles: ['00000000-0000-4000-8000-000000000006'],
      sessionNotes: ['00000000-0000-4000-8000-000000000007'],
      documents: ['00000000-0000-4000-8000-000000000008'],
      appointments: ['00000000-0000-4000-8000-000000000009'],
      financialTransactions: [
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000011',
      ],
    });
  });

  it('is logically idempotent after a complete matching run', () => {
    const plan = buildLegacyBackfillPlan(completedSnapshot(), manifest);

    expect(plan.blockers).toEqual([]);
    expect(hasChanges(plan)).toBe(false);
    expect(plan.assignments.existing).toBe(1);
    expect(plan.profiles).toEqual({ create: [], existing: 1 });
  });

  it('fails closed when the explicit OWNER is absent', () => {
    const plan = buildLegacyBackfillPlan(
      { ...legacySnapshot(), users: legacySnapshot().users.slice(1) },
      manifest,
    );

    expect(plan.blockers.map((blocker) => blocker.code)).toContain(
      'OWNER_NOT_FOUND',
    );
    expect(
      buildBackfillReport({
        mode: 'dry-run',
        manifest,
        plan,
        durationMs: 10,
        database: { host: 'localhost', port: '5432', database: 'legacy_test' },
      }).invariants.idempotentState,
    ).toBe(false);
  });

  it('defaults to a non-destructive mode and redacts database credentials', () => {
    expect(
      parseBackfillCliOptions([
        '--manifest',
        'prisma/backfill/legacy-backfill.manifest.example.json',
        '--dry-run',
      ]),
    ).toMatchObject({ mode: 'dry-run' });
    expect(() =>
      parseBackfillCliOptions(['--manifest', 'manifest.json']),
    ).toThrow('Choose exactly one');
    expect(() =>
      assertApplyEnvironment('postgresql://user:password@localhost:5432/prod', {
        BACKFILL_CONFIRMATION: 'LEGACY_BACKFILL_APPLY',
        BACKFILL_ALLOW_NON_TEST_DATABASE: 'true',
      }),
    ).toThrow('production-like');
    expect(
      redactDatabaseUrls(
        'Failed: postgresql://user:password@db.example/private',
      ),
    ).toBe('Failed: [REDACTED_DATABASE_URL]');
  });

  it('does not include profile names or clinical data in structured reports', () => {
    const plan = buildLegacyBackfillPlan(legacySnapshot(), manifest);
    const output = JSON.stringify(
      buildBackfillReport({
        mode: 'dry-run',
        manifest,
        plan,
        durationMs: 10,
        database: { host: 'localhost', port: '5432', database: 'legacy_test' },
      }),
    );

    expect(output).not.toContain('Confidential psychologist');
    expect(output).not.toContain('clinical note');
    expect(
      buildBackfillReport({
        mode: 'dry-run',
        manifest,
        plan,
        durationMs: 10,
        database: { host: 'localhost', port: '5432', database: 'legacy_test' },
      }).reconciliation,
    ).toMatchObject({
      eligiblePatients: 1,
      compatiblePrimaryAssignments: 0,
      primaryAssignmentsToCreate: 1,
      eligibleUsers: 2,
      compatibleMemberships: 0,
      membershipsToCreate: 2,
    });
  });
});

function legacySnapshot() {
  return {
    organizations: [],
    users: [
      { id: ownerId, name: 'Administrator', role: UserRole.ADMIN },
      {
        id: psychologistId,
        name: 'Confidential psychologist',
        role: UserRole.PSYCHOLOGIST,
      },
    ],
    memberships: [],
    profiles: [],
    patients: [{ id: patientId, psychologistId, organizationId: null }],
    caseFiles: [
      {
        id: '00000000-0000-4000-8000-000000000006',
        organizationId: null,
        patient: { organizationId: null },
      },
    ],
    sessionNotes: [
      {
        id: '00000000-0000-4000-8000-000000000007',
        organizationId: null,
        caseFile: { patient: { organizationId: null } },
      },
    ],
    documents: [
      {
        id: '00000000-0000-4000-8000-000000000008',
        organizationId: null,
        caseFile: { patient: { organizationId: null } },
      },
    ],
    appointments: [
      {
        id: '00000000-0000-4000-8000-000000000009',
        organizationId: null,
        patient: { organizationId: null },
      },
    ],
    financialTransactions: [
      {
        id: '00000000-0000-4000-8000-000000000010',
        organizationId: null,
        patient: { id: patientId, organizationId: null },
        appointment: null,
      },
      {
        id: '00000000-0000-4000-8000-000000000011',
        organizationId: null,
        patient: null,
        appointment: null,
      },
    ],
    assignments: [],
  };
}

function completedSnapshot() {
  const snapshot = legacySnapshot();
  return {
    ...snapshot,
    organizations: [
      {
        id: organizationId,
        slug: manifest.organization.slug,
        legalName: manifest.organization.legalName,
        displayName: manifest.organization.displayName,
        status: OrganizationStatus.ACTIVE,
      },
    ],
    memberships: [
      {
        id: '00000000-0000-4000-8000-000000000012',
        organizationId,
        userId: ownerId,
        role: MembershipRole.OWNER,
        status: 'ACTIVE',
      },
      {
        id: membershipId,
        organizationId,
        userId: psychologistId,
        role: MembershipRole.PSYCHOLOGIST,
        status: 'ACTIVE',
      },
    ],
    profiles: [{ userId: psychologistId }],
    patients: [{ id: patientId, psychologistId, organizationId }],
    caseFiles: snapshot.caseFiles.map((item) => ({
      ...item,
      organizationId,
      patient: { organizationId },
    })),
    sessionNotes: snapshot.sessionNotes.map((item) => ({
      ...item,
      organizationId,
      caseFile: { patient: { organizationId } },
    })),
    documents: snapshot.documents.map((item) => ({
      ...item,
      organizationId,
      caseFile: { patient: { organizationId } },
    })),
    appointments: snapshot.appointments.map((item) => ({
      ...item,
      organizationId,
      patient: { organizationId },
    })),
    financialTransactions: snapshot.financialTransactions.map((item) => ({
      ...item,
      organizationId,
      patient: item.patient ? { ...item.patient, organizationId } : null,
      appointment: item.appointment,
    })),
    assignments: [
      {
        patientId,
        organizationId,
        membershipId,
        role: 'PRIMARY',
        status: 'ACTIVE',
      },
    ],
  };
}
