import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PrismaService, OrderStatus, PaymentStatus, Prisma } from '@lib/prisma';
import { PaymentsPublisher } from '../messaging/messaging.payments.publisher';
import { randomUUID } from 'node:crypto';
import { constants, PaymentRequestedEvent } from '@lib/contracts';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentPublisher: PaymentsPublisher,
  ) {}

  async process(orderId: number, userId: number, correlationId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
      },

      include: {
        payments: true,
        items: true,
      },
    });

    if (!order) {
      // A exceção deve vir do Nest para a camada HTTP responder com status 404.
      // `NotFoundError` do RxJS possui outro propósito e resultaria em erro 500.
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Order with status ${order.status} cannot be paid`,
      );
    }

    if (order.payments) {
      throw new BadRequestException('Order already have payment exists');
    }

    const payment = await this.prisma.$transaction(async (txPrisma) => {
      const payment = await txPrisma.payment.create({
        data: {
          orderId,
          amount: order.total,
          status: PaymentStatus.PROCESSING,
        },
      });

      await txPrisma.order.update({
        where: {
          id: order.id,
        },

        data: {
          status: OrderStatus.PROCESSING,
        },
      });

      // Intenção durável de publicar: o envelope DomainEvent completo vai
      // para o outbox na MESMA transação (aggregateId = order id como string).
      // Nenhum publish direto aqui — o OutboxPublisher entrega depois,
      // então pagar com o broker fora do ar ainda retorna sucesso.
      const envelope: PaymentRequestedEvent = {
        eventId: randomUUID(),
        eventType: constants.paymentRequested,
        occurredAt: new Date().toISOString(),
        correlationId,
        payload: {
          paymentId: payment.id,
          orderId: order.id,
          userId,
          amount: payment.amount.toString(),
        },
      };

      await txPrisma.outboxEvent.create({
        data: {
          eventType: constants.paymentRequested,
          aggregateId: String(order.id),
          payload: envelope as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      return payment;
    });

    return payment;
  }
  create(createPaymentDto: CreatePaymentDto) {
    return 'This action adds a new payment';
  }

  findAll() {
    return this.prisma.payment.findMany();
  }

  findOne(id: number) {
    return `This action returns a #${id} payment`;
  }

  update(id: number, updatePaymentDto: UpdatePaymentDto) {
    return `This action updates a #${id} payment`;
  }

  remove(id: number) {
    return `This action removes a #${id} payment`;
  }
}
