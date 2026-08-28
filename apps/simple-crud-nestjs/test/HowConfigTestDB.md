

Criando um banco de dados para testes

imagem docker para teste em postgresql

comando para executar o container 
  docker compose -f docker-compose.test.yml up -d --wait


definindo url de teste do banco de dados

DATABASE_URL_TEST="postgresql://test:test@127.0.0.1:2021/order_platform_test"

No terminal 

export DATABASE_URL_TEST="postgresql://test:test@127.0.0.1:2021/order_platform_test"

depois de definir a variável de ambiente, execute as migrations do orm

DATABASE_URL="$DATABASE_URL_TEST" pnpm exec prisma migrate deploy

ou

DATABASE_URL="postgresql://test:test@127.0.0.1:2021/order_platform_test" \ pnpm exec prisma migrate deploy


Executar os testes

DATABASE_URL="$DATABASE_URL_TEST" pnpm test:integration

DATABASE_URL="$DATABASE_URL_TEST" pnpm test:e2e


encerrar o container de teste

docker compose -f docker-compose.test.yml down




Usando container do rabbitmq para testes de mensageria


no terminal 
export RABBITMQ_URL_TEST=amqp://test:test@localhost:5672
