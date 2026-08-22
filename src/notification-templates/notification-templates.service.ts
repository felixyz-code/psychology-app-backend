import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationChannel,
  NotificationEventType,
  NotificationTemplate,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  TemplateVariableMetadata,
} from './notification-templates.constants';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import { QueryNotificationTemplatesDto } from './dto/query-notification-templates.dto';
import { RenderTemplatePreviewDto } from './dto/render-template-preview.dto';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';
import {
  RenderPreviewResult,
  TemplateInterpolatorService,
} from './interpolator/template-interpolator.service';

@Injectable()
export class NotificationTemplatesService {
  private readonly logger = new Logger(NotificationTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly interpolator: TemplateInterpolatorService,
  ) {}

  /**
   * Retrieves all notification templates for the active organization.
   */
  async findAll(query: QueryNotificationTemplatesDto, organizationId: string) {
    const where: Prisma.NotificationTemplateWhereInput = {
      organizationId,
    };

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.eventType) {
      where.eventType = query.eventType;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search && query.search.trim().length > 0) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { subject: { contains: s, mode: 'insensitive' } },
        { body: { contains: s, mode: 'insensitive' } },
      ];
    }

    return this.prisma.notificationTemplate.findMany({
      where,
      orderBy: [{ channel: 'asc' }, { eventType: 'asc' }],
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });
  }

  /**
   * Retrieves a single notification template by ID scoped to the active organization.
   */
  async findOne(id: string, organizationId: string) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { id, organizationId },
    });

    if (!template) {
      throw new NotFoundException(
        `Notification template with ID '${id}' was not found in this organization.`,
      );
    }

    return template;
  }

  /**
   * Creates a new custom notification template.
   */
  async create(dto: CreateNotificationTemplateDto, organizationId: string) {
    const existing = await this.prisma.notificationTemplate.findUnique({
      where: {
        organizationId_channel_eventType: {
          organizationId,
          channel: dto.channel,
          eventType: dto.eventType,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `A template for channel '${dto.channel}' and event '${dto.eventType}' already exists. Please update the existing template.`,
      );
    }

    const detectedVars = this.interpolator.extractVariables(
      `${dto.subject || ''} ${dto.body}`,
    );
    const variables = dto.variables?.length ? dto.variables : detectedVars;

    return this.prisma.notificationTemplate.create({
      data: {
        organizationId,
        channel: dto.channel,
        eventType: dto.eventType,
        name: dto.name.trim(),
        subject: dto.channel === NotificationChannel.EMAIL ? dto.subject?.trim() || null : null,
        body: dto.body,
        variables,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });
  }

  /**
   * Updates an existing notification template.
   */
  async update(
    id: string,
    dto: UpdateNotificationTemplateDto,
    organizationId: string,
  ) {
    const existing = await this.findOne(id, organizationId);

    const updatedSubject =
      dto.subject !== undefined
        ? dto.subject?.trim() || null
        : existing.subject;
    const updatedBody = dto.body !== undefined ? dto.body : existing.body;

    const detectedVars = this.interpolator.extractVariables(
      `${updatedSubject || ''} ${updatedBody}`,
    );
    const variables = dto.variables?.length ? dto.variables : detectedVars;

    return this.prisma.notificationTemplate.update({
      where: { id: existing.id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        subject:
          existing.channel === NotificationChannel.EMAIL
            ? updatedSubject
            : null,
        body: updatedBody,
        variables,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });
  }

  /**
   * Removes a notification template by ID.
   */
  async remove(id: string, organizationId: string) {
    const existing = await this.findOne(id, organizationId);

    await this.prisma.notificationTemplate.delete({
      where: { id: existing.id },
    });

    return {
      id: existing.id,
      deleted: true,
      message: `Template '${existing.name}' was successfully removed.`,
    };
  }

  /**
   * Seeds all default notification templates for an organization if they do not exist.
   */
  async seedDefaultsForOrganization(organizationId: string) {
    const results: NotificationTemplate[] = [];

    for (const def of DEFAULT_NOTIFICATION_TEMPLATES) {
      const existing = await this.prisma.notificationTemplate.findUnique({
        where: {
          organizationId_channel_eventType: {
            organizationId,
            channel: def.channel,
            eventType: def.eventType,
          },
        },
      });

      if (!existing) {
        const created = await this.prisma.notificationTemplate.create({
          data: {
            organizationId,
            channel: def.channel,
            eventType: def.eventType,
            name: def.name,
            subject: def.subject || null,
            body: def.body,
            variables: def.variables,
            isActive: true,
          },
        });
        results.push(created);
      }
    }

    return {
      organizationId,
      seededCount: results.length,
      templates: results,
    };
  }

  /**
   * Renders a live preview either from a saved template or ad-hoc payload.
   */
  async renderPreview(
    dto: RenderTemplatePreviewDto,
    organizationId?: string,
  ): Promise<RenderPreviewResult> {
    let channel = dto.channel || NotificationChannel.EMAIL;
    let eventType =
      dto.eventType || NotificationEventType.APPOINTMENT_CONFIRMATION;
    let subject = dto.subject;
    let body = dto.body || '';

    if (dto.templateId && organizationId) {
      const template = await this.findOne(dto.templateId, organizationId);
      channel = template.channel;
      eventType = template.eventType;
      subject = template.subject || undefined;
      body = template.body;
    }

    return this.interpolator.renderPreview({
      channel,
      eventType,
      subject,
      body,
      customContext: dto.customContext,
    });
  }

  /**
   * Returns metadata for all dynamic variables supported.
   */
  getVariablesMetadata(): readonly TemplateVariableMetadata[] {
    return this.interpolator.getAvailableVariables();
  }
}
