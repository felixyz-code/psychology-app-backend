import { Injectable } from '@nestjs/common';
import {
  AlertTriggerCondition,
  AssessmentResponseMap,
  ClinicalFlagResult,
  ClinicalSeverity,
  InstrumentDefinition,
  InstrumentItem,
  ItemScoreDetail,
  ScoringResult,
  ScoringSpec,
  StrataDefinition,
  SubscaleScoreResult,
} from './scoring.types';

@Injectable()
export class ScoringEngineService {
  /**
   * Pure deterministic calculation for psychometric instruments
   */
  calculate(
    definition: InstrumentDefinition,
    spec: ScoringSpec,
    responses: AssessmentResponseMap = {},
  ): ScoringResult {
    // 1. Normalization & Validation of all items
    const {
      itemDetails,
      missingRequiredItems,
      answeredCount,
      totalRequiredCount,
      totalItemsCount,
      isComplete,
      completionRate,
    } = this.normalizeAndValidateItems(definition, responses);

    // 2. Theoretical Min & Max Range for Global Scale
    const { minPossibleScore, maxPossibleScore } = this.calculateGlobalBounds(
      definition,
      spec,
    );

    // 3. Compute Global Raw & Normalized Scores
    let rawScore = 0;
    for (const detail of Object.values(itemDetails)) {
      if (detail.numericWeight !== null && !isNaN(detail.numericWeight)) {
        rawScore += detail.numericWeight;
      }
    }

    const normalizedScore = this.computeNormalizedScore(
      rawScore,
      minPossibleScore,
      maxPossibleScore,
    );

    // 4. Global Stratification Match
    const strataMatch = this.matchStratum(rawScore, spec.strata);

    // 5. Subscales Evaluation
    const subscaleScores = this.calculateSubscales(
      definition,
      spec,
      itemDetails,
    );

    // 6. Clinical Risk & Alert Rules Evaluation
    const flags = this.evaluateClinicalAlerts(spec, itemDetails);

    return {
      rawScore,
      normalizedScore,
      minPossibleScore,
      maxPossibleScore,
      strataCode: strataMatch.strataCode,
      strataTitle: strataMatch.strataTitle,
      strataSeverity: strataMatch.strataSeverity,
      strataDescription: strataMatch.strataDescription,
      isComplete,
      completionRate,
      answeredCount,
      totalRequiredCount,
      totalItemsCount,
      missingRequiredItems,
      subscaleScores,
      flags,
      itemDetails,
    };
  }

  /**
   * Normalizes response inputs, resolves option weights, applies reverse scoring, and checks completeness
   */
  private normalizeAndValidateItems(
    definition: InstrumentDefinition,
    responses: AssessmentResponseMap,
  ): {
    itemDetails: Record<string, ItemScoreDetail>;
    missingRequiredItems: string[];
    answeredCount: number;
    totalRequiredCount: number;
    totalItemsCount: number;
    isComplete: boolean;
    completionRate: number;
  } {
    const itemDetails: Record<string, ItemScoreDetail> = {};
    const missingRequiredItems: string[] = [];
    let answeredCount = 0;
    let totalRequiredCount = 0;
    const totalItemsCount = definition.items.length;

    for (const item of definition.items) {
      if (item.required) {
        totalRequiredCount++;
      }

      const rawResponse = responses[item.code];
      const isAnswered =
        rawResponse !== undefined &&
        rawResponse !== null &&
        rawResponse !== '' &&
        !(Array.isArray(rawResponse) && rawResponse.length === 0);

      if (isAnswered) {
        answeredCount++;
      } else if (item.required) {
        missingRequiredItems.push(item.code);
      }

      const { weight, reverseApplied } = isAnswered
        ? this.resolveItemWeight(item, rawResponse)
        : { weight: null, reverseApplied: false };

      itemDetails[item.code] = {
        itemCode: item.code,
        rawResponse: rawResponse ?? null,
        numericWeight: weight,
        isAnswered,
        isRequired: item.required,
        reverseScoredApplied: reverseApplied,
      };
    }

    const isComplete = missingRequiredItems.length === 0;
    const completionRate =
      totalRequiredCount > 0
        ? Math.round(
            ((totalRequiredCount - missingRequiredItems.length) /
              totalRequiredCount) *
              100,
          ) / 100
        : 1.0;

    return {
      itemDetails,
      missingRequiredItems,
      answeredCount,
      totalRequiredCount,
      totalItemsCount,
      isComplete,
      completionRate,
    };
  }

