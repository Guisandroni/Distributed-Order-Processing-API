import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '@lib/prisma';
import { cacheConstants, productKey } from '@lib/contracts';
import type { Product } from 'generated/prisma/client';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}
  async create(dto: CreateProductDto) {
    const existingProduct = await this.prisma.product.findUnique({
      where: {
        sku: dto.sku,
      },
    });

    if (existingProduct) {
      throw new ConflictException('SKU already exists');
    }
    const data = await this.prisma.product.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
      },
    });

    await this.cache.del(cacheConstants.productsListKey);
    return data;
  }

  async createMany(dto: CreateProductDto[]) {
    const existingProduct = await this.prisma.product.findUnique({
      where: {
        sku: dto[0].sku,
      },
    });

    if (existingProduct) {
      throw new ConflictException('SKU already exists');
    }
    const data = await this.prisma.product.createMany({
      data: dto.map((d) => ({
        sku: d.sku,
        name: d.name,
        description: d.description,
        price: d.price,
        stock: d.stock,
      })),
    });

    await this.cache.del(cacheConstants.productsListKey);
    return data;
  }

  async findAll(): Promise<Product[]> {
    const cached = await this.cache.get<Product[]>(
      cacheConstants.productsListKey,
    );
    if (cached !== null) {
      return cached;
    }

    const data = await this.prisma.product.findMany({
      where: {
        active: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    await this.cache.set(cacheConstants.productsListKey, data);
    return data;
  }

  async findOne(id: number): Promise<Product> {
    const cached = await this.cache.get<Product>(productKey(id));
    if (cached !== null) {
      return cached;
    }

    const data = await this.prisma.product.findUnique({
      where: {
        id,
      },
    });
    if (!data) {
      throw new NotFoundException('Product not found');
    }

    await this.cache.set(productKey(id), data);
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

    const data = await this.prisma.product.update({
      where: {
        id,
      },
      data: dto,
    });

    await this.cache.del(cacheConstants.productsListKey, productKey(id));
    return data;
  }

  async remove(id: number) {
    await this.findOne(id);
    //desativa do db
    const data = await this.prisma.product.update({
      where: {
        id,
      },
      data: {
        active: false,
      },
    });

    await this.cache.del(cacheConstants.productsListKey, productKey(id));
    return data;
  }
}
