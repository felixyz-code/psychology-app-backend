import { Injectable, NotFoundException } from '@nestjs/common';
import { BenefitDebitStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CorporateBillingStatementQueryDto,
  CorporateReportQueryDto,
} from '../dto/corporate-report-query.dto';

const K_ANONYMITY_THRESHOLD = 5;
const UTF8_BOM = '\uFEFF';

export interface DepartmentDistributionItem {
  department: string;
  employeeCount: number;
  sessionsConsumed: number;
  percentageOfTotalSessions: number;
  isAggregated: boolean;
}

export interface ExecutiveKpis {
  totalSessionsContracted: number;
  totalSessionsConsumed: number;
  totalSessionsReserved: number;
  totalSessionsAvailable: number;
  burnRatePercentage: number;
  uniqueEmployeesEntitled: number;
  uniqueEmployeesAttended: number;
  coveragePercentage: number;
}

export interface PoolBreakdownItem {
  poolId: string;
  name: string;
  totalSessions: number;
  consumedSessions: number;
  reservedSessions: number;
  availableSessions: number;
  utilizationPercentage: number;
  status: string;
  validFrom: Date;
  validUntil: Date;
}

export interface ExecutiveReportResponse {
  agreement: {
    id: string;
    code: string;
    title: string;
    status: string;
    corporateClient: {
      id: string;
      name: string;
      commercialName: string | null;
    };
  };
  kpis: ExecutiveKpis;
  poolBreakdown: PoolBreakdownItem[];
  departmentDistribution: DepartmentDistributionItem[];
  periodSummary: {
    startDate: string | null;
    endDate: string | null;
    branchId: string | null;
    totalConfirmedInPeriod: number;
  };
  privacyNotice: string;
}

export interface BillingStatementResponse {
  statementNumber: string;
  generatedAt: string;
  agreement: {
    id: string;
    code: string;
    title: string;
    corporateClient: {
      id: string;
      name: string;
      taxId: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
    };
  };
  billingPeriod: {
    startDate: string;
    endDate: string;
  };
  unitPrice: number;
  currency: string;
  summary: {
    billableSessionsCount: number;
    subtotal: number;
    ivaTaxRate: number;
    ivaAmount: number;
    totalAmount: number;
  };
  poolReconciliation: Array<{
    poolId: string;
    poolName: string;
    periodConfirmedSessions: number;
    poolTotalSessions: number;
    poolConsumedTotal: number;
  }>;
  debitItems: Array<{
    debitId: string;
    timestamp: Date;
    sessionQuantity: number;
    branchId: string | null;
    branchName: string | null;
    status: BenefitDebitStatus;
  }>;
  privacyNotice: string;
}

