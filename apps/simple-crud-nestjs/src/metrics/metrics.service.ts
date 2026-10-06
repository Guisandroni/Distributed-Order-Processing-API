import { Injectable } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';
import { metricNames } from '@lib/contracts';

const httpRequests = new Counter({
  name: metricNames.httpRequestsTotal,
  help: 'HTTP requests by method, route and status',
  labelNames: ['method', 'route', 'status'],
});

const httpDuration = new Histogram({
  name: metricNames.httpRequestDurationSeconds,
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
});

const ordersCreated = new Counter({
  name: metricNames.ordersCreatedTotal,
  help: 'Orders created',
});

const ordersCancelled = new Counter({
  name: metricNames.ordersCancelledTotal,
  help: 'Orders cancelled',
});

const paymentsRequested = new Counter({
  name: metricNames.paymentsRequestedTotal,
  help: 'Payments requested',
});

const paymentsApproved = new Counter({
  name: metricNames.paymentsApprovedTotal,
  help: 'Payments approved',
});

const paymentsFailed = new Counter({
  name: metricNames.paymentsFailedTotal,
  help: 'Payments failed',
});

const workerProcessing = new Histogram({
  name: metricNames.workerProcessingSeconds,
  help: 'Worker processing time in seconds',
});

const rabbitmqPublished = new Counter({
  name: metricNames.rabbitmqPublishedTotal,
  help: 'RabbitMQ messages published by queue',
  labelNames: ['queue'],
});

const rabbitmqConsumed = new Counter({
  name: metricNames.rabbitmqConsumedTotal,
  help: 'RabbitMQ messages consumed by queue',
  labelNames: ['queue'],
});

const rabbitmqFailed = new Counter({
  name: metricNames.rabbitmqFailedTotal,
  help: 'RabbitMQ failures by queue and classification',
  labelNames: ['queue', 'classification'],
});

@Injectable()
export class MetricsService {
  httpRequest(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    httpRequests.inc({ method, route, status: String(status) });
    httpDuration.observe({ method, route }, durationSeconds);
  }

  orderCreated(): void {
    ordersCreated.inc();
  }

  orderCancelled(): void {
    ordersCancelled.inc();
  }

  paymentRequested(): void {
    paymentsRequested.inc();
  }

  paymentApproved(): void {
    paymentsApproved.inc();
  }

  paymentFailed(): void {
    paymentsFailed.inc();
  }

  workerObserved(durationSeconds: number): void {
    workerProcessing.observe(durationSeconds);
  }

  rabbitmqPublished(queue: string): void {
    rabbitmqPublished.inc({ queue });
  }

  rabbitmqConsumed(queue: string): void {
    rabbitmqConsumed.inc({ queue });
  }

  rabbitmqFailed(queue: string, classification: string): void {
    rabbitmqFailed.inc({ queue, classification });
  }

  snapshot(): Promise<string> {
    return register.metrics();
  }
}
