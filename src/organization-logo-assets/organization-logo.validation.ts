import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { imageSize } from 'image-size';
import { extname } from 'node:path';

export const MAX_ORGANIZATION_LOGO_BYTES = 1024 * 1024;
const MIN_DIMENSION = 64;
const MAX_DIMENSION = 2048;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CRC_TABLE = createPngCrcTable();

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
  if (signatureType === 'image/png') assertPngStructure(file.buffer);
  else assertJpegStructure(file.buffer);

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

function assertPngStructure(bytes: Buffer) {
  let offset = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let hasImageData = false;

  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throwMalformedImage();

    const length = bytes.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    if (length > bytes.length - dataOffset - 4) throwMalformedImage();

    const crcOffset = dataOffset + length;
    const chunkEnd = crcOffset + 4;
    const typeBytes = bytes.subarray(typeOffset, dataOffset);
    if (!isValidPngChunkType(typeBytes)) throwMalformedImage();

    const type = typeBytes.toString('ascii');
    if (chunkIndex === 0 && (type !== 'IHDR' || length !== 13)) {
      throwMalformedImage();
    }
    if (chunkIndex > 0 && type === 'IHDR') throwMalformedImage();

    const expectedCrc = bytes.readUInt32BE(crcOffset);
    const actualCrc = pngCrc32(bytes, typeOffset, crcOffset);
    if (expectedCrc !== actualCrc) throwMalformedImage();

    if (type === 'IHDR')
      assertValidPngHeader(bytes.subarray(dataOffset, crcOffset));

    if (type === 'acTL') {
      throw new BadRequestException('Animated PNG logos are not supported');
    }
    if (type === 'IDAT' && length > 0) hasImageData = true;
    if (type === 'IEND') {
      if (length !== 0 || !hasImageData || chunkEnd !== bytes.length) {
        throwMalformedImage();
      }
      return;
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  throwMalformedImage();
}

function assertValidPngHeader(header: Buffer) {
  const bitDepth = header[8];
  const colorType = header[9];
  const validBitDepths: Readonly<Record<number, readonly number[]>> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };

  if (
    header.readUInt32BE(0) === 0 ||
    header.readUInt32BE(4) === 0 ||
    !validBitDepths[colorType]?.includes(bitDepth) ||
    header[10] !== 0 ||
    header[11] !== 0 ||
    (header[12] !== 0 && header[12] !== 1)
  ) {
    throwMalformedImage();
  }
}

function isValidPngChunkType(type: Buffer) {
  return (
    type.length === 4 &&
    [...type].every(
      (value) =>
        (value >= 0x41 && value <= 0x5a) || (value >= 0x61 && value <= 0x7a),
    ) &&
    type[2] >= 0x41 &&
    type[2] <= 0x5a
  );
}

function assertJpegStructure(bytes: Buffer) {
  let offset = 2;
  let hasFrame = false;
  let hasScan = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throwMalformedImage();

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) throwMalformedImage();

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0xd8) throwMalformedImage();
    if (marker === 0xd9) {
      if (!hasFrame || !hasScan || offset !== bytes.length) {
        throwMalformedImage();
      }
      return;
    }
    if (marker === 0x01) continue;
    if (marker >= 0xd0 && marker <= 0xd7) throwMalformedImage();

    if (bytes.length - offset < 2) throwMalformedImage();
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || segmentLength - 2 > bytes.length - offset - 2) {
      throwMalformedImage();
    }

    const payloadOffset = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (isStartOfFrame(marker)) {
      if (segmentLength < 11) throwMalformedImage();
      const componentCount = bytes[payloadOffset + 5];
      if (componentCount === 0 || segmentLength !== 8 + 3 * componentCount) {
        throwMalformedImage();
      }
      hasFrame = true;
    }
    if (marker === 0xda) {
      if (!hasFrame || segmentLength < 8) throwMalformedImage();
      const componentCount = bytes[payloadOffset];
      if (componentCount === 0 || segmentLength !== 6 + 2 * componentCount) {
        throwMalformedImage();
      }
      hasScan = true;
      offset = findNextJpegMarker(bytes, segmentEnd);
      continue;
    }

    offset = segmentEnd;
  }

  throwMalformedImage();
}

function findNextJpegMarker(bytes: Buffer, start: number) {
  let offset = start;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const markerOffset = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) throwMalformedImage();

    const marker = bytes[offset];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }
    return markerOffset;
  }

  throwMalformedImage();
}

function isStartOfFrame(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function pngCrc32(bytes: Buffer, start: number, end: number) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = PNG_CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngCrcTable() {
  return Uint32Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return crc >>> 0;
  });
}

function throwMalformedImage(): never {
  throw new BadRequestException('Logo image is malformed');
}
