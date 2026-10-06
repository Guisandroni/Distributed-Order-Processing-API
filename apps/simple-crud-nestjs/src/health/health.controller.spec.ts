import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  MicroserviceHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '@lib/prisma';
import request from 'supertest';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';

describe('HealthController (T009)', () => {
  let app: INestApplication;

  const healthCheckServiceMock = {
    check: jest.fn(),
  };
  const prismaIndicatorMock = {
    pingCheck: jest.fn(),
  };
  const microserviceIndicatorMock = {
    pingCheck: jest.fn(),
  };
  const redisIndicatorMock = {
    pingCheck: jest.fn(),
  };
  const prismaMock = {};
  const configMock = {
    getOrThrow: jest.fn(),
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckServiceMock },
        { provide: PrismaHealthIndicator, useValue: prismaIndicatorMock },
        {
          provide: MicroserviceHealthIndicator,
          useValue: microserviceIndicatorMock,
        },
        { provide: RedisHealthIndicator, useValue: redisIndicatorMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde 200 com database/broker/cache saudáveis (T009)', async () => {
    // Arrange: terminus agrega os três indicadores como saudáveis.
    healthCheckServiceMock.check.mockResolvedValue({
      status: 'ok',
      info: {
        database: { status: 'up' },
        broker: { status: 'up' },
        cache: { status: 'up' },
      },
      error: {},
      details: {
        database: { status: 'up' },
        broker: { status: 'up' },
        cache: { status: 'up' },
      },
    });

    // Act + Assert: contrato de saúde verde.
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      info: {
        database: { status: 'up' },
        broker: { status: 'up' },
        cache: { status: 'up' },
      },
    });
    expect(healthCheckServiceMock.check).toHaveBeenCalledTimes(1);
  });

  it('responde 503 quando uma dependência está fora do ar (T009)', async () => {
    // Arrange: Redis caiu — terminus agrega com status de erro.
    healthCheckServiceMock.check.mockResolvedValue({
      status: 'error',
      info: {
        database: { status: 'up' },
        broker: { status: 'up' },
      },
      error: {
        cache: { status: 'down' },
      },
      details: {
        database: { status: 'up' },
        broker: { status: 'up' },
        cache: { status: 'down' },
      },
    });

    // Act + Assert: contrato de saúde vermelho (payload do terminus direto).
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'error',
      error: {
        cache: { status: 'down' },
      },
    });
  });
});
