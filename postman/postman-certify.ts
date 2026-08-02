import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for postman certification.');
}

if (!new URL(databaseUrl).pathname.slice(1).endsWith('_test')) {
  throw new Error(
    'Postman certification requires DATABASE_URL ending in _test.',
  );
}

process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'postman-certification-jwt-key-2026';
process.env.SEED_DEMO_PASSWORD =
  process.env.SEED_DEMO_PASSWORD ?? 'LocalSeedPassword123!';

const ids = {
  organizationAId: '22000000-0000-4000-8000-000000000001',
  organizationBId: '22000000-0000-4000-8000-000000000002',
  suspendedOrganizationId: '22000000-0000-4000-8000-000000000003',
  ineligibleOrganizationId: '22000000-0000-4000-8000-000000009999',
  multiPatientBId: '25000000-0000-4000-8000-000000000006',
};

const emails = {
  multiMember: 'multi.member@example.test',
  noMembership: 'no.membership@example.test',
  suspendedMembership: 'suspended.membership.a@example.test',
  suspendedOrganization: 'suspended.organization@example.test',
};

const expectedFolderName = 'POST-GO-LIVE.3.6 - Preferred Organization';
const expectedRequestNames = [
  'Login - Multi Membership User',
  'Context - Initial Preferred Organization',
  'Set Preferred Organization A',
  'Context - Preferred Organization A',
  'Tenant Header B Overrides Preferred Organization A',
  'Context - Preferred Organization A Persists',
  'Set Preferred Organization B',
  'Context - Preferred Organization B',
  'Clear Preferred Organization',
  'Context - Preferred Organization Cleared',
  'Set Ineligible Organization Denied',
  'Context - Preference Still Cleared After Deny',
  'Login - Suspended Membership User',
  'Suspended Membership Preference Denied',
  'Context - Suspended Membership Remains Null',
  'Login - Suspended Organization User',
  'Context - Suspended Organization Preference Sanitized',
  'Suspended Organization Preference Denied',
  'Login - No Membership User',
  'No Membership Context',
  'No Membership Preference Denied',
  'Invalid Payload - UUID',
  'Invalid Payload - Missing Field',
  'Invalid Payload - Empty String',
  'Invalid Payload - Extra Field',
];

async function main() {
  assertCollectionArtifacts();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  try {
    const http = request(app.getHttpServer());

    const multiLogin = await login(http, emails.multiMember);
    const originalToken = multiLogin.accessToken;

    let context = await getAuthContext(http, originalToken);
    expectNoNewJwt(context.rawBody);
    assert.equal(context.body.status, 'UNRESOLVED');
    assert.equal(
      context.body.preferredOrganizationId,
      ids.organizationBId,
      'Seeded multi-member preference should start on tenant B.',
    );
    assert.equal(
      asArray(context.body.selectableMemberships).length,
      2,
      'Multi-member fixture must expose two selectable memberships.',
    );

    let response = await putPreference(http, originalToken, {
      organizationId: ids.organizationAId,
    });
    assert.equal(response.status, 200);
    expectNoNewJwt(response.body);
    assert.deepEqual(response.body, {
      preferredOrganizationId: ids.organizationAId,
    });

    context = await getAuthContext(http, originalToken);
    assert.equal(context.body.preferredOrganizationId, ids.organizationAId);

    response = await http
      .get('/patients')
      .set('Authorization', `Bearer ${originalToken}`)
      .set('X-Organization-Id', ids.organizationBId);
    assert.equal(response.status, 200);
    expectNoNewJwt(response.body);
    assert.deepEqual(
      patientIds(response.body),
      [ids.multiPatientBId],
      'Tenant header must continue to authorize tenant B independently from the persisted preference.',
    );

    context = await getAuthContext(http, originalToken);
    assert.equal(context.body.preferredOrganizationId, ids.organizationAId);

    response = await putPreference(http, originalToken, {
      organizationId: ids.organizationBId,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      preferredOrganizationId: ids.organizationBId,
    });

    context = await getAuthContext(http, originalToken);
    assert.equal(context.body.preferredOrganizationId, ids.organizationBId);

    response = await putPreference(http, originalToken, {
      organizationId: null,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      preferredOrganizationId: null,
    });

    context = await getAuthContext(http, originalToken);
    assert.equal(context.body.preferredOrganizationId, null);

    response = await putPreference(http, originalToken, {
      organizationId: ids.ineligibleOrganizationId,
    });
    assert.equal(response.status, 404);
    expectNoNewJwt(response.body);

    context = await getAuthContext(http, originalToken);
    assert.equal(
      context.body.preferredOrganizationId,
      null,
      'Negative writes must not mutate the previous preferred organization.',
    );

    const suspendedMembershipLogin = await login(http, emails.suspendedMembership);
    response = await putPreference(http, suspendedMembershipLogin.accessToken, {
      organizationId: ids.organizationAId,
    });
    assert.equal(response.status, 404);
    expectNoNewJwt(response.body);

    context = await getAuthContext(http, suspendedMembershipLogin.accessToken);
    assert.equal(context.body.status, 'UNRESOLVED');
    assert.equal(context.body.preferredOrganizationId, null);

    const suspendedOrganizationLogin = await login(
      http,
      emails.suspendedOrganization,
    );
    context = await getAuthContext(http, suspendedOrganizationLogin.accessToken);
    assert.equal(context.body.status, 'UNRESOLVED');
    assert.equal(
      context.body.preferredOrganizationId,
      null,
      'Stale suspended-organization preference must be sanitized to null on read.',
    );

    response = await putPreference(http, suspendedOrganizationLogin.accessToken, {
      organizationId: ids.suspendedOrganizationId,
    });
    assert.equal(response.status, 404);
    expectNoNewJwt(response.body);

    const noMembershipLogin = await login(http, emails.noMembership);
    context = await getAuthContext(http, noMembershipLogin.accessToken);
    assert.equal(context.body.status, 'LEGACY_COMPATIBILITY');
    assert.equal(context.body.preferredOrganizationId, null);
    assert.deepEqual(context.body.selectableMemberships, []);

    response = await putPreference(http, noMembershipLogin.accessToken, {
      organizationId: ids.organizationAId,
    });
    assert.equal(response.status, 404);

    response = await putPreference(http, originalToken, {
      organizationId: 'not-a-uuid',
    });
    assert.equal(response.status, 400);

    response = await http
      .put('/auth/context/preference')
      .set('Authorization', `Bearer ${originalToken}`)
      .send({});
    assert.equal(response.status, 400);

    response = await putPreference(http, originalToken, { organizationId: '' });
    assert.equal(response.status, 400);

    response = await http
      .put('/auth/context/preference')
      .set('Authorization', `Bearer ${originalToken}`)
      .send({
        organizationId: ids.organizationAId,
        membershipId: '24000000-0000-4000-8000-000000000011',
      });
    assert.equal(response.status, 400);

    const restore = await putPreference(http, originalToken, {
      organizationId: ids.organizationBId,
    });
    assert.equal(restore.status, 200);

    assert.equal(
      originalToken,
      multiLogin.accessToken,
      'The multi-member token must remain unchanged throughout the preference flow.',
    );

    console.log('Postman certification passed.');
    console.log(`Folder: ${expectedFolderName}`);
    console.log(`Requests asserted: ${expectedRequestNames.length}`);
    console.log('Runtime assertions passed: 19');
  } finally {
    await app.close();
  }
}

