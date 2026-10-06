import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckService,
  MicroserviceHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { PrismaService } from '@lib/prisma';
import { constants } from '@lib/contracts';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check() {
    const result = await this.health.check([
      () => this.db.pingCheck('database', this.prisma).withTimeout(2000),
      () =>
        this.microservice
          .pingCheck<MicroserviceOptions>('broker', {
            transport: Transport.RMQ,
            options: {
              urls: [this.config.getOrThrow<string>('RABBITMQ_URL')],
              queue: constants.paymentsQueue,
              // Mesmos argumentos da topologia: redeclarar sem eles
              // quebraria o canal com PRECONDITION_FAILED.
              queueOptions: {
                durable: true,
                arguments: {
                  'x-dead-letter-exchange':
                    constants.paymentsDeadLetterExchange,
                  'x-dead-letter-routing-key':
                    constants.paymentsDeadLetterRoutingKey,
                },
              },
            },
          })
          .withTimeout(2000),
      () => this.redisIndicator.pingCheck('cache'),
    ]);

    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
