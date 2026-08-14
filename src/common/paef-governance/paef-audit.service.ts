import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PaefAuditService {
  private readonly logger = new Logger(PaefAuditService.name);
  private readonly auditLogPath: string;

  constructor() {
    this.auditLogPath = path.resolve(process.cwd(), '.paef', 'audit.jsonl');
  }

  /**
   * Redacts sensitive keys / secrets from any log string or payload.
   */
  private redactSecrets(text: string): string {
    return text
      .replace(/(bearer\s+)[a-zA-Z0-9_\-.]{8,}/gi, '$1[REDACTED_SECRET]')
      .replace(
        /(password|secret|token|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-.]{8,})['"]?/gi,
        '$1:[REDACTED_SECRET]',
      )
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_OPENAI_KEY]');
  }

  /**
   * Records a governed execution or AI interaction event into append-only JSONL log.
   */
  public recordExecution(event: {
    commandName: string;
    contextScope: string;
    actorIdentity: string;
    summary: string;
    details?: Record<string, unknown>;
  }): void {
    try {
      const record = {
        executionId: `EXEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        runtimeVersion: '0.1.0',
        timestampUtc: new Date().toISOString(),
        ...event,
      };

      const rawJson = JSON.stringify(record);
      const sanitized = this.redactSecrets(rawJson);

      const dir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.appendFileSync(this.auditLogPath, `${sanitized}\n`, 'utf8');
      this.logger.debug(
        `[PAEF Audit] Recorded execution '${record.executionId}' for scope '${event.contextScope}'`,
      );
    } catch (err) {
      this.logger.error(
        `[PAEF Audit] Failed to write audit record: ${(err as Error).message}`,
      );
    }
  }
}
