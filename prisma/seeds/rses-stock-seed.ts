import { InstrumentVersionStatus, PrismaClient } from '@prisma/client';

export const RSES_SYSTEM_INSTRUMENT_ID = '00000000-0000-4000-8000-000000090009';
export const RSES_SYSTEM_VERSION_1_ID = '00000000-0000-4000-8000-000000090010';

export const rsesDefinitionJson = {
  schemaVersion: '1.0',
  metadata: {
    title: 'Escala de Autoestima de Rosenberg (RSES)',
    acronym: 'RSES',
    author: 'Morris Rosenberg',
    language: 'es-MX',
    estimatedTimeMinutes: 3,
    administrationMode: 'SELF_ADMINISTERED',
  },
  instructions: {
    generalInstructions:
      'A continuación encontrará una serie de afirmaciones sobre lo que siente acerca de usted mismo/a. Indique su grado de acuerdo con cada una.',
    responseScaleFormat: 'SINGLE_CHOICE',
  },
  items: [
    {
      code: 'RSES_Q1',
      sequenceNumber: 1,
      prompt:
        'Siento que soy una persona digna de aprecio, al menos en igual medida que los demás',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 1 },
        { value: '2', label: 'En desacuerdo', weight: 2 },
        { value: '3', label: 'De acuerdo', weight: 3 },
        { value: '4', label: 'Muy de acuerdo', weight: 4 },
      ],
    },
    {
      code: 'RSES_Q2',
      sequenceNumber: 2,
      prompt: 'Siento que tengo cualidades positivas',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 1 },
        { value: '2', label: 'En desacuerdo', weight: 2 },
        { value: '3', label: 'De acuerdo', weight: 3 },
        { value: '4', label: 'Muy de acuerdo', weight: 4 },
      ],
    },
    {
      code: 'RSES_Q3',
      sequenceNumber: 3,
      prompt:
        'En general, me inclino a pensar que soy un/a fracasado/a',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 4 },
        { value: '2', label: 'En desacuerdo', weight: 3 },
        { value: '3', label: 'De acuerdo', weight: 2 },
        { value: '4', label: 'Muy de acuerdo', weight: 1 },
      ],
    },
    {
      code: 'RSES_Q4',
      sequenceNumber: 4,
      prompt:
        'Soy capaz de hacer las cosas tan bien como la mayoría de la gente',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 1 },
        { value: '2', label: 'En desacuerdo', weight: 2 },
        { value: '3', label: 'De acuerdo', weight: 3 },
        { value: '4', label: 'Muy de acuerdo', weight: 4 },
      ],
    },
    {
      code: 'RSES_Q5',
      sequenceNumber: 5,
      prompt: 'Siento que no tengo mucho de lo que estar orgulloso/a',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 4 },
        { value: '2', label: 'En desacuerdo', weight: 3 },
        { value: '3', label: 'De acuerdo', weight: 2 },
        { value: '4', label: 'Muy de acuerdo', weight: 1 },
      ],
    },
    {
      code: 'RSES_Q6',
      sequenceNumber: 6,
      prompt: 'Adopto una actitud positiva hacia mí mismo/a',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 1 },
        { value: '2', label: 'En desacuerdo', weight: 2 },
        { value: '3', label: 'De acuerdo', weight: 3 },
        { value: '4', label: 'Muy de acuerdo', weight: 4 },
      ],
    },
    {
      code: 'RSES_Q7',
      sequenceNumber: 7,
      prompt: 'En general, me siento satisfecho/a conmigo mismo/a',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: false,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 1 },
        { value: '2', label: 'En desacuerdo', weight: 2 },
        { value: '3', label: 'De acuerdo', weight: 3 },
        { value: '4', label: 'Muy de acuerdo', weight: 4 },
      ],
    },
    {
      code: 'RSES_Q8',
      sequenceNumber: 8,
      prompt: 'Me gustaría tener más respeto por mí mismo/a',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 4 },
        { value: '2', label: 'En desacuerdo', weight: 3 },
        { value: '3', label: 'De acuerdo', weight: 2 },
        { value: '4', label: 'Muy de acuerdo', weight: 1 },
      ],
    },
    {
      code: 'RSES_Q9',
      sequenceNumber: 9,
      prompt: 'A veces me siento verdaderamente inútil',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 4 },
        { value: '2', label: 'En desacuerdo', weight: 3 },
        { value: '3', label: 'De acuerdo', weight: 2 },
        { value: '4', label: 'Muy de acuerdo', weight: 1 },
      ],
    },
    {
      code: 'RSES_Q10',
      sequenceNumber: 10,
      prompt: 'A veces pienso que no soy bueno/a para nada',
      itemType: 'SINGLE_CHOICE',
      required: true,
      reverseScored: true,
      options: [
        { value: '1', label: 'Muy en desacuerdo', weight: 4 },
        { value: '2', label: 'En desacuerdo', weight: 3 },
        { value: '3', label: 'De acuerdo', weight: 2 },
        { value: '4', label: 'Muy de acuerdo', weight: 1 },
      ],
    },
  ],
};

