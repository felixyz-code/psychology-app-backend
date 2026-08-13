import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/configuration';
import { OrganizationLogoStorageService } from './organization-logo-storage.service';

describe('OrganizationLogoStorageService', () => {
  let uploadsPath: string;
  let outsidePath: string;
  let service: OrganizationLogoStorageService;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();

  beforeEach(async () => {
    uploadsPath = await mkdtemp(
      join(tmpdir(), 'psychology-organization-logo-uploads-'),
    );
    outsidePath = await mkdtemp(
      join(tmpdir(), 'psychology-organization-logo-outside-'),
    );
    service = new OrganizationLogoStorageService({
      uploadsPath,
    } as AppConfigService);
  });

  afterEach(async () => {
    await rm(uploadsPath, { recursive: true, force: true });
    await rm(outsidePath, { recursive: true, force: true });
  });

  it('generates unique server-owned keys in the organization namespace', () => {
    const firstKey = service.generateStorageKey(organizationId);
    const secondKey = service.generateStorageKey(organizationId);

    expect(firstKey).toMatch(
      new RegExp(`^organizations/${organizationId}/[0-9a-f-]{36}$`, 'i'),
    );
    expect(secondKey).toMatch(
      new RegExp(`^organizations/${organizationId}/[0-9a-f-]{36}$`, 'i'),
    );
    expect(firstKey).not.toBe(secondKey);
  });

  it('writes new bytes and resolves the resulting file beneath the upload root', async () => {
    const bytes = Buffer.from('logo bytes');
    const written = await service.writeNew(organizationId, bytes);

    const resolvedPath = await service.resolveExistingFile(
      organizationId,
      written.storageKey,
    );
    await expect(readFile(resolvedPath)).resolves.toEqual(bytes);
    expect(written.byteSize).toBe(bytes.byteLength);
  });

  it.each([
    '../outside',
    'organizations/../outside',
    '/tmp/outside',
    'C:\\temp\\outside',
    '\\\\server\\share\\outside',
    'organizations%2Foutside',
    'organizations\\outside\\file',
  ])(
    'rejects unsafe storage key %s without disclosing host paths',
    async (key) => {
      await expect(
        service.resolveExistingFile(organizationId, key),
      ).rejects.toThrow('Invalid organization logo storage key');
      await expect(
        service.resolveExistingFile(organizationId, key),
      ).rejects.not.toThrow(uploadsPath);
    },
  );

  it('rejects a syntactically valid key that belongs to another organization', async () => {
    const foreignKey = service.generateStorageKey(otherOrganizationId);

    await expect(
      service.resolveExistingFile(organizationId, foreignKey),
    ).rejects.toThrow('Invalid organization logo storage key');
  });

  it('deletes only a confined logo file and treats a missing file as a safe no-op', async () => {
    const written = await service.writeNew(organizationId, Buffer.from('logo'));
    const resolvedPath = await service.resolveExistingFile(
      organizationId,
      written.storageKey,
    );

    await expect(
      service.deleteIfExists(organizationId, written.storageKey),
    ).resolves.toBeUndefined();
    await expect(access(resolvedPath)).rejects.toThrow();
    await expect(
      service.deleteIfExists(organizationId, written.storageKey),
    ).resolves.toBeUndefined();
  });

  it('does not resolve or delete through an organization namespace symlink escape', async () => {
    const storageKey = service.generateStorageKey(organizationId);
    const fileName = storageKey.split('/')[2];
    const organizationRoot = join(uploadsPath, 'organizations');
    const outsideFile = join(outsidePath, fileName);

    await mkdir(organizationRoot, { recursive: true });
    await writeFile(outsideFile, 'outside logo');

    try {
      await symlink(
        outsidePath,
        join(organizationRoot, organizationId),
        'junction',
      );
    } catch (error) {
      if (getFileSystemErrorCode(error) === 'EPERM') {
        return;
      }
      throw error;
    }

    await expect(
      service.resolveExistingFile(organizationId, storageKey),
    ).rejects.toThrow('Organization logo file not found');
    await expect(
      service.deleteIfExists(organizationId, storageKey),
    ).rejects.toThrow('Organization logo file not found');
    await expect(readFile(outsideFile, 'utf8')).resolves.toBe('outside logo');
  });
});

function getFileSystemErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code;
  }

  return undefined;
}
