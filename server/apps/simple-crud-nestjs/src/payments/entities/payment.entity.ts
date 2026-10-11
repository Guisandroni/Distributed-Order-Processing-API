import { ApiProperty } from '@nestjs/swagger';
import { PaymentStatus } from '@lib/prisma';

export class Payment {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PROCESSING })
  status!: PaymentStatus;

  @ApiProperty({
    description: 'Valor decimal serializado como string',
    example: '499.80',
    type: String,
  })
  amount!: string;

  @ApiProperty({ example: 1 })
  orderId!: number;

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
