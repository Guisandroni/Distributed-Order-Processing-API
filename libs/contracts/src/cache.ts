export const cacheConstants = {
  productsListKey: 'products:list',
  productKeyPrefix: 'products:',
  defaultTtlMs: 30000,
} as const;

export const metricNames = {
  httpRequestsTotal: 'http_requests_total',
  httpRequestDurationSeconds: 'http_request_duration_seconds',
  ordersCreatedTotal: 'orders_created_total',
  ordersCancelledTotal: 'orders_cancelled_total',
  paymentsRequestedTotal: 'payments_requested_total',
  paymentsApprovedTotal: 'payments_approved_total',
  paymentsFailedTotal: 'payments_failed_total',
  workerProcessingSeconds: 'worker_processing_seconds',
  rabbitmqPublishedTotal: 'rabbitmq_published_total',
  rabbitmqConsumedTotal: 'rabbitmq_consumed_total',
  rabbitmqFailedTotal: 'rabbitmq_failed_total',
  cacheHitsTotal: 'cache_hits_total',
  cacheMissesTotal: 'cache_misses_total',
} as const;

export function productKey(id: number | string): string {
  return `${cacheConstants.productKeyPrefix}${id}`;
}
