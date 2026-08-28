import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '@lib/prisma';
import { AppModule } from './../src/app.module';
import { PaymentsPublisher } from './../src/messaging/messaging.payments.publisher';

const databaseUrl = process.env.DATABASE_URL_TEST;

if (
  !databaseUrl ||
  !databaseUrl.includes('order_platform_test') ||
  !databaseUrl.includes(':2021/')
) {
  throw new Error(
    'DATABASE_URL_TEST deve apontar para order_platform_test na porta 2021',
  );
}

describe('Order platform API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const publisherMock = {
    publishPaymentRequested: jest.fn(),
  };

  async function registerAndGetToken(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Usuário E2E',
        email,
        password: 'StrongPass@123',
        dateOfBirth: '1990-01-01',
      })
      .expect(202);

    return response.body.acessToken as string;
  }

  async function createProduct(
    token: string,
    data: { sku: string; name: string; price: number; stock: number },
  ): Promise<{ id: number; stock: number }> {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(data)
      .expect(201);

    return response.body as { id: number; stock: number };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'e2e-secret-key';
    process.env.RABBITMQ_URL = 'amqp://test:test@127.0.0.1:5672';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PaymentsPublisher)
      .useValue(publisherMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    publisherMock.publishPaymentRequested.mockReset();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth', () => {
    it('registra um usuário e não expõe a senha', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Ana E2E',
          email: 'ana.e2e@example.test',
          password: 'StrongPass@123',
          dateOfBirth: '1995-05-20',
        })
        .expect(202);

      expect(response.body).toMatchObject({
        user: {
          name: 'Ana E2E',
          email: 'ana.e2e@example.test',
        },
      });
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.acessToken).toEqual(expect.any(String));
    });

    it('autentica credenciais válidas e retorna o token JWT', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Bruno E2E',
          email: 'bruno.e2e@example.test',
          password: 'StrongPass@123',
          dateOfBirth: '1992-02-10',
        })
        .expect(202);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'bruno.e2e@example.test',
          password: 'StrongPass@123',
        })
        .expect(200);

      expect(response.body).toEqual({
        acessToken: expect.any(String),
      });
    });

    it('rejeita uma senha inválida sem revelar qual credencial falhou', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Carla E2E',
          email: 'carla.e2e@example.test',
          password: 'StrongPass@123',
          dateOfBirth: '1993-03-15',
        })
        .expect(202);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'carla.e2e@example.test',
          password: 'WrongPass@123',
        })
        .expect(401);

      expect(response.body.message).toBe('Email ou senha invalidos');
    });

    it('protege rotas privadas quando o Bearer token está ausente', async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .send({
          sku: 'AUTH-GUARD-E2E',
          name: 'Produto protegido',
          price: 10,
          stock: 1,
        })
        .expect(401);

      expect(response.body.message).toBe('Token nao informado');
    });
  });

  describe('Orders', () => {
    it('cria um pedido autenticado e reduz o estoque observado pela API', async () => {
      const token = await registerAndGetToken('order-create@example.test');
      const product = await createProduct(token, {
        sku: 'ORDER-CREATE-E2E',
        name: 'Produto do pedido',
        price: 10.5,
        stock: 5,
      });

      const orderResponse = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: product.id, quantity: 2 }],
        })
        .expect(201);

      expect(orderResponse.body).toMatchObject({
        userId: expect.any(Number),
        status: 'PENDING',
      });
      expect(orderResponse.body.items).toHaveLength(1);

      const productResponse = await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(200);
      expect(productResponse.body.stock).toBe(3);
    });

    it('rejeita pedido sem estoque e preserva a quantidade disponível', async () => {
      const token = await registerAndGetToken(
        'order-insufficient@example.test',
      );
      const product = await createProduct(token, {
        sku: 'ORDER-INSUFFICIENT-E2E',
        name: 'Produto limitado',
        price: 20,
        stock: 1,
      });

      const orderResponse = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: product.id, quantity: 2 }],
        })
        .expect(400);
      expect(orderResponse.body.message).toBe(
        'Insuficient stock for product Produto limitado',
      );

      const productResponse = await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(200);
      expect(productResponse.body.stock).toBe(1);
    });

    it('aceita apenas um de dois pedidos simultâneos para a última unidade', async () => {
      const token = await registerAndGetToken('order-race@example.test');
      const product = await createProduct(token, {
        sku: 'ORDER-RACE-E2E',
        name: 'Última unidade',
        price: 30,
        stock: 1,
      });
      const orderBody = {
        items: [{ productId: product.id, quantity: 1 }],
      };

      const responses = await Promise.all([
        request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${token}`)
          .send(orderBody),
        request(app.getHttpServer())
          .post('/orders')
          .set('Authorization', `Bearer ${token}`)
          .send(orderBody),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 400,
      ]);
      const productResponse = await request(app.getHttpServer())
        .get(`/products/${product.id}`)
        .expect(200);
      expect(productResponse.body.stock).toBe(0);
    });
  });

  describe('Fluxo principal', () => {
    it('registra, autentica, cria produto, cria pedido e solicita pagamento', async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Cliente principal',
          email: 'main-flow@example.test',
          password: 'StrongPass@123',
          dateOfBirth: '1991-04-20',
        })
        .expect(202);

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'main-flow@example.test',
          password: 'StrongPass@123',
        })
        .expect(200);
      const token = loginResponse.body.acessToken as string;

      const productResponse = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sku: 'MAIN-FLOW-E2E',
          name: 'Produto principal',
          price: 25,
          stock: 3,
        })
        .expect(201);

      const orderResponse = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ productId: productResponse.body.id, quantity: 2 }],
        })
        .expect(201);

      const paymentResponse = await request(app.getHttpServer())
        .post(`/orders/${orderResponse.body.id}/payment`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(paymentResponse.body).toMatchObject({
        orderId: orderResponse.body.id,
        status: 'PROCESSING',
        amount: '50',
      });
      expect(publisherMock.publishPaymentRequested).toHaveBeenCalledWith({
        paymentId: paymentResponse.body.id,
        orderId: orderResponse.body.id,
        userId: registerResponse.body.user.id,
        amount: '50',
      });

      const finalProductResponse = await request(app.getHttpServer())
        .get(`/products/${productResponse.body.id}`)
        .expect(200);
      expect(finalProductResponse.body.stock).toBe(1);

      await request(app.getHttpServer())
        .post(`/orders/${orderResponse.body.id}/payment`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });
});
