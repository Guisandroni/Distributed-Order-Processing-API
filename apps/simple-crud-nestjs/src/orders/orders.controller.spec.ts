import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { AuthGuard } from '../auth/auth.guard';

describe('OrdersController', () => {
  let controller: OrdersController;

  const ordersServiceMock = {};
  const paymentsServiceMock = {};
  const authGuardMock = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        // O controller recebe dois services. Mocks evitam construir toda a
        // árvore de Prisma e mensageria em um teste unitário do controller.
        { provide: OrdersService, useValue: ordersServiceMock },
        { provide: PaymentsService, useValue: paymentsServiceMock },
      ],
    })
      // O AuthGuard vem do decorator de classe, não do construtor. Por isso o
      // TestingModuleBuilder precisa sobrescrever o guard como enhancer.
      .overrideGuard(AuthGuard)
      .useValue(authGuardMock)
      .compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
