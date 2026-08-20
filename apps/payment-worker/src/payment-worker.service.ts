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
    // const payment = await this.prisma.payment.findFirst({
    //   where: {
    //     id: paymentId,
    //     order: {
    //       userId,
    //     },
    //   },

    //   include: {
    //     order: true,
    //   },
    // });

    // if (!payment) {
    //   throw new NotFoundError('Payment not found');
    // }

    // if (payment.status !== PaymentStatus.PROCESSING) {
    //   throw new BadRequestException(
    //     `Payment with status ${payment.status} cannot be paid`,
    //   );
    // }

    return this.prisma.$transaction(async (txPrisma) => {
      const approvePayment = await this.prisma.payment.update({
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

      return approvePayment;
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
    // const payment = await this.prisma.payment.findFirst({
    //   where: {
    //     id: paymentId,
    //     order: {
    //       userId,
    //     },
    //   },

    //   include: {
    //     order: {
    //       include: {
    //         items: true,
    //       },
    //     },
    //   },
    // });

    // if (!payment) {
    //   throw new NotFoundError('Payment not found');
    // }

    // if (payment.status !== PaymentStatus.PROCESSING) {
    //   throw new BadRequestException(
    //     `Payment with status ${payment.status} cannot be paid`,
    //   );
    // }

    return this.prisma.$transaction(async (txPrisma) => {
      const failedPayment = await this.prisma.payment.update({
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

      //caso realmente o  pagamento de falha, a quantidade da ordem e devolvida ao estoque
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
