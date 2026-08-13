import { decode as decodeJpeg } from 'jpeg-js';
import { inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';

const MAX_JPEG_RESOLUTION_IN_MEGAPIXELS = 5;
const MAX_JPEG_MEMORY_MIB = 96;

export type DecodedOrganizationLogo = {
  width: number;
  height: number;
};

export function decodeOrganizationLogo(
  bytes: Buffer,
  mimeType: 'image/png' | 'image/jpeg',
  certifiedDimensions: DecodedOrganizationLogo,
): DecodedOrganizationLogo {
  if (mimeType === 'image/png') {
    assertPngInflateIsBounded(bytes, certifiedDimensions);
    const decoded = PNG.sync.read(bytes, { checkCRC: true });
    return { width: decoded.width, height: decoded.height };
  }

  const decoded = decodeJpeg(bytes, {
    useTArray: true,
    formatAsRGBA: false,
    tolerantDecoding: false,
    maxResolutionInMP: MAX_JPEG_RESOLUTION_IN_MEGAPIXELS,
    maxMemoryUsageInMB: MAX_JPEG_MEMORY_MIB,
  });
  return { width: decoded.width, height: decoded.height };
}

function assertPngInflateIsBounded(
  bytes: Buffer,
  dimensions: DecodedOrganizationLogo,
) {
  const imageData: Buffer[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const dataEnd = dataOffset + length;
    if (bytes.toString('ascii', typeOffset, dataOffset) === 'IDAT') {
      imageData.push(bytes.subarray(dataOffset, dataEnd));
    }
    offset = dataEnd + 4;
  }

  const maximumInflatedBytes =
    dimensions.width * dimensions.height * 8 + dimensions.height * 2 + 14;
  inflateSync(Buffer.concat(imageData), {
    maxOutputLength: maximumInflatedBytes,
  });
}
