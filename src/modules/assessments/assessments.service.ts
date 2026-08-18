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
  InstrumentDefinition,
  ScoringSpec,
} from '../instruments/scoring/scoring.types';
import { AssignAssessmentDto } from './dto/assign-assessment.dto';
import { QueryAdministrationsDto } from './dto/query-administrations.dto';
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
      include: { instrument: true },
    });

    if (!instrumentVersion) {
      throw new NotFoundException('Instrument version not found');
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

  async completeByAccessToken(accessToken: string) {
    const administration =
      await this.prisma.assessmentAdministration.findUnique({
        where: { accessToken },
      });

    if (!administration) {
      throw new NotFoundException(
        'Assessment runner link invalid or not found',
      );
    }

    return this.complete(administration.organizationId, administration.id);
  }
}
