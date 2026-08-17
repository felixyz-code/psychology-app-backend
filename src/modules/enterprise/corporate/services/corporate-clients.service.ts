import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateCorporateClientDto } from '../dto/create-corporate-client.dto';
import { UpdateCorporateClientDto } from '../dto/update-corporate-client.dto';

@Injectable()
export class CorporateClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateCorporateClientDto) {
    const existing = await this.prisma.corporateClient.findFirst({
      where: {
        organizationId,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Corporate client with name "${dto.name}" already exists in this organization.`,
      );
    }

    return this.prisma.corporateClient.create({
      data: {
        organizationId,
        name: dto.name,
        commercialName: dto.commercialName,
        taxId: dto.taxId,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        domainWhitelist: dto.domainWhitelist || [],
        notes: dto.notes,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });
  }

  async findAll(
    organizationId: string,
    options?: { includeInactive?: boolean },
  ) {
    return this.prisma.corporateClient.findMany({
      where: {
        organizationId,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      include: {
        _count: {
          select: { agreements: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const client = await this.prisma.corporateClient.findFirst({
      where: { id, organizationId },
      include: {
        agreements: {
          include: {
            benefitPools: true,
            _count: {
              select: { employeeEligibilities: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Corporate client not found');
    }

    return client;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateCorporateClientDto,
  ) {
    await this.findOne(organizationId, id);

    if (dto.name) {
      const conflict = await this.prisma.corporateClient.findFirst({
        where: {
          organizationId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (conflict) {
        throw new ConflictException(
          `Corporate client with name "${dto.name}" already exists.`,
        );
      }
    }

    return this.prisma.corporateClient.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.commercialName !== undefined && {
          commercialName: dto.commercialName,
        }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        ...(dto.contactEmail !== undefined && {
          contactEmail: dto.contactEmail,
        }),
        ...(dto.contactPhone !== undefined && {
          contactPhone: dto.contactPhone,
        }),
        ...(dto.domainWhitelist !== undefined && {
          domainWhitelist: dto.domainWhitelist,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    return this.prisma.corporateClient.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
