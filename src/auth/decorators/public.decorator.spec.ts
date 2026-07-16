import { IS_PUBLIC_KEY, Public } from './public.decorator';

describe('Public', () => {
  it('sets public metadata on a handler', () => {
    class TestController {
      handler() {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      'handler',
    );

    Public()(TestController.prototype, 'handler', descriptor!);

    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, descriptor!.value as object),
    ).toBe(true);
  });

  it('sets public metadata on a controller', () => {
    class TestController {}

    Public()(TestController);

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, TestController)).toBe(true);
  });
});
