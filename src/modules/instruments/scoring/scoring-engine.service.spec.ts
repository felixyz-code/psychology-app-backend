import {
  phq9DefinitionJson,
  phq9ScoringSpecJson,
} from '../../../../prisma/seeds/phq9-stock-seed';
import { ScoringEngineService } from './scoring-engine.service';
import {
  InstrumentDefinition,
  ScoringResult,
  ScoringSpec,
} from './scoring.types';

describe('ScoringEngineService', () => {
  let service: ScoringEngineService;
  const phq9Def = phq9DefinitionJson as unknown as InstrumentDefinition;
  const phq9Spec = phq9ScoringSpecJson as unknown as ScoringSpec;

  beforeEach(() => {
    service = new ScoringEngineService();
  });

  describe('PHQ-9 Psychometric Benchmark Suite (8 Canonical Cases)', () => {
    it('TC-01: should evaluate Minimal or None Depression (Score = 0)', () => {
      const responses = {
        PHQ9_Q1: '0',
        PHQ9_Q2: '0',
        PHQ9_Q3: '0',
        PHQ9_Q4: '0',
        PHQ9_Q5: '0',
        PHQ9_Q6: '0',
        PHQ9_Q7: '0',
        PHQ9_Q8: '0',
        PHQ9_Q9: '0',
      };

      const result: ScoringResult = service.calculate(
        phq9Def,
        phq9Spec,
        responses,
      );

      expect(result.rawScore).toBe(0);
      expect(result.normalizedScore).toBe(0);
      expect(result.strataCode).toBe('MINIMAL_OR_NONE');
      expect(result.strataSeverity).toBe('NONE');
      expect(result.strataTitle).toBe('Depresión mínima o nula');
      expect(result.isComplete).toBe(true);
      expect(result.completionRate).toBe(1.0);
      expect(result.answeredCount).toBe(9);
      expect(result.totalRequiredCount).toBe(9);
      expect(result.missingRequiredItems).toEqual([]);
      expect(result.flags).toHaveLength(0);
    });

    it('TC-02: should evaluate Mild Depression (Score = 6)', () => {
      const responses = {
        PHQ9_Q1: '1',
        PHQ9_Q2: '2',
        PHQ9_Q3: '1',
        PHQ9_Q4: '1',
        PHQ9_Q5: '1',
        PHQ9_Q6: '0',
        PHQ9_Q7: '0',
        PHQ9_Q8: '0',
        PHQ9_Q9: '0',
      };

      const result = service.calculate(phq9Def, phq9Spec, responses);

      expect(result.rawScore).toBe(6);
      expect(result.normalizedScore).toBeCloseTo(22.22, 1);
      expect(result.strataCode).toBe('MILD');
      expect(result.strataSeverity).toBe('MILD');
      expect(result.strataTitle).toBe('Depresión leve');
      expect(result.isComplete).toBe(true);
      expect(result.flags).toHaveLength(0);
    });

    it('TC-03: should evaluate Moderate Depression (Score = 12)', () => {
      const responses = {
        PHQ9_Q1: '2',
        PHQ9_Q2: '2',
        PHQ9_Q3: '2',
        PHQ9_Q4: '1',
        PHQ9_Q5: '2',
        PHQ9_Q6: '1',
        PHQ9_Q7: '1',
        PHQ9_Q8: '1',
        PHQ9_Q9: '0',
      };

      const result = service.calculate(phq9Def, phq9Spec, responses);

      expect(result.rawScore).toBe(12);
      expect(result.normalizedScore).toBeCloseTo(44.44, 1);
      expect(result.strataCode).toBe('MODERATE');
      expect(result.strataSeverity).toBe('MODERATE');
      expect(result.strataTitle).toBe('Depresión moderada');
      expect(result.isComplete).toBe(true);
      expect(result.flags).toHaveLength(0);
    });

    it('TC-04: should evaluate Moderately Severe Depression (Score = 17)', () => {
      const responses = {
        PHQ9_Q1: '2',
        PHQ9_Q2: '3',
        PHQ9_Q3: '2',
        PHQ9_Q4: '2',
        PHQ9_Q5: '2',
        PHQ9_Q6: '2',
        PHQ9_Q7: '2',
        PHQ9_Q8: '2',
        PHQ9_Q9: '0',
      };

      const result = service.calculate(phq9Def, phq9Spec, responses);

      expect(result.rawScore).toBe(17);
      expect(result.normalizedScore).toBeCloseTo(62.96, 1);
      expect(result.strataCode).toBe('MODERATELY_SEVERE');
      expect(result.strataSeverity).toBe('MODERATELY_SEVERE');
      expect(result.strataTitle).toBe('Depresión moderadamente grave');
      expect(result.isComplete).toBe(true);
      expect(result.flags).toHaveLength(0);
    });

    it('TC-05: should evaluate Severe Depression (Max Score = 27) with Suicide Risk Alert', () => {
      const responses = {
        PHQ9_Q1: '3',
        PHQ9_Q2: '3',
        PHQ9_Q3: '3',
        PHQ9_Q4: '3',
        PHQ9_Q5: '3',
        PHQ9_Q6: '3',
        PHQ9_Q7: '3',
        PHQ9_Q8: '3',
        PHQ9_Q9: '3',
      };

      const result = service.calculate(phq9Def, phq9Spec, responses);

      expect(result.rawScore).toBe(27);
      expect(result.normalizedScore).toBe(100);
      expect(result.strataCode).toBe('SEVERE');
      expect(result.strataSeverity).toBe('SEVERE');
      expect(result.strataTitle).toBe('Depresión grave');
      expect(result.isComplete).toBe(true);
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0].alertType).toBe('SUICIDAL_IDEATION_RISK');
      expect(result.flags[0].severity).toBe('CRITICAL');
      expect(result.flags[0].itemCode).toBe('PHQ9_Q9');
      expect(result.flags[0].actualWeight).toBe(3);
    });

    it('TC-06: should trigger Critical Suicide Risk Alert with Low Total Score (Score = 2)', () => {
      const responses = {
        PHQ9_Q1: '0',
        PHQ9_Q2: '0',
        PHQ9_Q3: '0',
        PHQ9_Q4: '0',
        PHQ9_Q5: '0',
        PHQ9_Q6: '0',
        PHQ9_Q7: '0',
        PHQ9_Q8: '0',
        PHQ9_Q9: '2',
      };

      const result = service.calculate(phq9Def, phq9Spec, responses);

      expect(result.rawScore).toBe(2);
      expect(result.strataCode).toBe('MINIMAL_OR_NONE');
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0].alertType).toBe('SUICIDAL_IDEATION_RISK');
      expect(result.flags[0].severity).toBe('CRITICAL');
      expect(result.flags[0].itemCode).toBe('PHQ9_Q9');
      expect(result.flags[0].actualWeight).toBe(2);
    });

    it('TC-07: should handle Incomplete Questionnaires with missing required items', () => {
      const partialResponses = {
        PHQ9_Q1: '1',
        PHQ9_Q2: '1',
        PHQ9_Q3: '1',
      };

      const result = service.calculate(phq9Def, phq9Spec, partialResponses);

      expect(result.rawScore).toBe(3);
      expect(result.isComplete).toBe(false);
      expect(result.completionRate).toBe(0.33);
      expect(result.answeredCount).toBe(3);
      expect(result.totalRequiredCount).toBe(9);
      expect(result.missingRequiredItems).toEqual([
        'PHQ9_Q4',
        'PHQ9_Q5',
        'PHQ9_Q6',
        'PHQ9_Q7',
        'PHQ9_Q8',
        'PHQ9_Q9',
      ]);
    });

    it('TC-08: should handle Type Coercion, numeric inputs and ignore unknown foreign keys', () => {
      const mixedResponses = {
        PHQ9_Q1: 3, // numeric literal
        PHQ9_Q2: '2', // string numeric
        PHQ9_Q3: 1,
        PHQ9_Q4: '0',
        PHQ9_Q5: 0,
        PHQ9_Q6: '0',
        PHQ9_Q7: '0',
        PHQ9_Q8: '0',
        PHQ9_Q9: '0',
        INJECTED_FOREIGN_KEY: 999, // Should be ignored
      };

      const result = service.calculate(phq9Def, phq9Spec, mixedResponses);

      expect(result.rawScore).toBe(6);
      expect(result.strataCode).toBe('MILD');
      expect(result.isComplete).toBe(true);
      expect(result.itemDetails['PHQ9_Q1'].numericWeight).toBe(3);
      expect(result.itemDetails['INJECTED_FOREIGN_KEY']).toBeUndefined();
    });
  });

  describe('Reverse Scored Items Handling', () => {
    it('should correctly invert weights on reverseScored items', () => {
      const customDef: InstrumentDefinition = {
        schemaVersion: '1.0',
        metadata: {
          title: 'Escala con reactivo invertido',
          acronym: 'REV-TEST',
          language: 'es-MX',
        },
        items: [
          {
            code: 'REV_Q1',
            sequenceNumber: 1,
            prompt: 'Me siento triste (Directo)',
            itemType: 'LIKERT',
            required: true,
            reverseScored: false,
            options: [
              { value: '0', label: 'Nunca', weight: 0 },
              { value: '1', label: 'A veces', weight: 1 },
              { value: '2', label: 'Siempre', weight: 2 },
            ],
          },
          {
            code: 'REV_Q2',
            sequenceNumber: 2,
            prompt: 'Me siento lleno de energía y feliz (Invertido)',
            itemType: 'LIKERT',
            required: true,
            reverseScored: true,
            options: [
              { value: '0', label: 'Nunca', weight: 0 },
              { value: '1', label: 'A veces', weight: 1 },
              { value: '2', label: 'Siempre', weight: 2 },
            ],
          },
        ],
      };

      const customSpec: ScoringSpec = {
        schemaVersion: '1.0',
        scoringType: 'SUM',
        minScore: 0,
        maxScore: 4,
      };

      // When answering '2' (Siempre feliz) on reversed item, inverted weight should be 0 (2+0-2=0)
      const res1 = service.calculate(customDef, customSpec, {
        REV_Q1: '2', // weight 2
        REV_Q2: '2', // weight 2 inverted -> 0
      });
      expect(res1.rawScore).toBe(2);
      expect(res1.itemDetails['REV_Q2'].numericWeight).toBe(0);
      expect(res1.itemDetails['REV_Q2'].reverseScoredApplied).toBe(true);

      // When answering '0' (Nunca feliz) on reversed item, inverted weight should be 2 (2+0-0=2)
      const res2 = service.calculate(customDef, customSpec, {
        REV_Q1: '0', // weight 0
        REV_Q2: '0', // weight 0 inverted -> 2
      });
      expect(res2.rawScore).toBe(2);
      expect(res2.itemDetails['REV_Q2'].numericWeight).toBe(2);
    });
  });

  describe('Multidimensional Subscales (SUBSCALES Algorithm)', () => {
    it('should compute separated subscale scores and assign scale-level strata', () => {
      const multiDef: InstrumentDefinition = {
        schemaVersion: '1.0',
        metadata: {
          title: 'Escala Multidimensional de Ansiedad y Depresión',
          acronym: 'ANX-DEP',
          language: 'es-MX',
        },
        items: [
          {
            code: 'ANX_1',
            sequenceNumber: 1,
            prompt: 'Palpitaciones',
            itemType: 'SINGLE_CHOICE',
            required: true,
            options: [
              { value: '0', label: 'No', weight: 0 },
              { value: '1', label: 'Sí', weight: 3 },
            ],
          },
          {
            code: 'ANX_2',
            sequenceNumber: 2,
            prompt: 'Tensión muscular',
            itemType: 'SINGLE_CHOICE',
            required: true,
            options: [
              { value: '0', label: 'No', weight: 0 },
              { value: '1', label: 'Sí', weight: 3 },
            ],
          },
          {
            code: 'DEP_1',
            sequenceNumber: 3,
            prompt: 'Anhedonia',
            itemType: 'SINGLE_CHOICE',
            required: true,
            options: [
              { value: '0', label: 'No', weight: 0 },
              { value: '1', label: 'Sí', weight: 3 },
            ],
          },
          {
            code: 'DEP_2',
            sequenceNumber: 4,
            prompt: 'Tristeza profunda',
            itemType: 'SINGLE_CHOICE',
            required: true,
            options: [
              { value: '0', label: 'No', weight: 0 },
              { value: '1', label: 'Sí', weight: 3 },
            ],
          },
        ],
      };

      const multiSpec: ScoringSpec = {
        schemaVersion: '1.0',
        scoringType: 'SUBSCALES',
        minScore: 0,
        maxScore: 12,
        scales: [
          {
            code: 'ANXIETY_DIMENSION',
            name: 'Dimensión de Ansiedad',
            itemCodes: ['ANX_1', 'ANX_2'],
            minScore: 0,
            maxScore: 6,
            strata: [
              {
                code: 'ANX_LOW',
                min: 0,
                max: 2,
                severity: 'NONE',
                title: 'Ansiedad Baja',
                description: 'Nivel bajo de ansiedad',
              },
              {
                code: 'ANX_HIGH',
                min: 3,
                max: 6,
                severity: 'SEVERE',
                title: 'Ansiedad Elevada',
                description: 'Nivel elevado de ansiedad',
              },
            ],
          },
          {
            code: 'DEPRESSION_DIMENSION',
            name: 'Dimensión de Depresión',
            itemCodes: ['DEP_1', 'DEP_2'],
            minScore: 0,
            maxScore: 6,
            strata: [
              {
                code: 'DEP_LOW',
                min: 0,
                max: 2,
                severity: 'NONE',
                title: 'Depresión Baja',
                description: 'Nivel bajo de depresión',
              },
              {
                code: 'DEP_HIGH',
                min: 3,
                max: 6,
                severity: 'SEVERE',
                title: 'Depresión Elevada',
                description: 'Nivel elevado de depresión',
              },
            ],
          },
        ],
      };

      const responses = {
        ANX_1: '1', // weight 3
        ANX_2: '1', // weight 3 -> Anxiety = 6
        DEP_1: '0', // weight 0
        DEP_2: '0', // weight 0 -> Depression = 0
      };

      const result = service.calculate(multiDef, multiSpec, responses);

      expect(result.rawScore).toBe(6);
      expect(result.subscaleScores['ANXIETY_DIMENSION']).toBeDefined();
      expect(result.subscaleScores['ANXIETY_DIMENSION'].rawScore).toBe(6);
      expect(result.subscaleScores['ANXIETY_DIMENSION'].normalizedScore).toBe(
        100,
      );
      expect(result.subscaleScores['ANXIETY_DIMENSION'].strataCode).toBe(
        'ANX_HIGH',
      );
      expect(result.subscaleScores['ANXIETY_DIMENSION'].severity).toBe(
        'SEVERE',
      );

      expect(result.subscaleScores['DEPRESSION_DIMENSION']).toBeDefined();
      expect(result.subscaleScores['DEPRESSION_DIMENSION'].rawScore).toBe(0);
      expect(
        result.subscaleScores['DEPRESSION_DIMENSION'].normalizedScore,
      ).toBe(0);
      expect(result.subscaleScores['DEPRESSION_DIMENSION'].strataCode).toBe(
        'DEP_LOW',
      );
      expect(result.subscaleScores['DEPRESSION_DIMENSION'].severity).toBe(
        'NONE',
      );
    });
  });

  describe('Clinical Alert Evaluation (Logical Conditions)', () => {
    const alertDef: InstrumentDefinition = {
      schemaVersion: '1.0',
      metadata: { title: 'Test Alerts', acronym: 'ALT', language: 'es-MX' },
      items: [
        {
          code: 'Q_TEXT',
          sequenceNumber: 1,
          prompt: '¿Consume sustancias?',
          itemType: 'TEXT',
          required: true,
        },
        {
          code: 'Q_SCALE',
          sequenceNumber: 2,
          prompt: 'Nivel de estrés',
          itemType: 'NUMERIC_SCALE',
          required: true,
          minValue: 0,
          maxValue: 10,
        },
      ],
    };

    it('should evaluate IN and EQUALS conditions correctly', () => {
      const alertSpec: ScoringSpec = {
        schemaVersion: '1.0',
        scoringType: 'SUM',
        clinicalAlerts: [
          {
            itemCode: 'Q_TEXT',
            triggerCondition: 'IN',
            thresholdValue: ['cocaina', 'heroina', 'metanfetamina'],
            targetProperty: 'VALUE',
            alertType: 'HARD_DRUGS_RISK',
            severity: 'EMERGENCY',
            message: 'Alerta de consumo de sustancias de alto impacto',
          },
          {
            itemCode: 'Q_SCALE',
            triggerCondition: 'GREATER_THAN',
            thresholdValue: 8,
            targetProperty: 'VALUE',
            alertType: 'EXTREME_STRESS',
            severity: 'WARNING',
            message: 'Nivel de estrés extremo',
          },
        ],
      };

      const result = service.calculate(alertDef, alertSpec, {
        Q_TEXT: 'cocaina',
        Q_SCALE: 9,
      });

      expect(result.flags).toHaveLength(2);
      expect(result.flags[0].alertType).toBe('HARD_DRUGS_RISK');
      expect(result.flags[0].severity).toBe('EMERGENCY');
      expect(result.flags[1].alertType).toBe('EXTREME_STRESS');
      expect(result.flags[1].severity).toBe('WARNING');
    });
  });
});
