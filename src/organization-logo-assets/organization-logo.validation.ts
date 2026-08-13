import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { imageSize } from 'image-size';
import { extname } from 'node:path';

export const MAX_ORGANIZATION_LOGO_BYTES = 1024 * 1024;
const MIN_DIMENSION = 64;
const MAX_DIMENSION = 2048;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type ValidatedOrganizationLogo = {
  mimeType: 'image/png' | 'image/jpeg';
  byteSize: number;
  width: number;
  height: number;
};

export function validateOrganizationLogo(
  file: Express.Multer.File,
): ValidatedOrganizationLogo {
  if (!Buffer.isBuffer(file.buffer) || file.buffer.byteLength !== file.size) {
    throw new BadRequestException('Logo upload bytes are invalid');
  }
  if (file.buffer.byteLength > MAX_ORGANIZATION_LOGO_BYTES) {
    throw new PayloadTooLargeException(
      'Organization logo exceeds the 1 MiB limit',
    );
  }

  const extension = extname(file.originalname).toLocaleLowerCase('en-US');
  const signatureType = getSignatureType(file.buffer);
  const expectedMimeType = mimeForExtension(extension);
  if (
    !expectedMimeType ||
    !signatureType ||
    expectedMimeType !== signatureType
  ) {
    throw new BadRequestException('Logo extension and binary type must agree');
  }
  if (file.mimetype !== expectedMimeType) {
    throw new BadRequestException(
      'Logo declared MIME type must match binary type',
    );
  }
  if (signatureType === 'image/png' && hasPngAnimationControl(file.buffer)) {
    throw new BadRequestException('Animated PNG logos are not supported');
  }

  let dimensions: { width?: number; height?: number; type?: string };
  try {
    dimensions = imageSize(file.buffer);
  } catch {
    throw new BadRequestException('Logo image is malformed');
  }
  if (
    dimensions.type !== (signatureType === 'image/png' ? 'png' : 'jpg') ||
    !dimensions.width ||
    !dimensions.height
  ) {
    throw new BadRequestException('Logo image is malformed');
  }
  if (
    dimensions.width < MIN_DIMENSION ||
    dimensions.height < MIN_DIMENSION ||
    dimensions.width > MAX_DIMENSION ||
    dimensions.height > MAX_DIMENSION
  ) {
    throw new BadRequestException(
      'Logo dimensions must be between 64 and 2048 pixels',
    );
  }

  return {
    mimeType: signatureType,
    byteSize: file.buffer.byteLength,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function mimeForExtension(extension: string) {
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  return null;
}

function getSignatureType(bytes: Buffer) {
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png' as const;
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg' as const;
  }
  return null;
}

function hasPngAnimationControl(bytes: Buffer) {
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return false;
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') return true;
    offset = chunkEnd;
  }
  return false;
}
