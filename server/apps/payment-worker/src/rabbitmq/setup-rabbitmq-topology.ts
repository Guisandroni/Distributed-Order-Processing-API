import { constants } from '@lib/contracts';
import * as amqp from 'amqplib';

export async function setupRabbitMqTopology() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL!);

  const channel = await connection.createChannel();

  await channel.assertExchange(constants.paymentsDeadLetterExchange, 'direct', {
    durable: true,
  });

  await channel.assertQueue(constants.paymentsDeadLetterQueue, {
    durable: true,
  });
  //relação entre exchance e queue
  await channel.bindQueue(
    constants.paymentsDeadLetterQueue,
    constants.paymentsDeadLetterExchange,
    constants.paymentsDeadLetterRoutingKey,
  );

  await channel.assertQueue(constants.paymentRequestedRetryQueue, {
    durable: true,
    arguments: {
      'x-message-ttl': Number(process.env.RETRY_TTL_MS ?? 5000),
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': constants.paymentsQueue,
    },
  });

  await channel.assertQueue(constants.paymentsResultsQueue, {
    durable: true,
  });

  await channel.assertQueue(constants.paymentsQueue, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': constants.paymentsDeadLetterExchange,
      'x-dead-letter-routing-key': constants.paymentsDeadLetterRoutingKey,
    },
  });

  await channel.close();
  await connection.close();
}
