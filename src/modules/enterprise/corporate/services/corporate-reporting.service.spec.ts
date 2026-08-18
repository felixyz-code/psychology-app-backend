import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BenefitDebitStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CorporateReportingService } from './corporate-reporting.service';

describe('CorporateReportingService', () => {
  let service: CorporateReportingService;
  let prisma: any;

  const mockOrgId = 'org-1111-uuid';
  const mockAgreementId = 'agreement-1111-uuid';

  const mockAgreement = {
    id: mockAgreementId,
    organizationId: mockOrgId,
    code: 'PAEF-ACME-2026',
    title: 'Convenio ACME Corp 2026',
    status: 'ACTIVE',
    corporateClient: {
      id: 'client-1111-uuid',
      name: 'ACME Corporation S.A. de C.V.',
      commercialName: 'ACME Corp',
      taxId: 'ACM850101XYZ',
      contactEmail: 'rh@acme.com',
      contactPhone: '+52 55 1234 5678',
    },
    benefitPools: [
      {
        id: 'pool-1',
        name: 'Bolsa Anual General',
        totalSessions: 100,
        consumedSessions: 40,
        reservedSessions: 10,
        status: 'ACTIVE',
        validFrom: new Date('2026-01-01'),
        validUntil: new Date('2026-12-31'),
      },
      {
        id: 'pool-2',
        name: 'Bolsa Directiva',
        totalSessions: 20,
        consumedSessions: 10,
        reservedSessions: 0,
        status: 'ACTIVE',
        validFrom: new Date('2026-01-01'),
        validUntil: new Date('2026-12-31'),
      },
    ],
  };

  const mockEligibilities = [
    // Dept A (Engineering): 6 employees >= 5 -> Should NOT be aggregated
    { department: 'Engineering', consumedSessions: 5 },
    { department: 'Engineering', consumedSessions: 3 },
    { department: 'Engineering', consumedSessions: 2 },
    { department: 'Engineering', consumedSessions: 0 },
    { department: 'Engineering', consumedSessions: 0 },
    { department: 'Engineering', consumedSessions: 1 },

    // Dept B (HR): 2 employees < 5 -> Should BE aggregated into 'Otros / Departamentos Agrupados (k < 5)'
    { department: 'HR', consumedSessions: 4 },
    { department: 'HR', consumedSessions: 1 },

    // Dept C (Null/Empty): 1 employee -> Should BE aggregated
    { department: null, consumedSessions: 2 },
  ];

  beforeEach(async () => {
    prisma = {
      paefAgreement: {
        findFirst: jest.fn().mockResolvedValue(mockAgreement),
      },
      employeeEligibility: {
        findMany: jest.fn().mockResolvedValue(mockEligibilities),
      },
      benefitDebitLog: {
        count: jest.fn().mockResolvedValue(45),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'debit-1',
            poolId: 'pool-1',
            createdAt: new Date('2026-06-01T10:00:00Z'),
            sessionQuantity: 1,
            branchId: 'branch-1',
            status: BenefitDebitStatus.CONFIRMED,
            branch: { id: 'branch-1', name: 'Sede Roma Norte' },
          },
          {
            id: 'debit-2',
            poolId: 'pool-1',
            createdAt: new Date('2026-06-05T15:30:00Z'),
            sessionQuantity: 2,
            branchId: 'branch-2',
            status: BenefitDebitStatus.CONFIRMED,
            branch: { id: 'branch-2', name: 'Sede Del Valle' },
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorporateReportingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CorporateReportingService>(CorporateReportingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getExecutiveReport', () => {
    it('should calculate KPIs, burn-rate and apply k-anonymity (k >= 5) to departmental breakdown', async () => {
      const report = await service.getExecutiveReport(
        mockOrgId,
        mockAgreementId,
        {},
      );

      // Verify agreement details
      expect(report.agreement.id).toBe(mockAgreementId);
      expect(report.agreement.corporateClient.name).toBe(
        'ACME Corporation S.A. de C.V.',
      );

      // Total contracted: 100 + 20 = 120
      // Total consumed: 40 + 10 = 50
      // Total reserved: 10 + 0 = 10
      // Total available: 120 - (50 + 10) = 60
      expect(report.kpis.totalSessionsContracted).toBe(120);
      expect(report.kpis.totalSessionsConsumed).toBe(50);
      expect(report.kpis.totalSessionsReserved).toBe(10);
      expect(report.kpis.totalSessionsAvailable).toBe(60);
      expect(report.kpis.burnRatePercentage).toBe(41.7); // (50 / 120) * 100 = 41.666 -> 41.7%

      // Coverage: 9 employees total, 7 attended (consumedSessions > 0) -> (7 / 9) * 100 = 77.8%
      expect(report.kpis.uniqueEmployeesEntitled).toBe(9);
      expect(report.kpis.uniqueEmployeesAttended).toBe(7);
      expect(report.kpis.coveragePercentage).toBe(77.8);

      // Pool breakdown check
      expect(report.poolBreakdown.length).toBe(2);
      expect(report.poolBreakdown[0].utilizationPercentage).toBe(40);
      expect(report.poolBreakdown[1].utilizationPercentage).toBe(50);

      // Department distribution k-anonymity verification:
      // Engineering (6 employees >= 5) -> individual entry
      // HR (2 employees < 5) + null (1 employee) -> aggregated entry with 3 employees and 7 sessions
      expect(report.departmentDistribution.length).toBe(2);

      const engineeringDept = report.departmentDistribution.find(
        (d) => d.department === 'Engineering',
      );
      expect(engineeringDept).toBeDefined();
      expect(engineeringDept?.employeeCount).toBe(6);
      expect(engineeringDept?.sessionsConsumed).toBe(11);
      expect(engineeringDept?.isAggregated).toBe(false);

      const aggregatedDept = report.departmentDistribution.find(
        (d) => d.isAggregated === true,
      );
      expect(aggregatedDept).toBeDefined();
      expect(aggregatedDept?.department).toBe(
        'Otros / Departamentos Agrupados (k < 5)',
      );
      expect(aggregatedDept?.employeeCount).toBe(3); // 2 from HR + 1 from Null
      expect(aggregatedDept?.sessionsConsumed).toBe(7); // 5 from HR + 2 from Null

      // Zero ePHI notice
      expect(report.privacyNotice).toContain('Zero ePHI Guarantee');
    });

    it('should throw NotFoundException if agreement does not exist', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue(null);

      await expect(
        service.getExecutiveReport(mockOrgId, 'non-existent', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBillingStatement', () => {
    it('should reconcile confirmed sessions, subtotal, 16% IVA and sanitize debit logs', async () => {
      const statement = await service.getBillingStatement(
        mockOrgId,
        mockAgreementId,
        {
          unitPrice: 600,
          startDate: '2026-06-01T00:00:00Z',
          endDate: '2026-06-30T23:59:59Z',
        },
      );

      expect(statement.statementNumber).toContain('PAEF-BILL-PAEF-ACME-2026');
      expect(statement.unitPrice).toBe(600);
      expect(statement.currency).toBe('MXN');

      // 1 session + 2 sessions = 3 sessions total
      expect(statement.summary.billableSessionsCount).toBe(3);
      expect(statement.summary.subtotal).toBe(1800); // 3 * 600
      expect(statement.summary.ivaTaxRate).toBe(0.16);
      expect(statement.summary.ivaAmount).toBe(288); // 1800 * 0.16
      expect(statement.summary.totalAmount).toBe(2088); // 1800 + 288

      // Debit items must NOT contain patientId, appointmentId, or notes
      expect(statement.debitItems.length).toBe(2);
      expect(statement.debitItems[0].debitId).toBe('debit-1');
      expect(statement.debitItems[0].branchName).toBe('Sede Roma Norte');
      expect((statement.debitItems[0] as any).patientId).toBeUndefined();
      expect((statement.debitItems[0] as any).appointmentId).toBeUndefined();
    });
  });

  describe('exportBillingCsv', () => {
    it('should generate valid UTF-8 BOM CSV text containing financial summary and debit ledger', async () => {
      const csv = await service.exportBillingCsv(mockOrgId, mockAgreementId, {
        unitPrice: 500,
      });

      // Starts with UTF-8 BOM
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('ESTADO DE CUENTA Y FACTURACION PAEF');
      expect(csv).toContain('ACME Corporation S.A. de C.V.');
      expect(csv).toContain('ACM850101XYZ');
      expect(csv).toContain('RESUMEN FINANCIERO');
      expect(csv).toContain('CONCILIACION POR BOLSA DE BENEFICIOS');
      expect(csv).toContain(
        'REGISTRO CONCILIADO DE DEBITOS (ANONIMIZADO - ZERO ePHI)',
      );
      expect(csv).toContain('debit-1');
      expect(csv).toContain('Sede Roma Norte');
    });
  });
});