  /**
   * Resolves the numeric weight of an individual item response
   */
  private resolveItemWeight(
    item: InstrumentItem,
    rawResponse: string | number | boolean | string[] | null | undefined,
  ): { weight: number | null; reverseApplied: boolean } {
    let weight: number | null = null;

    if (item.options && item.options.length > 0) {
      if (Array.isArray(rawResponse)) {
        // Multiple choice sum of weights
        let sum = 0;
        for (const val of rawResponse) {
          const opt = item.options.find((o) => o.value === String(val));
          if (opt) {
            sum += opt.weight;
          }
        }
        weight = sum;
      } else {
        // Single choice or Likert
        const opt = item.options.find(
          (o) =>
            o.value === String(rawResponse) || o.weight === Number(rawResponse),
        );
        if (opt) {
          weight = opt.weight;
        } else if (!isNaN(Number(rawResponse))) {
          weight = Number(rawResponse);
        }
      }
    } else if (item.itemType === 'NUMERIC_SCALE') {
      const num = Number(rawResponse);
      if (!isNaN(num)) {
        weight = num;
      }
    } else if (item.itemType === 'BOOLEAN') {
      if (
        rawResponse === true ||
        rawResponse === 'true' ||
        rawResponse === 1 ||
        rawResponse === '1'
      ) {
        weight = 1;
      } else {
        weight = 0;
      }
    } else if (!isNaN(Number(rawResponse))) {
      weight = Number(rawResponse);
    }

    let reverseApplied = false;
    if (item.reverseScored && weight !== null) {
      let minW = 0;
      let maxW = 3;

      if (item.options && item.options.length > 0) {
        const weights = item.options.map((o) => o.weight);
        minW = Math.min(...weights);
        maxW = Math.max(...weights);
      } else if (item.minValue !== undefined && item.maxValue !== undefined) {
        minW = item.minValue;
        maxW = item.maxValue;
      }

      weight = maxW + minW - weight;
      reverseApplied = true;
    }

    return { weight, reverseApplied };
  }

  /**
   * Computes theoretical min and max bounds for global scale
   */
  private calculateGlobalBounds(
    definition: InstrumentDefinition,
    spec: ScoringSpec,
  ): { minPossibleScore: number; maxPossibleScore: number } {
    if (spec.minScore !== undefined && spec.maxScore !== undefined) {
      return {
        minPossibleScore: spec.minScore,
        maxPossibleScore: spec.maxScore,
      };
    }

    let min = 0;
    let max = 0;

    for (const item of definition.items) {
      if (item.options && item.options.length > 0) {
        const weights = item.options.map((o) => o.weight);
        min += Math.min(...weights);
        max += Math.max(...weights);
      } else if (item.minValue !== undefined && item.maxValue !== undefined) {
        min += item.minValue;
        max += item.maxValue;
      }
    }

    return {
      minPossibleScore: spec.minScore ?? min,
      maxPossibleScore: spec.maxScore ?? max,
    };
  }

