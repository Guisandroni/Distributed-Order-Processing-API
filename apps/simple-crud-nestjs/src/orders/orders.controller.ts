import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { AuthGuard } from '../auth/auth.guard';
import { PaymentsService } from '../payments/payments.service';
import type { AuthenticatedRequest } from '../auth/types/jwt-payload.type';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Order } from './entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';

@ApiTags('orders')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado' })
@UseGuards(AuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @ApiOperation({ summary: 'Criar pedido' })
  @ApiCreatedResponse({
    description: 'Pedido criado e estoque reservado',
    type: Order,
  })
  @ApiBadRequestResponse({
    description: 'Pedido inválido ou estoque insuficiente',
  })
  @ApiNotFoundResponse({
    description: 'Um ou mais produtos não foram encontrados',
  })
  @Post()
  create(
    @Body() createOrderDto: CreateOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ordersService.create(createOrderDto, request.user.sub);
  }

  @ApiOperation({ summary: 'Cancelar pedido pendente' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiCreatedResponse({
    description: 'Pedido cancelado e estoque devolvido',
    type: Order,
  })
  @ApiBadRequestResponse({ description: 'O pedido não pode ser cancelado' })
  @ApiNotFoundResponse({ description: 'Pedido não encontrado' })
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ordersService.cancel(id, request.user.sub);
  }

  @ApiOperation({ summary: 'Listar pedidos' })
  @ApiOkResponse({ type: [Order] })
  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @ApiOperation({ summary: 'Buscar pedido por ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: String })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id);
  }

  @ApiOperation({ summary: 'Atualizar pedido' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: String })
  @ApiBadRequestResponse({ description: 'Dados do pedido inválidos' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(+id, updateOrderDto);
  }

  @ApiOperation({ summary: 'Remover pedido' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: String })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ordersService.remove(+id);
  }

  @ApiOperation({ summary: 'Solicitar pagamento do pedido' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiCreatedResponse({
    description: 'Pagamento criado e enviado para processamento',
    type: Payment,
  })
  @ApiBadRequestResponse({ description: 'Pedido não pode ser pago' })
  @ApiNotFoundResponse({ description: 'Pedido não encontrado' })
  @Post(':id/payment')
  payment(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.paymentsService.process(id, request.user.sub);
  }

  // @UseGuards(AuthGuard)
  // @Post('payments/:id/approve')
  // approvePayment(
  //   @Param('id', ParseIntPipe) id: number,
  //   @Req() request: AuthenticatedRequest,
  // ) {
  //   return this.paymentsService.approve(id, request.user.sub);
  // }

  // @UseGuards(AuthGuard)
  // @Post('payments/:id/fail')
  // failPayment(
  //   @Param('id', ParseIntPipe) id: number,
  //   @Req() request: AuthenticatedRequest,
  // ) {
  //   return this.paymentsService.fail(id, request.user.sub);
  // }
}
