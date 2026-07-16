import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';

const invalidDocumentContentMessage =
  'File content does not match an allowed format';

type SupportedDocumentFormat = {
  mimeType: string;
  extensions: string[];
  signature: number[];
};

type DocumentFileMetadata = {
  originalname: string;
  mimetype: string;
};

type DocumentFileContent = DocumentFileMetadata & {
  buffer: Buffer;
};

const supportedDocumentFormats: SupportedDocumentFormat[] = [
  {
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  {
    mimeType: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    signature: [0xff, 0xd8, 0xff],
  },
  {
    mimeType: 'image/png',
    extensions: ['.png'],
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
];

export function hasAllowedDocumentMetadata(file: DocumentFileMetadata) {
  const extension = extname(file.originalname).toLowerCase();

  return supportedDocumentFormats.some(
    (format) =>
      format.mimeType === file.mimetype &&
      format.extensions.includes(extension),
  );
}

export function validateDocumentFileContent(file: DocumentFileContent) {
  const detectedFormat = supportedDocumentFormats.find((format) =>
    hasSignature(file.buffer, format.signature),
  );

  if (
    !detectedFormat ||
    detectedFormat.mimeType !== file.mimetype ||
    !detectedFormat.extensions.includes(
      extname(file.originalname).toLowerCase(),
    )
  ) {
    throw new BadRequestException(invalidDocumentContentMessage);
  }
}

function hasSignature(buffer: Buffer, signature: number[]) {
  return (
    buffer.length >= signature.length &&
    signature.every((byte, index) => buffer[index] === byte)
  );
}
