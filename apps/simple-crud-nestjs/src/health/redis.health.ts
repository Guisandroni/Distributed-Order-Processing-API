import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../cache/cache.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly health: HealthIndicatorService,
  ) {}

  pingCheck(key = 'cache', timeoutMs = 1000) {
    return this.health
      .check(key)
      .attempt(async () => {
        // PING nunca consome nem altera nada; falha ⇒ status down, sem throw no endpoint.
        const pong = await this.redis.ping();
        if (pong !== 'PONG') {
          throw new Error(`Unexpected PING response: ${pong}`);
        }
      })
      .withTimeout(timeoutMs);
  }
}
