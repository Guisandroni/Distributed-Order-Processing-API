import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PrismaService, OrderStatus, PaymentStatus } from '@lib/prisma';
import { PaymentsPublisher } from '../messaging/messaging.payments.publisher';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentPublisher: PaymentsPublisher,
  ) {}

  async process(orderId: number, userId: number) {
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
      return payment;
    });

    this.paymentPublisher.publishPaymentRequested({
      paymentId: payment.id,
      orderId: order.id,
      userId,
      amount: payment.amount.toString(),
    });

    return payment;
  }

  // private async approve(payment: { id: number; orderId: number }) {
  //   // const payment = await this.prisma.payment.findFirst({
  //   //   where: {
  //   //     id: paymentId,
  //   //     order: {
  //   //       userId,
  //   //     },
  //   //   },

  //   //   include: {
  //   //     order: true,
  //   //   },
  //   // });

  //   // if (!payment) {
  //   //   throw new NotFoundError('Payment not found');
  //   // }

  //   // if (payment.status !== PaymentStatus.PROCESSING) {
  //   //   throw new BadRequestException(
  //   //     `Payment with status ${payment.status} cannot be paid`,
  //   //   );
  //   // }

  //   return this.prisma.$transaction(async (txPrisma) => {
  //     const approvePayment = await this.prisma.payment.update({
  //       where: {
  //         id: payment.id,
  //       },
  //       data: {
  //         status: PaymentStatus.APPROVED,
  //       },
  //     });

  //     await txPrisma.order.update({
  //       where: {
  //         id: payment.orderId,
  //       },

  //       data: {
  //         status: OrderStatus.PAID,
  //       },
  //     });

  //     return approvePayment;
  //   });
  // }

  // private async fail(payment: {
  //   id: number;
  //   orderId: number;
  //   order: {
  //     items: {
  //       productId: number;
  //       quantity: number;
  //     }[];
  //   };
  // }) {
  //   // const payment = await this.prisma.payment.findFirst({
  //   //   where: {
  //   //     id: paymentId,
  //   //     order: {
  //   //       userId,
  //   //     },
  //   //   },

  //   //   include: {
  //   //     order: {
  //   //       include: {
  //   //         items: true,
  //   //       },
  //   //     },
  //   //   },
  //   // });

  //   // if (!payment) {
  //   //   throw new NotFoundError('Payment not found');
  //   // }

  //   // if (payment.status !== PaymentStatus.PROCESSING) {
  //   //   throw new BadRequestException(
  //   //     `Payment with status ${payment.status} cannot be paid`,
  //   //   );
  //   // }

  //   return this.prisma.$transaction(async (txPrisma) => {
  //     const failedPayment = await this.prisma.payment.update({
  //       where: {
  //         id: payment.id,
  //       },
  //       data: {
  //         status: PaymentStatus.FAILED,
  //       },
  //     });

  //     await txPrisma.order.update({
  //       where: {
  //         id: payment.orderId,
  //       },

  //       data: {
  //         status: OrderStatus.FAILED,
  //       },
  //     });

  //     //caso realmente o  pagamento de falha, a quantidade da ordem e devolvida ao estoque
  //     for (const item of payment.order.items) {
  //       await txPrisma.product.update({
  //         where: {
  //           id: item.productId,
  //         },
  //         data: {
  //           stock: {
  //             increment: item.quantity,
  //           },
  //         },
  //       });
  //     }

  //     return failedPayment;
  //   });
  // }

  // async processRequestedPayment(paymentId: number) {
  //   const payment = await this.prisma.payment.findUnique({
  //     where: {
  //       id: paymentId,
  //     },

  //     include: {
  //       order: {
  //         include: {
  //           items: true,
  //         },
  //       },
  //     },
  //   });

  //   if (!payment) {
  //     throw new NotFoundException('Payment not found');
  //   }

  //   if (payment.status !== PaymentStatus.PROCESSING) {
  //     return payment;
  //   }
  //   const approved = Math.random() < 0.8;

  //   if (approved) {
  //     return this.approve(payment);
  //   }

  //   return this.fail(payment);
  // }

  create(createPaymentDto: CreatePaymentDto) {
    return 'This action adds a new payment';
  }

  findAll() {
    return `This action returns all payments`;
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
