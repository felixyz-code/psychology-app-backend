import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const INVALID_ATTACHMENT_CONTENT_MESSAGE =
  'File content does not match an allowed format';

export const INVALID_ATTACHMENT_SIZE_MESSAGE =
  'File size exceeds the 10MB limit';

type SupportedAttachmentFormat = {
  mimeType: string;
  extensions: string[];
  validateSignature: (buffer: Buffer) => boolean;
};

export type CaseFileAttachmentFileMetadata = {
  originalname: string;
  mimetype: string;
  size?: number;
};

export type CaseFileAttachmentFileContent = CaseFileAttachmentFileMetadata & {
  buffer: Buffer;
};

const supportedAttachmentFormats: SupportedAttachmentFormat[] = [
  {
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
    validateSignature: (buffer) =>
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d, // %PDF-
  },
  {
    mimeType: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    validateSignature: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extensions: ['.png'],
    validateSignature: (buffer) =>
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a,
  },
  {
    mimeType: 'image/webp',
    extensions: ['.webp'],
    validateSignature: (buffer) =>
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 && // RIFF
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50, // WEBP
  },
  {
    mimeType: 'application/msword',
    extensions: ['.doc'],
    validateSignature: (buffer) =>
      buffer.length >= 8 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 &&
      buffer[5] === 0xb1 &&
      buffer[6] === 0x1a &&
      buffer[7] === 0xe1, // OLE compound file
  },
  {
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx'],
    validateSignature: (buffer) =>
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
      (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08), // PK zip
  },
];

export function hasAllowedCaseFileAttachmentMetadata(
  file: CaseFileAttachmentFileMetadata,
): boolean {
  const extension = extname(file.originalname).toLowerCase();

  return supportedAttachmentFormats.some(
    (format) =>
      format.mimeType === file.mimetype &&
      format.extensions.includes(extension),
  );
}

export function validateCaseFileAttachmentFile(
  file: CaseFileAttachmentFileContent,
): void {
  if (file.buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new BadRequestException(INVALID_ATTACHMENT_SIZE_MESSAGE);
  }

  const extension = extname(file.originalname).toLowerCase();
  const matchedFormat = supportedAttachmentFormats.find(
    (format) =>
      format.mimeType === file.mimetype &&
      format.extensions.includes(extension),
  );

  if (!matchedFormat || !matchedFormat.validateSignature(file.buffer)) {
    throw new BadRequestException(INVALID_ATTACHMENT_CONTENT_MESSAGE);
  }
}
