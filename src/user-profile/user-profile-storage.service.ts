import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, normalize, resolve } from 'node:path';

@Injectable()
export class UserProfileStorageService {
  private readonly logger = new Logger(UserProfileStorageService.name);
  private readonly avatarDir: string;
  private readonly signatureDir: string;

  constructor() {
    const baseDir = process.env.UPLOADS_BASE_PATH
      ? resolve(process.env.UPLOADS_BASE_PATH)
      : resolve(process.cwd(), 'uploads');
    this.avatarDir = join(baseDir, 'avatars');
    this.signatureDir = join(baseDir, 'signatures');
  }

  async writeAvatar(
    userId: string,
    buffer: Buffer,
    extension: string,
  ): Promise<string> {
    await fs.mkdir(this.avatarDir, { recursive: true });
    const storageKey = `${userId}-${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;
    const absolutePath = join(this.avatarDir, storageKey);
    await fs.writeFile(absolutePath, buffer);
    return storageKey;
  }

  async writeSignature(
    userId: string,
    buffer: Buffer,
    extension: string,
  ): Promise<string> {
    await fs.mkdir(this.signatureDir, { recursive: true });
    const storageKey = `${userId}-${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;
    const absolutePath = join(this.signatureDir, storageKey);
    await fs.writeFile(absolutePath, buffer);
    return storageKey;
  }

  async resolveAvatarPath(storageKey: string): Promise<string> {
    const target = normalize(join(this.avatarDir, storageKey));
    try {
      if (!target.startsWith(this.avatarDir)) {
        throw new NotFoundException('Avatar asset not found');
      }
      await fs.access(target);
      return target;
    } catch {
      throw new NotFoundException('Avatar asset not found');
    }
  }

  async resolveSignaturePath(storageKey: string): Promise<string> {
    const target = normalize(join(this.signatureDir, storageKey));
    try {
      if (!target.startsWith(this.signatureDir)) {
        throw new NotFoundException('Signature asset not found');
      }
      await fs.access(target);
      return target;
    } catch {
      throw new NotFoundException('Signature asset not found');
    }
  }

  async deleteAvatarFile(storageKey: string): Promise<void> {
    try {
      const target = normalize(join(this.avatarDir, storageKey));
      if (target.startsWith(this.avatarDir)) {
        await fs.unlink(target);
      }
    } catch (error) {
      this.logger.warn(`Could not delete avatar file: ${storageKey}`, error);
    }
  }

  async deleteSignatureFile(storageKey: string): Promise<void> {
    try {
      const target = normalize(join(this.signatureDir, storageKey));
      if (target.startsWith(this.signatureDir)) {
        await fs.unlink(target);
      }
    } catch (error) {
      this.logger.warn(`Could not delete signature file: ${storageKey}`, error);
    }
  }
}
