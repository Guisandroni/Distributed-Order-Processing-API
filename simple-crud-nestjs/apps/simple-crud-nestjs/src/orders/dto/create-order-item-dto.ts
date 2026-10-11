import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({
    description: 'Identificador do produto',
    example: 1,
    minimum: 1,
    type: Number,
  })
  @IsInt()
  @Min(1)
  productId!: number;

  @ApiProperty({
    description: 'Quantidade solicitada',
    example: 2,
    minimum: 1,
    type: Number,
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}
