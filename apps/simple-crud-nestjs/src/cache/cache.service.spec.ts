import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { CacheService, REDIS_CLIENT } from './cache.service';

describe('CacheService (T005)', () => {
  let service: CacheService;

  // Fronteira Redis controlada: sem rede, sem broker, sem banco.
  const redisMock = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const configMock = {
    get: jest.fn((key: string, fallback?: string) => fallback),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    configMock.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'CACHE_TTL_MS') return '30000';
      return fallback;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: REDIS_CLIENT, useValue: redisMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('HIT retorna o valor desserializado sem tocar o banco (T005)', async () => {
    // Arrange: Redis devolve o JSON da lista de produtos.
    redisMock.get.mockResolvedValue(JSON.stringify([{ id: 1 }]));

    // Act: leitura pelo seam público do cache.
    const result = await service.get('products:list');

    // Assert: valor pronto, sem escrita ou repopulação.
    expect(result).toEqual([{ id: 1 }]);
    expect(redisMock.get).toHaveBeenCalledWith('products:list');
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('MISS retorna nulo para o chamador repovoar (T005)', async () => {
    // Arrange: chave ausente no Redis.
    redisMock.get.mockResolvedValue(null);

    // Act + Assert: nulo sinaliza miss, sem erro.
    await expect(service.get('products:list')).resolves.toBeNull();
  });

  it('entrada corrompida vira MISS e não quebra a leitura (T005)', async () => {
    // Arrange: valor ilegível armazenado.
    redisMock.get.mockResolvedValue('{{{not-json');

    // Act + Assert: tratada como miss, chamador repovoa por cima.
    await expect(service.get('products:8')).resolves.toBeNull();
  });

  it('Redis fora do ar degrada para nulo com aviso, sem lançar (T005)', async () => {
    // Arrange: conexão recusada em get, set e del.
    const outage = new Error('connect ECONNREFUSED');
    redisMock.get.mockRejectedValue(outage);
    redisMock.set.mockRejectedValue(outage);
    redisMock.del.mockRejectedValue(outage);

    // Act + Assert: fail-open nas três operações.
    await expect(service.get('products:list')).resolves.toBeNull();
    await expect(
      service.set('products:list', [{ id: 1 }]),
    ).resolves.toBeUndefined();
    await expect(service.del('products:list')).resolves.toBeUndefined();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('set serializa em JSON com TTL em milissegundos (T005)', async () => {
    // Arrange: Redis saudável.
    redisMock.set.mockResolvedValue('OK');

    // Act: gravação com TTL explícito.
    await service.set('products:8', { id: 8 }, 30000);

    // Assert: comando com expiração em ms.
    expect(redisMock.set).toHaveBeenCalledWith(
      'products:8',
      JSON.stringify({ id: 8 }),
      'PX',
      30000,
    );
  });

  it('set sem TTL usa o padrão configurado (T005)', async () => {
    // Arrange: Redis saudável, CACHE_TTL_MS=30000.
    redisMock.set.mockResolvedValue('OK');

    // Act: gravação sem TTL explícito.
    await service.set('products:list', [{ id: 1 }]);

    // Assert: cai no padrão da configuração.
    expect(redisMock.set).toHaveBeenCalledWith(
      'products:list',
      JSON.stringify([{ id: 1 }]),
      'PX',
      30000,
    );
  });

  it('del remove as chaves pedidas (T005)', async () => {
    // Arrange: Redis saudável.
    redisMock.del.mockResolvedValue(2);

    // Act: invalidação de lista + item.
    await service.del('products:list', 'products:8');

    // Assert: repasse direto ao Redis.
    expect(redisMock.del).toHaveBeenCalledWith('products:list', 'products:8');
  });
});
