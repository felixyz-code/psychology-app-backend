import { deflateSync } from 'node:zlib';
import {
  MAX_ORGANIZATION_LOGO_BYTES,
  validateOrganizationLogo,
} from './organization-logo.validation';

describe('validateOrganizationLogo', () => {
  it.each([
    ['logo.png', 'image/png'],
    ['LOGO.PNG', 'image/png'],
  ])('accepts a bounded PNG named %s', (originalname, mimetype) => {
    expect(
      validateOrganizationLogo(file(createPng(64, 64), originalname, mimetype)),
    ).toMatchObject({
      mimeType: 'image/png',
      width: 64,
      height: 64,
    });
  });

  it('accepts a bounded JPEG when extension, declared MIME, signature, and metadata agree', () => {
    expect(
      validateOrganizationLogo(
        file(minimalJpeg(64, 64), 'logo.JPEG', 'image/jpeg'),
      ),
    ).toMatchObject({ mimeType: 'image/jpeg', width: 64, height: 64 });
  });

  it('accepts the inclusive 2048 pixel dimension boundary', () => {
    expect(validateOrganizationLogo(file(createPng(2048, 2048)))).toMatchObject(
      {
        width: 2048,
        height: 2048,
      },
    );
  });

  it.each([
    ['logo.jpg', 'image/jpeg', createPng(64, 64)],
    ['logo.png', 'image/png', minimalJpeg(64, 64)],
    ['logo.png', 'image/jpeg', createPng(64, 64)],
    ['logo.svg', 'image/png', createPng(64, 64)],
    ['logo.gif', 'image/gif', Buffer.from('GIF89a')],
    ['logo.webp', 'image/webp', Buffer.from('RIFFxxxxWEBP')],
    ['logo.png', 'image/png', Buffer.from('not an image')],
    [
      'malformed.png',
      'image/png',
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    ],
    ['malformed.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
  ])('rejects mismatched or unsupported upload %s', (name, type, buffer) => {
    expect(() => validateOrganizationLogo(file(buffer, name, type))).toThrow();
  });

  it.each([
    [63, 64],
    [64, 63],
    [2049, 64],
    [64, 2049],
  ])('rejects dimensions %i by %i', (width, height) => {
    expect(() =>
      validateOrganizationLogo(file(createPng(width, height))),
    ).toThrow();
  });

  it('rejects APNG animation control chunks and files larger than 1 MiB', () => {
    expect(() =>
      validateOrganizationLogo(file(createPng(64, 64, true))),
    ).toThrow('Animated PNG');
    expect(() =>
      validateOrganizationLogo(
        file(
          Buffer.alloc(MAX_ORGANIZATION_LOGO_BYTES + 1),
          'logo.png',
          'image/png',
        ),
      ),
    ).toThrow('1 MiB');
  });

  it('accepts a structurally valid PNG exactly at the 1 MiB byte limit', () => {
    const exactlyOneMiB = createPngAtSize(64, 64, MAX_ORGANIZATION_LOGO_BYTES);

    expect(validateOrganizationLogo(file(exactlyOneMiB))).toMatchObject({
      byteSize: MAX_ORGANIZATION_LOGO_BYTES,
      width: 64,
      height: 64,
    });
  });

  it.each([
    ['bad IHDR ordering', pngWithChunks([chunk('IDAT', Buffer.alloc(0))])],
    [
      'wrong IHDR length',
      pngWithChunks([
        chunk('IHDR', Buffer.alloc(12)),
        chunk('IDAT', deflateSync(Buffer.alloc(64 * 64 * 4 + 64))),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    ],
    ['truncated chunk', createPng(64, 64).subarray(0, -2)],
    [
      'bad chunk length',
      mutate(createPng(64, 64), (bytes) => bytes.writeUInt32BE(0xffffffff, 33)),
    ],
    [
      'invalid CRC',
      mutate(createPng(64, 64), (bytes) => {
        bytes[29] ^= 0xff;
      }),
    ],
    [
      'invalid IHDR encoding fields',
      pngWithChunks([
        chunk(
          'IHDR',
          mutate(pngHeader(64, 64), (header) => {
            header[10] = 1;
          }),
        ),
        chunk('IDAT', deflateSync(Buffer.alloc(64 * 64 * 4 + 64))),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    ],
    ['missing IEND', withoutLastChunk(createPng(64, 64))],
    [
      'non-zero IEND',
      replaceLastChunk(createPng(64, 64), chunk('IEND', Buffer.from([0]))),
    ],
    [
      'bytes after IEND',
      Buffer.concat([createPng(64, 64), Buffer.from('trailing garbage')]),
    ],
    ['APNG acTL', createPng(64, 64, true)],
    [
      'malformed structure before acTL',
      pngWithChunks([
        chunk('IHDR', pngHeader(64, 64)),
        mutate(chunk('vpAg', Buffer.alloc(1)), (bytes) =>
          bytes.writeUInt32BE(0xffffffff, 0),
        ),
        chunk('acTL', Buffer.alloc(8)),
        chunk('IDAT', deflateSync(Buffer.alloc(64 * 64 * 4 + 64))),
        chunk('IEND', Buffer.alloc(0)),
      ]),
    ],
  ])('rejects PNG structural failure: %s', (_description, bytes) => {
    expect(() => validateOrganizationLogo(file(bytes))).toThrow();
  });

  it.each([
    [
      'truncated after dimensional metadata',
      truncateAfterFrame(minimalJpeg(64, 64)),
    ],
    ['missing terminal marker', minimalJpeg(64, 64).subarray(0, -2)],
    [
      'invalid terminal marker',
      mutate(minimalJpeg(64, 64), (bytes) => {
        bytes[bytes.length - 1] = 0xd8;
      }),
    ],
    [
      'malformed marker segment boundary',
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0xff, 0xd9]),
    ],
    ['signature/type mismatch', createPng(64, 64)],
  ])('rejects JPEG structural failure: %s', (_description, bytes) => {
    expect(() =>
      validateOrganizationLogo(file(bytes, 'logo.jpg', 'image/jpeg')),
    ).toThrow();
  });
});

function file(
  buffer: Buffer,
  originalname = 'logo.png',
  mimetype = 'image/png',
) {
  return {
    buffer,
    size: buffer.byteLength,
    originalname,
    mimetype,
  } as Express.Multer.File;
}

function createPng(width: number, height: number, animated = false) {
  const ihdr = pngHeader(width, height);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return pngWithChunks([
    chunk('IHDR', ihdr),
    ...(animated ? [chunk('acTL', Buffer.from([0, 0, 0, 1, 0, 0, 0, 0]))] : []),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createPngAtSize(width: number, height: number, byteSize: number) {
  const base = createPng(width, height);
  const paddingLength = byteSize - base.length - 12;
  if (paddingLength < 0) throw new Error('Requested PNG size is too small');
  const ihdrEnd = 8 + 12 + 13;
  return Buffer.concat([
    base.subarray(0, ihdrEnd),
    chunk('vpAg', Buffer.alloc(paddingLength)),
    base.subarray(ihdrEnd),
  ]);
}

function pngHeader(width: number, height: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return ihdr;
}

function pngWithChunks(chunks: Buffer[]) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...chunks,
  ]);
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function mutate(bytes: Buffer, mutation: (copy: Buffer) => void) {
  const copy = Buffer.from(bytes);
  mutation(copy);
  return copy;
}

function withoutLastChunk(bytes: Buffer) {
  return bytes.subarray(0, -12);
}

function replaceLastChunk(bytes: Buffer, replacement: Buffer) {
  return Buffer.concat([withoutLastChunk(bytes), replacement]);
}

function truncateAfterFrame(bytes: Buffer) {
  const frame = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  const frameLength = bytes.readUInt16BE(frame + 2);
  return bytes.subarray(0, frame + 2 + frameLength);
}

function minimalJpeg(width: number, height: number) {
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
    'base64',
  );
  const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
  jpeg.writeUInt16BE(height, sof + 5);
  jpeg.writeUInt16BE(width, sof + 7);
  return jpeg;
}
