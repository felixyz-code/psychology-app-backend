import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

type ReflectorMock = {
  getAllAndOverride: jest.Mock;
};

function createContext(): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

function handler() {}
class TestController {}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: ReflectorMock;
  let passportCanActivate: jest.SpyInstance;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new JwtAuthGuard(reflector as unknown as Reflector);
    passportCanActivate = jest.spyOn(
      Object.getPrototypeOf(JwtAuthGuard.prototype),
      'canActivate',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows a public handler without delegating to Passport', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(createContext())).toBe(true);
    expect(passportCanActivate).not.toHaveBeenCalled();
  });

  it('delegates an unmarked route to Passport authentication', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    passportCanActivate.mockReturnValue(true);
    const context = createContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(passportCanActivate).toHaveBeenCalledWith(context);
  });

  it('checks handler metadata before controller metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    passportCanActivate.mockReturnValue(true);

    void guard.canActivate(createContext());

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
      handler,
      TestController,
    ]);
  });
});
