import { Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService, REDIS_CLIENT } from './cache.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const client = new Redis(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
          {
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            // Sem teto, as retentativas seguram o event loop para sempre
            // (foi o que travou o e2e sem Redis no ar). Comandos falham
            // rápido e o fail-open do CacheService assume.
            retryStrategy: (times: number) =>
              times > 5 ? null : Math.min(times * 200, 2000),
          },
        );
        // Sem listener, um 'error' de conexão derrubaria o processo.
        // O fail-open por comando vive no CacheService; aqui só contemos o evento.
        client.on('error', (error: Error) => {
          new Logger('Redis').warn(`Redis connection issue: ${error.message}`);
        });
        return client;
      },
    },
    CacheService,
  ],
  exports: [CacheService, REDIS_CLIENT],
})
export class CacheModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    // Libera sockets/timers para o processo (e o jest) encerrar limpo.
    this.redis.disconnect();
  }
}
