import { PrismaService, OrderStatus, PaymentStatus } from '@lib/prisma';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class PaymentWorkerService {
  constructor(private readonly prisma: PrismaService) {}

  async processRequestedPayment(paymentId: number) {
    const payment = await this.prisma.payment.findUnique({
      where: {
        id: paymentId,
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
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== PaymentStatus.PROCESSING) {
      return payment;
    }
    const approved = Math.random() < 0.8;

    if (approved) {
      return this.approve(payment);
    }

    return this.fail(payment);
  }

  private async approve(payment: { id: number; orderId: number }) {
    return this.prisma.$transaction(async (txPrisma) => {
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

  private async fail(payment: {
    id: number;
    orderId: number;
    order: {
      items: {
        productId: number;
        quantity: number;
      }[];
    };
  }) {
    return this.prisma.$transaction(async (txPrisma) => {
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
