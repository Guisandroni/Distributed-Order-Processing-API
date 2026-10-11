import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class Product {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'SKU-001' })
  sku!: string;

  @ApiProperty({ example: 'Teclado mecânico' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Teclado mecânico ABNT2 com switches marrons',
    nullable: true,
  })
  description?: string | null;

  @ApiProperty({
    description: 'Valor decimal serializado como string',
    example: '249.90',
    type: String,
  })
  price!: string;

  @ApiProperty({ example: 25 })
  stock!: number;

  @ApiProperty({ example: true })
  active!: boolean;

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