export const rsesScoringSpecJson = {
  schemaVersion: '1.0',
  scoringType: 'SUM',
  minScore: 10,
  maxScore: 40,
  scales: [
    {
      code: 'GLOBAL_SELF_ESTEEM',
      name: 'Puntuación Total de Autoestima Global',
      itemCodes: [
        'RSES_Q1',
        'RSES_Q2',
        'RSES_Q3',
        'RSES_Q4',
        'RSES_Q5',
        'RSES_Q6',
        'RSES_Q7',
        'RSES_Q8',
        'RSES_Q9',
        'RSES_Q10',
      ],
    },
  ],
  strata: [
    {
      code: 'LOW_SELF_ESTEEM',
      min: 10,
      max: 25,
      severity: 'SEVERE',
      title: 'Autoestima baja',
      description:
        'Puntuación indicativa de baja autoestima, autocrítica pronunciada o sentimientos de menor valía personal (10-25 puntos).',
    },
    {
      code: 'AVERAGE_SELF_ESTEEM',
      min: 26,
      max: 29,
      severity: 'NONE',
      title: 'Autoestima media / normal',
      description:
        'Nivel de autoestima dentro del rango promedio y saludable (26-29 puntos).',
    },
    {
      code: 'HIGH_SELF_ESTEEM',
      min: 30,
      max: 40,
      severity: 'NONE',
      title: 'Autoestima alta',
      description:
        'Autoestima elevada, sólida autoconfianza y valoración positiva de sí mismo/a (30-40 puntos).',
    },
  ],
  clinicalAlerts: [
    {
      itemCode: 'RSES_Q9',
      triggerCondition: 'WEIGHT_LESS_THAN_OR_EQUAL',
      thresholdValue: 1,
      alertType: 'WORTHLESSNESS_ALERT',
      severity: 'MODERATE',
      message:
        'ALERTA CLÍNICA: El paciente reporta sentirse fuertemente inútil con alta frecuencia (reactivo 9 "muy de acuerdo").',
    },
  ],
};

export async function seedRsesStockInstrument(prisma: PrismaClient) {
  const existingInstrument = await prisma.instrument.findFirst({
    where: {
      code: 'RSES',
      isSystem: true,
      organizationId: null,
    },
  });

  const instrument = existingInstrument
    ? await prisma.instrument.update({
        where: { id: existingInstrument.id },
        data: {
          name: 'Escala de Autoestima de Rosenberg (RSES)',
          description:
            'Instrumento psicométrico de 10 reactivos ampliamente validado para evaluar la autoestima global y los sentimientos de autovalía.',
          targetPopulation: 'Adolescentes y adultos (>= 12 años)',
        },
      })
    : await prisma.instrument.create({
        data: {
          id: RSES_SYSTEM_INSTRUMENT_ID,
          code: 'RSES',
          name: 'Escala de Autoestima de Rosenberg (RSES)',
          description:
            'Instrumento psicométrico de 10 reactivos ampliamente validado para evaluar la autoestima global y los sentimientos de autovalía.',
          targetPopulation: 'Adolescentes y adultos (>= 12 años)',
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
        id: RSES_SYSTEM_VERSION_1_ID,
        instrumentId: instrument.id,
        versionNumber: 1,
        status: InstrumentVersionStatus.PUBLISHED,
        definitionJson: rsesDefinitionJson,
        scoringSpecJson: rsesScoringSpecJson,
        publishedAt: new Date(),
      },
    });
  }

  return instrument;
}
