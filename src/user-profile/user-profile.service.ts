import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PsychologistProfileStatus,
  UserPreferences,
  UserRole,
} from '@prisma/client';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { UserAssetResponseDto } from './dto/user-asset-response.dto';
import {
  UpdateUserPreferencesDto,
  UserPreferencesResponseDto,
} from './dto/user-preferences.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UpdateUserProfileDto } from './dto/user-profile.dto';
import { UserProfileStorageService } from './user-profile-storage.service';
import {
  validateAvatarImage,
  validateSignatureImage,
} from './user-profile.validation';

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: UserProfileStorageService,
  ) {}

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        psychologistProfile: {
          include: {
            avatarAsset: true,
            signatureAsset: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let profile = user.psychologistProfile;
    if (!profile) {
      profile = await this.prisma.psychologistProfile.create({
        data: {
          userId: user.id,
          professionalName: user.name,
        },
        include: {
          avatarAsset: true,
          signatureAsset: true,
        },
      });
    }

    return this.toProfileResponse(user, profile);
  }

  async updateProfile(
    userId: string,
    dto: UpdateUserProfileDto,
  ): Promise<UserProfileResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        psychologistProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data: {
      professionalName?: string;
      licenseNumber?: string | null;
      phone?: string | null;
      specialties?: string[];
      bio?: string | null;
    } = {};

    if (dto.professionalName !== undefined) {
      data.professionalName = dto.professionalName.trim();
    }
    if (dto.licenseNumber !== undefined) {
      data.licenseNumber = dto.licenseNumber ? dto.licenseNumber.trim() : null;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone ? dto.phone.trim() : null;
    }
    if (dto.specialties !== undefined) {
      data.specialties = dto.specialties.map((s) => s.trim()).filter(Boolean);
    }
    if (dto.bio !== undefined) {
      data.bio = dto.bio ? dto.bio.trim() : null;
    }

    const updatedProfile = await this.prisma.psychologistProfile.upsert({
      where: { userId },
      create: {
        userId,
        professionalName: dto.professionalName?.trim() || user.name,
        licenseNumber: data.licenseNumber,
        phone: data.phone,
        specialties: data.specialties || [],
        bio: data.bio,
      },
      update: data,
      include: {
        avatarAsset: true,
        signatureAsset: true,
      },
    });

    if (dto.professionalName && dto.professionalName.trim() !== user.name) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { name: dto.professionalName.trim() },
      });
    }

    const freshUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return this.toProfileResponse(freshUser, updatedProfile);
  }

  async getAvatarMetadata(userId: string): Promise<UserAssetResponseDto> {
    const asset = await this.prisma.userAvatarAsset.findUnique({
      where: { userId },
    });
    if (!asset) {
      return {
        rowState: 'ABSENT',
        mimeType: null,
        byteSize: null,
        width: null,
        height: null,
        updatedAt: null,
      };
    }
    return {
      rowState: 'PRESENT',
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      updatedAt: asset.updatedAt,
    };
  }

  async getAvatarContent(userId: string) {
    const asset = await this.prisma.userAvatarAsset.findUnique({
      where: { userId },
    });
    if (!asset) {
      throw new NotFoundException('Avatar asset not found');
    }
    const absolutePath = await this.storage.resolveAvatarPath(asset.storageKey);
    return {
      absolutePath,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      updatedAt: asset.updatedAt,
    };
  }

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<UserAssetResponseDto> {
    await this.ensureProfileExists(userId);
    const validated = validateAvatarImage(file);
    const ext =
      extname(file.originalname).replace('.', '').toLowerCase() || 'png';
    const storageKey = await this.storage.writeAvatar(userId, file.buffer, ext);

    const oldAsset = await this.prisma.userAvatarAsset.findUnique({
      where: { userId },
    });

    const newAsset = await this.prisma.userAvatarAsset.upsert({
      where: { userId },
      create: {
        userId,
        storageKey,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        width: validated.width,
        height: validated.height,
      },
      update: {
        storageKey,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        width: validated.width,
        height: validated.height,
      },
    });

    if (oldAsset && oldAsset.storageKey !== storageKey) {
      await this.storage.deleteAvatarFile(oldAsset.storageKey);
    }

    return {
      rowState: 'PRESENT',
      mimeType: newAsset.mimeType,
      byteSize: newAsset.byteSize,
      width: newAsset.width,
      height: newAsset.height,
      updatedAt: newAsset.updatedAt,
    };
  }

  async removeAvatar(userId: string): Promise<UserAssetResponseDto> {
    const asset = await this.prisma.userAvatarAsset.findUnique({
      where: { userId },
    });
    if (asset) {
      await this.prisma.userAvatarAsset.delete({ where: { userId } });
      await this.storage.deleteAvatarFile(asset.storageKey);
    }
    return {
      rowState: 'ABSENT',
      mimeType: null,
      byteSize: null,
      width: null,
      height: null,
      updatedAt: null,
    };
  }

  async getSignatureMetadata(userId: string): Promise<UserAssetResponseDto> {
    const asset = await this.prisma.userSignatureAsset.findUnique({
      where: { userId },
    });
    if (!asset) {
      return {
        rowState: 'ABSENT',
        mimeType: null,
        byteSize: null,
        width: null,
        height: null,
        updatedAt: null,
      };
    }
    return {
      rowState: 'PRESENT',
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      updatedAt: asset.updatedAt,
    };
  }

  async getSignatureContent(userId: string) {
    const asset = await this.prisma.userSignatureAsset.findUnique({
      where: { userId },
    });
    if (!asset) {
      throw new NotFoundException('Signature asset not found');
    }
    const absolutePath = await this.storage.resolveSignaturePath(
      asset.storageKey,
    );
    return {
      absolutePath,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      updatedAt: asset.updatedAt,
    };
  }

  async uploadSignature(
    userId: string,
    file: Express.Multer.File,
  ): Promise<UserAssetResponseDto> {
    await this.ensureProfileExists(userId);
    const validated = validateSignatureImage(file);
    const ext =
      extname(file.originalname).replace('.', '').toLowerCase() || 'png';
    const storageKey = await this.storage.writeSignature(
      userId,
      file.buffer,
      ext,
    );

    const oldAsset = await this.prisma.userSignatureAsset.findUnique({
      where: { userId },
    });

    const newAsset = await this.prisma.userSignatureAsset.upsert({
      where: { userId },
      create: {
        userId,
        storageKey,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        width: validated.width,
        height: validated.height,
      },
      update: {
        storageKey,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        width: validated.width,
        height: validated.height,
      },
    });

    if (oldAsset && oldAsset.storageKey !== storageKey) {
      await this.storage.deleteSignatureFile(oldAsset.storageKey);
    }

    return {
      rowState: 'PRESENT',
      mimeType: newAsset.mimeType,
      byteSize: newAsset.byteSize,
      width: newAsset.width,
      height: newAsset.height,
      updatedAt: newAsset.updatedAt,
    };
  }

  async removeSignature(userId: string): Promise<UserAssetResponseDto> {
    const asset = await this.prisma.userSignatureAsset.findUnique({
      where: { userId },
    });
    if (asset) {
      await this.prisma.userSignatureAsset.delete({ where: { userId } });
      await this.storage.deleteSignatureFile(asset.storageKey);
    }
    return {
      rowState: 'ABSENT',
      mimeType: null,
      byteSize: null,
      width: null,
      height: null,
      updatedAt: null,
    };
  }

  private async ensureProfileExists(userId: string): Promise<void> {
    const profile = await this.prisma.psychologistProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      await this.prisma.psychologistProfile.create({
        data: {
          userId,
          professionalName: user.name,
        },
      });
    }
  }

  async getPreferences(userId: string): Promise<UserPreferencesResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.preferences) {
      return this.toPreferencesResponse(user.preferences);
    }

    const created = await this.prisma.userPreferences.create({
      data: {
        userId: user.id,
      },
    });

    return this.toPreferencesResponse(created);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        ...(dto.emailNotifications !== undefined && {
          emailNotifications: dto.emailNotifications,
        }),
        ...(dto.inAppNotifications !== undefined && {
          inAppNotifications: dto.inAppNotifications,
        }),
        ...(dto.appointmentReminders !== undefined && {
          appointmentReminders: dto.appointmentReminders,
        }),
        ...(dto.reminderAdvanceMinutes !== undefined && {
          reminderAdvanceMinutes: dto.reminderAdvanceMinutes,
        }),
        ...(dto.sessionDigest !== undefined && {
          sessionDigest: dto.sessionDigest,
        }),
        ...(dto.timeZone !== undefined && { timeZone: dto.timeZone }),
        ...(dto.timeFormat !== undefined && { timeFormat: dto.timeFormat }),
        ...(dto.dateFormat !== undefined && { dateFormat: dto.dateFormat }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.weekStartsOn !== undefined && {
          weekStartsOn: dto.weekStartsOn,
        }),
      },
      update: {
        ...(dto.emailNotifications !== undefined && {
          emailNotifications: dto.emailNotifications,
        }),
        ...(dto.inAppNotifications !== undefined && {
          inAppNotifications: dto.inAppNotifications,
        }),
        ...(dto.appointmentReminders !== undefined && {
          appointmentReminders: dto.appointmentReminders,
        }),
        ...(dto.reminderAdvanceMinutes !== undefined && {
          reminderAdvanceMinutes: dto.reminderAdvanceMinutes,
        }),
        ...(dto.sessionDigest !== undefined && {
          sessionDigest: dto.sessionDigest,
        }),
        ...(dto.timeZone !== undefined && { timeZone: dto.timeZone }),
        ...(dto.timeFormat !== undefined && { timeFormat: dto.timeFormat }),
        ...(dto.dateFormat !== undefined && { dateFormat: dto.dateFormat }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.weekStartsOn !== undefined && {
          weekStartsOn: dto.weekStartsOn,
        }),
      },
    });

    return this.toPreferencesResponse(updated);
  }

  private toPreferencesResponse(
    prefs: UserPreferences,
  ): UserPreferencesResponseDto {
    return {
      userId: prefs.userId,
      emailNotifications: prefs.emailNotifications,
      inAppNotifications: prefs.inAppNotifications,
      appointmentReminders: prefs.appointmentReminders,
      reminderAdvanceMinutes: prefs.reminderAdvanceMinutes,
      sessionDigest: prefs.sessionDigest,
      timeZone: prefs.timeZone,
      timeFormat: prefs.timeFormat,
      dateFormat: prefs.dateFormat,
      locale: prefs.locale,
      weekStartsOn: prefs.weekStartsOn,
      createdAt: prefs.createdAt,
      updatedAt: prefs.updatedAt,
    };
  }

  private toProfileResponse(
    user: { id: string; email: string; role: UserRole },
    profile: {
      id: string;
      professionalName: string;
      licenseNumber?: string | null;
      phone?: string | null;
      specialties?: string[];
      bio?: string | null;
      status: PsychologistProfileStatus;
      avatarAsset?: unknown;
      signatureAsset?: unknown;
      createdAt: Date;
      updatedAt: Date;
    },
  ): UserProfileResponseDto {
    return {
      id: profile.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      professionalName: profile.professionalName,
      licenseNumber: profile.licenseNumber ?? null,
      phone: profile.phone ?? null,
      specialties: profile.specialties ?? [],
      bio: profile.bio ?? null,
      status: profile.status,
      hasAvatar: Boolean(profile.avatarAsset),
      hasSignature: Boolean(profile.signatureAsset),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
