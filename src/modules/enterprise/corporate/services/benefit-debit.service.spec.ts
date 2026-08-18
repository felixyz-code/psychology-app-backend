import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BenefitDebitStatus,
  BenefitPoolStatus,
  EmployeeEligibilityStatus,
  PaefAgreementStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { BenefitDebitService } from './benefit-debit.service';

describe('BenefitDebitService', () => {
  let service: BenefitDebitService;
  let prisma: any;
  let txMock: any;

  const mockOrgId = 'org-1111-uuid';
  const mockAgreementId = 'agreement-1111-uuid';
  const mockPoolId = 'pool-1111-uuid';
  const mockEligibilityId = 'eligibility-1111-uuid';
  const mockDebitLogId = 'debit-1111-uuid';

  beforeEach(async () => {
    txMock = {
      paefAgreement: {
        findFirst: jest.fn(),
      },
      benefitPool: {
        update: jest.fn(),
      },
      employeeEligibility: {
        update: jest.fn(),
      },
      benefitDebitLog: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    prisma = {
      $transaction: jest.fn(async (cb) => cb(txMock)),
      benefitDebitLog: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenefitDebitService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BenefitDebitService>(BenefitDebitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reserveBenefitSession', () => {
    const validReserveDto = {
      agreementId: mockAgreementId,
      poolId: mockPoolId,
      eligibilityId: mockEligibilityId,
      sessionQuantity: 1,
      reason: 'Standard Booking',
    };

    const mockActiveAgreement = {
      id: mockAgreementId,
      status: PaefAgreementStatus.ACTIVE,
      isMultiBranch: true,
      validFrom: new Date('2020-01-01'),
      validUntil: new Date('2030-12-31'),
    };

    const mockPoolRow = {
      id: mockPoolId,
      total_sessions: 100,
      consumed_sessions: 10,
      reserved_sessions: 5,
      status: BenefitPoolStatus.ACTIVE,
      valid_from: new Date('2020-01-01'),
      valid_until: new Date('2030-12-31'),
    };

    const mockEligibilityRow = {
      id: mockEligibilityId,
      max_sessions_allowed: 5,
      consumed_sessions: 1,
      reserved_sessions: 0,
      status: EmployeeEligibilityStatus.ACTIVE,
    };

    it('should reserve session successfully with atomic lock', async () => {
      txMock.paefAgreement.findFirst.mockResolvedValue(mockActiveAgreement);
      txMock.$queryRaw
        .mockResolvedValueOnce([mockPoolRow]) // Lock Pool
        .mockResolvedValueOnce([mockEligibilityRow]); // Lock Eligibility

      txMock.benefitPool.update.mockResolvedValue({ id: mockPoolId });
      txMock.employeeEligibility.update.mockResolvedValue({
        id: mockEligibilityId,
      });
      txMock.benefitDebitLog.create.mockResolvedValue({
        id: mockDebitLogId,
        status: BenefitDebitStatus.RESERVED,
        sessionQuantity: 1,
      });

      const result = await service.reserveBenefitSession(
        mockOrgId,
        validReserveDto,
        'user-uuid',
      );

      expect(result.debitLog.id).toBe(mockDebitLogId);
      expect(result.poolUpdated.reservedSessions).toBe(6);
      expect(result.eligibilityUpdated.reservedSessions).toBe(1);
      expect(txMock.benefitPool.update).toHaveBeenCalledWith({
        where: { id: mockPoolId },
        data: { reservedSessions: { increment: 1 } },
      });
    });

    it('should throw ConflictException when pool has insufficient sessions', async () => {
      txMock.paefAgreement.findFirst.mockResolvedValue(mockActiveAgreement);
      txMock.$queryRaw.mockResolvedValueOnce([
        {
          ...mockPoolRow,
          total_sessions: 10,
          consumed_sessions: 8,
          reserved_sessions: 2, // 10 total - 10 used = 0 available
        },
      ]);

      await expect(
        service.reserveBenefitSession(mockOrgId, validReserveDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when employee quota is exceeded', async () => {
      txMock.paefAgreement.findFirst.mockResolvedValue(mockActiveAgreement);
      txMock.$queryRaw
        .mockResolvedValueOnce([mockPoolRow])
        .mockResolvedValueOnce([
          {
            ...mockEligibilityRow,
            max_sessions_allowed: 5,
            consumed_sessions: 4,
            reserved_sessions: 1, // 5 total - 5 used = 0 remaining
          },
        ]);

      await expect(
        service.reserveBenefitSession(mockOrgId, validReserveDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('confirmBenefitSession', () => {
    it('should confirm RESERVED debit log and decrement reserved, increment consumed', async () => {
      txMock.benefitDebitLog.findFirst.mockResolvedValue({
        id: mockDebitLogId,
        poolId: mockPoolId,
        eligibilityId: mockEligibilityId,
        sessionQuantity: 1,
        status: BenefitDebitStatus.RESERVED,
        metadata: {},
      });
      txMock.$queryRaw.mockResolvedValue([{ id: 'locked' }]);
      txMock.benefitPool.update.mockResolvedValue({ id: mockPoolId });
      txMock.employeeEligibility.update.mockResolvedValue({
        id: mockEligibilityId,
      });
      txMock.benefitDebitLog.update.mockResolvedValue({
        id: mockDebitLogId,
        status: BenefitDebitStatus.CONFIRMED,
      });

      const result = await service.confirmBenefitSession(
        mockOrgId,
        mockDebitLogId,
        { reason: 'Attended' },
      );

      expect(result.status).toBe(BenefitDebitStatus.CONFIRMED);
      expect(txMock.benefitPool.update).toHaveBeenCalledWith({
        where: { id: mockPoolId },
        data: {
          reservedSessions: { decrement: 1 },
          consumedSessions: { increment: 1 },
        },
      });
    });

    it('should reject confirming non-RESERVED log', async () => {
      txMock.benefitDebitLog.findFirst.mockResolvedValue({
        id: mockDebitLogId,
        status: BenefitDebitStatus.CONFIRMED,
      });

      await expect(
        service.confirmBenefitSession(mockOrgId, mockDebitLogId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('releaseOrRefundBenefitSession', () => {
    it('should release RESERVED session back to pool', async () => {
      txMock.benefitDebitLog.findFirst.mockResolvedValue({
        id: mockDebitLogId,
        poolId: mockPoolId,
        eligibilityId: mockEligibilityId,
        sessionQuantity: 1,
        status: BenefitDebitStatus.RESERVED,
        metadata: {},
      });
      txMock.$queryRaw.mockResolvedValue([{ id: 'locked' }]);
      txMock.benefitPool.update.mockResolvedValue({ id: mockPoolId });
      txMock.employeeEligibility.update.mockResolvedValue({
        id: mockEligibilityId,
      });
      txMock.benefitDebitLog.update.mockResolvedValue({
        id: mockDebitLogId,
        status: BenefitDebitStatus.RELEASED,
      });

      const result = await service.releaseOrRefundBenefitSession(
        mockOrgId,
        mockDebitLogId,
        { reason: 'Cancelled appointment' },
      );

      expect(result.status).toBe(BenefitDebitStatus.RELEASED);
      expect(txMock.benefitPool.update).toHaveBeenCalledWith({
        where: { id: mockPoolId },
        data: { reservedSessions: { decrement: 1 } },
      });
    });

    it('should refund CONFIRMED session back to pool', async () => {
      txMock.benefitDebitLog.findFirst.mockResolvedValue({
        id: mockDebitLogId,
        poolId: mockPoolId,
        eligibilityId: mockEligibilityId,
        sessionQuantity: 1,
        status: BenefitDebitStatus.CONFIRMED,
        metadata: {},
      });
      txMock.$queryRaw.mockResolvedValue([{ id: 'locked' }]);
      txMock.benefitPool.update.mockResolvedValue({ id: mockPoolId });
      txMock.employeeEligibility.update.mockResolvedValue({
        id: mockEligibilityId,
      });
      txMock.benefitDebitLog.update.mockResolvedValue({
        id: mockDebitLogId,
        status: BenefitDebitStatus.REFUNDED,
      });

      const result = await service.releaseOrRefundBenefitSession(
        mockOrgId,
        mockDebitLogId,
        { reason: 'Clinical cancellation credit' },
      );

      expect(result.status).toBe(BenefitDebitStatus.REFUNDED);
      expect(txMock.benefitPool.update).toHaveBeenCalledWith({
        where: { id: mockPoolId },
        data: { consumedSessions: { decrement: 1 } },
      });
    });
  });
});
