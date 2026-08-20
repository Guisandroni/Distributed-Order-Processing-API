import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import type { AuthenticatedRequest } from '../auth/types/jwt-payload.type';
import { AuthGuard } from '../auth/auth.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // @UseGuards(AuthGuard)
  // @Post('payments/:id/fail')
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

  @Get()
  findAll() {
    return this.paymentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsService.update(+id, updatePaymentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(+id);
  }
}
