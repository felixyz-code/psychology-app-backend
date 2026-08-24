import { NotificationChannel, NotificationEventType } from '@prisma/client';
import { TemplateInterpolatorService } from './template-interpolator.service';

describe('TemplateInterpolatorService', () => {
  let service: TemplateInterpolatorService;

  beforeEach(() => {
    service = new TemplateInterpolatorService();
  });

  describe('extractVariables', () => {
    it('extracts all unique variables correctly in order', () => {
      const template =
        'Hola {{patientName}}, tu cita con {{therapistName}} es el {{appointmentDate}} a las {{appointmentTime}}. Repito: {{patientName}}';
      const variables = service.extractVariables(template);

      expect(variables).toEqual([
        'patientName',
        'therapistName',
        'appointmentDate',
        'appointmentTime',
      ]);
    });

    it('handles whitespaces inside braces like {{ patientName }}', () => {
      const template = 'Hola {{ patientName  }} en {{organizationName}}';
      const variables = service.extractVariables(template);

      expect(variables).toEqual(['patientName', 'organizationName']);
    });

    it('returns empty array for empty or null template text', () => {
      expect(service.extractVariables('')).toEqual([]);
      expect(service.extractVariables(null as any)).toEqual([]);
    });

    it('ignores forbidden prototype keys during extraction', () => {
      const template = 'Malicious: {{__proto__}} and {{constructor}} and {{patientName}}';
      const variables = service.extractVariables(template);

      expect(variables).toEqual(['patientName']);
      expect(variables).not.toContain('__proto__');
      expect(variables).not.toContain('constructor');
    });
  });

  describe('interpolate', () => {
    it('substitutes known variables properly', () => {
      const template =
        'Hola {{patientName}}, recordatorio de tu cita con {{therapistName}} el {{appointmentDate}}.';
      const context = {
        patientName: 'Lucía Méndez',
        therapistName: 'Dr. Roberto Gómez',
        appointmentDate: '28 de Agosto',
      };

      const result = service.interpolate(template, context);

      expect(result.renderedText).toBe(
        'Hola Lucía Méndez, recordatorio de tu cita con Dr. Roberto Gómez el 28 de Agosto.',
      );
      expect(result.detectedVariables).toEqual([
        'patientName',
        'therapistName',
        'appointmentDate',
      ]);
      expect(result.unmappedVariables).toEqual([]);
    });

    it('keeps unmapped variables intact and reports them in unmappedVariables', () => {
      const template = 'Estimado {{patientName}}, su enlace es {{rescheduleLink}} en {{branchName}}';
      const context = {
        patientName: 'Juan Pérez',
      };

      const result = service.interpolate(template, context);

      expect(result.renderedText).toBe(
        'Estimado Juan Pérez, su enlace es {{rescheduleLink}} en {{branchName}}',
      );
      expect(result.detectedVariables).toEqual([
        'patientName',
        'rescheduleLink',
        'branchName',
      ]);
      expect(result.unmappedVariables).toEqual([
        'rescheduleLink',
        'branchName',
      ]);
    });

    it('prevents prototype pollution when malicious keys are passed', () => {
      const template = 'Valor: {{__proto__}} y {{constructor}} y {{patientName}}';
      const context: Record<string, any> = {
        patientName: 'Seguro',
        __proto__: { injected: 'evil' },
        constructor: 'bad',
      };

      const result = service.interpolate(template, context);

      expect(result.renderedText).toBe('Valor:  y  y Seguro');
      expect((Object.prototype as any).injected).toBeUndefined();
    });

    it('escapes HTML values when channel is EMAIL and escapeHtmlValues is enabled', () => {
      const template = 'Hola <b>{{patientName}}</b>';
      const context = {
        patientName: '<script>alert("xss")</script>',
      };

      const result = service.interpolate(template, context, {
        channel: NotificationChannel.EMAIL,
        escapeHtmlValues: true,
      });

      expect(result.renderedText).toBe(
        'Hola <b>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</b>',
      );
    });

    it('does not escape HTML for SMS / WHATSAPP channels by default', () => {
      const template = '*{{organizationName}}*: Cita confirmada';
      const context = {
        organizationName: 'Salud & Bienestar',
      };

      const result = service.interpolate(template, context, {
        channel: NotificationChannel.WHATSAPP,
      });

      expect(result.renderedText).toBe('*Salud & Bienestar*: Cita confirmada');
    });

    it('returns empty structure for empty string or undefined', () => {
      const result = service.interpolate(undefined);
      expect(result.renderedText).toBe('');
      expect(result.detectedVariables).toEqual([]);
      expect(result.unmappedVariables).toEqual([]);
    });
  });

  describe('renderPreview', () => {
    it('renders a complete preview merging default sample values and custom context', () => {
      const preview = service.renderPreview({
        channel: NotificationChannel.EMAIL,
        eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
        subject: 'Cita en {{organizationName}} para {{patientName}}',
        body: 'Hola {{patientName}}, tu cita con {{therapistName}} es el {{appointmentDate}} a las {{appointmentTime}}.',
        customContext: {
          patientName: 'Mariana García',
        },
      });

      expect(preview.renderedSubject).toContain('Mariana García');
      expect(preview.renderedBody).toContain('Mariana García');
      expect(preview.renderedBody).toContain('Dr. Carlos Mendoza'); // From default sample context
      expect(preview.detectedVariables).toContain('patientName');
      expect(preview.detectedVariables).toContain('therapistName');
      expect(preview.channel).toBe(NotificationChannel.EMAIL);
      expect(preview.eventType).toBe(
        NotificationEventType.APPOINTMENT_CONFIRMATION,
      );
    });
  });

  describe('getAvailableVariables', () => {
    it('returns the list of canonical variables with metadata', () => {
      const variables = service.getAvailableVariables();
      expect(variables.length).toBeGreaterThan(5);
      const keys = variables.map((v) => v.key);
      expect(keys).toContain('patientName');
      expect(keys).toContain('therapistName');
      expect(keys).toContain('appointmentDate');
      expect(keys).toContain('appointmentTime');
      expect(keys).toContain('locationOrLink');
      expect(keys).toContain('enlace_teleconsulta');
    });

    it('interpolates enlace_teleconsulta variable correctly', () => {
      const template = 'Accede a tu teleconsulta aquí: {{enlace_teleconsulta}}';
      const context = {
        enlace_teleconsulta: 'https://app.psiqueos.com/teleconsulta/abc123def456ghi7?token=token-uuid-1',
      };
      const result = service.interpolate(template, context);
      expect(result.renderedText).toBe(
        'Accede a tu teleconsulta aquí: https://app.psiqueos.com/teleconsulta/abc123def456ghi7?token=token-uuid-1',
      );
    });
  });
});
