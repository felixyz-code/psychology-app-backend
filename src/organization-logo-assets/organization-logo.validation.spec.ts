import { deflateSync } from 'node:zlib';
import { validateOrganizationLogo } from './organization-logo.validation';

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

  it.each([
    ['logo.jpg', 'image/jpeg', createPng(64, 64)],
    ['logo.png', 'image/png', minimalJpeg(64, 64)],
    ['logo.png', 'image/jpeg', createPng(64, 64)],
    ['logo.svg', 'image/png', createPng(64, 64)],
    ['logo.gif', 'image/gif', Buffer.from('GIF89a')],
    ['logo.webp', 'image/webp', Buffer.from('RIFFxxxxWEBP')],
    ['logo.png', 'image/png', Buffer.from('not an image')],
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
        file(Buffer.alloc(1024 * 1024 + 1), 'logo.png', 'image/png'),
      ),
    ).toThrow('1 MiB');
  });

  it('accepts a file exactly at the 1 MiB byte limit', () => {
    const validPng = createPng(64, 64);
    const exactlyOneMiB = Buffer.concat([
      validPng,
      Buffer.alloc(1024 * 1024 - validPng.byteLength),
    ]);

    expect(validateOrganizationLogo(file(exactlyOneMiB))).toMatchObject({
      byteSize: 1024 * 1024,
      width: 64,
      height: 64,
    });
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
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    ...(animated ? [chunk('acTL', Buffer.from([0, 0, 0, 1, 0, 0, 0, 0]))] : []),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
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
