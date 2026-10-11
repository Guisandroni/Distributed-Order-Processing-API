import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService, OrderStatus, Prisma } from '@lib/prisma';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}
  async create(createOrderDto: CreateOrderDto, userId: number) {
    const productsIds = [
      ...new Set(createOrderDto.items.map((item) => item.productId)),
    ];

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: productsIds,
        },
        active: true,
      },
    });

    if (products.length !== productsIds.length) {
      throw new NotFoundException(
        'One or more products do not exist or are inactive',
      );
    }

    const requestedQuantityByProduct = new Map<number, number>();
    let total = new Prisma.Decimal(0);

    for (const item of createOrderDto.items) {
      const product = products.find((product) => product.id === item.productId);

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      requestedQuantityByProduct.set(
        item.productId,
        (requestedQuantityByProduct.get(item.productId) ?? 0) + item.quantity,
      );
      total = total.add(product.price.mul(item.quantity));
    }

    for (const [productId, quantity] of requestedQuantityByProduct) {
      const product = products.find((product) => product.id === productId)!;

      if (product.stock < quantity) {
        throw new BadRequestException(
          `Insuficient stock for product ${product.name}`,
        );
      }
    }

    return this.prisma.$transaction(async (txPrisma) => {
      for (const [productId, quantity] of requestedQuantityByProduct) {
        // A condição e o decremento formam uma única escrita atômica no
        // PostgreSQL. Duas transações não conseguem reservar a mesma unidade.
        const reservation = await txPrisma.product.updateMany({
          where: {
            id: productId,
            active: true,
            stock: {
              gte: quantity,
            },
          },
          data: {
            stock: {
              decrement: quantity,
            },
          },
        });

        if (reservation.count !== 1) {
          const product = products.find((product) => product.id === productId)!;
          throw new BadRequestException(
            `Insuficient stock for product ${product.name}`,
          );
        }
      }

      return txPrisma.order.create({
        data: {
          userId,
          total,
          items: {
            create: createOrderDto.items.map((item) => {
              const product = products.find(
                (product) => product.id === item.productId,
              )!;
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: product.price,
              };
            }),
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    });
  }

  async cancel(id: number, userId: number) {
    const order = await this.prisma.order.findFirst({
      //pedido de tal id pertencente ao user de tal id
      where: {
        id,
        userId,
      },

      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Only pending ${order.status} can be cancelled`,
      );
    }

    return this.prisma.$transaction(async (txPrisma) => {
      const cancelledOrder = await txPrisma.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: OrderStatus.CANCELLED,
        },
      });

      for (const item of order.items) {
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

      return cancelledOrder;
    });
  }

  findAll() {
    return this.prisma.order.findMany();
  }
  findOne(id: number) {
    return `This action returns a #${id} order`;
  }

  update(id: number, updateOrderDto: UpdateOrderDto) {
    return `This action updates a #${id} order`;
  }

  remove(id: number) {
    return `This action removes a #${id} order`;
  }
}
