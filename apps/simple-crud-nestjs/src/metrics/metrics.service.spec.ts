import { register } from 'prom-client';
import { MetricsService } from './metrics.service';

describe('MetricsService (T017)', () => {
  let service: MetricsService;

  async function valueOf(
    baseName: string,
    sampleName: string,
    labels: Record<string, string> = {},
  ): Promise<number> {
    const snapshot = await register.getMetricsAsJSON();
    const metric = snapshot.find((item) => item.name === baseName);
    // Histogramas expõem _bucket/_sum/_count como amostras com metricName
    // próprio dentro da métrica base.
    const entry = metric?.values.find((sample) => {
      const name =
        (sample as { metricName?: string }).metricName ?? metric?.name;
      if (name !== sampleName) {
        return false;
      }
      const sampleLabels = (sample.labels ?? {}) as Record<string, string>;
      return Object.entries(labels).every(
        ([key, value]) => sampleLabels[key] === value,
      );
    });
    return typeof entry?.value === 'number' ? entry.value : 0;
  }

  beforeEach(() => {
    register.resetMetrics();
    service = new MetricsService();
  });

  it('registra requisição HTTP com rótulos exatos e duração (T017)', async () => {
    // Act: uma requisição parametrizada concluída.
    service.httpRequest('GET', '/products/:id', 200, 0.042);

    // Assert: contador e histograma com os rótulos dados.
    await expect(
      valueOf('http_requests_total', 'http_requests_total', {
        method: 'GET',
        route: '/products/:id',
        status: '200',
      }),
    ).resolves.toBe(1);
    await expect(
      valueOf(
        'http_request_duration_seconds',
        'http_request_duration_seconds_count',
        {
          method: 'GET',
          route: '/products/:id',
        },
      ),
    ).resolves.toBe(1);
  });

  it('contadores de domínio incrementam por evento (T017)', async () => {
    // Act: um ciclo pedido→pagamento aprovado.
    service.orderCreated();
    service.paymentRequested();
    service.paymentApproved();

    // Assert: cada série soma uma unidade.
    await expect(
      valueOf('orders_created_total', 'orders_created_total'),
    ).resolves.toBe(1);
    await expect(
      valueOf('payments_requested_total', 'payments_requested_total'),
    ).resolves.toBe(1);
    await expect(
      valueOf('payments_approved_total', 'payments_approved_total'),
    ).resolves.toBe(1);
    await expect(
      valueOf('payments_failed_total', 'payments_failed_total'),
    ).resolves.toBe(0);
  });

  it('falhas de mensageria carregam a classificação (T017)', async () => {
    // Act: consumo com falha permanente.
    service.rabbitmqFailed('payments_queue', 'permanent');

    // Assert: rótulo de classificação preservado.
    await expect(
      valueOf('rabbitmq_failed_total', 'rabbitmq_failed_total', {
        queue: 'payments_queue',
        classification: 'permanent',
      }),
    ).resolves.toBe(1);
  });

  it('observação do worker alimenta o histograma (T017)', async () => {
    // Act: processamento concluído.
    service.workerObserved(1.25);

    // Assert: uma observação registrada.
    await expect(
      valueOf('worker_processing_seconds', 'worker_processing_seconds_count'),
    ).resolves.toBe(1);
  });
});
