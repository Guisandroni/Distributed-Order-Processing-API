import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@lib/prisma';
import { Product } from '../../products/entities/product.entity';

export class OrderItem {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({
    description: 'Preço unitário registrado no momento do pedido',
    example: '249.90',
    type: String,
  })
  unitPrice!: string;

  @ApiProperty({ example: 1 })
  orderId!: number;

  @ApiProperty({ example: 1 })
  productId!: number;

  @ApiPropertyOptional({ type: () => Product })
  product?: Product;
}

export class Order {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PENDING })
  status!: OrderStatus;

  @ApiProperty({
    description: 'Valor total decimal serializado como string',
    example: '499.80',
    type: String,
  })
  total!: string;

  @ApiProperty({ example: 1 })
  userId!: number;

  @ApiPropertyOptional({ type: () => [OrderItem] })
  items?: OrderItem[];

  @ApiProperty({
    example: '2026-08-20T12:00:00.000Z',
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-08-20T12:00:00.000Z',
    format: 'date-time',
  })
  updatedAt!: Date;
}
