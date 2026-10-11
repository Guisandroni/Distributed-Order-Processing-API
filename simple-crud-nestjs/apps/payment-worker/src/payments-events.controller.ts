import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Controller } from '@nestjs/common';
import { Channel, ConsumeMessage } from 'amqplib';
import { PaymentWorkerService } from './payment-worker.service';
import type { PaymentRequestedEvent } from '../../../libs/contracts/src/payment-events';
import { constants } from '../../../libs/contracts/src/payment-events';
import { NonRetryableError } from '../../../libs/contracts/src/processing-errors';

const DEFAULT_MAX_RETRIES = 3;

// A contagem de tentativas vem do histórico de expirações da retry queue.
// Cada TTL expirado incrementa a entrada da retry queue no `x-death`, então
// tentativa atual = expirações anteriores + 1 (primeira entrega = tentativa 1).
function currentAttempt(message: ConsumeMessage): number {
  const deaths = message.properties?.headers?.['x-death'] as
    Array<{ queue?: unknown; count?: unknown }> | undefined;
  if (!Array.isArray(deaths)) {
    return 1;
  }
  const entry = deaths.find(
    (death) => death?.queue === constants.paymentRequestedRetryQueue,
  );
  const prior = typeof entry?.count === 'number' ? entry.count : 0;
  return prior + 1;
}

@Controller()
export class PaymentEventsController {
  constructor(private readonly paymentWorkerService: PaymentWorkerService) {}
  @EventPattern(constants.paymentRequestedEvent)
  async handlePaymentRequested(
    @Payload() event: PaymentRequestedEvent,
    @Ctx() context: RmqContext,
  ) {
    const parsedMaxRetries = Number(
      process.env.MAX_RETRIES ?? DEFAULT_MAX_RETRIES,
    );
    const maxRetries =
      Number.isFinite(parsedMaxRetries) && parsedMaxRetries > 0
        ? Math.floor(parsedMaxRetries)
        : DEFAULT_MAX_RETRIES;
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;
    const paymentId = event?.payload?.paymentId;

    try {
      console.log(
        `${event.correlationId} - Payment requested received: ${paymentId}`,
      );
      const payment =
        await this.paymentWorkerService.processRequestedPayment(event);

      console.log(`Payment ${payment.id}: ${payment.status}`);
      channel.ack(message);
    } catch (error) {
      const attempt = currentAttempt(message);
      const permanent = error instanceof NonRetryableError;

      // Erro permanente ou tentativas esgotadas: a DLX da fila principal
      // roteia para a DLQ. Requeue imediato (`requeue=true`) é proibido por
      // causar loop infinito entre erro e reprocessamento.
      if (permanent || attempt >= maxRetries) {
        console.error(
          `${event?.correlationId} - Payment ${paymentId} → DLQ (attempt ${attempt}, permanent=${permanent})`,
          error,
        );
        channel.nack(message, false, false);
        return;
      }

      // Falha temporária com tentativas restantes: republica o conteúdo
      // original na retry queue preservando propriedades/cabeçalhos. O
      // `x-death` é preservado de propósito para o broker incrementar a
      // contagem na próxima expiração. A original só é confirmada após a
      // republicação para nunca perder a mensagem entre as filas.
      console.error(
        `${event?.correlationId} - Payment ${paymentId} → retry (attempt ${attempt}/${maxRetries})`,
        error,
      );
      channel.sendToQueue(
        constants.paymentRequestedRetryQueue,
        message.content,
        { ...(message.properties as object) },
      );
      channel.ack(message);
    }
  }
}
