import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

type ReflectorMock = {
  getAllAndOverride: jest.Mock;
};

function handler() {}
class TestController {}

function createContext(user?: { role?: UserRole }): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: ReflectorMock;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows an authenticated request when no roles metadata exists', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(
      guard.canActivate(createContext({ role: UserRole.PSYCHOLOGIST })),
    ).toBe(true);
  });

  it('allows a role listed in the route metadata', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.PSYCHOLOGIST]);

    expect(
      guard.canActivate(createContext({ role: UserRole.PSYCHOLOGIST })),
    ).toBe(true);
  });

  it('allows administrators under the existing unrestricted-admin contract for standard roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.PSYCHOLOGIST]);

    expect(guard.canActivate(createContext({ role: UserRole.ADMIN }))).toBe(
      true,
    );
  });

  it('strictly rejects clinic ADMIN when SUPERADMIN role is required', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SUPERADMIN]);

    expect(guard.canActivate(createContext({ role: UserRole.ADMIN }))).toBe(
      false,
    );
  });

  it('allows global SUPERADMIN for any role requirement', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SUPERADMIN]);
    expect(
      guard.canActivate(createContext({ role: UserRole.SUPERADMIN })),
    ).toBe(true);

    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    expect(
      guard.canActivate(createContext({ role: UserRole.SUPERADMIN })),
    ).toBe(true);

    reflector.getAllAndOverride.mockReturnValue([UserRole.PSYCHOLOGIST]);
    expect(
      guard.canActivate(createContext({ role: UserRole.SUPERADMIN })),
    ).toBe(true);
  });

  it('allows user with isSuperAdmin=true flag for SUPERADMIN routes', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SUPERADMIN]);

    expect(
      guard.canActivate(
        createContext({ role: UserRole.ADMIN, isSuperAdmin: true } as any),
      ),
    ).toBe(true);
  });

  it('rejects an authenticated user whose role is not allowed', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(
      guard.canActivate(createContext({ role: UserRole.PSYCHOLOGIST })),
    ).toBe(false);
  });

  it('rejects a required-role route when the user or role is absent', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(createContext())).toBe(false);
    expect(guard.canActivate(createContext({}))).toBe(false);
  });

  it('reads roles with handler precedence over controller metadata', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    guard.canActivate(createContext({ role: UserRole.ADMIN }));

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      handler,
      TestController,
    ]);
  });
});
