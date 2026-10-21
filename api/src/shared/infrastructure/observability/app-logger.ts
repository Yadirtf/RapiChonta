import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { currentRequestId } from './request-context';
import { scrubText } from './scrub';

/**
 * Logs en JSON de una línea (fácil de filtrar en SnapDeploy o en cualquier colector) con el id de la petición.
 * En desarrollo, sin LOG_FORMAT=json, se ve el formato legible de siempre.
 */
export class AppLogger extends ConsoleLogger {
  static create(): AppLogger {
    const json = (process.env.LOG_FORMAT ?? (process.env.NODE_ENV === 'production' ? 'json' : 'pretty')) === 'json';
    return new AppLogger({ json, colors: !json, compact: json ? true : undefined });
  }

  protected getJsonLogObject(message: unknown, options: { context: string; logLevel: LogLevel; writeStreamType?: 'stdout' | 'stderr'; errorStack?: unknown }) {
    const requestId = currentRequestId();
    return { ...super.getJsonLogObject(typeof message === 'string' ? scrubText(message) : message, options), ...(requestId ? { requestId } : {}) };
  }
}
