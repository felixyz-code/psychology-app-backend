import { InstrumentVersionStatus, PrismaClient } from '@prisma/client';

export const PSS10_SYSTEM_INSTRUMENT_ID = '00000000-0000-4000-8000-000000090005';
export const PSS10_SYSTEM_VERSION_1_ID = '00000000-0000-4000-8000-000000090006';

export const pss10DefinitionJson = {
  schemaVersion: '1.0',
  metadata: {
    title: 'Escala de Estrés Percibido (PSS-10)',
    acronym: 'PSS-10',
    author: 'Cohen, Kamarck & Mermelstein',
    language: 'es-MX',
    estimatedTimeMinutes: 4,
    administrationMode: 'SELF_ADMINISTERED',
  },
  instructions: {
    generalInstructions:
      'Las preguntas en esta escala hacen referencia a sus sentimientos y pensamientos durante el último mes. Indique con qué frecuencia se sintió o pensó de cierta manera.',
    responseScaleFormat: 'SINGLE_CHOICE',
  },
  items: [
    {
      code: 'PSS10_Q1',
      sequenceNumber: 1,
      prompt:
        'En el último mes, ¿con qué frecuencia ha estado afectado/a por algo que ha ocurrido inesperadamente?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Casi nunca', weight: 1 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 3 },
        { value: '4', label: 'Muy a menudo', weight: 4 },
      ],
    },
    {
      code: 'PSS10_Q2',
      sequenceNumber: 2,
      prompt:
        'En el último mes, ¿con qué frecuencia se ha sentido incapaz de controlar las cosas importantes en su vida?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Casi nunca', weight: 1 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 3 },
        { value: '4', label: 'Muy a menudo', weight: 4 },
      ],
    },
    {
      code: 'PSS10_Q3',
      sequenceNumber: 3,
      prompt:
        'En el último mes, ¿con qué frecuencia se ha sentido nervioso/a o estresado/a?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Casi nunca', weight: 1 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 3 },
        { value: '4', label: 'Muy a menudo', weight: 4 },
      ],
    },
    {
      code: 'PSS10_Q4',
      sequenceNumber: 4,
      prompt:
        'En el último mes, ¿con qué frecuencia ha manejado con éxito los pequeños problemas irritantes de la vida?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '0', label: 'Nunca', weight: 4 },
        { value: '1', label: 'Casi nunca', weight: 3 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 1 },
        { value: '4', label: 'Muy a menudo', weight: 0 },
      ],
    },
    {
      code: 'PSS10_Q5',
      sequenceNumber: 5,
      prompt:
        'En el último mes, ¿con qué frecuencia ha sentido que ha afrontado eficazmente los cambios importantes que han estado ocurriendo en su vida?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '0', label: 'Nunca', weight: 4 },
        { value: '1', label: 'Casi nunca', weight: 3 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 1 },
        { value: '4', label: 'Muy a menudo', weight: 0 },
      ],
    },
    {
      code: 'PSS10_Q6',
      sequenceNumber: 6,
      prompt:
        'En el último mes, ¿con qué frecuencia ha estado seguro/a sobre su capacidad para manejar sus problemas personales?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Casi nunca', weight: 1 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 3 },
        { value: '4', label: 'Muy a menudo', weight: 4 },
      ],
    },
    {
      code: 'PSS10_Q7',
      sequenceNumber: 7,
      prompt:
        'En el último mes, ¿con qué frecuencia ha sentido que las cosas le van bien?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '0', label: 'Nunca', weight: 4 },
        { value: '1', label: 'Casi nunca', weight: 3 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 1 },
        { value: '4', label: 'Muy a menudo', weight: 0 },
      ],
    },
    {
      code: 'PSS10_Q8',
      sequenceNumber: 8,
      prompt:
        'En el último mes, ¿con qué frecuencia ha sentido que las cosas estaban bajo su control?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '0', label: 'Nunca', weight: 4 },
        { value: '1', label: 'Casi nunca', weight: 3 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 1 },
        { value: '4', label: 'Muy a menudo', weight: 0 },
      ],
    },
    {
      code: 'PSS10_Q9',
      sequenceNumber: 9,
      prompt:
        'En el último mes, ¿con qué frecuencia ha estado enfadado/a porque las cosas que le han ocurrido estaban fuera de su control?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Casi nunca', weight: 1 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 3 },
        { value: '4', label: 'Muy a menudo', weight: 4 },
      ],
    },
    {
      code: 'PSS10_Q10',
      sequenceNumber: 10,
      prompt:
        'En el último mes, ¿con qué frecuencia ha sentido que las dificultades se acumulaban tanto que no podía superarlas?',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '0', label: 'Nunca', weight: 0 },
        { value: '1', label: 'Casi nunca', weight: 1 },
        { value: '2', label: 'De vez en cuando', weight: 2 },
        { value: '3', label: 'A menudo', weight: 3 },
        { value: '4', label: 'Muy a menudo', weight: 4 },
      ],
    },
  ],
};

