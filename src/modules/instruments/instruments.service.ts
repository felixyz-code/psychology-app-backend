import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InstrumentVersionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInstrumentVersionDto } from './dto/create-instrument-version.dto';
import { CreateInstrumentDto } from './dto/create-instrument.dto';

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all instruments accessible to a tenant (Global System stock + Tenant custom)
   */
  async findAll(organizationId: string | null) {
    return this.prisma.instrument.findMany({
      where: organizationId
        ? {
            OR: [{ isSystem: true }, { organizationId }],
          }
        : { isSystem: true },
      include: {
        versions: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            createdAt: true,
            publishedAt: true,
          },
          orderBy: { versionNumber: 'asc' },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
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
        versions: {
          orderBy: { versionNumber: 'asc' },
        },
      },
    });

    if (!instrument) {
      throw new NotFoundException(`Instrument with ID '${id}' not found`);
    }

    return instrument;
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

    return this.prisma.instrument.create({
      data: {
        organizationId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        targetPopulation: dto.targetPopulation,
        isSystem: false,
      },
    });
  }

  /**
   * Create a new draft version for a tenant instrument
   */
  async createVersion(
    organizationId: string,
    instrumentId: string,
    dto: CreateInstrumentVersionDto,
  ) {
    const instrument = await this.prisma.instrument.findFirst({
      where: { id: instrumentId, organizationId, isSystem: false },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });

    if (!instrument) {
      throw new NotFoundException(
        `Custom tenant instrument with ID '${instrumentId}' not found`,
      );
    }

    const nextVersionNumber =
      instrument.versions.length > 0
        ? instrument.versions[0].versionNumber + 1
        : 1;

    return this.prisma.instrumentVersion.create({
      data: {
        instrumentId: instrument.id,
        versionNumber: nextVersionNumber,
        status: InstrumentVersionStatus.DRAFT,
        definitionJson: dto.definitionJson,
        scoringSpecJson: dto.scoringSpecJson,
      },
    });
  }

  /**
   * Update an existing draft version definition or scoring spec
   */
  async updateDraftVersion(
    organizationId: string,
    versionId: string,
    dto: CreateInstrumentVersionDto,
  ) {
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

    if (version.status !== InstrumentVersionStatus.DRAFT) {
      throw new ForbiddenException(
        'Published or deprecated instrument versions are immutable. Create a new version to apply changes. (PUBLISHED_VERSION_IMMUTABLE)',
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

    // Deprecate any older published versions
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
}
