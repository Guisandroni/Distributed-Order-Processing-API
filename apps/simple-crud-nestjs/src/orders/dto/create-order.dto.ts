import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item-dto';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  //each : valida cada objeto dentro
  @ValidateNested({ each: true })
  // informa a classe a ser usado como tipo
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
