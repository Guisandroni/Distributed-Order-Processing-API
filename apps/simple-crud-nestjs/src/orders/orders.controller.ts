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

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @UseGuards(AuthGuard)
  @Post()
  create(
    @Body() createOrderDto: CreateOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ordersService.create(createOrderDto, request.user.sub);
  }

  @UseGuards(AuthGuard)
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ordersService.cancel(id, request.user.sub);
  }

  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(+id, updateOrderDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ordersService.remove(+id);
  }

  @UseGuards(AuthGuard)
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