export const pss10ScoringSpecJson = {
  schemaVersion: '1.0',
  scoringType: 'SUM',
  minScore: 0,
  maxScore: 40,
  scales: [
    {
      code: 'GLOBAL_PERCEIVED_STRESS',
      name: 'Puntuación Total de Estrés Percibido',
      itemCodes: [
        'PSS10_Q1',
        'PSS10_Q2',
        'PSS10_Q3',
        'PSS10_Q4',
        'PSS10_Q5',
        'PSS10_Q6',
        'PSS10_Q7',
        'PSS10_Q8',
        'PSS10_Q9',
        'PSS10_Q10',
      ],
    },
  ],
  strata: [
    {
      code: 'LOW_STRESS',
      min: 0,
      max: 13,
      severity: 'NONE',
      title: 'Estrés percibido bajo',
      description:
        'Nivel bajo de estrés percibido; recursos de afrontamiento adecuados para las demandas cotidianas (0-13 puntos).',
    },
    {
      code: 'MODERATE_STRESS',
      min: 14,
      max: 26,
      severity: 'MODERATE',
      title: 'Estrés percibido moderado',
      description:
        'Nivel moderado de estrés percibido; sugiere entrenamiento en manejo de estrés o técnicas de regulación (14-26 puntos).',
    },
    {
      code: 'HIGH_STRESS',
      min: 27,
      max: 40,
      severity: 'SEVERE',
      title: 'Estrés percibido alto',
      description:
        'Nivel elevado de estrés percibido con riesgo de sobrecarga emocional, somatización o burnout (27-40 puntos).',
    },
  ],
  clinicalAlerts: [
    {
      itemCode: 'PSS10_Q10',
      triggerCondition: 'WEIGHT_GREATER_THAN_OR_EQUAL',
      thresholdValue: 3,
      alertType: 'OVERWHELM_RISK',
      severity: 'MODERATE',
      message:
        'ALERTA CLÍNICA: El paciente percibe que las dificultades le superan con alta frecuencia (reactivo 10 >= 3).',
    },
  ],
};

export async function seedPss10StockInstrument(prisma: PrismaClient) {
  const existingInstrument = await prisma.instrument.findFirst({
    where: {
      code: 'PSS-10',
      isSystem: true,
      organizationId: null,
    },
  });

  const instrument = existingInstrument
    ? await prisma.instrument.update({
        where: { id: existingInstrument.id },
        data: {
          name: 'Escala de Estrés Percibido (PSS-10)',
          description:
            'Instrumento de 10 reactivos que evalúa el grado en que las situaciones de la vida son percibidas como impredecibles, incontrolables y sobrecargadas durante el último mes.',
          targetPopulation: 'Población general (>= 18 años)',
        },
      })
    : await prisma.instrument.create({
        data: {
          id: PSS10_SYSTEM_INSTRUMENT_ID,
          code: 'PSS-10',
          name: 'Escala de Estrés Percibido (PSS-10)',
          description:
            'Instrumento de 10 reactivos que evalúa el grado en que las situaciones de la vida son percibidas como impredecibles, incontrolables y sobrecargadas durante el último mes.',
          targetPopulation: 'Población general (>= 18 años)',
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
        definitionJson: pss10DefinitionJson,
        scoringSpecJson: pss10ScoringSpecJson,
        status: InstrumentVersionStatus.PUBLISHED,
      },
    });
  } else {
    await prisma.instrumentVersion.create({
      data: {
        id: PSS10_SYSTEM_VERSION_1_ID,
        instrumentId: instrument.id,
        versionNumber: 1,
        status: InstrumentVersionStatus.PUBLISHED,
        definitionJson: pss10DefinitionJson,
        scoringSpecJson: pss10ScoringSpecJson,
        publishedAt: new Date(),
      },
    });
  }

  return instrument;
}
