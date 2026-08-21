import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdministrationStatus,
  InstrumentVersionStatus,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ScoringEngineService } from '../instruments/scoring/scoring-engine.service';
import type {
  AssessmentResponseMap,
  ClinicalFlagResult,
  InstrumentDefinition,
  ScoringSpec,
  SubscaleScoreResult,
} from '../instruments/scoring/scoring.types';
import { AssignAssessmentDto } from './dto/assign-assessment.dto';
import { QueryAdministrationsDto } from './dto/query-administrations.dto';
import { QueryLongitudinalDto } from './dto/query-longitudinal.dto';
import { SaveResponsesDto } from './dto/save-responses.dto';

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringEngineService: ScoringEngineService,
  ) {}

  async assign(
    organizationId: string,
    professionalId: string,
    dto: AssignAssessmentDto,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: dto.patientId,
        organizationId,
      },
      include: {
        caseFile: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found in this organization');
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: dto.branchId,
          organizationId,
        },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found in this organization');
      }
    }

    let caseFileId = dto.caseFileId;
    if (caseFileId) {
      const caseFile = await this.prisma.caseFile.findFirst({
        where: {
          id: caseFileId,
          organizationId,
          patientId: dto.patientId,
        },
      });

      if (!caseFile) {
        throw new NotFoundException(
          'Case file not found for this patient and organization',
        );
      }
    } else if (patient.caseFile) {
      caseFileId = patient.caseFile.id;
    }

    const instrumentVersion = await this.prisma.instrumentVersion.findUnique({
      where: { id: dto.instrumentVersionId },
      include: {
        instrument: {
          include: {
            tenantConfigs: {
              where: { organizationId },
              select: { isEnabled: true },
            },
          },
        },
      },
    });

    if (!instrumentVersion) {
      throw new NotFoundException('Instrument version not found');
    }

    const isSystem = instrumentVersion.instrument.isSystem;
    const isOwner =
      instrumentVersion.instrument.organizationId === organizationId;
    if (!isSystem && !isOwner) {
      throw new NotFoundException(
        'Instrument version not found in this organization',
      );
    }

    const tenantConfig = instrumentVersion.instrument.tenantConfigs?.[0];
    if (tenantConfig && tenantConfig.isEnabled === false) {
      throw new BadRequestException(
        'This clinical instrument is currently disabled for this organization',
      );
    }

    if (instrumentVersion.status !== InstrumentVersionStatus.PUBLISHED) {
      throw new BadRequestException(
        'Cannot assign an instrument version that is not in PUBLISHED status',
      );
    }

    const isRemote = dto.isRemoteSelfAdministered ?? true;
    const accessToken = isRemote
      ? `sec_eval_${crypto.randomBytes(32).toString('hex')}`
      : null;

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    return this.prisma.assessmentAdministration.create({
      data: {
        organizationId,
        patientId: dto.patientId,
        professionalId,
        branchId: dto.branchId,
        caseFileId,
        instrumentVersionId: dto.instrumentVersionId,
        status: AdministrationStatus.ASSIGNED,
        accessToken,
        expiresAt,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        professional: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        instrumentVersion: {
          include: {
            instrument: {
              select: {
                id: true,
                code: true,
                name: true,
                targetPopulation: true,
              },
            },
          },
        },
      },
    });
  }

  async findAll(organizationId: string, query: QueryAdministrationsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AssessmentAdministrationWhereInput = {
      organizationId,
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.professionalId ? { professionalId: query.professionalId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.instrumentCode
        ? {
            instrumentVersion: {
              instrument: { code: query.instrumentCode },
            },
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.assessmentAdministration.count({ where }),
      this.prisma.assessmentAdministration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          professional: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          instrumentVersion: {
            include: {
              instrument: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
          result: {
            select: {
              id: true,
              rawScore: true,
              normalizedScore: true,
              strataCode: true,
              strataTitle: true,
              severity: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(organizationId: string, id: string) {
    const administration = await this.prisma.assessmentAdministration.findFirst(
      {
        where: {
          id,
          organizationId,
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          professional: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          caseFile: {
            select: {
              id: true,
              diagnosis: true,
              treatmentPlan: true,
            },
          },
          instrumentVersion: {
            include: {
              instrument: true,
            },
          },
          responses: {
            orderBy: { createdAt: 'asc' },
          },
          result: true,
        },
      },
    );

    if (!administration) {
      throw new NotFoundException('Assessment administration not found');
    }

    return administration;
  }

  async saveResponses(
    organizationId: string,
    id: string,
    dto: SaveResponsesDto,
  ) {
    const administration = await this.prisma.assessmentAdministration.findFirst(
      {
        where: {
          id,
          organizationId,
        },
      },
    );

    if (!administration) {
      throw new NotFoundException('Assessment administration not found');
    }

    if (administration.status === AdministrationStatus.COMPLETED) {
      throw new ConflictException(
        'Assessment is already completed and locked for edits (ASSESSMENT_ALREADY_COMPLETED)',
      );
    }

    if (administration.status === AdministrationStatus.CANCELLED) {
      throw new ConflictException(
        'Assessment has been cancelled (ASSESSMENT_CANCELLED)',
      );
    }

    if (
      administration.status === AdministrationStatus.EXPIRED ||
      (administration.expiresAt && new Date() > administration.expiresAt)
    ) {
      throw new ConflictException(
        'Assessment has expired (ASSESSMENT_EXPIRED)',
      );
    }

    const responseEntries = Object.entries(dto.responses);

    await this.prisma.$transaction(async (tx) => {
      if (administration.status === AdministrationStatus.ASSIGNED) {
        await tx.assessmentAdministration.update({
          where: { id },
          data: {
            status: AdministrationStatus.IN_PROGRESS,
            startedAt: administration.startedAt ?? new Date(),
          },
        });
      }

      for (const [itemCode, responseValue] of responseEntries) {
        const numericWeight =
          typeof responseValue === 'number' ? responseValue : null;

        await tx.assessmentResponse.upsert({
          where: {
            administrationId_itemCode: {
              administrationId: id,
              itemCode,
            },
          },
          create: {
            administrationId: id,
            itemCode,
            responseValue: responseValue as Prisma.InputJsonValue,
            numericWeight,
          },
          update: {
            responseValue: responseValue as Prisma.InputJsonValue,
            numericWeight,
          },
        });
      }
    });

    const totalAnswered = await this.prisma.assessmentResponse.count({
      where: { administrationId: id },
    });

    return {
      administrationId: id,
      status:
        administration.status === AdministrationStatus.ASSIGNED
          ? AdministrationStatus.IN_PROGRESS
          : administration.status,
      savedCount: responseEntries.length,
      totalAnswered,
      message: 'Responses saved successfully',
    };
  }

  async complete(organizationId: string, id: string) {
    const administration = await this.prisma.assessmentAdministration.findFirst(
      {
        where: {
          id,
          organizationId,
        },
        include: {
          instrumentVersion: true,
          responses: true,
          result: true,
        },
      },
    );

    if (!administration) {
      throw new NotFoundException('Assessment administration not found');
    }

    if (
      administration.status === AdministrationStatus.COMPLETED ||
      administration.result !== null
    ) {
      throw new ConflictException(
        'Assessment is already completed and locked (ASSESSMENT_ALREADY_COMPLETED)',
      );
    }

    if (administration.status === AdministrationStatus.CANCELLED) {
      throw new ConflictException(
        'Assessment has been cancelled (ASSESSMENT_CANCELLED)',
      );
    }

    if (
      administration.status === AdministrationStatus.EXPIRED ||
      (administration.expiresAt && new Date() > administration.expiresAt)
    ) {
      throw new ConflictException(
        'Assessment has expired (ASSESSMENT_EXPIRED)',
      );
    }

    const definition = administration.instrumentVersion
      .definitionJson as unknown as InstrumentDefinition;
    const scoringSpec = administration.instrumentVersion
      .scoringSpecJson as unknown as ScoringSpec;

    const responseMap: AssessmentResponseMap = {};
    for (const r of administration.responses) {
      responseMap[r.itemCode] = r.responseValue as
        | string
        | number
        | boolean
        | string[]
        | null;
    }

    const scoringResult = this.scoringEngineService.calculate(
      definition,
      scoringSpec,
      responseMap,
    );

    if (!scoringResult.isComplete) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message:
          'Assessment is incomplete. All required items must be answered before completion.',
        missingRequiredItems: scoringResult.missingRequiredItems,
        answeredCount: scoringResult.answeredCount,
        totalRequiredCount: scoringResult.totalRequiredCount,
      });
    }

    const completedAt = new Date();

    const [createdResult] = await this.prisma.$transaction([
      this.prisma.assessmentResult.create({
        data: {
          administrationId: id,
          rawScore: scoringResult.rawScore,
          normalizedScore: scoringResult.normalizedScore,
          strataCode: scoringResult.strataCode,
          strataTitle: scoringResult.strataTitle,
          severity: scoringResult.strataSeverity,
          subscaleScoresJson:
            scoringResult.subscaleScores as unknown as Prisma.InputJsonValue,
          flagsJson: scoringResult.flags as unknown as Prisma.InputJsonValue,
          scoringSpecSnapshotJson: administration.instrumentVersion
            .scoringSpecJson as Prisma.InputJsonValue,
        },
      }),
      this.prisma.assessmentAdministration.update({
        where: { id },
        data: {
          status: AdministrationStatus.COMPLETED,
          completedAt,
        },
      }),
    ]);

    return {
      administrationId: id,
      status: AdministrationStatus.COMPLETED,
      completedAt,
      result: {
        id: createdResult.id,
        rawScore: createdResult.rawScore,
        normalizedScore: createdResult.normalizedScore,
        strataCode: createdResult.strataCode,
        strataTitle: createdResult.strataTitle,
        severity: createdResult.severity,
        subscaleScores: scoringResult.subscaleScores,
        flags: scoringResult.flags,
      },
    };
  }

  async findByAccessToken(accessToken: string) {
    const administration =
      await this.prisma.assessmentAdministration.findUnique({
        where: { accessToken },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          instrumentVersion: {
            include: {
              instrument: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  targetPopulation: true,
                },
              },
            },
          },
          responses: {
            orderBy: { createdAt: 'asc' },
          },
          result: true,
        },
      });

    if (!administration) {
      throw new NotFoundException(
        'Assessment runner link invalid or not found',
      );
    }

    if (
      administration.status === AdministrationStatus.EXPIRED ||
      (administration.expiresAt && new Date() > administration.expiresAt)
    ) {
      if (
        administration.status !== AdministrationStatus.EXPIRED &&
        administration.status !== AdministrationStatus.COMPLETED
      ) {
        await this.prisma.assessmentAdministration.update({
          where: { id: administration.id },
          data: { status: AdministrationStatus.EXPIRED },
        });
      }
      throw new ConflictException(
        'Assessment link has expired (ASSESSMENT_EXPIRED)',
      );
    }

    return {
      id: administration.id,
      organizationId: administration.organizationId,
      status: administration.status,
      patient: {
        id: administration.patient.id,
        firstName: administration.patient.firstName,
        lastName: administration.patient.lastName,
      },
      instrumentVersion: {
        id: administration.instrumentVersion.id,
        versionNumber: administration.instrumentVersion.versionNumber,
        definitionJson: administration.instrumentVersion.definitionJson,
        instrument: administration.instrumentVersion.instrument,
      },
      responses: administration.responses.map((r) => ({
        id: r.id,
        itemCode: r.itemCode,
        responseValue: r.responseValue,
        numericWeight: r.numericWeight,
      })),
      result: administration.result,
      expiresAt: administration.expiresAt,
      startedAt: administration.startedAt,
      completedAt: administration.completedAt,
    };
  }

  async saveResponsesByAccessToken(accessToken: string, dto: SaveResponsesDto) {
    const administration =
      await this.prisma.assessmentAdministration.findUnique({
        where: { accessToken },
      });

    if (!administration) {
      throw new NotFoundException(
        'Assessment runner link invalid or not found',
      );
    }

    return this.saveResponses(
      administration.organizationId,
      administration.id,
      dto,
    );
  }

  async completeByAccessToken(accessToken: string, dto?: SaveResponsesDto) {
    const administration =
      await this.prisma.assessmentAdministration.findUnique({
        where: { accessToken },
      });

    if (!administration) {
      throw new NotFoundException(
        'Assessment runner link invalid or not found',
      );
    }

    if (
      administration.status === AdministrationStatus.EXPIRED ||
      (administration.expiresAt && new Date() > administration.expiresAt)
    ) {
      if (
        administration.status !== AdministrationStatus.EXPIRED &&
        administration.status !== AdministrationStatus.COMPLETED
      ) {
        await this.prisma.assessmentAdministration.update({
          where: { id: administration.id },
          data: { status: AdministrationStatus.EXPIRED },
        });
      }
      throw new ConflictException(
        'Assessment link has expired (ASSESSMENT_EXPIRED)',
      );
    }

    if (dto && dto.responses && Object.keys(dto.responses).length > 0) {
      await this.saveResponses(
        administration.organizationId,
        administration.id,
        dto,
      );
    }

    return this.complete(administration.organizationId, administration.id);
  }

  private buildLegalDisclaimer(
    instrumentName: string,
    acronym: string,
    versionNumber: number,
    professionalName: string,
    licenseNumber: string | null,
    reportGeneratedAt: string,
    orgLegalName: string,
    branchName: string | null,
  ): string {
    return `DESCARGO DE RESPONSABILIDAD CLÍNICA\n\nEl presente reporte psicométrico ha sido generado automáticamente a partir de la aplicación del instrumento ${instrumentName} (${acronym}) versión ${versionNumber} administrado digitalmente a través del Sistema de Gestión Clínica.\n\nEste reporte constituye un auxiliar diagnóstico para uso exclusivo del profesional de salud mental autorizado y forma parte integrante del expediente clínico del paciente conforme a lo establecido en la NOM-004-SSA3-2012 Del Expediente Clínico.\n\nLos resultados presentados NO reemplazan el juicio clínico profesional, la entrevista clínica estructurada ni la valoración integral del paciente. Las puntuaciones y estratificaciones de severidad son orientativas y deben interpretarse en el contexto completo del caso clínico.\n\nLa distribución, reproducción o divulgación de este documento a terceros no autorizados está prohibida y sujeta a las disposiciones de la Ley General de Salud y la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).\n\nGenerado por: ${professionalName} | Cédula: ${licenseNumber ?? 'No registrada'}\nFecha y hora de generación: ${reportGeneratedAt}\nOrganización: ${orgLegalName} | Sucursal: ${branchName ?? 'No especificada'}`;
  }

  async getReport(organizationId: string, id: string) {
    const administration = await this.prisma.assessmentAdministration.findFirst(
      {
        where: { id, organizationId },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              birthDate: true,
            },
          },
          professional: {
            select: {
              id: true,
              name: true,
              email: true,
              psychologistProfile: {
                select: {
                  professionalName: true,
                  licenseNumber: true,
                },
              },
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              address: true,
              phone: true,
              timezone: true,
            },
          },
          caseFile: { select: { id: true } },
          instrumentVersion: { include: { instrument: true } },
          responses: { orderBy: { createdAt: 'asc' } },
          result: true,
          organization: {
            select: {
              id: true,
              legalName: true,
              displayName: true,
              slug: true,
              branding: {
                select: {
                  primaryColor: true,
                  accentColor: true,
                  visualName: true,
                },
              },
              logoAsset: { select: { storageKey: true } },
            },
          },
        },
      },
    );

    if (!administration) {
      throw new NotFoundException('Assessment administration not found');
    }

    if (administration.status !== 'COMPLETED' || !administration.result) {
      throw new UnprocessableEntityException(
        'Assessment has not been completed yet. A psychometric report requires a finalized evaluation.',
      );
    }

    const reportGeneratedAt = new Date().toISOString();
    const {
      patient,
      professional,
      branch,
      organization,
      instrumentVersion,
      result,
      responses,
    } = administration;

    // Calculate patient age
    let age: number | null = null;
    if (patient.birthDate) {
      const birth = new Date(patient.birthDate);
      const now = new Date();
      age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    }

    // Calculate duration in minutes
    let durationMinutes: number | null = null;
    if (administration.startedAt && administration.completedAt) {
      durationMinutes = Math.round(
        (new Date(administration.completedAt).getTime() -
          new Date(administration.startedAt).getTime()) /
          60000,
      );
    }

    // Parse definition for item prompts
    const definition =
      instrumentVersion.definitionJson as unknown as InstrumentDefinition;
    const scoringSnapshot =
      result.scoringSpecSnapshotJson as unknown as ScoringSpec;

    // Build item-level lookup
    const itemMap = new Map(
      (definition?.items ?? []).map((item) => [item.code, item]),
    );

    // Subscales typed
    const subscaleScores = (result.subscaleScoresJson ??
      {}) as unknown as Record<string, SubscaleScoreResult>;

    // Find strata description for current strata
    let strataDescription: string | null = null;
    if (result.strataCode && scoringSnapshot?.strata) {
      const strata = scoringSnapshot.strata.find(
        (s) => s.code === result.strataCode,
      );
      strataDescription = strata?.description ?? null;
    }

    // Flags typed
    const clinicalAlerts = (Array.isArray(result.flagsJson)
      ? result.flagsJson
      : []) as unknown as ClinicalFlagResult[];

    // Logo URL (relative path served by backend uploads)
    const logoUrl = organization.logoAsset?.storageKey
      ? `/uploads/${organization.logoAsset.storageKey}`
      : null;

    // Item responses enriched with prompt and label
    const itemResponses = responses.map((r) => {
      const item = itemMap.get(r.itemCode);
      let responseLabel: string | null = null;
      if (item?.options && r.responseValue !== null) {
        const valStr =
          typeof r.responseValue === 'object'
            ? JSON.stringify(r.responseValue)
            : String(r.responseValue);
        const opt = item.options.find((o) => o.value === valStr);
        responseLabel = opt?.label ?? null;
      }
      return {
        itemCode: r.itemCode,
        sequenceNumber: item?.sequenceNumber ?? 0,
        prompt: item?.prompt ?? r.itemCode,
        responseValue: r.responseValue as
          | string
          | number
          | boolean
          | string[]
          | null,
        responseLabel,
        numericWeight: r.numericWeight,
        isRequired: item?.required ?? false,
        dimensionCode: item?.dimensionCode ?? null,
      };
    });

    const acronym =
      definition?.metadata?.acronym ?? instrumentVersion.instrument.code;
    const author = definition?.metadata?.author ?? null;
    const administrationMode = definition?.metadata?.administrationMode ?? null;
    const estimatedTimeMinutes =
      definition?.metadata?.estimatedTimeMinutes ?? null;

    const subscalesArr = Object.values(subscaleScores).map((sub) => {
      let subStrataDesc: string | null = null;
      if (sub.strataCode && scoringSnapshot?.scales) {
        const scale = scoringSnapshot.scales?.find(
          (sc) => sc.code === sub.scaleCode,
        );
        const subStrata = scale?.strata?.find((s) => s.code === sub.strataCode);
        subStrataDesc = subStrata?.description ?? null;
      }
      return {
        scaleCode: sub.scaleCode,
        scaleName: sub.scaleName,
        rawScore: sub.rawScore,
        normalizedScore: sub.normalizedScore,
        minPossibleScore: sub.minPossibleScore,
        maxPossibleScore: sub.maxPossibleScore,
        strataCode: sub.strataCode,
        strataTitle: sub.strataTitle,
        severity: sub.severity,
        strataDescription: subStrataDesc,
        isComplete: sub.isComplete,
      };
    });

    const legalDisclaimer = this.buildLegalDisclaimer(
      instrumentVersion.instrument.name,
      acronym,
      instrumentVersion.versionNumber,
      professional.psychologistProfile?.professionalName ?? professional.name,
      professional.psychologistProfile?.licenseNumber ?? null,
      reportGeneratedAt,
      organization.legalName,
      branch?.name ?? null,
    );

    return {
      reportGeneratedAt,
      reportVersion: '1.0',
      organization: {
        id: organization.id,
        legalName: organization.legalName,
        displayName: organization.displayName,
        slug: organization.slug,
        primaryColor: organization.branding?.primaryColor ?? null,
        accentColor: organization.branding?.accentColor ?? null,
        logoUrl,
      },
      branch: {
        id: branch?.id ?? null,
        name: branch?.name ?? null,
        code: branch?.code ?? null,
        address: branch?.address ?? null,
        phone: branch?.phone ?? null,
        timezone: branch?.timezone ?? null,
      },
      professional: {
        id: professional.id,
        name: professional.name,
        email: professional.email,
        professionalName:
          professional.psychologistProfile?.professionalName ?? null,
        licenseNumber: professional.psychologistProfile?.licenseNumber ?? null,
      },
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        fullName: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        birthDate: patient.birthDate
          ? patient.birthDate.toISOString().split('T')[0]
          : null,
        age,
      },
      instrument: {
        id: instrumentVersion.instrument.id,
        code: instrumentVersion.instrument.code,
        name: instrumentVersion.instrument.name,
        acronym,
        author,
        targetPopulation: instrumentVersion.instrument.targetPopulation,
        versionNumber: instrumentVersion.versionNumber,
        administrationMode,
        estimatedTimeMinutes,
      },
      administration: {
        id: administration.id,
        assignedAt: administration.createdAt.toISOString(),
        startedAt: administration.startedAt?.toISOString() ?? null,
        completedAt: administration.completedAt!.toISOString(),
        durationMinutes,
      },
      result: {
        rawScore: result.rawScore,
        normalizedScore: result.normalizedScore,
        strataCode: result.strataCode,
        strataTitle: result.strataTitle,
        severity: result.severity,
        strataDescription,
        minPossibleScore: scoringSnapshot?.minScore ?? null,
        maxPossibleScore: scoringSnapshot?.maxScore ?? null,
        subscales: subscalesArr,
        clinicalAlerts: clinicalAlerts.map((f) => ({
          alertType: f.alertType,
          severity: f.severity,
          itemCode: f.itemCode,
          message: f.message,
          actualValue: f.actualValue,
          actualWeight: f.actualWeight,
        })),
        scoringSpecSnapshot: scoringSnapshot,
      },
      itemResponses,
      legalDisclaimer,
    };
  }

  /**
   * Retrieves longitudinal evolution data for a patient's assessments over time.
   */
  async getLongitudinalSeries(
    organizationId: string,
    patientId: string,
    query: QueryLongitudinalDto,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found in this organization');
    }

    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const where: Prisma.AssessmentAdministrationWhereInput = {
      organizationId,
      patientId,
      status: 'COMPLETED',
      result: { isNot: null },
      ...(query.instrumentCode
        ? {
            instrumentVersion: {
              instrument: { code: query.instrumentCode },
            },
          }
        : {}),
      ...(query.fromDate || query.toDate
        ? {
            completedAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const administrations = await this.prisma.assessmentAdministration.findMany(
      {
        where,
        take: limit,
        orderBy: { completedAt: 'asc' },
        include: {
          instrumentVersion: { include: { instrument: true } },
          result: true,
        },
      },
    );

    // MCiD thresholds by instrument code
    const MCID_THRESHOLDS: Record<string, number> = {
      'PHQ-9': 5,
      'GAD-7': 4,
    };

    // Track previous score per instrument for delta calculation
    const previousByInstrument = new Map<
      string,
      { id: string; rawScore: number; severity: string | null }
    >();

    const series = administrations.map((adm) => {
      const instrCode = adm.instrumentVersion.instrument.code;
      const result = adm.result!;
      const subscaleScores = (result.subscaleScoresJson ??
        {}) as unknown as Record<string, SubscaleScoreResult>;
      const flags = (Array.isArray(result.flagsJson)
        ? result.flagsJson
        : []) as unknown as ClinicalFlagResult[];
      const activeCriticalAlerts = flags.filter(
        (f) => f.severity === 'CRITICAL' || f.severity === 'EMERGENCY',
      ).length;

      const prev = previousByInstrument.get(instrCode);
      let delta: {
        previousAdministrationId: string;
        rawScoreDelta: number;
        severityChange: string;
        clinicalSignificance: string;
      } | null = null;

      if (prev) {
        const rawDelta = result.rawScore - prev.rawScore;
        const threshold = MCID_THRESHOLDS[instrCode] ?? 3;
        const clinicallySig = Math.abs(rawDelta) >= threshold;
        let severityChange: string;
        if (rawDelta < 0) severityChange = 'IMPROVED';
        else if (rawDelta > 0) severityChange = 'WORSENED';
        else severityChange = 'STABLE';

        delta = {
          previousAdministrationId: prev.id,
          rawScoreDelta: rawDelta,
          severityChange,
          clinicalSignificance: clinicallySig
            ? 'CLINICALLY_SIGNIFICANT'
            : 'MINIMAL_CHANGE',
        };
      }

      previousByInstrument.set(instrCode, {
        id: adm.id,
        rawScore: result.rawScore,
        severity: result.severity,
      });

      return {
        administrationId: adm.id,
        instrumentCode: instrCode,
        instrumentName: adm.instrumentVersion.instrument.name,
        versionNumber: adm.instrumentVersion.versionNumber,
        completedAt: adm.completedAt!.toISOString(),
        rawScore: result.rawScore,
        normalizedScore: result.normalizedScore,
        strataCode: result.strataCode,
        strataTitle: result.strataTitle,
        severity: result.severity,
        delta,
        activeCriticalAlerts,
        hasRiskFlag: activeCriticalAlerts > 0,
        subscaleSummary: Object.values(subscaleScores).map((sub) => ({
          scaleCode: sub.scaleCode,
          scaleName: sub.scaleName,
          rawScore: sub.rawScore,
          severity: sub.severity,
        })),
      };
    });

    // Compute summary (only for single-instrument queries)
    let scoreMin: number | null = null;
    let scoreMax: number | null = null;
    let scoreAverage: number | null = null;
    let scoreTrend: string = 'INSUFFICIENT_DATA';
    const severityDistribution: Record<string, number> = {};

    if (series.length > 0) {
      const scores = series.map((s) => s.rawScore);
      scoreMin = Math.min(...scores);
      scoreMax = Math.max(...scores);
      scoreAverage =
        Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
        100;

      // Severity distribution
      for (const point of series) {
        if (point.severity) {
          severityDistribution[point.severity] =
            (severityDistribution[point.severity] ?? 0) + 1;
        }
      }

      // Trend: compare first vs last delta (for single instrument)
      if (series.length >= 2) {
        const singleInstrument =
          new Set(series.map((s) => s.instrumentCode)).size === 1;
        if (singleInstrument) {
          const firstScore = series[0].rawScore;
          const lastScore = series[series.length - 1].rawScore;
          const totalDelta = lastScore - firstScore;
          const instrCode = series[0].instrumentCode;
          const threshold = MCID_THRESHOLDS[instrCode] ?? 3;
          if (Math.abs(totalDelta) < threshold) scoreTrend = 'STABLE';
          else scoreTrend = totalDelta < 0 ? 'IMPROVING' : 'WORSENING';
        } else {
          scoreTrend = 'INSUFFICIENT_DATA';
        }
      }
    }

    return {
      patientId: patient.id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      instrumentCode: query.instrumentCode ?? null,
      series,
      summary: {
        totalCompletedAssessments: series.length,
        firstAssessmentAt: series.length > 0 ? series[0].completedAt : null,
        lastAssessmentAt:
          series.length > 0 ? series[series.length - 1].completedAt : null,
        scoreMin,
        scoreMax,
        scoreAverage,
        scoreTrend,
        severityDistribution,
      },
    };
  }
}