@Injectable()
export class CorporateReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compiles executive-level PAEF KPIs and anonymous departmental distribution
   * adhering strictly to the Zero ePHI Leakage and k-anonymity (k >= 5) standard.
   */
  async getExecutiveReport(
    organizationId: string,
    agreementId: string,
    query: CorporateReportQueryDto,
  ): Promise<ExecutiveReportResponse> {
    const agreement = await this.prisma.paefAgreement.findFirst({
      where: { id: agreementId, organizationId },
      include: {
        corporateClient: {
          select: {
            id: true,
            name: true,
            commercialName: true,
          },
        },
        benefitPools: true,
      },
    });

    if (!agreement) {
      throw new NotFoundException(
        'PAEF agreement not found in this organization',
      );
    }

    // 1. Calculate pool totals and KPIs
    let totalSessionsContracted = 0;
    let totalSessionsConsumed = 0;
    let totalSessionsReserved = 0;

    const poolBreakdown: PoolBreakdownItem[] = agreement.benefitPools.map(
      (pool) => {
        totalSessionsContracted += pool.totalSessions;
        totalSessionsConsumed += pool.consumedSessions;
        totalSessionsReserved += pool.reservedSessions;

        const available = Math.max(
          0,
          pool.totalSessions - (pool.consumedSessions + pool.reservedSessions),
        );
        const utilization =
          pool.totalSessions > 0
            ? Number(
                ((pool.consumedSessions / pool.totalSessions) * 100).toFixed(1),
              )
            : 0;

        return {
          poolId: pool.id,
          name: pool.name,
          totalSessions: pool.totalSessions,
          consumedSessions: pool.consumedSessions,
          reservedSessions: pool.reservedSessions,
          availableSessions: available,
          utilizationPercentage: utilization,
          status: pool.status,
          validFrom: pool.validFrom,
          validUntil: pool.validUntil,
        };
      },
    );

    const totalSessionsAvailable = Math.max(
      0,
      totalSessionsContracted - (totalSessionsConsumed + totalSessionsReserved),
    );
    const burnRatePercentage =
      totalSessionsContracted > 0
        ? Number(
            ((totalSessionsConsumed / totalSessionsContracted) * 100).toFixed(
              1,
            ),
          )
        : 0;

    // 2. Fetch employee eligibility demographics (Department only, strictly anonymized)
    const eligibilities = await this.prisma.employeeEligibility.findMany({
      where: { agreementId, organizationId },
      select: {
        department: true,
        consumedSessions: true,
      },
    });

    const uniqueEmployeesEntitled = eligibilities.length;
    const uniqueEmployeesAttended = eligibilities.filter(
      (e) => e.consumedSessions > 0,
    ).length;
    const coveragePercentage =
      uniqueEmployeesEntitled > 0
        ? Number(
            ((uniqueEmployeesAttended / uniqueEmployeesEntitled) * 100).toFixed(
              1,
            ),
          )
        : 0;

    // 3. Apply k-Anonymity (k >= 5) on department distribution
    const deptMap = new Map<
      string,
      { employeeCount: number; sessionsConsumed: number }
    >();

    for (const item of eligibilities) {
      const deptKey = item.department ? item.department.trim() : '';
      const current = deptMap.get(deptKey) || {
        employeeCount: 0,
        sessionsConsumed: 0,
      };
      current.employeeCount += 1;
      current.sessionsConsumed += item.consumedSessions;
      deptMap.set(deptKey, current);
    }

    const departmentDistribution: DepartmentDistributionItem[] = [];
    let aggregatedCount = 0;
    let aggregatedSessions = 0;

    for (const [dept, data] of deptMap.entries()) {
      if (!dept || data.employeeCount < K_ANONYMITY_THRESHOLD) {
        aggregatedCount += data.employeeCount;
        aggregatedSessions += data.sessionsConsumed;
      } else {
        const pct =
          totalSessionsConsumed > 0
            ? Number(
                ((data.sessionsConsumed / totalSessionsConsumed) * 100).toFixed(
                  1,
                ),
              )
            : 0;

        departmentDistribution.push({
          department: dept,
          employeeCount: data.employeeCount,
          sessionsConsumed: data.sessionsConsumed,
          percentageOfTotalSessions: pct,
          isAggregated: false,
        });
      }
    }

    if (aggregatedCount > 0) {
      const aggPct =
        totalSessionsConsumed > 0
          ? Number(
              ((aggregatedSessions / totalSessionsConsumed) * 100).toFixed(1),
            )
          : 0;

      departmentDistribution.push({
        department: 'Otros / Departamentos Agrupados (k < 5)',
        employeeCount: aggregatedCount,
        sessionsConsumed: aggregatedSessions,
        percentageOfTotalSessions: aggPct,
        isAggregated: true,
      });
    }

    // Sort departments by sessions consumed descending
    departmentDistribution.sort(
      (a, b) => b.sessionsConsumed - a.sessionsConsumed,
    );

    // 4. Period specific debits count (Zero ePHI: only counts / dates)
    const debitWhere: Prisma.BenefitDebitLogWhereInput = {
      agreementId,
      organizationId,
      status: BenefitDebitStatus.CONFIRMED,
    };

    if (query.branchId) {
      debitWhere.branchId = query.branchId;
    }

    if (query.startDate || query.endDate) {
      debitWhere.createdAt = {};
      if (query.startDate) {
        debitWhere.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        debitWhere.createdAt.lte = new Date(query.endDate);
      }
    }

    const totalConfirmedInPeriod = await this.prisma.benefitDebitLog.count({
      where: debitWhere,
    });

    return {
      agreement: {
        id: agreement.id,
        code: agreement.code,
        title: agreement.title,
        status: agreement.status,
        corporateClient: {
          id: agreement.corporateClient.id,
          name: agreement.corporateClient.name,
          commercialName: agreement.corporateClient.commercialName,
        },
      },
      kpis: {
        totalSessionsContracted,
        totalSessionsConsumed,
        totalSessionsReserved,
        totalSessionsAvailable,
        burnRatePercentage,
        uniqueEmployeesEntitled,
        uniqueEmployeesAttended,
        coveragePercentage,
      },
      poolBreakdown,
      departmentDistribution,
      periodSummary: {
        startDate: query.startDate ?? null,
        endDate: query.endDate ?? null,
        branchId: query.branchId ?? null,
        totalConfirmedInPeriod,
      },
      privacyNotice:
        'Zero ePHI Guarantee: Report strictly aggregated under NOM-004-SSA3-2012 / HIPAA privacy rules. No individual patient identities, diagnoses or clinical notes are accessible or exposed.',
    };
  }

  /**
   * Generates a detailed monthly billing reconciliation statement for corporate B2B invoicing.
   * Discloses confirmed sessions, monetary subtotal/taxes, and anonymized debit audit logs.
   */
  async getBillingStatement(
    organizationId: string,
    agreementId: string,
    query: CorporateBillingStatementQueryDto,
  ): Promise<BillingStatementResponse> {
    const agreement = await this.prisma.paefAgreement.findFirst({
      where: { id: agreementId, organizationId },
      include: {
        corporateClient: {
          select: {
            id: true,
            name: true,
            taxId: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
        benefitPools: true,
      },
    });

    if (!agreement) {
      throw new NotFoundException(
        'PAEF agreement not found in this organization',
      );
    }

    // Default period: current month if not explicitly specified
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const startDate = query.startDate
      ? new Date(query.startDate)
      : defaultStart;
    const endDate = query.endDate ? new Date(query.endDate) : defaultEnd;

    // Fetch CONFIRMED debit logs in period (Zero ePHI: select ONLY opaque ledger attributes)
    const debitLogs = await this.prisma.benefitDebitLog.findMany({
      where: {
        agreementId,
        organizationId,
        status: BenefitDebitStatus.CONFIRMED,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      select: {
        id: true,
        poolId: true,
        createdAt: true,
        sessionQuantity: true,
        branchId: true,
        status: true,
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const billableSessionsCount = debitLogs.reduce(
      (sum, item) => sum + item.sessionQuantity,
      0,
    );
    const unitPrice = query.unitPrice ?? 500;
    const subtotal = Number((billableSessionsCount * unitPrice).toFixed(2));
    const ivaTaxRate = 0.16;
    const ivaAmount = Number((subtotal * ivaTaxRate).toFixed(2));
    const totalAmount = Number((subtotal + ivaAmount).toFixed(2));

    // Pool reconciliation
    const poolReconciliation = agreement.benefitPools.map((pool) => {
      const periodConfirmed = debitLogs
        .filter((d) => d.poolId === pool.id)
        .reduce((sum, d) => sum + d.sessionQuantity, 0);

      return {
        poolId: pool.id,
        poolName: pool.name,
        periodConfirmedSessions: periodConfirmed,
        poolTotalSessions: pool.totalSessions,
        poolConsumedTotal: pool.consumedSessions,
      };
    });

    const debitItems = debitLogs.map((d) => ({
      debitId: d.id,
      timestamp: d.createdAt,
      sessionQuantity: d.sessionQuantity,
      branchId: d.branchId,
      branchName: d.branch?.name ?? 'Sede Central / Virtual',
      status: d.status,
    }));

    const timestampCode = Date.now().toString(36).toUpperCase();
    const statementNumber = `PAEF-BILL-${agreement.code}-${timestampCode}`;

    return {
      statementNumber,
      generatedAt: new Date().toISOString(),
      agreement: {
        id: agreement.id,
        code: agreement.code,
        title: agreement.title,
        corporateClient: {
          id: agreement.corporateClient.id,
          name: agreement.corporateClient.name,
          taxId: agreement.corporateClient.taxId,
          contactEmail: agreement.corporateClient.contactEmail,
          contactPhone: agreement.corporateClient.contactPhone,
        },
      },
      billingPeriod: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      unitPrice,
      currency: 'MXN',
      summary: {
        billableSessionsCount,
        subtotal,
        ivaTaxRate,
        ivaAmount,
        totalAmount,
      },
      poolReconciliation,
      debitItems,
      privacyNotice:
        'Zero ePHI Guarantee: Folios are opaque audit references. In compliance with medical confidentiality laws (NOM-004-SSA3-2012 / HIPAA), individual patient details are strictly omitted.',
    };
  }

  /**
   * Generates a structured CSV export with UTF-8 BOM encoding for direct import
   * into Microsoft Excel / corporate billing systems.
   */
  async exportBillingCsv(
    organizationId: string,
    agreementId: string,
    query: CorporateBillingStatementQueryDto,
  ): Promise<string> {
    const statement = await this.getBillingStatement(
      organizationId,
      agreementId,
      query,
    );

    const lines: string[] = [];

    // Header section
    lines.push(`"ESTADO DE CUENTA Y FACTURACION PAEF"`);
    lines.push(`"Folio Liquidacion:","${statement.statementNumber}"`);
    lines.push(`"Fecha Generacion:","${statement.generatedAt}"`);
    lines.push(
      `"Convenio:","${statement.agreement.title} (${statement.agreement.code})"`,
    );
    lines.push(
      `"Cliente Corporativo:","${statement.agreement.corporateClient.name}"`,
    );
    lines.push(
      `"RFC:","${statement.agreement.corporateClient.taxId || 'N/A'}"`,
    );
    lines.push(
      `"Periodo de Facturacion:","${statement.billingPeriod.startDate.substring(0, 10)} al ${statement.billingPeriod.endDate.substring(0, 10)}"`,
    );
    lines.push(`"Moneda:","${statement.currency}"`);
    lines.push('');

    // Financial summary section
    lines.push(`"RESUMEN FINANCIERO"`);
    lines.push(
      `"Sesiones Facturables","Tarifa Unitaria","Subtotal","IVA (16%)","Total a Pagar"`,
    );
    lines.push(
      `"${statement.summary.billableSessionsCount}","${statement.unitPrice.toFixed(2)}","${statement.summary.subtotal.toFixed(2)}","${statement.summary.ivaAmount.toFixed(2)}","${statement.summary.totalAmount.toFixed(2)}"`,
    );
    lines.push('');

    // Pool reconciliation section
    lines.push(`"CONCILIACION POR BOLSA DE BENEFICIOS"`);
    lines.push(
      `"Bolsa","Sesiones Periodo","Capacidad Total Bolsa","Consumo Historico Bolsa"`,
    );
    for (const pool of statement.poolReconciliation) {
      lines.push(
        `"${pool.poolName}","${pool.periodConfirmedSessions}","${pool.poolTotalSessions}","${pool.poolConsumedTotal}"`,
      );
    }
    lines.push('');

    // Reconciled debit ledger section
    lines.push(`"REGISTRO CONCILIADO DE DEBITOS (ANONIMIZADO - ZERO ePHI)"`);
    lines.push(
      `"Folio Transaccion","Fecha / Hora","Sede","Cantidad Sesiones","Estado"`,
    );
    for (const item of statement.debitItems) {
      const formattedDate = new Date(item.timestamp)
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);
      lines.push(
        `"${item.debitId}","${formattedDate}","${item.branchName || 'Central'}","${item.sessionQuantity}","${item.status}"`,
      );
    }
    lines.push('');
    lines.push(`"${statement.privacyNotice}"`);

    return UTF8_BOM + lines.join('\r\n');
  }
}
