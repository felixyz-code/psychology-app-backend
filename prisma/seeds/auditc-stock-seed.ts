import { InstrumentVersionStatus, PrismaClient } from '@prisma/client';

export const AUDITC_SYSTEM_INSTRUMENT_ID = '00000000-0000-4000-8000-000000090007';
export const AUDITC_SYSTEM_VERSION_1_ID = '00000000-0000-4000-8000-000000090008';

export const auditcDefinitionJson = {
  schemaVersion: '1.0',
  metadata: {
    title:
      'Cuestionario de Identificación de Trastornos por Consumo de Alcohol - Versión Breve (AUDIT-C)',
    acronym: 'AUDIT-C',
    author: 'Bush, Kivlahan, McDonnell, Fihn & Bradley (OMS)',
    language: 'es-MX',
    estimatedTimeMinutes: 2,
    administrationMode: 'SELF_ADMINISTERED',
  },
  instructions: {
    generalInstructions:
      'Por favor responda las siguientes preguntas sobre su consumo de bebidas alcohólicas durante el último año.',
    responseScaleFormat: 'SINGLE_CHOICE',
  },
  items: [
    {
      code: 'AUDITC_Q1',
      sequenceNumber: 1,
      prompt: '¿Con qué frecuencia consume alguna bebida alcohólica?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: '1 vez al mes o menos', weight: 1 },
        { value: '2', label: '2 a 4 veces al mes', weight: 2 },
        { value: '3', label: '2 a 3 veces por semana', weight: 3 },
        { value: '4', label: '4 o más veces por semana', weight: 4 },
      ],
    },
    {
      code: 'AUDITC_Q2',
      sequenceNumber: 2,
      prompt:
        '¿Cuántas consumiciones de bebidas alcohólicas suele tomar en un día normal de consumo?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: '1 o 2', weight: 0 },
        { value: '1', label: '3 o 4', weight: 1 },
        { value: '2', label: '5 o 6', weight: 2 },
        { value: '3', label: '7, 8 o 9', weight: 3 },
        { value: '4', label: '10 o más', weight: 4 },
      ],
    },
    {
      code: 'AUDITC_Q3',
      sequenceNumber: 3,
      prompt:
        '¿Con qué frecuencia toma 6 o más bebidas alcohólicas en un solo día (atracón / consumo episódico intensivo)?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Menos de una vez al mes', weight: 1 },
        { value: '2', label: 'Mensualmente', weight: 2 },
        { value: '3', label: 'Semanalmente', weight: 3 },
        { value: '4', label: 'A diario o casi a diario', weight: 4 },
      ],
    },
  ],
};

export const auditcScoringSpecJson = {
  schemaVersion: '1.0',
  scoringType: 'SUM',
  minScore: 0,
  maxScore: 12,
  scales: [
    {
      code: 'GLOBAL_ALCOHOL_RISK',
      name: 'Puntuación Total de Riesgo de Consumo de Alcohol',
      itemCodes: ['AUDITC_Q1', 'AUDITC_Q2', 'AUDITC_Q3'],
    },
  ],
  strata: [
    {
      code: 'LOW_RISK',
      min: 0,
      max: 3,
      severity: 'NONE',
      title: 'Consumo de bajo riesgo',
      description:
        'Nivel de consumo dentro de pautas de bajo riesgo o abstinencia (0-3 puntos).',
    },
    {
      code: 'RISKY_CONSUMPTION',
      min: 4,
      max: 5,
      severity: 'MILD',
      title: 'Consumo de riesgo',
      description:
        'Punto de corte clínico indicativo de consumo de riesgo (>= 4 en mujeres, >= 5 en hombres). Sugiere consejo breve y psicoeducación preventiva.',
    },
    {
      code: 'HARMFUL_CONSUMPTION',
      min: 6,
      max: 7,
      severity: 'MODERATE',
      title: 'Consumo perjudicial',
      description:
        'Consumo perjudicial de alcohol con alta probabilidad de problemas de salud o impacto psicosocial (6-7 puntos).',
    },
    {
      code: 'HIGH_RISK_DEPENDENCE',
      min: 8,
      max: 12,
      severity: 'SEVERE',
      title: 'Posible dependencia / Consumo de alto riesgo',
      description:
        'Consumo de alto riesgo con sospecha clínica de dependencia o trastorno por uso de alcohol (8-12 puntos). Requiere evaluación diagnóstica integral.',
    },
  ],
  clinicalAlerts: [
    {
      itemCode: 'AUDITC_Q3',
      triggerCondition: 'WEIGHT_GREATER_THAN_OR_EQUAL',
      thresholdValue: 3,
      alertType: 'BINGE_DRINKING_ALERT',
      severity: 'CRITICAL',
      message:
        'ALERTA CLÍNICA: Patrón de consumo por atracón (>= 6 copas) semanal o diario reportado (reactivo 3 >= 3). Riesgo agudo de intoxicación y daño a la salud.',
    },
  ],
};

export async function seedAuditcStockInstrument(prisma: PrismaClient) {
  const existingInstrument = await prisma.instrument.findFirst({
    where: {
      code: 'AUDIT-C',
      isSystem: true,
      organizationId: null,
    },
  });

  const instrument = existingInstrument
    ? await prisma.instrument.update({
        where: { id: existingInstrument.id },
        data: {
          name: 'Cuestionario de Identificación de Trastornos por Consumo de Alcohol - Versión Breve (AUDIT-C)',
          description:
            'Instrumento de tamizaje clínico validado por la OMS de 3 reactivos para identificar consumo de alcohol de riesgo, perjudicial o dependencia.',
          targetPopulation: 'Población adulta general (>= 18 años)',
        },
      })
    : await prisma.instrument.create({
        data: {
          id: AUDITC_SYSTEM_INSTRUMENT_ID,
          code: 'AUDIT-C',
          name: 'Cuestionario de Identificación de Trastornos por Consumo de Alcohol - Versión Breve (AUDIT-C)',
          description:
            'Instrumento de tamizaje clínico validado por la OMS de 3 reactivos para identificar consumo de alcohol de riesgo, perjudicial o dependencia.',
          targetPopulation: 'Población adulta general (>= 18 años)',
          isSystem: true,
          organizationId: null,
        },
      });

  const existingVersion = await prisma.instrumentVersion.findUnique({
    where: {
      instrumentId_versionNumber: {
        instrumentId: instrument.id,
        versionNumber: 1,
      },
    },
  });

  if (existingVersion) {
    await prisma.instrumentVersion.update({
      where: { id: existingVersion.id },
      data: {
        definitionJson: auditcDefinitionJson,
        scoringSpecJson: auditcScoringSpecJson,
        status: InstrumentVersionStatus.PUBLISHED,
      },
    });
  } else {
    await prisma.instrumentVersion.create({
      data: {
        id: AUDITC_SYSTEM_VERSION_1_ID,
        instrumentId: instrument.id,
        versionNumber: 1,
        status: InstrumentVersionStatus.PUBLISHED,
        definitionJson: auditcDefinitionJson,
        scoringSpecJson: auditcScoringSpecJson,
        publishedAt: new Date(),
      },
    });
  }

  return instrument;
}
