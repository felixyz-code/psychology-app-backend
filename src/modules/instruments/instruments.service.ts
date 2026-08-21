import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InstrumentVersionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInstrumentVersionDto } from './dto/create-instrument-version.dto';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { ScoringEngineService } from './scoring/scoring-engine.service';
import {
  AssessmentResponseMap,
  InstrumentDefinition,
  ScoringResult,
  ScoringSpec,
} from './scoring/scoring.types';

@Injectable()
export class InstrumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoringEngine: ScoringEngineService,
  ) {}

  /**
   * List clinical catalog available for patient assignment (Active published & enabled for tenant)
   */
  async findClinicalCatalog(organizationId: string) {
    const rawInstruments = await this.prisma.instrument.findMany({
      where: {
        OR: [{ isSystem: true }, { organizationId }],
      },
      include: {
        tenantConfigs: {
          where: { organizationId },
          select: { isEnabled: true },
        },
        versions: {
          where: { status: InstrumentVersionStatus.PUBLISHED },
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });

    return rawInstruments
      .filter((inst) => {
        // Must have at least 1 published version
        if (inst.versions.length === 0) {
          return false;
        }
        // Must not be explicitly disabled for this tenant
        const config = inst.tenantConfigs[0];
        if (config && config.isEnabled === false) {
          return false;
        }
        return true;
      })
      .map((inst) => ({
        id: inst.id,
        organizationId: inst.organizationId,
        code: inst.code,
        name: inst.name,
        description: inst.description,
        targetPopulation: inst.targetPopulation,
        isSystem: inst.isSystem,
        isEnabled: true,
        createdAt: inst.createdAt,
        updatedAt: inst.updatedAt,
        versions: inst.versions,
        latestVersion: inst.versions[0] ?? null,
      }));
  }

  /**
   * List management catalog for administrative dashboard (All Stock + Custom with visibility toggles and version metadata)
   */
  async findManagementCatalog(organizationId: string) {
    const rawInstruments = await this.prisma.instrument.findMany({
      where: {
        OR: [{ isSystem: true }, { organizationId }],
      },
      include: {
        tenantConfigs: {
          where: { organizationId },
          select: { isEnabled: true },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            _count: {
              select: { assessmentAdministrations: true },
            },
          },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });

    return rawInstruments.map((inst) => {
      const config = inst.tenantConfigs[0];
      const isEnabled = config ? config.isEnabled : true;
      const versions = inst.versions.map((v) => ({
        id: v.id,
        instrumentId: v.instrumentId,
        versionNumber: v.versionNumber,
        status: v.status,
        createdAt: v.createdAt,
        publishedAt: v.publishedAt,
        definitionJson: v.definitionJson,
        scoringSpecJson: v.scoringSpecJson,
        administrationsCount: v._count.assessmentAdministrations,
        isLocked:
          v.status !== InstrumentVersionStatus.DRAFT ||
          v._count.assessmentAdministrations > 0,
      }));

      const publishedVersion = versions.find(
        (v) => v.status === InstrumentVersionStatus.PUBLISHED,
      );
      const draftVersion = versions.find(
        (v) => v.status === InstrumentVersionStatus.DRAFT,
      );
      const latestVersion = versions[0] ?? null;
      const hasActiveAdministrations = versions.some(
        (v) => v.administrationsCount > 0,
      );

      return {
        id: inst.id,
        organizationId: inst.organizationId,
        code: inst.code,
        name: inst.name,
        description: inst.description,
        targetPopulation: inst.targetPopulation,
        isSystem: inst.isSystem,
        isEnabled,
        createdAt: inst.createdAt,
        updatedAt: inst.updatedAt,
        versionsCount: versions.length,
        hasActiveAdministrations,
        latestVersion,
        publishedVersion: publishedVersion ?? null,
        draftVersion: draftVersion ?? null,
        versions,
      };
    });
  }

  /**
   * List all instruments accessible to a tenant (Global System stock + Tenant custom)
   */
  async findAll(organizationId: string | null) {
    if (organizationId) {
      return this.findManagementCatalog(organizationId);
    }
    return this.prisma.instrument.findMany({
      where: { isSystem: true },
      include: {
        versions: {
          orderBy: { versionNumber: 'asc' },
        },
      },
      orderBy: [{ code: 'asc' }],
    });
  }

  /**
   * Get single instrument with full version history
   */
  async findOne(organizationId: string | null, id: string) {
    const instrument = await this.prisma.instrument.findFirst({
      where: {
        id,
        ...(organizationId
          ? { OR: [{ isSystem: true }, { organizationId }] }
          : { isSystem: true }),
      },
      include: {
        tenantConfigs: organizationId
          ? {
              where: { organizationId },
              select: { isEnabled: true },
            }
          : false,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            _count: {
              select: { assessmentAdministrations: true },
            },
          },
        },
      },
    });

    if (!instrument) {
      throw new NotFoundException(`Instrument with ID '${id}' not found`);
    }

    const config = instrument.tenantConfigs?.[0];
    const isEnabled = config ? config.isEnabled : true;

    return {
      ...instrument,
      isEnabled,
      versions: instrument.versions.map((v) => ({
        ...v,
        administrationsCount: v._count.assessmentAdministrations,
        isLocked:
          v.status !== InstrumentVersionStatus.DRAFT ||
          v._count.assessmentAdministrations > 0,
      })),
    };
  }

  /**
   * Create custom tenant instrument catalog entry
   */
  async create(organizationId: string, dto: CreateInstrumentDto) {
    const existing = await this.prisma.instrument.findFirst({
      where: {
        organizationId,
        code: dto.code,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Instrument code '${dto.code}' already exists in organization (INSTRUMENT_CODE_EXISTS)`,
      );
    }

    const defaultDefinition: InstrumentDefinition = {
      schemaVersion: '1.0',
      metadata: {
        title: dto.name,
        acronym: dto.code,
        language: 'es-MX',
        estimatedTimeMinutes: 5,
        administrationMode: 'SELF_ADMINISTERED',
      },
      instructions: {
        generalInstructions:
          'Por favor responda a las siguientes preguntas con honestidad.',
        responseScaleFormat: 'LIKERT',
      },
      items: [],
    };

    const defaultScoringSpec: ScoringSpec = {
      schemaVersion: '1.0',
      scoringType: 'SUM',
      minScore: 0,
      maxScore: 100,
      strata: [],
      clinicalAlerts: [],
    };

    const definitionJson: Prisma.InputJsonValue = (dto.initialDraft
      ?.definitionJson ??
      defaultDefinition) as unknown as Prisma.InputJsonValue;
    const scoringSpecJson: Prisma.InputJsonValue = (dto.initialDraft
      ?.scoringSpecJson ??
      defaultScoringSpec) as unknown as Prisma.InputJsonValue;

    return this.prisma.instrument.create({
      data: {
        organizationId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        targetPopulation: dto.targetPopulation,
        isSystem: false,
        tenantConfigs: {
          create: {
            organizationId,
            isEnabled: true,
          },
        },
        versions: {
          create: {
            versionNumber: 1,
            status: InstrumentVersionStatus.DRAFT,
            definitionJson,
            scoringSpecJson,
          },
        },
      },
      include: {
        versions: true,
        tenantConfigs: true,
      },
    });
  }

  /**
   * Toggle visibility (enable/disable) of an instrument for the current tenant
   */
  async toggleVisibility(
    organizationId: string,
    instrumentId: string,
    isEnabled: boolean,
  ) {
    const instrument = await this.prisma.instrument.findFirst({
      where: {
        id: instrumentId,
        OR: [{ isSystem: true }, { organizationId }],
      },
    });

    if (!instrument) {
      throw new NotFoundException(
        `Instrument with ID '${instrumentId}' not found in tenant catalog`,
      );
    }

    const config = await this.prisma.tenantInstrumentConfig.upsert({
      where: {
        organizationId_instrumentId: {
          organizationId,
          instrumentId,
        },
      },
      create: {
        organizationId,
        instrumentId,
        isEnabled,
      },
      update: {
        isEnabled,
      },
    });

    return {
      instrumentId: config.instrumentId,
      organizationId: config.organizationId,
      isEnabled: config.isEnabled,
      updatedAt: config.updatedAt,
    };
  }

  /**
   * Create a new draft version for a custom tenant instrument (vN+1)
   */
  async createVersion(
    organizationId: string,
    instrumentId: string,
    dto?: Partial<CreateInstrumentVersionDto>,
  ) {
    const instrument = await this.prisma.instrument.findFirst({
      where: { id: instrumentId, organizationId, isSystem: false },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    if (!instrument) {
      throw new NotFoundException(
        `Custom tenant instrument with ID '${instrumentId}' not found`,
      );
    }

    const latest = instrument.versions[0];
    const nextVersionNumber = latest ? latest.versionNumber + 1 : 1;

    // Use provided definition or clone from latest version
    const definitionJson = dto?.definitionJson ??
      (latest?.definitionJson as Record<string, any>) ?? {
        schemaVersion: '1.0',
        metadata: { title: instrument.name, acronym: instrument.code },
        items: [],
      };

    const scoringSpecJson = dto?.scoringSpecJson ??
      (latest?.scoringSpecJson as Record<string, any>) ?? {
        schemaVersion: '1.0',
        scoringType: 'SUM',
        strata: [],
      };

    return this.prisma.instrumentVersion.create({
      data: {
        instrumentId: instrument.id,
        versionNumber: nextVersionNumber,
        status: InstrumentVersionStatus.DRAFT,
        definitionJson,
        scoringSpecJson,
      },
    });
  }

  /**
   * Update an existing draft version definition or scoring spec (Strict immutability check)
   */
  async updateDraftVersion(
    organizationId: string,
    versionId: string,
    dto: CreateInstrumentVersionDto,
  ) {
    const version = await this.prisma.instrumentVersion.findUnique({
      where: { id: versionId },
      include: {
        instrument: true,
        _count: {
          select: { assessmentAdministrations: true },
        },
      },
    });

    if (
      !version ||
      version.instrument.isSystem ||
      version.instrument.organizationId !== organizationId
    ) {
      throw new NotFoundException(
        `Instrument version with ID '${versionId}' not found`,
      );
    }

    if (version.status !== InstrumentVersionStatus.DRAFT) {
      throw new ForbiddenException(
        'Published or deprecated instrument versions are immutable. Create a new version (vN+1) to apply changes. (PUBLISHED_VERSION_IMMUTABLE)',
      );
    }

    if (version._count.assessmentAdministrations > 0) {
      throw new ForbiddenException(
        'Cannot modify an instrument version that already has associated clinical administrations. Create a new version (vN+1). (VERSION_HAS_ADMINISTRATIONS)',
      );
    }

    return this.prisma.instrumentVersion.update({
      where: { id: versionId },
      data: {
        definitionJson: dto.definitionJson,
        scoringSpecJson: dto.scoringSpecJson,
      },
    });
  }

  /**
   * Publish a draft version (locks the version as immutable and deprecates previous versions)
   */
  async publishVersion(organizationId: string, versionId: string) {
    const version = await this.prisma.instrumentVersion.findUnique({
      where: { id: versionId },
      include: { instrument: true },
    });

    if (
      !version ||
      version.instrument.isSystem ||
      version.instrument.organizationId !== organizationId
    ) {
      throw new NotFoundException(
        `Instrument version with ID '${versionId}' not found`,
      );
    }

    if (version.status === InstrumentVersionStatus.PUBLISHED) {
      return version;
    }

    // Validate specification consistency before publishing
    const definition =
      version.definitionJson as unknown as InstrumentDefinition;
    if (
      !definition ||
      !Array.isArray(definition.items) ||
      definition.items.length === 0
    ) {
      throw new UnprocessableEntityException(
        'Cannot publish an instrument with 0 items. Please add at least 1 prompt before publishing.',
      );
    }

    // Deprecate any older published versions of this instrument
    await this.prisma.instrumentVersion.updateMany({
      where: {
        instrumentId: version.instrumentId,
        status: InstrumentVersionStatus.PUBLISHED,
      },
      data: {
        status: InstrumentVersionStatus.DEPRECATED,
      },
    });

    return this.prisma.instrumentVersion.update({
      where: { id: versionId },
      data: {
        status: InstrumentVersionStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });
  }

  /**
   * Deprecate a version
   */
  async deprecateVersion(organizationId: string, versionId: string) {
    const version = await this.prisma.instrumentVersion.findUnique({
      where: { id: versionId },
      include: { instrument: true },
    });

    if (
      !version ||
      version.instrument.isSystem ||
      version.instrument.organizationId !== organizationId
    ) {
      throw new NotFoundException(
        `Instrument version with ID '${versionId}' not found`,
      );
    }

    return this.prisma.instrumentVersion.update({
      where: { id: versionId },
      data: {
        status: InstrumentVersionStatus.DEPRECATED,
      },
    });
  }

  /**
   * Retrieve a specific version by ID for evaluation execution
   */
  async getVersionDetails(organizationId: string | null, versionId: string) {
    const version = await this.prisma.instrumentVersion.findUnique({
      where: { id: versionId },
      include: { instrument: true },
    });

    if (!version) {
      throw new NotFoundException(
        `Instrument version with ID '${versionId}' not found`,
      );
    }

    const isSystem = version.instrument.isSystem;
    const isOwner = version.instrument.organizationId === organizationId;

    if (!isSystem && !isOwner) {
      throw new NotFoundException(
        `Instrument version with ID '${versionId}' not found`,
      );
    }

    return version;
  }

  /**
   * Calculate psychometric score for given responses using a specific instrument version
   */
  async calculateScoreForVersion(
    organizationId: string | null,
    versionId: string,
    responses: AssessmentResponseMap,
  ): Promise<ScoringResult> {
    const version = await this.getVersionDetails(organizationId, versionId);

    const definition =
      version.definitionJson as unknown as InstrumentDefinition;
    const scoringSpec = version.scoringSpecJson as unknown as ScoringSpec;

    return this.scoringEngine.calculate(definition, scoringSpec, responses);
  }
}
