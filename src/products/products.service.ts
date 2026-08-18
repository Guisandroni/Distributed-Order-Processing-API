import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(dto: CreateProductDto) {
    const existingProduct = await this.prisma.product.findUnique({
      where: {
        sku: dto.sku,
      },
    });

    if (existingProduct) {
      throw new ConflictException('SKU already exists');
    }
    const data = this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
      },
    });

    return data;
  }

  async findAll() {
    const data = await this.prisma.product.findMany({
      where: {
        active: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return data;
  }

  async findOne(id: number) {
    const data = await this.prisma.product.findUnique({
      where: {
        id,
      },
    });
    if (!data) {
      throw new NotFoundException('Product not found');
    }
    return data;
  }

  async update(id: number, dto: UpdateProductDto) {
    await this.findOne(id);

    if (dto.sku) {
      const productWithSameSku = await this.prisma.product.findUnique({
        where: {
          sku: dto.sku,
        },
      });

      if (productWithSameSku && productWithSameSku.id !== id) {
        throw new ConflictException('SKU already exists');
      }
    }

    return this.prisma.product.update({
      where: {
        id,
      },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    //desativa do db
    const data = this.prisma.product.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
    });
    return data;
  }
}
