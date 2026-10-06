import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { CacheModule } from '../cache/cache.module';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';

@Module({
  // PrismaModule é global; ConfigModule global vem do AppModule.
  imports: [TerminusModule.forRoot(), ConfigModule, CacheModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
