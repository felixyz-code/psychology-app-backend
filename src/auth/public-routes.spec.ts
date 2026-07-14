import { AppController } from '../app.controller';
import { PatientsController } from '../patients/patients.controller';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { AuthController } from './auth.controller';

function getHandlerMetadata(target: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const handler = descriptor?.value as object | undefined;

  return handler ? Reflect.getMetadata(IS_PUBLIC_KEY, handler) : undefined;
}

describe('public route metadata', () => {
  it('marks login, root, and health as public', () => {
    expect(getHandlerMetadata(AuthController.prototype, 'login')).toBe(true);
    expect(getHandlerMetadata(AppController.prototype, 'getHello')).toBe(true);
    expect(getHandlerMetadata(AppController.prototype, 'getHealth')).toBe(true);
  });

  it('does not mark a functional controller as public', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, PatientsController),
    ).toBeUndefined();
    expect(
      getHandlerMetadata(PatientsController.prototype, 'findAll'),
    ).toBeUndefined();
  });
});
