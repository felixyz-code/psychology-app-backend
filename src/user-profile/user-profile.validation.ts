import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { imageSize } from 'image-size';
import { extname } from 'node:path';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MiB
export const MAX_SIGNATURE_BYTES = 1 * 1024 * 1024; // 1 MiB

export interface ValidatedUserAsset {
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
}

export function validateAvatarImage(
  file: Express.Multer.File,
): ValidatedUserAsset {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.byteLength !== file.size
  ) {
    throw new BadRequestException('Avatar upload bytes are invalid');
  }
  if (file.buffer.byteLength > MAX_AVATAR_BYTES) {
    throw new PayloadTooLargeException('Avatar image exceeds the 2 MiB limit');
  }

  const extension = extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
  if (!allowedExtensions.includes(extension)) {
    throw new BadRequestException('Avatar must be a PNG, JPEG, or WebP image');
  }

  let dimensions: { width?: number; height?: number; type?: string };
  try {
    dimensions = imageSize(file.buffer);
  } catch {
    throw new BadRequestException('Avatar image is malformed');
  }

  if (!dimensions.width || !dimensions.height) {
    throw new BadRequestException(
      'Avatar image dimensions could not be determined',
    );
  }

  const mimeType =
    extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

  return {
    mimeType,
    byteSize: file.buffer.byteLength,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function validateSignatureImage(
  file: Express.Multer.File,
): ValidatedUserAsset {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.byteLength !== file.size
  ) {
    throw new BadRequestException('Signature upload bytes are invalid');
  }
  if (file.buffer.byteLength > MAX_SIGNATURE_BYTES) {
    throw new PayloadTooLargeException(
      'Signature image exceeds the 1 MiB limit',
    );
  }

  const extension = extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.png', '.jpg', '.jpeg'];
  if (!allowedExtensions.includes(extension)) {
    throw new BadRequestException('Signature must be a PNG or JPEG image');
  }

  let dimensions: { width?: number; height?: number; type?: string };
  try {
    dimensions = imageSize(file.buffer);
  } catch {
    throw new BadRequestException('Signature image is malformed');
  }

  if (!dimensions.width || !dimensions.height) {
    throw new BadRequestException(
      'Signature image dimensions could not be determined',
    );
  }

  const mimeType = extension === '.png' ? 'image/png' : 'image/jpeg';

  return {
    mimeType,
    byteSize: file.buffer.byteLength,
    width: dimensions.width,
    height: dimensions.height,
  };
}
