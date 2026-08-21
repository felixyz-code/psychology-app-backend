import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { isAbsolute, join, normalize, resolve } from 'node:path';

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

  async writeAvatar(userId: string, buffer: Buffer, extension: string): Promise<string> {
    await fs.mkdir(this.avatarDir, { recursive: true });
    const storageKey = `${userId}-${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;
    const absolutePath = join(this.avatarDir, storageKey);
    await fs.writeFile(absolutePath, buffer);
    return storageKey;
  }

  async writeSignature(userId: string, buffer: Buffer, extension: string): Promise<string> {
    await fs.mkdir(this.signatureDir, { recursive: true });
    const storageKey = `${userId}-${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;
    const absolutePath = join(this.signatureDir, storageKey);
    await fs.writeFile(absolutePath, buffer);
    return storageKey;
  }

  async resolveAvatarPath(storageKey: string): Promise<string> {
    const target = normalize(join(this.avatarDir, storageKey));
    if (!target.startsWith(this.avatarDir) || !existsSync(target)) {
      throw new NotFoundException('Avatar asset not found');
    }
    return target;
  }

  async resolveSignaturePath(storageKey: string): Promise<string> {
    const target = normalize(join(this.signatureDir, storageKey));
    if (!target.startsWith(this.signatureDir) || !existsSync(target)) {
      throw new NotFoundException('Signature asset not found');
    }
    return target;
  }

  async deleteAvatarFile(storageKey: string): Promise<void> {
    try {
      const target = normalize(join(this.avatarDir, storageKey));
      if (target.startsWith(this.avatarDir) && existsSync(target)) {
        await fs.unlink(target);
      }
    } catch (error) {
      this.logger.warn(`Could not delete avatar file: ${storageKey}`, error);
    }
  }

  async deleteSignatureFile(storageKey: string): Promise<void> {
    try {
      const target = normalize(join(this.signatureDir, storageKey));
      if (target.startsWith(this.signatureDir) && existsSync(target)) {
        await fs.unlink(target);
      }
    } catch (error) {
      this.logger.warn(`Could not delete signature file: ${storageKey}`, error);
    }
  }
}
