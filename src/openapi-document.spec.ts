import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

const originalEnvironment = { ...process.env };
const syntheticEnvironment = {
  DATABASE_URL:
    'postgresql://test-user:test-password@localhost:5432/openapi_contract_test',
  JWT_SECRET: 'openapi-contract-validation-signing-key-2026',
  SWAGGER_ENABLED: 'true',
};

describe('OpenAPI document', () => {
  let app: INestApplication;

  beforeAll(async () => {
    Object.assign(process.env, syntheticEnvironment);

    try {
      const { AppModule } =
        jest.requireActual<typeof import('./app.module')>('./app.module');
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleRef.createNestApplication();
    } catch (error) {
      restoreEnvironment();
      throw error;
    }
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      restoreEnvironment();
    }
  });

  it('documents every certified route and the Bearer security scheme', () => {
    const document = createDocument(app);

    expect(Object.keys(document.paths)).toHaveLength(140);
    expect(
      document.paths['/teleconsultation/access/{roomCode}'].get?.security,
    ).toBeUndefined();
    expect(document.paths['/auth/refresh'].post?.security).toBeUndefined();
    expect(document.paths['/auth/sessions'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/auth/sessions/{id}'].delete?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/auth/sessions/revoke-others'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(document.paths['/auth/logout'].post?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.components?.securitySchemes?.bearer).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Paste the JWT access token here',
    });
    expect(document.paths['/notification-templates'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/notification-templates'].post?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/notification-templates/variables'].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/notification-templates/seed-defaults'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/notification-templates/render-preview'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/notification-templates/{id}'].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/notification-templates/{id}'].patch?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/notification-templates/{id}'].delete?.security,
    ).toEqual([{ bearer: [] }]);
    expect(document.paths['/appointments/availability'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/appointments/{id}/reschedule'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(document.paths['/schedule-blocks'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/schedule-blocks'].post?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/schedule-blocks/{id}'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/schedule-blocks/{id}'].delete?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/case-files/{id}/attachments'].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/case-files/{id}/attachments'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/case-files/{id}/attachments/{attachmentId}/download'].get
        ?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/case-files/{id}/attachments/{attachmentId}/view'].get
        ?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/case-files/{id}/attachments/{attachmentId}'].delete
        ?.security,
    ).toEqual([{ bearer: [] }]);
    expect(document.paths['/case-files/{id}/pdf-data'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/case-files/{id}/notes/{noteId}/pdf-data'].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/case-files/{id}/consent-data'].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/session-notes/{id}/pdf-data'].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(document.paths['/users/me/profile'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/users/me/preferences'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/users/me/preferences'].patch?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/assessments/administrations'].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/assessments/administrations'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/assessments/administrations/{id}/responses'].patch
        ?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/assessments/administrations/{id}/complete'].post
        ?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/assessments/administrations/{id}/report'].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/assessments/patients/{patientId}/longitudinal'].get
        ?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/assessments/public/runner/{accessToken}'].get?.security,
    ).toBeUndefined();
    expect(
      document.paths['/assessments/public/runner/{accessToken}/responses'].patch
        ?.security,
    ).toBeUndefined();
    expect(
      document.paths['/assessments/public/runner/{accessToken}/complete'].post
        ?.security,
    ).toBeUndefined();
    expect(document.paths['/audit-logs'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/audit-logs'].get?.responses).toHaveProperty('200');
    expect(document.paths['/audit-logs'].get?.responses).toHaveProperty('401');
    expect(document.paths['/audit-logs'].get?.responses).toHaveProperty('403');
    expect(document.paths['/audit-logs/export'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/audit-logs/export'].get?.responses).toHaveProperty(
      '200',
    );
    expect(document.paths['/audit-logs/export'].get?.responses).toHaveProperty(
      '401',
    );
    expect(document.paths['/audit-logs/export'].get?.responses).toHaveProperty(
      '403',
    );
    expect(document.paths['/audit-logs/{id}'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/audit-logs/{id}'].get?.responses).toHaveProperty(
      '200',
    );
    expect(document.paths['/audit-logs/{id}'].get?.responses).toHaveProperty(
      '401',
    );
    expect(document.paths['/audit-logs/{id}'].get?.responses).toHaveProperty(
      '403',
    );
    expect(document.paths['/audit-logs/{id}'].get?.responses).toHaveProperty(
      '404',
    );
    expect(document.paths['/auth/login'].post?.security).toBeUndefined();
    expect(
      document.paths['/auth/forgot-password'].post?.security,
    ).toBeUndefined();
    expect(
      document.paths['/auth/freelancer-bootstrap'].post?.security,
    ).toBeUndefined();
    expect(document.paths['/auth/context'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/auth/context/preference'].put?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/health'].get?.security).toBeUndefined();
    expect(document.paths['/health/live'].get?.security).toBeUndefined();
    expect(document.paths['/health/ready'].get?.security).toBeUndefined();
    expect(document.paths['/patients'].get?.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/patients'].get?.responses).toHaveProperty('401');
    expect(document.paths['/patients'].get?.responses).toHaveProperty('403');
    expect(document.paths['/enterprise/branches'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/enterprise/branches'].post?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/enterprise/branches'].post?.responses,
    ).toHaveProperty('201');
    expect(
      document.paths['/enterprise/corporate/clients'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/enterprise/corporate/agreements'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/enterprise/corporate/debit/reserve'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/enterprise/corporate/agreements/{id}/reports/executive']
        .get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths[
        '/enterprise/corporate/agreements/{id}/reports/billing-statement'
      ].get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/enterprise/corporate/agreements/{id}/reports/export/csv']
        .get?.security,
    ).toEqual([{ bearer: [] }]);
    expect(document.paths['/ops/reconcile/uploads'].post?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/ops/reconcile/uploads'].post?.responses,
    ).toHaveProperty('200');
    expect(
      document.paths['/admin/billing/manual-transition'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/admin/billing/manual-transition'].post?.responses,
    ).toHaveProperty('200');
    expect(
      document.paths['/admin/billing/extend-trial'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/admin/billing/extend-trial'].post?.responses,
    ).toHaveProperty('200');
    expect(
      document.paths['/admin/billing/plan-override'].patch?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/admin/billing/plan-override'].patch?.responses,
    ).toHaveProperty('200');
    expect(document.paths['/admin/tenants'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/admin/tenants'].get?.responses).toHaveProperty(
      '200',
    );
    expect(
      document.paths['/admin/tenants/{id}/extend-trial'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/admin/tenants/{id}/grant-lifetime'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/admin/tenants/{id}/quotas'].patch?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      document.paths['/admin/tenants/{id}/freeze'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(document.paths['/admin/audit-logs'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/admin/audit-logs'].get?.responses).toHaveProperty(
      '200',
    );
    expect(document.paths['/admin/metrics'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/admin/metrics'].get?.responses).toHaveProperty(
      '200',
    );
    expect(document.paths['/organizations'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/organizations/{organizationId}/status'].patch,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/settings'].get,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/settings'].patch,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/branding'].get,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/branding'].patch,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/logo'].get,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/logo'].put,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/logo'].delete,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/logo/content'].get,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/ownership-transfer'].post,
    ).toBeDefined();
    expect(
      document.paths['/organizations/{organizationId}/invitations'].post
        ?.responses,
    ).toHaveProperty('201');
    expect(
      document.paths[
        '/organizations/{organizationId}/invitations/{invitationId}/resend'
      ].post?.responses,
    ).toHaveProperty('201');
    expect(
      document.paths['/organization-invitations/{token}/accept'].post?.security,
    ).toEqual([{ bearer: [] }]);
    expect(
      getHeaderParameter(document, '/patients', 'get', 'X-Organization-Id'),
    ).toMatchObject({
      required: false,
      schema: { type: 'string' },
    });
    expect(
      getQueryParameterNames(document, '/financial-transactions', 'get'),
    ).toEqual([
      'appointmentId',
      'category',
      'createdById',
      'from',
      'patientId',
      'paymentMethod',
      'status',
      'to',
      'type',
    ]);
  });

  it('documents the certified critical response contracts', () => {
    const document = createDocument(app);

    expect(document.paths['/auth/login'].post?.responses).toHaveProperty('201');
    expect(
      document.paths['/auth/freelancer-bootstrap'].post?.responses,
    ).toHaveProperty('201');
    expect(
      document.paths['/auth/freelancer-bootstrap'].post?.responses,
    ).toHaveProperty('409');
    expect(
      document.paths['/auth/freelancer-bootstrap'].post?.responses,
    ).toHaveProperty('429');
    expect(
      document.paths['/auth/freelancer-bootstrap'].post?.responses,
    ).toHaveProperty('500');
    expect(
      document.paths['/auth/context/preference'].put?.responses,
    ).toHaveProperty('200');
    expect(
      document.paths['/auth/context/preference'].put?.responses,
    ).toHaveProperty('404');
    expect(document.paths['/auth/login'].post?.responses).not.toHaveProperty(
      '200',
    );
    expect(document.paths['/documents/upload'].post?.responses).toHaveProperty(
      '201',
    );
    expect(document.paths['/documents/upload'].post?.responses).toHaveProperty(
      '413',
    );
    expect(
      getResponseContent(
        document,
        '/financial-transactions/summary',
        'get',
        '200',
      )['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/FinancialTransactionSummaryDto' });
    expect(
      document.components?.schemas?.FinancialTransactionResponseDto,
    ).toMatchObject({
      properties: {
        amount: { type: 'string', example: '850.50' },
      },
    });
    expect(
      document.components?.schemas?.InvitationIssueResponseDto,
    ).toMatchObject({
      properties: {
        logicalStatus: {
          enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED'],
        },
      },
    });
    expect(
      getRequestContent(
        document,
        '/organizations/{organizationId}/ownership-transfer',
        'post',
      )['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/TransferOwnershipDto' });
    expect(
      getResponseContent(
        document,
        '/organizations/{organizationId}/ownership-transfer',
        'post',
        '200',
      )['application/json']?.schema,
    ).toEqual({
      $ref: '#/components/schemas/OwnershipTransferResponseDto',
    });
    expect(
      getRequestContent(document, '/auth/freelancer-bootstrap', 'post')[
        'application/json'
      ]?.schema,
    ).toEqual({
      $ref: '#/components/schemas/CreateFreelancerBootstrapDto',
    });
    expect(
      getResponseContent(document, '/auth/freelancer-bootstrap', 'post', '201')[
        'application/json'
      ]?.schema,
    ).toEqual({
      $ref: '#/components/schemas/FreelancerBootstrapResponseDto',
    });
    expect(
      getRequestContent(document, '/auth/context/preference', 'put')[
        'application/json'
      ]?.schema,
    ).toEqual({
      $ref: '#/components/schemas/UpdateAuthContextPreferenceDto',
    });
    expect(
      getResponseContent(document, '/auth/context/preference', 'put', '200')[
        'application/json'
      ]?.schema,
    ).toEqual({
      $ref: '#/components/schemas/AuthContextPreferenceResponseDto',
    });
    expect(
      getResponseContent(
        document,
        '/organizations/{organizationId}/memberships',
        'get',
        '200',
      )['application/json']?.schema,
    ).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/MembershipListItemDto' },
    });
    expect(document.components?.schemas?.MembershipListItemDto).toMatchObject({
      properties: {
        displayName: { type: 'string' },
        email: { type: 'string', format: 'email' },
        updatedAt: { type: 'string', format: 'date-time' },
        allowedActions: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['CHANGE_ROLE', 'SUSPEND', 'REACTIVATE', 'REMOVE'],
          },
        },
      },
    });
    expect(
      getRequestContent(
        document,
        '/organizations/{organizationId}/settings',
        'patch',
      )['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/UpdateOrganizationSettingsDto' });
    expect(
      getResponseContent(
        document,
        '/organizations/{organizationId}/settings',
        'get',
        '200',
      )['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/OrganizationSettingsResponseDto' });
    expect(
      getRequestContent(
        document,
        '/organizations/{organizationId}/branding',
        'patch',
      )['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/UpdateOrganizationBrandingDto' });
    expect(
      getResponseContent(
        document,
        '/organizations/{organizationId}/branding',
        'get',
        '200',
      )['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/OrganizationBrandingResponseDto' });
    expect(
      document.components?.schemas?.UpdateOrganizationSettingsDto,
    ).toMatchObject({
      properties: {
        defaultAppointmentDuration: {
          minimum: 1,
          maximum: 1440,
          nullable: true,
        },
        expectedRowState: { enum: ['ABSENT'] },
        expectedUpdatedAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(
      document.components?.schemas?.OrganizationSettingsResponseDto,
    ).toMatchObject({
      properties: {
        rowState: { enum: ['ABSENT', 'PRESENT'] },
        updatedAt: { nullable: true },
        defaultAppointmentDuration: { minimum: 1, maximum: 1440 },
        persistedDefaultAppointmentDuration: { nullable: true },
      },
    });
    expect(
      document.components?.schemas?.UpdateOrganizationBrandingDto,
    ).toMatchObject({
      properties: {
        primaryColor: { pattern: '^#[0-9A-F]{6}$', nullable: true },
      },
    });
    expect(
      getResponseContent(
        document,
        '/organizations/{organizationId}/logo',
        'get',
        '200',
      )['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/OrganizationLogoResponseDto' });
    expect(
      getResponseContent(
        document,
        '/organizations/{organizationId}/logo',
        'put',
        '200',
      )['application/json']?.schema,
    ).toEqual({ $ref: '#/components/schemas/OrganizationLogoResponseDto' });
    expect(
      getResponseContent(
        document,
        '/organizations/{organizationId}/logo/content',
        'get',
        '200',
      )['image/png']?.schema,
    ).toEqual({ type: 'string', format: 'binary' });
    expect(
      document.paths['/organizations/{organizationId}/logo'].put?.responses,
    ).toHaveProperty('413');
    expect(
      document.components?.schemas?.OrganizationLogoResponseDto,
    ).toMatchObject({
      properties: {
        rowState: { enum: ['ABSENT', 'PRESENT'] },
        updatedAt: { nullable: true },
        mimeType: { nullable: true },
      },
    });
    expect(
      (
        document.components?.schemas?.MembershipListItemDto as {
          required?: string[];
        }
      ).required,
    ).toEqual(
      expect.arrayContaining([
        'displayName',
        'email',
        'updatedAt',
        'allowedActions',
      ]),
    );
    expect(document.components?.schemas?.ChangeMembershipRoleDto).toMatchObject(
      {
        properties: {
          expectedUpdatedAt: { type: 'string', format: 'date-time' },
        },
      },
    );
    expect(
      (
        document.components?.schemas?.ChangeMembershipRoleDto as {
          required?: string[];
        }
      ).required,
    ).toEqual(expect.arrayContaining(['role', 'expectedUpdatedAt']));
    expect(
      document.components?.schemas?.ChangeMembershipStatusDto,
    ).toMatchObject({
      properties: {
        expectedUpdatedAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(
      (
        document.components?.schemas?.ChangeMembershipStatusDto as {
          required?: string[];
        }
      ).required,
    ).toEqual(expect.arrayContaining(['status', 'expectedUpdatedAt']));
    expect(
      getRequestContent(
        document,
        '/organizations/{organizationId}/memberships/{membershipId}',
        'delete',
      )['application/json']?.schema,
    ).toEqual({
      $ref: '#/components/schemas/MembershipMutationPreconditionDto',
    });
    expect(
      getRequestContent(
        document,
        '/organizations/{organizationId}/memberships/leave',
        'post',
      )['application/json']?.schema,
    ).toEqual({
      $ref: '#/components/schemas/MembershipMutationPreconditionDto',
    });
    const membershipConflictOperations = [
      {
        path: '/organizations/{organizationId}/memberships/{membershipId}/role',
        method: 'patch',
      },
      {
        path: '/organizations/{organizationId}/memberships/{membershipId}/status',
        method: 'patch',
      },
      {
        path: '/organizations/{organizationId}/memberships/{membershipId}',
        method: 'delete',
      },
      {
        path: '/organizations/{organizationId}/memberships/leave',
        method: 'post',
      },
    ] as const;

    for (const operation of membershipConflictOperations) {
      expect(
        getResponseContent(document, operation.path, operation.method, '409')[
          'application/json'
        ]?.schema,
      ).toEqual({
        $ref: '#/components/schemas/MembershipConflictResponseDto',
      });
    }
    expect(
      document.components?.schemas?.MembershipConflictResponseDto,
    ).toMatchObject({
      properties: {
        code: {
          enum: [
            'CONFLICT',
            'CONCURRENT_UPDATE',
            'LAST_OWNER_PROTECTED',
            'TENANT_CONTEXT_REQUIRED',
          ],
        },
      },
    });
    const authContextSchema = document.components?.schemas
      ?.AuthContextResponseV1Dto as unknown as {
      properties?: {
        schemaVersion?: unknown;
        status?: unknown;
        preferredOrganizationId?: unknown;
        capabilities?: {
          type?: string;
          items?: { type?: string; enum?: unknown[] };
        };
      };
    };

    expect(authContextSchema).toMatchObject({
      properties: {
        schemaVersion: { enum: [1] },
        status: {
          enum: [
            'ACTIVE_TENANT_READY',
            'AMBIGUOUS_SELECTION',
            'NO_ACTIVE_TENANT',
            'ADMIN_SUSPENDED_CONTEXT',
          ],
        },
        preferredOrganizationId: {
          type: 'string',
          nullable: true,
        },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    });
    expect(authContextSchema.properties?.capabilities?.items?.enum).toEqual(
      expect.arrayContaining([
        'audit.read',
        'organization.read',
        'patient.read',
        'report.read',
      ]),
    );
  });

  it('documents multipart and binary document operations', () => {
    const document = createDocument(app);

    const uploadRequestContent = getRequestContent(
      document,
      '/documents/upload',
      'post',
    );

    expect(uploadRequestContent).toHaveProperty('multipart/form-data');
    expect(uploadRequestContent['multipart/form-data']?.schema).toMatchObject({
      required: ['file', 'caseFileId'],
      properties: {
        file: { format: 'binary' },
        caseFileId: { format: 'uuid' },
      },
    });
    expect(
      getResponseContent(document, '/documents/{id}/download', 'get', '200')[
        'application/pdf'
      ]?.schema,
    ).toEqual({ type: 'string', format: 'binary' });
  });
});

function createDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Psychology App API')
      .setDescription('REST API documentation for the Psychology App backend')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste the JWT access token here',
        },
        'bearer',
      )
      .build(),
  );
}

type OpenApiMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

function getRequestContent(
  document: OpenAPIObject,
  path: string,
  method: OpenApiMethod,
) {
  const requestBody = getOperation(document, path, method).requestBody;

  if (!requestBody || '$ref' in requestBody) {
    throw new Error(
      `Expected request body for ${method.toUpperCase()} ${path}`,
    );
  }

  return requestBody.content;
}

function getResponseContent(
  document: OpenAPIObject,
  path: string,
  method: OpenApiMethod,
  status: string,
) {
  const response = getOperation(document, path, method).responses[status];

  if (!response || '$ref' in response) {
    throw new Error(
      `Expected a concrete ${status} response for ${method.toUpperCase()} ${path}`,
    );
  }

  return response.content ?? {};
}

function getQueryParameterNames(
  document: OpenAPIObject,
  path: string,
  method: OpenApiMethod,
) {
  return (
    getOperation(document, path, method)
      .parameters?.flatMap((parameter) =>
        '$ref' in parameter || parameter.in !== 'query' ? [] : [parameter.name],
      )
      .sort() ?? []
  );
}

function getHeaderParameter(
  document: OpenAPIObject,
  path: string,
  method: OpenApiMethod,
  name: string,
) {
  return getOperation(document, path, method).parameters?.find(
    (parameter) =>
      !('$ref' in parameter) &&
      parameter.in === 'header' &&
      parameter.name === name,
  );
}

function getOperation(
  document: OpenAPIObject,
  path: string,
  method: OpenApiMethod,
) {
  const operation = document.paths[path]?.[method];

  if (!operation) {
    throw new Error(`Expected ${method.toUpperCase()} ${path} in OpenAPI`);
  }

  return operation;
}

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnvironment);
}
