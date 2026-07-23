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

    expect(Object.keys(document.paths)).toHaveLength(39);
    expect(document.components?.securitySchemes?.bearer).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Paste the JWT access token here',
    });
    expect(document.paths['/auth/login'].post?.security).toBeUndefined();
    expect(document.paths['/auth/context'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(document.paths['/health'].get?.security).toBeUndefined();
    expect(document.paths['/health/live'].get?.security).toBeUndefined();
    expect(document.paths['/health/ready'].get?.security).toBeUndefined();
    expect(document.paths['/patients'].get?.security).toEqual([{ bearer: [] }]);
    expect(document.paths['/patients'].get?.responses).toHaveProperty('401');
    expect(document.paths['/patients'].get?.responses).toHaveProperty('403');
    expect(document.paths['/organizations'].get?.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      document.paths['/organizations/{organizationId}/invitations'].post
        ?.responses,
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

function getRequestContent(
  document: OpenAPIObject,
  path: string,
  method: 'get' | 'post',
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
  method: 'get' | 'post',
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
  method: 'get' | 'post',
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
  method: 'get' | 'post',
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
  method: 'get' | 'post',
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
