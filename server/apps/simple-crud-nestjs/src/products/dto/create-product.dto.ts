import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Identificador comercial único do produto',
    example: 'SKU-001',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  sku!: string;

  @ApiProperty({
    description: 'Nome do produto',
    example: 'Teclado mecânico',
    maxLength: 150,
  })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({
    description: 'Descrição detalhada do produto',
    example: 'Teclado mecânico ABNT2 com switches marrons',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Preço unitário com até duas casas decimais',
    example: 249.9,
    minimum: 0,
    type: Number,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({
    description: 'Quantidade disponível em estoque',
    example: 25,
    minimum: 0,
    type: Number,
  })
  @IsInt()
  @Min(0)
  stock!: number;
}
