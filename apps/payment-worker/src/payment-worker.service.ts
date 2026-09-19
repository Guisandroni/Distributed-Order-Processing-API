import { PrismaService, OrderStatus, PaymentStatus, Prisma } from '@lib/prisma';
import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { NonRetryableError } from '../../../libs/contracts/src/processing-errors';
import {
  constants,
  type PaymentApprovedEvent,
  type PaymentFailedEvent,
  type PaymentRequestedEvent,
} from '../../../libs/contracts/src/payment-events';

// Motivo da falha simulada (ramo de declínio): sem segredos, só a decisão.
const DECLINED_REASON = 'Payment declined by processor';

// Subconjunto imutável do pagamento para montar o envelope de resultado.
type ResultSource = {
  id: number;
  orderId: number;
  amount: { toString(): string };
  order: { userId: number };
};

// Corrida entre a pré-leitura do claim e a inserção na transação: a
// perdedora recebe P2002 e tem o mesmo destino da duplicata (ack, sem escrita).
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PaymentWorkerService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(constants.paymentsResultsClient)
    private readonly resultsClient: ClientProxy,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.resultsClient.connect();
  }

  async processRequestedPayment(event: PaymentRequestedEvent) {
    const payment = await this.prisma.payment.findUnique({
      where: {
        id: event?.payload?.paymentId,
      },

      include: {
        order: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NonRetryableError('Payment not found');
    }

    // Entrega duplicada (o claim já existe — ex.: crash entre commit e ack):
    // retorna o pagamento atual intocado para o consumer confirmar (ack).
    const seen = await this.prisma.processedEvent.findUnique({
      where: { eventId: event.eventId },
    });
    if (seen) {
      return payment;
    }

    if (payment.status !== PaymentStatus.PROCESSING) {
      throw new NonRetryableError(
        `Payment with status ${payment.status} cannot be processed`,
      );
    }

    try {
      const approved = Math.random() < 0.8;

      // `return await` de propósito: a rejeição (ex.: P2002 do claim em
      // corrida) precisa passar por este catch para virar duplicata-ack.
      // Um `return` seco adotaria a rejeição sem acionar o catch.
      if (approved) {
        const result = await this.approve(payment, event);
        // Resultado sai DEPOIS do commit — nunca no caminho de duplicata
        // (retornos antecipados acima) nem em falha.
        this.emitApproved(event, payment);
        return result;
      }

      const result = await this.fail(payment, event);
      this.emitFailed(event, payment);
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return payment;
      }
      throw error;
    }
  }

  private emitApproved(
    origin: PaymentRequestedEvent,
    payment: ResultSource,
  ): void {
    const envelope: PaymentApprovedEvent = {
      eventId: randomUUID(),
      eventType: constants.paymentApproved,
      occurredAt: new Date().toISOString(),
      correlationId: origin.correlationId,
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        userId: payment.order.userId,
        amount: payment.amount.toString(),
      },
    };
    this.resultsClient.emit(constants.paymentApprovedEvent, envelope);
  }

  private emitFailed(
    origin: PaymentRequestedEvent,
    payment: ResultSource,
  ): void {
    const envelope: PaymentFailedEvent = {
      eventId: randomUUID(),
      eventType: constants.paymentFailed,
      occurredAt: new Date().toISOString(),
      correlationId: origin.correlationId,
      payload: {
        paymentId: payment.id,
        orderId: payment.orderId,
        userId: payment.order.userId,
        amount: payment.amount.toString(),
        reason: DECLINED_REASON,
      },
    };
    this.resultsClient.emit(constants.paymentFailedEvent, envelope);
  }

  private async approve(
    payment: { id: number; orderId: number },
    event: PaymentRequestedEvent,
  ) {
    return this.prisma.$transaction(async (txPrisma) => {
      // Claim de idempotência primeiro: violação de unicidade ⇒ duplicata ⇒
      // rollback só do claim, sem nenhuma escrita de negócio.
      await txPrisma.processedEvent.create({
        data: { eventId: event.eventId, eventType: event.eventType },
      });

      // Todas as escritas usam `txPrisma`. Usar `this.prisma` aqui faria a
      // atualização do pagamento escapar do rollback da transação.
      const approvedPayment = await txPrisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: PaymentStatus.APPROVED,
        },
      });

      await txPrisma.order.update({
        where: {
          id: payment.orderId,
        },
        data: {
          status: OrderStatus.PAID,
        },
      });

      return approvedPayment;
    });
  }

  private async fail(
    payment: {
      id: number;
      orderId: number;
      order: {
        items: {
          productId: number;
          quantity: number;
        }[];
      };
    },
    event: PaymentRequestedEvent,
  ) {
    return this.prisma.$transaction(async (txPrisma) => {
      // Claim de idempotência primeiro (mesma regra do approve).
      await txPrisma.processedEvent.create({
        data: { eventId: event.eventId, eventType: event.eventType },
      });

      // Pagamento, pedido e reposição de estoque formam uma única operação.
      // Se qualquer escrita falhar, o PostgreSQL pode reverter todas elas.
      const failedPayment = await txPrisma.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: PaymentStatus.FAILED,
        },
      });

      await txPrisma.order.update({
        where: {
          id: payment.orderId,
        },
        data: {
          status: OrderStatus.FAILED,
        },
      });

      // Quando o pagamento falha, cada item reservado volta ao estoque.
      for (const item of payment.order.items) {
        await txPrisma.product.update({
          where: {
            id: item.productId,
          },
          data: {
            stock: {
              increment: item.quantity,
            },
          },
        });
      }

      return failedPayment;
    });
  }
}
