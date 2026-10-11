import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { AuthGuard } from '../auth/auth.guard';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  const paymentsServiceMock = {};
  const authGuardMock = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        // O controller precisa apenas do contrato do service. Usar o service
        // real criaria também as dependências PrismaService e PaymentsPublisher.
        { provide: PaymentsService, useValue: paymentsServiceMock },
      ],
    })
      // @UseGuards registra um enhancer do Nest. `overrideGuard` substitui
      // esse enhancer; apenas adicionar AuthGuard em providers não o substitui.
      .overrideGuard(AuthGuard)
      .useValue(authGuardMock)
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