  /**
   * Computes a 0 - 100 % normalized score based on scale bounds
   */
  private computeNormalizedScore(
    raw: number,
    min: number,
    max: number,
  ): number {
    if (max <= min) {
      return 0;
    }
    const pct = ((raw - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
  }

  /**
   * Matches a score against defined strata
   */
  private matchStratum(
    score: number,
    strata?: StrataDefinition[],
  ): {
    strataCode: string | null;
    strataTitle: string | null;
    strataSeverity: ClinicalSeverity | null;
    strataDescription: string | null;
  } {
    if (!strata || strata.length === 0) {
      return {
        strataCode: null,
        strataTitle: null,
        strataSeverity: null,
        strataDescription: null,
      };
    }

    // Direct range match
    const matched = strata.find((s) => score >= s.min && score <= s.max);
    if (matched) {
      return {
        strataCode: matched.code,
        strataTitle: matched.title,
        strataSeverity: matched.severity,
        strataDescription: matched.description,
      };
    }

    // Clamp fallback if out of defined bounds
    if (score < strata[0].min) {
      const first = strata[0];
      return {
        strataCode: first.code,
        strataTitle: first.title,
        strataSeverity: first.severity,
        strataDescription: first.description,
      };
    }

    const last = strata[strata.length - 1];
    return {
      strataCode: last.code,
      strataTitle: last.title,
      strataSeverity: last.severity,
      strataDescription: last.description,
    };
  }

  /**
   * Computes multi-scale dimensions
   */
  private calculateSubscales(
    definition: InstrumentDefinition,
    spec: ScoringSpec,
    itemDetails: Record<string, ItemScoreDetail>,
  ): Record<string, SubscaleScoreResult> {
    const subscaleScores: Record<string, SubscaleScoreResult> = {};
    if (!spec.scales || spec.scales.length === 0) {
      return subscaleScores;
    }

    for (const scale of spec.scales) {
      let rawScore = 0;
      let answeredCount = 0;
      const totalCount = scale.itemCodes.length;
      let minPossibleScore = 0;
      let maxPossibleScore = 0;

      for (const itemCode of scale.itemCodes) {
        const item = definition.items.find((i) => i.code === itemCode);
        if (item) {
          if (item.options && item.options.length > 0) {
            const weights = item.options.map((o) => o.weight);
            minPossibleScore += Math.min(...weights);
            maxPossibleScore += Math.max(...weights);
          } else if (
            item.minValue !== undefined &&
            item.maxValue !== undefined
          ) {
            minPossibleScore += item.minValue;
            maxPossibleScore += item.maxValue;
          }
        }

        const detail = itemDetails[itemCode];
        if (detail && detail.isAnswered && detail.numericWeight !== null) {
          rawScore += detail.numericWeight;
          answeredCount++;
        }
      }

      const multiplier = scale.weightMultiplier ?? 1;
      rawScore = rawScore * multiplier;
      minPossibleScore = (scale.minScore ?? minPossibleScore) * multiplier;
      maxPossibleScore = (scale.maxScore ?? maxPossibleScore) * multiplier;

      const normalizedScore = this.computeNormalizedScore(
        rawScore,
        minPossibleScore,
        maxPossibleScore,
      );

      const isComplete = answeredCount === totalCount;
      const strataMatch = this.matchStratum(
        rawScore,
        scale.strata ?? spec.strata,
      );

      subscaleScores[scale.code] = {
        scaleCode: scale.code,
        scaleName: scale.name,
        rawScore,
        normalizedScore,
        minPossibleScore,
        maxPossibleScore,
        answeredCount,
        totalCount,
        isComplete,
        strataCode: strataMatch.strataCode,
        strataTitle: strataMatch.strataTitle,
        severity: strataMatch.strataSeverity,
        strataDescription: strataMatch.strataDescription,
      };
    }

    return subscaleScores;
  }

  /**
   * Evaluates clinical alert rules (CRITICAL_FLAGS)
   */
  private evaluateClinicalAlerts(
    spec: ScoringSpec,
    itemDetails: Record<string, ItemScoreDetail>,
  ): ClinicalFlagResult[] {
    const flags: ClinicalFlagResult[] = [];
    if (!spec.clinicalAlerts || spec.clinicalAlerts.length === 0) {
      return flags;
    }

    for (const rule of spec.clinicalAlerts) {
      const detail = itemDetails[rule.itemCode];
      if (!detail || !detail.isAnswered) {
        continue;
      }

      let targetProperty = rule.targetProperty ?? 'WEIGHT';
      let condition = rule.triggerCondition;

      if (condition.startsWith('WEIGHT_')) {
        targetProperty = 'WEIGHT';
        condition = condition.replace('WEIGHT_', '') as AlertTriggerCondition;
      } else if (condition.startsWith('VALUE_')) {
        targetProperty = 'VALUE';
        condition = condition.replace('VALUE_', '') as AlertTriggerCondition;
      }

      const actualValue = detail.rawResponse;
      const actualWeight = detail.numericWeight;

      const valueToTest =
        targetProperty === 'VALUE' ? actualValue : actualWeight;

      if (valueToTest === null || valueToTest === undefined) {
        continue;
      }

      const isTriggered = this.evaluateCondition(
        valueToTest,
        condition,
        rule.thresholdValue,
      );

      if (isTriggered) {
        flags.push({
          alertType: rule.alertType,
          severity: rule.severity,
          itemCode: rule.itemCode,
          triggerCondition: rule.triggerCondition,
          thresholdValue: rule.thresholdValue,
          actualValue:
            actualValue === undefined ||
            actualValue === null ||
            typeof actualValue === 'object'
              ? null
              : actualValue,
          actualWeight,
          message: rule.message,
        });
      }
    }

    return flags;
  }

  /**
   * Logical condition evaluator
   */
  private evaluateCondition(
    actual: string | number | boolean | string[],
    condition: AlertTriggerCondition,
    threshold: number | string | (number | string)[],
  ): boolean {
    const numActual = Number(actual);
    const numThreshold = Number(threshold);
    const hasNumericValues = !isNaN(numActual) && !isNaN(numThreshold);

    switch (condition) {
      case 'EQUALS':
        return hasNumericValues
          ? numActual === numThreshold
          : String(actual).trim().toLowerCase() ===
              String(threshold).trim().toLowerCase();

      case 'NOT_EQUALS':
        return hasNumericValues
          ? numActual !== numThreshold
          : String(actual).trim().toLowerCase() !==
              String(threshold).trim().toLowerCase();

      case 'GREATER_THAN':
        return hasNumericValues ? numActual > numThreshold : false;

      case 'GREATER_THAN_OR_EQUAL':
        return hasNumericValues ? numActual >= numThreshold : false;

      case 'LESS_THAN':
        return hasNumericValues ? numActual < numThreshold : false;

      case 'LESS_THAN_OR_EQUAL':
        return hasNumericValues ? numActual <= numThreshold : false;

      case 'IN':
        if (Array.isArray(threshold)) {
          return threshold.some((item) =>
            hasNumericValues
              ? Number(item) === numActual
              : String(item).trim().toLowerCase() ===
                String(actual).trim().toLowerCase(),
          );
        }
        return false;

      default:
        return false;
    }
  }
}
