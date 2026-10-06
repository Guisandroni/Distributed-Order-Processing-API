import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Counter } from 'prom-client';
import { Redis } from 'ioredis';
import { metricNames } from '@lib/contracts';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const hits = new Counter({
  name: metricNames.cacheHitsTotal,
  help: 'Cache hits by key prefix',
  labelNames: ['key_prefix'],
});

const misses = new Counter({
  name: metricNames.cacheMissesTotal,
  help: 'Cache misses by key prefix (unavailable = Redis unreachable)',
  labelNames: ['key_prefix'],
});

function prefixOf(key: string): string {
  const separator = key.indexOf(':');
  return separator < 0 ? key : key.slice(0, separator);
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);

      if (raw === null) {
        misses.inc({ key_prefix: prefixOf(key) });
        return null;
      }

      try {
        const value = JSON.parse(raw) as T;
        hits.inc({ key_prefix: prefixOf(key) });
        return value;
      } catch {
        // Entrada corrompida: trata como MISS, o chamador repovoa por cima.
        misses.inc({ key_prefix: prefixOf(key) });
        return null;
      }
    } catch (error) {
      // Fail-open: Redis fora do ar nunca quebra a leitura.
      this.logger.warn(
        `Cache get failed for ${key}: ${(error as Error).message}`,
      );
      misses.inc({ key_prefix: 'unavailable' });
      return null;
    }
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    const ttl =
      ttlMs ?? (Number(this.config.get('CACHE_TTL_MS') ?? '30000') || 30000);

    try {
      await this.redis.set(key, JSON.stringify(value), 'PX', ttl);
    } catch (error) {
      this.logger.warn(
        `Cache set failed for ${key}: ${(error as Error).message}`,
      );
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn(
        `Cache del failed for ${keys.join(',')}: ${(error as Error).message}`,
      );
    }
  }
}
