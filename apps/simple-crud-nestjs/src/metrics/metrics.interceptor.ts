import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      method: string;
      url: string;
      route?: { path: string };
    }>();
    const response = http.getResponse<{
      statusCode: number;
      on(event: string, listener: () => void): void;
    }>();
    const started = Date.now();

    // Registra no 'finish': só aqui o statusCode final existe (filtros de
    // exceção rodam depois dos interceptors). Sem rota casada, usa rótulo
    // fixo para não vazar cardinalidade de URLs 404.
    response.on('finish', () => {
      const route =
        typeof request.route?.path === 'string'
          ? request.route.path
          : 'unmatched';
      this.metrics.httpRequest(
        request.method,
        route,
        response.statusCode,
        (Date.now() - started) / 1000,
      );
    });

    return next.handle();
  }
}
