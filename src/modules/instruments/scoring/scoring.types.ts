/**
 * Psychometric Scoring Engine Types & Interfaces
 * Pure Domain Contracts for Clinical Instrument Evaluation
 */

export type ItemType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'LIKERT'
  | 'NUMERIC_SCALE'
  | 'BOOLEAN'
  | 'TEXT';

export interface ItemOption {
  value: string;
  label: string;
  weight: number;
  description?: string;
}

export interface InstrumentItem {
  code: string;
  sequenceNumber: number;
  prompt: string;
  itemType: ItemType;
  required: boolean;
  options?: ItemOption[];
  minValue?: number;
  maxValue?: number;
  reverseScored?: boolean;
  dimensionCode?: string;
}

export interface InstrumentDefinition {
  schemaVersion: string;
  metadata: {
    title: string;
    acronym: string;
    author?: string;
    language: string;
    estimatedTimeMinutes?: number;
    administrationMode?: 'SELF_ADMINISTERED' | 'CLINICIAN_ADMINISTERED';
  };
  instructions?: {
    generalInstructions?: string;
    responseScaleFormat?: string;
  };
  items: InstrumentItem[];
}

export type ScoringType = 'SUM' | 'SUBSCALES' | 'WEIGHTED_COMPOSITE';

export type ClinicalSeverity =
  | 'NONE'
  | 'MINIMAL'
  | 'MILD'
  | 'MODERATE'
  | 'MODERATELY_SEVERE'
  | 'SEVERE'
  | 'CRITICAL';

export type AlertTriggerCondition =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'IN'
  | 'WEIGHT_EQUALS'
  | 'WEIGHT_NOT_EQUALS'
  | 'WEIGHT_GREATER_THAN'
  | 'WEIGHT_GREATER_THAN_OR_EQUAL'
  | 'WEIGHT_LESS_THAN'
  | 'WEIGHT_LESS_THAN_OR_EQUAL'
  | 'VALUE_EQUALS'
  | 'VALUE_NOT_EQUALS'
  | 'VALUE_GREATER_THAN'
  | 'VALUE_GREATER_THAN_OR_EQUAL'
  | 'VALUE_LESS_THAN'
  | 'VALUE_LESS_THAN_OR_EQUAL'
  | 'VALUE_IN';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

export interface StrataDefinition {
  code: string;
  min: number;
  max: number;
  severity: ClinicalSeverity;
  title: string;
  description: string;
}

export interface ScaleDefinition {
  code: string;
  name: string;
  description?: string;
  itemCodes: string[];
  weightMultiplier?: number;
  minScore?: number;
  maxScore?: number;
  strata?: StrataDefinition[];
}

export interface ClinicalAlertRule {
  itemCode: string;
  triggerCondition: AlertTriggerCondition;
  thresholdValue: number | string | (number | string)[];
  alertType: string;
  severity: AlertSeverity;
  message: string;
  targetProperty?: 'WEIGHT' | 'VALUE'; // Default: 'WEIGHT'
}

export interface ScoringSpec {
  schemaVersion: string;
  scoringType: ScoringType;
  minScore?: number;
  maxScore?: number;
  scales?: ScaleDefinition[];
  strata?: StrataDefinition[];
  clinicalAlerts?: ClinicalAlertRule[];
}

export type AssessmentResponseMap = Record<
  string,
  string | number | boolean | string[] | null | undefined
>;

export interface ItemScoreDetail {
  itemCode: string;
  rawResponse: string | number | boolean | string[] | null | undefined;
  numericWeight: number | null;
  isAnswered: boolean;
  isRequired: boolean;
  reverseScoredApplied: boolean;
}

export interface SubscaleScoreResult {
  scaleCode: string;
  scaleName: string;
  rawScore: number;
  normalizedScore: number; // 0 - 100 %
  minPossibleScore: number;
  maxPossibleScore: number;
  answeredCount: number;
  totalCount: number;
  isComplete: boolean;
  strataCode: string | null;
  strataTitle: string | null;
  severity: ClinicalSeverity | null;
  strataDescription: string | null;
}

export interface ClinicalFlagResult {
  alertType: string;
  severity: AlertSeverity;
  itemCode: string;
  triggerCondition: AlertTriggerCondition;
  thresholdValue: number | string | (number | string)[];
  actualValue: string | number | boolean | null;
  actualWeight: number | null;
  message: string;
}

export interface ScoringResult {
  // Global Metrics
  rawScore: number;
  normalizedScore: number; // 0 - 100 %
  minPossibleScore: number;
  maxPossibleScore: number;

  // Global Stratification
  strataCode: string | null;
  strataTitle: string | null;
  strataSeverity: ClinicalSeverity | null;
  strataDescription: string | null;

  // Completeness & Audit
  isComplete: boolean;
  completionRate: number; // 0.0 to 1.0
  answeredCount: number;
  totalRequiredCount: number;
  totalItemsCount: number;
  missingRequiredItems: string[];

  // Subscales & Dimensions
  subscaleScores: Record<string, SubscaleScoreResult>;

  // Clinical Risk & Alerts
  flags: ClinicalFlagResult[];

  // Per-item breakdown
  itemDetails: Record<string, ItemScoreDetail>;
}
