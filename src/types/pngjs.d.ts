declare module 'pngjs' {
  type PngReadOptions = {
    checkCRC?: boolean;
  };

  type DecodedPng = {
    width: number;
    height: number;
    data: Buffer;
  };

  export const PNG: {
    sync: {
      read(bytes: Buffer, options?: PngReadOptions): DecodedPng;
    };
  };
}
