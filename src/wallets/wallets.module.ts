import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './schemas/wallet.schema';
import { CalculationScoreService } from './calculation-score.service';
import { Point, PointSchema } from './schemas/point.schema';
import { TipHistory, TipHistorySchema } from './schemas/tip-history.schema';
import { join } from 'path';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Config, GrpcClientConfig } from '../configuration/config.interface';
import { ConfigService } from '@nestjs/config';
import { WALLET_GRPC_CLIENT_NAME } from './constants/common';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: Point.name, schema: PointSchema },
      { name: TipHistory.name, schema: TipHistorySchema },
    ]),
    ClientsModule.registerAsync({
      clients: [
        {
          name: WALLET_GRPC_CLIENT_NAME,
          useFactory: (configService: ConfigService<Config>) => {
            const grpcClient =
              configService.get<GrpcClientConfig>('grpcClient');
            return {
              transport: Transport.GRPC,
              options: {
                package: 'wallet',
                protoPath: join(__dirname, 'proto/wallet.proto'),
                url: grpcClient.wallet.host,
                loader: {
                  keepCase: true,
                },
              },
            };
          },
          inject: [ConfigService],
        },
      ],
    }),
  ],
  controllers: [WalletsController],
  providers: [WalletsService, CalculationScoreService],
  exports: [WalletsService],
})
export class WalletsModule {}
