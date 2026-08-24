import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationEventType } from '@prisma/client';
import {
  CANONICAL_TEMPLATE_VARIABLES,
  TemplateVariableMetadata,
} from '../notification-templates.constants';

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export interface InterpolationResult {
  renderedText: string;
  detectedVariables: string[];
  unmappedVariables: string[];
}

export interface RenderPreviewParams {
  channel: NotificationChannel;
  eventType: NotificationEventType;
  body: string;
  subject?: string | null;
  customContext?: Record<string, any>;
}

export interface RenderPreviewResult {
  renderedSubject?: string;
  renderedBody: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  detectedVariables: string[];
  unmappedVariables: string[];
  contextUsed: Record<string, string>;
}

@Injectable()
export class TemplateInterpolatorService {
  private readonly logger = new Logger(TemplateInterpolatorService.name);
  private readonly variableRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  /**
   * Escapes HTML entities for email channels to prevent XSS.
   */
  escapeHtml(raw: string): string {
    return raw.replace(/[&<>"']/g, (match) => HTML_ESCAPE_MAP[match] || match);
  }

  /**
   * Extracts all unique variable names from template text (e.g. {{patientName}} -> ['patientName']).
   */
  extractVariables(text: string | null | undefined): string[] {
    if (!text) return [];
    const matches = new Set<string>();
    let match: RegExpExecArray | null;
    const regex = new RegExp(this.variableRegex.source, 'g');

    while ((match = regex.exec(text)) !== null) {
      const varName = match[1];
      if (varName && !FORBIDDEN_KEYS.has(varName)) {
        matches.add(varName);
      }
    }
    return Array.from(matches);
  }

  /**
   * Safely interpolates variables into a template string without prototype pollution risk.
   */
  interpolate(
    templateText: string | null | undefined,
    context: Record<string, any> = {},
    options?: { channel?: NotificationChannel; escapeHtmlValues?: boolean },
  ): InterpolationResult {
    if (!templateText) {
      return {
        renderedText: '',
        detectedVariables: [],
        unmappedVariables: [],
      };
    }

    const detected = new Set<string>();
    const unmapped = new Set<string>();
    const shouldEscape =
      options?.escapeHtmlValues ??
      options?.channel === NotificationChannel.EMAIL;

    const renderedText = templateText.replace(
      this.variableRegex,
      (fullMatch, rawKey: string) => {
        const key = rawKey.trim();

        if (FORBIDDEN_KEYS.has(key)) {
          this.logger.warn(
            `Attempted injection/access to forbidden prototype key: ${key}`,
          );
          return '';
        }

        detected.add(key);

        if (
          context &&
          Object.prototype.hasOwnProperty.call(context, key) &&
          context[key] !== undefined &&
          context[key] !== null
        ) {
          const rawVal = String(context[key]);
          return shouldEscape ? this.escapeHtml(rawVal) : rawVal;
        }

        unmapped.add(key);
        return fullMatch; // Keep placeholder if value not provided
      },
    );

    return {
      renderedText,
      detectedVariables: Array.from(detected),
      unmappedVariables: Array.from(unmapped),
    };
  }

  /**
   * Generates a sample context dictionary based on canonical template variables.
   */
  getDefaultSampleContext(): Record<string, string> {
    const context: Record<string, string> = {};
    for (const v of CANONICAL_TEMPLATE_VARIABLES) {
      context[v.key] = v.exampleValue;
    }
    return context;
  }

  /**
   * Generates a live preview of subject and body for the given channel & event type.
   */
  renderPreview(params: RenderPreviewParams): RenderPreviewResult {
    const baseContext = this.getDefaultSampleContext();
    const mergedContext = { ...baseContext, ...(params.customContext || {}) };

    // Clean dangerous keys from context
    for (const forbidden of FORBIDDEN_KEYS) {
      delete (mergedContext as Record<string, unknown>)[forbidden];
    }

    const bodyResult = this.interpolate(params.body, mergedContext, {
      channel: params.channel,
      escapeHtmlValues: false, // In preview we preserve formatting for renderers
    });

    let renderedSubject: string | undefined;
    const allDetected = new Set<string>(bodyResult.detectedVariables);
    const allUnmapped = new Set<string>(bodyResult.unmappedVariables);

    if (params.subject) {
      const subjectResult = this.interpolate(params.subject, mergedContext, {
        channel: params.channel,
        escapeHtmlValues: false,
      });
      renderedSubject = subjectResult.renderedText;
      subjectResult.detectedVariables.forEach((v) => allDetected.add(v));
      subjectResult.unmappedVariables.forEach((v) => allUnmapped.add(v));
    }

    return {
      renderedSubject,
      renderedBody: bodyResult.renderedText,
      channel: params.channel,
      eventType: params.eventType,
      detectedVariables: Array.from(allDetected),
      unmappedVariables: Array.from(allUnmapped),
      contextUsed: mergedContext,
    };
  }

  /**
   * Returns metadata of all available variables.
   */
  getAvailableVariables(): readonly TemplateVariableMetadata[] {
    return CANONICAL_TEMPLATE_VARIABLES;
  }
}
