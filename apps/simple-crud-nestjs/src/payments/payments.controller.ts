import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('payments')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido ou expirado' })
@UseGuards(AuthGuard)
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

  @ApiOperation({ summary: 'Listar pagamentos' })
  @ApiOkResponse({ type: String })
  @Get()
  findAll() {
    return this.paymentsService.findAll();
  }

  @ApiOperation({ summary: 'Buscar pagamento por ID' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: String })
  @ApiNotFoundResponse({ description: 'Pagamento não encontrado' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(+id);
  }

  @ApiOperation({ summary: 'Atualizar pagamento' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: String })
  @ApiBadRequestResponse({ description: 'Dados do pagamento inválidos' })
  @ApiNotFoundResponse({ description: 'Pagamento não encontrado' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentsService.update(+id, updatePaymentDto);
  }

  @ApiOperation({ summary: 'Remover pagamento' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: String })
  @ApiNotFoundResponse({ description: 'Pagamento não encontrado' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentsService.remove(+id);
  }
}
