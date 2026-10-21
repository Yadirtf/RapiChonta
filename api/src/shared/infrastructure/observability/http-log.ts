import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { withoutQuery } from './scrub';

const logger = new Logger('HTTP');

/** Una línea por petición: método, ruta sin consulta, estado y duración. El estado de salud no se registra. */
export function httpLog(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const path = withoutQuery(req.originalUrl);
    if (path.endsWith('/health')) return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const line = `${req.method} ${path} ${res.statusCode} ${ms.toFixed(0)} ms`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
  next();
}
