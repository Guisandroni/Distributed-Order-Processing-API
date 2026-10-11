import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@lib/prisma';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;

  // O mock representa somente os métodos do Prisma usados pelo service.
  // Assim cada teste controla o "banco" sem abrir uma conexão PostgreSQL.
  const prismaMock = {
    product: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  // A fixture usa valores literais conhecidos. Ela é reutilizada apenas para
  // preparar cenários; os valores esperados não são recalculados pelo teste.
  const productFixture = {
    id: 10,
    sku: 'LAPTOP-001',
    name: 'Laptop',
    description: 'Computador portátil',
    price: '4600.00',
    stock: 240,
    active: true,
  };

  beforeEach(async () => {
    // Limpa chamadas e respostas anteriores para manter os casos isolados.
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        // ProductsService exige PrismaService no construtor. `useValue`
        // substitui essa dependência real pelo mock definido acima.
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('retorna o produto encontrado pelo ID', async () => {
    // Arrange: o Prisma encontra a fixture para o ID consultado.
    prismaMock.product.findUnique.mockResolvedValue(productFixture);

    // Act: chamamos somente a interface pública do service.
    const result = await service.findOne(10);

    // Assert: protegemos tanto o retorno quanto o filtro enviado à fronteira.
    expect(result).toBe(productFixture);
    expect(prismaMock.product.findUnique).toHaveBeenCalledWith({
      where: { id: 10 },
    });
  });

  it('rejeita quando o produto não existe', async () => {
    // Arrange: `null` representa ausência de registro no Prisma.
    prismaMock.product.findUnique.mockResolvedValue(null);

    // Act + Assert: o service converte ausência em erro público do Nest.
    await expect(service.findOne(999)).rejects.toEqual(
      new NotFoundException('Product not found'),
    );
  });

  it('rejeita a criação quando o SKU já existe', async () => {
    // Arrange: a primeira consulta encontra outro produto com o mesmo SKU.
    prismaMock.product.findUnique.mockResolvedValue(productFixture);

    // Act + Assert: SKU duplicado é conflito e nenhuma escrita deve ocorrer.
    await expect(
      service.create({
        sku: 'LAPTOP-001',
        name: 'Laptop novo',
        description: 'Outro produto',
        price: 5000,
        stock: 5,
      }),
    ).rejects.toEqual(new ConflictException('SKU already exists'));
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it('cria um produto quando o SKU está disponível', async () => {
    // Arrange: a busca não encontra conflito e create devolve o novo produto.
    const dto = {
      sku: 'MOUSE-001',
      name: 'Mouse',
      description: 'Mouse sem fio',
      price: 150.5,
      stock: 20,
    };
    const createdProduct = { id: 11, ...dto, active: true };
    prismaMock.product.findUnique.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue(createdProduct);

    // Act: executamos a criação pelo método público.
    const result = await service.create(dto);

    // Assert: o retorno e os dados persistidos devem preservar o DTO.
    expect(result).toBe(createdProduct);
    expect(prismaMock.product.create).toHaveBeenCalledWith({
      data: dto,
    });
  });

  it('lista somente produtos ativos do mais recente para o mais antigo', async () => {
    // Arrange: o Prisma devolve a lista já filtrada e ordenada.
    const products = [productFixture];
    prismaMock.product.findMany.mockResolvedValue(products);

    // Act: solicitamos o catálogo público.
    const result = await service.findAll();

    // Assert: a query expressa as regras de visibilidade e ordenação.
    expect(result).toBe(products);
    expect(prismaMock.product.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('rejeita atualização quando o novo SKU pertence a outro produto', async () => {
    // Arrange: a primeira resposta é o produto atualizado; a segunda é o
    // produto de outro ID que já possui o SKU solicitado.
    prismaMock.product.findUnique
      .mockResolvedValueOnce(productFixture)
      .mockResolvedValueOnce({ ...productFixture, id: 11, sku: 'MOUSE-001' });

    // Act + Assert: o conflito impede a escrita de atualização.
    await expect(service.update(10, { sku: 'MOUSE-001' })).rejects.toEqual(
      new ConflictException('SKU already exists'),
    );
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it('atualiza quando o SKU consultado pertence ao próprio produto', async () => {
    // Arrange: findOne e a consulta por SKU devolvem o mesmo ID.
    const updatedProduct = { ...productFixture, name: 'Laptop Pro' };
    prismaMock.product.findUnique
      .mockResolvedValueOnce(productFixture)
      .mockResolvedValueOnce(productFixture);
    prismaMock.product.update.mockResolvedValue(updatedProduct);

    // Act: alteramos o nome mantendo o SKU atual.
    const result = await service.update(10, {
      sku: 'LAPTOP-001',
      name: 'Laptop Pro',
    });

    // Assert: a atualização usa o ID e somente os campos solicitados.
    expect(result).toBe(updatedProduct);
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { sku: 'LAPTOP-001', name: 'Laptop Pro' },
    });
  });

  it('remove logicamente o produto sem apagá-lo do banco', async () => {
    // Arrange: o produto existe e a atualização devolve a versão inativa.
    const inactiveProduct = { ...productFixture, active: false };
    prismaMock.product.findUnique.mockResolvedValue(productFixture);
    prismaMock.product.update.mockResolvedValue(inactiveProduct);

    // Act: `remove` representa desativação neste domínio.
    const result = await service.remove(10);

    // Assert: não há delete; a fronteira recebe `active: false`.
    expect(result).toBe(inactiveProduct);
    expect(prismaMock.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { active: false },
    });
  });
});
