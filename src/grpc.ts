import * as path from 'path';
import { INestApplication, Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

export default function (app: INestApplication) {
  const logger = new Logger();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: ['wallet'],
      url: `${process.env.HOST || 'localhost'}:${process.env.GRPC_PORT || '5000'}`,
      protoPath: [path.join(__dirname, 'wallets/proto/wallet.proto')],
    },
  });

  logger.log(`GRPC start`);
  logger.log(`==========================================================`);
}
