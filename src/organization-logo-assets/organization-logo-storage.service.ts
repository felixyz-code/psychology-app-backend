import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  realpath,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AppConfigService } from '../config/configuration';

const MAX_WRITE_ATTEMPTS = 3;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WrittenOrganizationLogo = {
  storageKey: string;
  byteSize: number;
};

@Injectable()
export class OrganizationLogoStorageService {
  constructor(private readonly config: AppConfigService) {}

  generateStorageKey(organizationId: string) {
    this.assertOrganizationId(organizationId);
    return `organizations/${organizationId}/${randomUUID()}`;
  }

  async writeNew(
    organizationId: string,
    bytes: Uint8Array,
  ): Promise<WrittenOrganizationLogo> {
    const uploadsRoot = this.getUploadsRoot();
    await this.ensureOrganizationDirectory(uploadsRoot, organizationId);

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const storageKey = this.generateStorageKey(organizationId);
      const { candidatePath } = this.getConfinedPath(
        organizationId,
        storageKey,
      );

      try {
        await writeFile(candidatePath, bytes, { flag: 'wx' });
        await this.assertResolvedPathIsWithinUploadsRoot(
          uploadsRoot,
          candidatePath,
        );
        return { storageKey, byteSize: bytes.byteLength };
      } catch (error) {
        if (getFileSystemErrorCode(error) === 'EEXIST') {
          continue;
        }

        throw new InternalServerErrorException(
          'Unable to write organization logo file',
        );
      }
    }

    throw new InternalServerErrorException(
      'Unable to write organization logo file',
    );
  }

  async resolveExistingFile(
    organizationId: string,
    storageKey: string,
  ): Promise<string> {
    const { uploadsRoot, candidatePath } = this.getConfinedPath(
      organizationId,
      storageKey,
    );

    try {
      await access(candidatePath);
      const fileStats = await stat(candidatePath);
      if (!fileStats.isFile()) {
        throw this.fileNotFound();
      }
      await this.assertResolvedPathIsWithinUploadsRoot(
        uploadsRoot,
        candidatePath,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw this.fileNotFound();
    }

    return candidatePath;
  }

  async deleteIfExists(organizationId: string, storageKey: string) {
    const { uploadsRoot, candidatePath } = this.getConfinedPath(
      organizationId,
      storageKey,
    );

    try {
      await this.assertResolvedPathIsWithinUploadsRoot(
        uploadsRoot,
        candidatePath,
      );
      await unlink(candidatePath);
    } catch (error) {
      if (getFileSystemErrorCode(error) === 'ENOENT') {
        return;
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Unable to delete organization logo file',
      );
    }
  }

  private getUploadsRoot() {
    const uploadsRoot = this.config.uploadsPath;
    return isAbsolute(uploadsRoot)
      ? resolve(uploadsRoot)
      : resolve(process.cwd(), uploadsRoot);
  }

  private async ensureOrganizationDirectory(
    uploadsRoot: string,
    organizationId: string,
  ) {
    this.assertOrganizationId(organizationId);
    const organizationDirectory = resolve(
      uploadsRoot,
      'organizations',
      organizationId,
    );

    try {
      await mkdir(organizationDirectory, { recursive: true });
      await this.assertResolvedPathIsWithinUploadsRoot(
        uploadsRoot,
        organizationDirectory,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Unable to prepare organization logo storage',
      );
    }
  }

  private getConfinedPath(organizationId: string, storageKey: string) {
    this.assertSafeStorageKey(organizationId, storageKey);
    const uploadsRoot = this.getUploadsRoot();
    const candidatePath = resolve(uploadsRoot, storageKey);
    const relativeToUploadsRoot = relative(uploadsRoot, candidatePath);

    if (isOutside(relativeToUploadsRoot)) {
      throw this.invalidStorageKey();
    }

    return { uploadsRoot, candidatePath };
  }

  private async assertResolvedPathIsWithinUploadsRoot(
    uploadsRoot: string,
    candidatePath: string,
  ) {
    const [resolvedUploadsRoot, resolvedCandidatePath] = await Promise.all([
      realpath(uploadsRoot),
      realpath(candidatePath),
    ]);
    const relativeToResolvedUploadsRoot = relative(
      resolvedUploadsRoot,
      resolvedCandidatePath,
    );

    if (isOutside(relativeToResolvedUploadsRoot)) {
      throw this.fileNotFound();
    }
  }

  private assertSafeStorageKey(organizationId: string, storageKey: string) {
    this.assertOrganizationId(organizationId);

    if (storageKey.includes('\0') || isAbsolute(storageKey)) {
      throw this.invalidStorageKey();
    }

    let decodedStorageKey: string;
    try {
      decodedStorageKey = decodeURIComponent(storageKey);
    } catch {
      throw this.invalidStorageKey();
    }

    const normalizedStorageKey = decodedStorageKey.replace(/\\/g, '/');
    const segments = normalizedStorageKey.split('/');
    const expectedPrefix = ['organizations', organizationId];

    if (
      decodedStorageKey !== storageKey ||
      normalizedStorageKey !== storageKey ||
      segments.length !== 3 ||
      segments[0] !== expectedPrefix[0] ||
      segments[1] !== expectedPrefix[1] ||
      !UUID_PATTERN.test(segments[2])
    ) {
      throw this.invalidStorageKey();
    }
  }

  private assertOrganizationId(organizationId: string) {
    if (!UUID_PATTERN.test(organizationId)) {
      throw this.invalidStorageKey();
    }
  }

  private invalidStorageKey() {
    return new BadRequestException('Invalid organization logo storage key');
  }

  private fileNotFound() {
    return new NotFoundException('Organization logo file not found');
  }
}

function getFileSystemErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code;
  }

  return undefined;
}

function isOutside(relativeToUploadsRoot: string) {
  return (
    relativeToUploadsRoot === '..' ||
    relativeToUploadsRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativeToUploadsRoot)
  );
}
