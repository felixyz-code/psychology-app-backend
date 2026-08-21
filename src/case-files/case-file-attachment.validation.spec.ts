import { BadRequestException } from '@nestjs/common';
import {
  hasAllowedCaseFileAttachmentMetadata,
  validateCaseFileAttachmentFile,
  MAX_ATTACHMENT_SIZE_BYTES,
  INVALID_ATTACHMENT_CONTENT_MESSAGE,
  INVALID_ATTACHMENT_SIZE_MESSAGE,
} from './case-file-attachment.validation';

describe('case-file-attachment.validation', () => {
  const pdfBuffer = Buffer.from('%PDF-1.4 test content');
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]);
  const webpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const docxBuffer = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00,
  ]);
  const docBuffer = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);

  describe('hasAllowedCaseFileAttachmentMetadata', () => {
    it('accepts valid PDF metadata', () => {
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'report.pdf',
          mimetype: 'application/pdf',
        }),
      ).toBe(true);
    });

    it('accepts valid JPEG metadata', () => {
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
        }),
      ).toBe(true);
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'photo.JPEG',
          mimetype: 'image/jpeg',
        }),
      ).toBe(true);
    });

    it('accepts valid PNG metadata', () => {
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'image.png',
          mimetype: 'image/png',
        }),
      ).toBe(true);
    });

    it('accepts valid WEBP metadata', () => {
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'image.webp',
          mimetype: 'image/webp',
        }),
      ).toBe(true);
    });

    it('accepts valid DOC and DOCX metadata', () => {
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'doc.doc',
          mimetype: 'application/msword',
        }),
      ).toBe(true);
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'doc.docx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ).toBe(true);
    });

    it('rejects unsupported extensions and mime types', () => {
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'script.exe',
          mimetype: 'application/octet-stream',
        }),
      ).toBe(false);
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'report.pdf',
          mimetype: 'text/html',
        }),
      ).toBe(false);
      expect(
        hasAllowedCaseFileAttachmentMetadata({
          originalname: 'script.js',
          mimetype: 'application/javascript',
        }),
      ).toBe(false);
    });
  });

  describe('validateCaseFileAttachmentFile', () => {
    it('validates genuine PDF content successfully', () => {
      expect(() =>
        validateCaseFileAttachmentFile({
          originalname: 'study.pdf',
          mimetype: 'application/pdf',
          buffer: pdfBuffer,
        }),
      ).not.toThrow();
    });

    it('validates genuine JPEG, PNG, WEBP, DOCX, DOC content successfully', () => {
      expect(() =>
        validateCaseFileAttachmentFile({
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          buffer: jpegBuffer,
        }),
      ).not.toThrow();

      expect(() =>
        validateCaseFileAttachmentFile({
          originalname: 'photo.png',
          mimetype: 'image/png',
          buffer: pngBuffer,
        }),
      ).not.toThrow();

      expect(() =>
        validateCaseFileAttachmentFile({
          originalname: 'photo.webp',
          mimetype: 'image/webp',
          buffer: webpBuffer,
        }),
      ).not.toThrow();

      expect(() =>
        validateCaseFileAttachmentFile({
          originalname: 'doc.docx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: docxBuffer,
        }),
      ).not.toThrow();

      expect(() =>
        validateCaseFileAttachmentFile({
          originalname: 'doc.doc',
          mimetype: 'application/msword',
          buffer: docBuffer,
        }),
      ).not.toThrow();
    });

    it('throws BadRequestException if file exceeds size limit', () => {
      const largeBuffer = Buffer.alloc(MAX_ATTACHMENT_SIZE_BYTES + 1);
      expect(() =>
        validateCaseFileAttachmentFile({
          originalname: 'large.pdf',
          mimetype: 'application/pdf',
          buffer: largeBuffer,
        }),
      ).toThrow(new BadRequestException(INVALID_ATTACHMENT_SIZE_MESSAGE));
    });

    it('throws BadRequestException if magic number does not match MIME type', () => {
      const fakePdfBuffer = Buffer.from('NOT A PDF FILE AT ALL');
      expect(() =>
        validateCaseFileAttachmentFile({
          originalname: 'fake.pdf',
          mimetype: 'application/pdf',
          buffer: fakePdfBuffer,
        }),
      ).toThrow(new BadRequestException(INVALID_ATTACHMENT_CONTENT_MESSAGE));
    });
  });
});
