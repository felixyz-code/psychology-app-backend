import { InstrumentVersionStatus, PrismaClient } from '@prisma/client';

export const GAD7_SYSTEM_INSTRUMENT_ID = '00000000-0000-4000-8000-000000090003';
export const GAD7_SYSTEM_VERSION_1_ID = '00000000-0000-4000-8000-000000090004';

export const gad7DefinitionJson = {
  schemaVersion: '1.0',
  metadata: {
    title: 'Escala del Trastorno de Ansiedad Generalizada (GAD-7)',
    acronym: 'GAD-7',
    author: 'Spitzer, Kroenke, Williams & Löwe',
    language: 'es-MX',
    estimatedTimeMinutes: 3,
    administrationMode: 'SELF_ADMINISTERED',
  },
  instructions: {
    generalInstructions:
      'Durante las últimas 2 semanas, ¿con qué frecuencia le han molestado los siguientes problemas?',
    responseScaleFormat: 'SINGLE_CHOICE',
  },
  items: [
    {
      code: 'GAD7_Q1',
      sequenceNumber: 1,
      prompt: 'Sentirse nervioso/a, intranquilo/a o con los nervios de punta',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Varios días', weight: 1 },
        { value: '2', label: 'Más de la mitad de los días', weight: 2 },
        { value: '3', label: 'Casi todos los días', weight: 3 },
      ],
    },
    {
      code: 'GAD7_Q2',
      sequenceNumber: 2,
      prompt: 'No poder parar o controlar las preocupaciones',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Varios días', weight: 1 },
        { value: '2', label: 'Más de la mitad de los días', weight: 2 },
        { value: '3', label: 'Casi todos los días', weight: 3 },
      ],
    },
    {
      code: 'GAD7_Q3',
      sequenceNumber: 3,
      prompt: 'Preocuparse demasiado por diferentes cosas',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Varios días', weight: 1 },
        { value: '2', label: 'Más de la mitad de los días', weight: 2 },
        { value: '3', label: 'Casi todos los días', weight: 3 },
      ],
    },
    {
      code: 'GAD7_Q4',
      sequenceNumber: 4,
      prompt: 'Dificultad para relajarse',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Varios días', weight: 1 },
        { value: '2', label: 'Más de la mitad de los días', weight: 2 },
        { value: '3', label: 'Casi todos los días', weight: 3 },
      ],
    },
    {
      code: 'GAD7_Q5',
      sequenceNumber: 5,
      prompt:
        'Estar tan inquieto/a que le resulta difícil permanecer sentado/a',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Varios días', weight: 1 },
        { value: '2', label: 'Más de la mitad de los días', weight: 2 },
        { value: '3', label: 'Casi todos los días', weight: 3 },
      ],
    },
    {
      code: 'GAD7_Q6',
      sequenceNumber: 6,
      prompt: 'Sentirse fácilmente disgustado/a o irritable',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Varios días', weight: 1 },
        { value: '2', label: 'Más de la mitad de los días', weight: 2 },
        { value: '3', label: 'Casi todos los días', weight: 3 },
      ],
    },
    {
      code: 'GAD7_Q7',
      sequenceNumber: 7,
      prompt: 'Sentir miedo como si algo terrible fuera a pasar',
      itemType: 'SINGLE_CHOICE',
      required: true,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Varios días', weight: 1 },
        { value: '2', label: 'Más de la mitad de los días', weight: 2 },
        { value: '3', label: 'Casi todos los días', weight: 3 },
      ],
    },
  ],
};

export const gad7ScoringSpecJson = {
  schemaVersion: '1.0',
  scoringType: 'SUM',
  minScore: 0,
  maxScore: 21,
  scales: [
    {
      code: 'GLOBAL_ANXIETY',
      name: 'Puntuación Total de Severidad de Ansiedad',
      itemCodes: [
        'GAD7_Q1',
        'GAD7_Q2',
        'GAD7_Q3',
        'GAD7_Q4',
        'GAD7_Q5',
        'GAD7_Q6',
        'GAD7_Q7',
      ],
    },
  ],
  strata: [
    {
      code: 'MINIMAL_ANXIETY',
      min: 0,
      max: 4,
      severity: 'NONE',
      title: 'Ansiedad mínima',
      description:
        'Sin síntomas significativos de ansiedad o dentro del rango no clínico (0-4 puntos).',
    },
    {
      code: 'MILD_ANXIETY',
      min: 5,
      max: 9,
      severity: 'MILD',
      title: 'Ansiedad leve',
      description:
        'Presencia de síntomas leves de ansiedad; sugerido monitoreo clínico (5-9 puntos).',
    },
    {
      code: 'MODERATE_ANXIETY',
      min: 10,
      max: 14,
      severity: 'MODERATE',
      title: 'Ansiedad moderada',
      description:
        'Punto de corte clínico estándar para posible Trastorno de Ansiedad Generalizada (10-14 puntos).',
    },
    {
      code: 'SEVERE_ANXIETY',
      min: 15,
      max: 21,
      severity: 'SEVERE',
      title: 'Ansiedad severa',
      description:
        'Sintomatología severa de ansiedad que requiere confirmación diagnóstica e intervención especializada (15-21 puntos).',
    },
  ],
  clinicalAlerts: [
    {
      itemCode: 'GAD7_Q7',
      triggerCondition: 'WEIGHT_GREATER_THAN_OR_EQUAL',
      thresholdValue: 2,
      alertType: 'PANIC_SYMPTOM_RISK',
      severity: 'MODERATE',
      message:
        'ALERTA CLÍNICA: El paciente reporta temor intenso a que ocurra una catástrofe la mayor parte del tiempo (reactivo 7 >= 2).',
    },
  ],
};

export async function seedGad7StockInstrument(prisma: PrismaClient) {
  const existingInstrument = await prisma.instrument.findFirst({
    where: {
      code: 'GAD-7',
      isSystem: true,
      organizationId: null,
    },
  });

  const instrument = existingInstrument
    ? await prisma.instrument.update({
        where: { id: existingInstrument.id },
        data: {
          name: 'Escala del Trastorno de Ansiedad Generalizada (GAD-7)',
          description:
            'Instrumento estandarizado de 7 reactivos para el cribado, diagnóstico y medición de la severidad del trastorno de ansiedad generalizada según criterios DSM.',
          targetPopulation: 'Población adulta general (>= 18 años)',
        },
      })
    : await prisma.instrument.create({
        data: {
          id: GAD7_SYSTEM_INSTRUMENT_ID,
          code: 'GAD-7',
          name: 'Escala del Trastorno de Ansiedad Generalizada (GAD-7)',
          description:
            'Instrumento estandarizado de 7 reactivos para el cribado, diagnóstico y medición de la severidad del trastorno de ansiedad generalizada según criterios DSM.',
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
        definitionJson: gad7DefinitionJson,
        scoringSpecJson: gad7ScoringSpecJson,
        status: InstrumentVersionStatus.PUBLISHED,
      },
    });
  } else {
    await prisma.instrumentVersion.create({
      data: {
        id: GAD7_SYSTEM_VERSION_1_ID,
        instrumentId: instrument.id,
        versionNumber: 1,
        status: InstrumentVersionStatus.PUBLISHED,
        definitionJson: gad7DefinitionJson,
        scoringSpecJson: gad7ScoringSpecJson,
        publishedAt: new Date(),
      },
    });
  }

  return instrument;
}
