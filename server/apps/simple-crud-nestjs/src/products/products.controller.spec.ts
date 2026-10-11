import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { AuthGuard } from '../auth/auth.guard';

describe('ProductsController', () => {
  let controller: ProductsController;

  const productsServiceMock = {};
  const authGuardMock = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        // Injetar o service real exigiria também PrismaService. Para testar a
        // construção do controller, basta fornecer o contrato como mock.
        { provide: ProductsService, useValue: productsServiceMock },
      ],
    })
      // @UseGuards registra um enhancer do Nest. `overrideGuard` substitui
      // esse enhancer; apenas adicionar AuthGuard em providers não o substitui.
      .overrideGuard(AuthGuard)
      .useValue(authGuardMock)
      .compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
