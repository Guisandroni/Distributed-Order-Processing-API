import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';

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

    let total = new Prisma.Decimal(0);
    for (const item of createOrderDto.items) {
      const product = products.find(
        (products) => products.id === item.productId,
      );

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insuficient stock for product ${product.name}`,
        );
      }

      total = total.add(product.price.mul(item.quantity));
    }

    return this.prisma.$transaction(async (txPrisma) => {
      const order = await txPrisma.order.create({
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

      for (const item of createOrderDto.items) {
        await txPrisma.product.update({
          where: {
            id: item.productId,
          },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }
      return order;
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