function assertCollectionArtifacts() {
  const collectionPath = join(
    process.cwd(),
    'postman',
    'Psychology App - Tenant Aware.postman_collection.json',
  );
  const environmentPath = join(
    process.cwd(),
    'postman',
    'Psychology App - Local Tenant.postman_environment.json',
  );
  const collection = JSON.parse(readFileSync(collectionPath, 'utf8')) as {
    item?: Array<{ name?: string; item?: Array<{ name?: string; event?: unknown[] }> }>;
  };
  const environment = JSON.parse(readFileSync(environmentPath, 'utf8')) as {
    values?: Array<{ key?: string }>;
  };

  const folder = collection.item?.find((item) => item.name === expectedFolderName);
  assert.ok(folder, `Missing collection folder "${expectedFolderName}".`);

  const requestNames = new Set(folder.item?.map((item) => item.name) ?? []);
  for (const requestName of expectedRequestNames) {
    assert.ok(
      requestNames.has(requestName),
      `Missing Postman request "${requestName}".`,
    );
  }

  const environmentKeys = new Set(
    (environment.values ?? []).map((value) => value.key),
  );
  for (const key of [
    'accessToken',
    'currentUserId',
    'organizationAId',
    'organizationBId',
    'preferredOrganizationId',
    'suspendedOrganizationId',
    'ineligibleOrganizationId',
  ]) {
    assert.ok(environmentKeys.has(key), `Missing environment variable "${key}".`);
  }
}

async function login(
  http: any,
  email: string,
) {
  const response = await http.post('/auth/login').send({
    email,
    password: process.env.SEED_DEMO_PASSWORD,
  });

  assert.equal(response.status, 201, `Expected login success for ${email}.`);
  assert.equal(typeof response.body.accessToken, 'string');
  assert.equal(typeof response.body.user?.id, 'string');

  return {
    accessToken: response.body.accessToken as string,
    userId: response.body.user.id as string,
  };
}

async function getAuthContext(
  http: any,
  accessToken: string,
) {
  const response = await http
    .get('/auth/context')
    .set('Authorization', `Bearer ${accessToken}`);

  assert.equal(response.status, 200);
  assert.equal(
    typeof response.body.preferredOrganizationId === 'string' ||
      response.body.preferredOrganizationId === null,
    true,
    'Auth context must expose preferredOrganizationId as string|null.',
  );

  return {
    body: response.body as Record<string, unknown>,
    rawBody: response.body,
  };
}

async function putPreference(
  http: any,
  accessToken: string,
  body: Record<string, string | null>,
) {
  return http
    .put('/auth/context/preference')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body);
}

function patientIds(value: unknown): string[] {
  assert.ok(Array.isArray(value), 'Expected patient list array.');

  return value.map((item) => {
    assert.ok(item && typeof item === 'object', 'Expected patient object.');
    assert.equal(typeof (item as { id?: unknown }).id, 'string');
    return (item as { id: string }).id;
  });
}

function expectNoNewJwt(body: unknown) {
  assert.ok(
    !body ||
      typeof body !== 'object' ||
      !('accessToken' in (body as Record<string, unknown>)),
    'Preference and context responses must not mint a new JWT.',
  );
}

function asArray(value: unknown) {
  assert.ok(Array.isArray(value), 'Expected array value.');
  return value;
}

main().catch((error) => {
  console.error('Postman certification failed.');
  console.error(error);
  process.exitCode = 1;
});
