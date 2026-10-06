import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { register } from 'prom-client';
import request from 'supertest';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController (T018)', () => {
  let app: INestApplication;
  let service: MetricsService;

  beforeEach(async () => {
    register.resetMetrics();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [MetricsService],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('expõe séries Prometheus em texto (T018)', async () => {
    // Arrange: uma métrica de domínio com valor conhecido.
    service.orderCreated();

    // Act + Assert: endpoint de exposição no formato texto.
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect('Content-Type', /text\/plain/);

    expect(response.text).toContain('orders_created_total 1');
  });
});
