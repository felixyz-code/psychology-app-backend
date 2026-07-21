import { MembershipRole, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { TENANT_REQUIRED_KEY } from '../tenant-context/tenant-context.constants';
import { TenantContext } from '../tenant-context/tenant-context.types';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

const user: AuthenticatedUser = {
  id: 'psychologist-a-id',
  name: 'Psychologist A',
  email: 'psychologist-a@example.test',
  role: UserRole.ADMIN,
};
const tenant: TenantContext = {
  userId: user.id,
  organizationId: 'organization-a-id',
  membershipId: 'membership-a-id',
  organizationRole: MembershipRole.PSYCHOLOGIST,
  legacyUserRole: user.role,
  resolutionMode: TenantResolutionMode.EXPLICIT,
};
const expectedScope = {
  organizationId: tenant.organizationId,
  psychologistId: user.id,
};

describe('PatientsController tenant-aware scope', () => {
  let controller: PatientsController;
  let service: Pick<
    PatientsService,
    'create' | 'findAll' | 'findOne' | 'update' | 'remove'
  >;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new PatientsController(service as PatientsService);
  });

  it('marks the complete controller as tenant-required', () => {
    expect(Reflect.getMetadata(TENANT_REQUIRED_KEY, PatientsController)).toBe(
      true,
    );
  });

  it('passes the resolved tenant and authenticated user as scope to every service operation', async () => {
    const createDto: CreatePatientDto = {
      firstName: 'Ana',
      lastName: 'Patient',
    };
    const updateDto: UpdatePatientDto = { firstName: 'Updated' };

    await controller.create(createDto, user, tenant);
    await controller.findAll(user, tenant);
    await controller.findOne('patient-id', user, tenant);
    await controller.update('patient-id', updateDto, user, tenant);
    await controller.remove('patient-id', user, tenant);

    expect(service.create).toHaveBeenCalledWith(createDto, expectedScope);
    expect(service.findAll).toHaveBeenCalledWith(expectedScope);
    expect(service.findOne).toHaveBeenCalledWith('patient-id', expectedScope);
    expect(service.update).toHaveBeenCalledWith(
      'patient-id',
      updateDto,
      expectedScope,
    );
    expect(service.remove).toHaveBeenCalledWith('patient-id', expectedScope);
  });

  it('does not expose ownership fields in either public patient DTO', () => {
    expect(Object.hasOwn(CreatePatientDto.prototype, 'organizationId')).toBe(
      false,
    );
    expect(Object.hasOwn(CreatePatientDto.prototype, 'psychologistId')).toBe(
      false,
    );
    expect(Object.hasOwn(UpdatePatientDto.prototype, 'organizationId')).toBe(
      false,
    );
    expect(Object.hasOwn(UpdatePatientDto.prototype, 'psychologistId')).toBe(
      false,
    );
  });
});
