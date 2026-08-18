import { InstrumentVersionStatus, PrismaClient } from '@prisma/client';

export const PHQ9_SYSTEM_INSTRUMENT_ID = '00000000-0000-4000-8000-000000090001';
export const PHQ9_SYSTEM_VERSION_1_ID = '00000000-0000-4000-8000-000000090002';

export const phq9DefinitionJson = {
  schemaVersion: '1.0',
  metadata: {
    title: 'Cuestionario de Salud del Paciente (PHQ-9)',
    acronym: 'PHQ-9',
    author: 'Kroenke, Spitzer & Williams',
    language: 'es-MX',
    estimatedTimeMinutes: 5,
    administrationMode: 'SELF_ADMINISTERED',
  },
  instructions: {
    generalInstructions:
      'Durante las últimas 2 semanas, ¿con qué frecuencia le han molestado los siguientes problemas?',
    responseScaleFormat: 'SINGLE_CHOICE',
  },
  items: [
    {
      code: 'PHQ9_Q1',
      sequenceNumber: 1,
      prompt: 'Tener poco interés o placer en hacer las cosas',
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
      code: 'PHQ9_Q2',
      sequenceNumber: 2,
      prompt: 'Sentirse desanimado/a, deprimido/a o sin esperanzas',
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
      code: 'PHQ9_Q3',
      sequenceNumber: 3,
      prompt:
        'Tener problemas para dormirse o mantener el sueño, o dormir demasiado',
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
      code: 'PHQ9_Q4',
      sequenceNumber: 4,
      prompt: 'Sentirse cansado/a o tener poca energía',
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
      code: 'PHQ9_Q5',
      sequenceNumber: 5,
      prompt: 'Tener poco apetito o comer en exceso',
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
      code: 'PHQ9_Q6',
      sequenceNumber: 6,
      prompt:
        'Sentirse mal consigo mismo/a, o sentir que es un/a fracasado/a o que se ha decepcionado a sí mismo/a o a su familia',
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
      code: 'PHQ9_Q7',
      sequenceNumber: 7,
      prompt:
        'Tener dificultad para concentrarse en cosas tales como leer el periódico o ver la televisión',
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
      code: 'PHQ9_Q8',
      sequenceNumber: 8,
      prompt:
        'Moverse o hablar tan lentamente que otras personas podrían haberlo notado; o bien, lo contrario: estar tan inquieto/a o agitado/a que se ha estado moviendo mucho más de lo normal',
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
      code: 'PHQ9_Q9',
      sequenceNumber: 9,
      prompt:
        'Pensamientos de que estaría mejor muerto/a o de desear hacerse daño de alguna manera',
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

export const phq9ScoringSpecJson = {
  schemaVersion: '1.0',
  scoringType: 'SUM',
  minScore: 0,
  maxScore: 27,
  scales: [
    {
      code: 'GLOBAL_DEPRESSION',
      name: 'Puntuación Total de Severidad Depresiva',
      itemCodes: [
        'PHQ9_Q1',
        'PHQ9_Q2',
        'PHQ9_Q3',
        'PHQ9_Q4',
        'PHQ9_Q5',
        'PHQ9_Q6',
        'PHQ9_Q7',
        'PHQ9_Q8',
        'PHQ9_Q9',
      ],
    },
  ],
  strata: [
    {
      code: 'MINIMAL_OR_NONE',
      min: 0,
      max: 4,
      severity: 'NONE',
      title: 'Depresión mínima o nula',
      description: 'Sin síntomas depresivos significativos (0-4 puntos).',
    },
    {
      code: 'MILD',
      min: 5,
      max: 9,
      severity: 'MILD',
      title: 'Depresión leve',
      description: 'Presencia de síntomas depresivos leves (5-9 puntos).',
    },
    {
      code: 'MODERATE',
      min: 10,
      max: 14,
      severity: 'MODERATE',
      title: 'Depresión moderada',
      description:
        'Síntomas depresivos de intensidad moderada (10-14 puntos).',
    },
    {
      code: 'MODERATELY_SEVERE',
      min: 15,
      max: 19,
      severity: 'MODERATELY_SEVERE',
      title: 'Depresión moderadamente grave',
      description: 'Síntomas depresivos acentuados (15-19 puntos).',
    },
    {
      code: 'SEVERE',
      min: 20,
      max: 27,
      severity: 'SEVERE',
      title: 'Depresión grave',
      description:
        'Depresión severa que requiere atención e intervención clínica (20-27 puntos).',
    },
  ],
  clinicalAlerts: [
    {
      itemCode: 'PHQ9_Q9',
      triggerCondition: 'WEIGHT_GREATER_THAN_OR_EQUAL',
      thresholdValue: 1,
      alertType: 'SUICIDAL_IDEATION_RISK',
      severity: 'CRITICAL',
      message:
        'ALERTA CLÍNICA: El paciente ha reportado ideación autolesiva o pensamientos de muerte (reactivo 9 >= 1). Requiere evaluación de riesgo suicida inmediata.',
    },
  ],
};

export async function seedPhq9StockInstrument(prisma: PrismaClient) {
  const existingInstrument = await prisma.instrument.findFirst({
    where: {
      code: 'PHQ-9',
      isSystem: true,
      organizationId: null,
    },
  });

  const instrument = existingInstrument
    ? await prisma.instrument.update({
        where: { id: existingInstrument.id },
        data: {
          name: 'Cuestionario de Salud del Paciente (PHQ-9)',
          description:
            'Herramienta estandarizada de 9 reactivos para el cribado, diagnóstico y medición de la severidad de la depresión según criterios DSM-IV/DSM-5.',
          targetPopulation: 'Población adulta (>= 18 años)',
        },
      })
    : await prisma.instrument.create({
        data: {
          id: PHQ9_SYSTEM_INSTRUMENT_ID,
          code: 'PHQ-9',
          name: 'Cuestionario de Salud del Paciente (PHQ-9)',
          description:
            'Herramienta estandarizada de 9 reactivos para el cribado, diagnóstico y medición de la severidad de la depresión según criterios DSM-IV/DSM-5.',
          targetPopulation: 'Población adulta (>= 18 años)',
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

  if (!existingVersion) {
    await prisma.instrumentVersion.create({
      data: {
        id: PHQ9_SYSTEM_VERSION_1_ID,
        instrumentId: instrument.id,
        versionNumber: 1,
        status: InstrumentVersionStatus.PUBLISHED,
        definitionJson: phq9DefinitionJson,
        scoringSpecJson: phq9ScoringSpecJson,
        publishedAt: new Date(),
      },
    });
  }

  return instrument;
}
