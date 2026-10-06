import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-correlation-id';

// Fonte única do correlationId HTTP: cabeçalho recebido ou gerado.
// Escreve de volta no cabeçalho para que qualquer camada (pino genReqId
// ou código da app, em qualquer ordem de middleware) convirja no mesmo id.
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(
    req: Request & { id?: string; correlationId?: string },
    res: Response,
    next: NextFunction,
  ): void {
    const incoming = req.headers[CORRELATION_HEADER];
    const fromHeader = Array.isArray(incoming) ? incoming[0] : incoming;
    const id =
      (typeof req.id === 'string' && req.id.length > 0 ? req.id : undefined) ??
      fromHeader ??
      randomUUID();

    req.correlationId = id;
    req.headers[CORRELATION_HEADER] = id;
    res.setHeader(CORRELATION_HEADER, id);
    next();
  }
}
