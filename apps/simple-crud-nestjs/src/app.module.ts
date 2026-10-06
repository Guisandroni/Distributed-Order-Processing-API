import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { UsersModule } from './users/users.module';
import { PrismaModule } from '@lib/prisma';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { MessagingModule } from './messaging/messaging.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import {
  CORRELATION_HEADER,
  CorrelationMiddleware,
} from './middleware/correlation.middleware';

function correlationOf(req: {
  id?: unknown;
  headers?: Record<string, unknown>;
}): string {
  const fromId = typeof req?.id === 'string' && req.id ? req.id : undefined;
  const header = req?.headers?.[CORRELATION_HEADER];
  const fromHeader =
    typeof header === 'string'
      ? header
      : Array.isArray(header)
        ? String(header[0] ?? '')
        : undefined;
  return fromId ?? (fromHeader ? fromHeader : undefined) ?? randomUUID();
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Mesma fonte do CorrelationMiddleware: cabeçalho (que o
        // middleware escreve de volta) → req.id → gerar. Converge em
        // qualquer ordem de execução dos middlewares.
        genReqId: (context) => correlationOf(context),
        customProps: (context) => ({
          correlationId: correlationOf(context),
        }),
      },
    }),

    ScheduleModule.forRoot(),

    PrismaModule,
    UsersModule,
    AuthModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    MessagingModule,
    CacheModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
