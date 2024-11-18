import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CalculationScoreService } from './calculation-score.service';
import { ChangeBalanceDto, ChangeLockedDto } from './dto/change-balance.dto';
import { Asset, WALLET_GRPC_CLIENT_NAME } from './constants/common';
import { GetBalanceDto } from './dto/get-balance.dto';
import { CreateWalletDto } from './dto/create-wallet.dto';
import {
  GrpcWalletService,
  TransactionHistory,
} from './interfaces/wallet.interface';
import { Metadata } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import { Config, GrpcClientConfig } from '../configuration/config.interface';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { TipHistory } from './schemas/tip-history.schema';
import { TransactionType } from './schemas/transaction-log.schema';

@Injectable()
export class WalletsService implements OnModuleInit {
  private grpcWalletService: GrpcWalletService;
  private authMetadata = new Metadata();

  constructor(
    private readonly configService: ConfigService<Config>,
    @Inject(WALLET_GRPC_CLIENT_NAME) private client: ClientGrpc,
    private readonly calculationScoreService: CalculationScoreService,
    @InjectModel(TipHistory.name)
    private readonly tipHistoryModel: Model<TipHistory>,
  ) {}

  onModuleInit() {
    const grpcClient = this.configService.get<GrpcClientConfig>('grpcClient');
    this.grpcWalletService =
      this.client.getService<GrpcWalletService>('WalletsService');
    this.authMetadata.add('apikey', grpcClient.wallet.authApiKey);
  }

  async getOrCreateWallet(data: { userId: number; isPremium: boolean }) {
    const assetId = Asset.HOPIUM;
    const balance = this.calculationScoreService.calculateScore(
      data.userId,
      data.isPremium,
    );

    return await this.createWallet({
      userId: data.userId,
      assetId,
      balance,
      locked: 0,
    });
  }

  async getAllBalance(userId: number) {
    const wallets = await firstValueFrom(
      this.grpcWalletService.getAllBalance({ userId }, this.authMetadata),
    );

    return wallets.wallets.reduce((acc, wallet) => {
      acc[wallet.assetId] = {
        assetId: wallet.assetId,
        balance: +wallet.balance,
        locked: +wallet.locked,
        available: wallet.available,
      };
      return acc;
    }, {});
  }

  async getBalance(data: GetBalanceDto) {
    const wallet = await firstValueFrom(
      this.grpcWalletService.getBalance(data, this.authMetadata),
    );

    return {
      userId: data.userId,
      assetId: data.assetId,
      balance: wallet.balance,
      locked: wallet.locked,
      available: wallet.available,
    };
  }

  async createWallet(data: CreateWalletDto) {
    return await firstValueFrom(
      this.grpcWalletService.createWallet(data, this.authMetadata),
    );
  }

  async changeBalance(data: ChangeBalanceDto) {
    return await firstValueFrom(
      this.grpcWalletService.changeBalance(data, this.authMetadata),
    );
  }

  async changeLocked(data: ChangeLockedDto) {
    return await firstValueFrom(
      this.grpcWalletService.changeLocked(data, this.authMetadata),
    );
  }

  async rollbackWallet(data: TransactionHistory[]) {
    if (!data.length) {
      return;
    }
    return await firstValueFrom(
      this.grpcWalletService.rollbackWallet(
        { transactionHistories: data },
        this.authMetadata,
      ),
    );
  }

  async increasePoint(userId: number, point: number, pointPvP: number = 0) {
    return await firstValueFrom(
      this.grpcWalletService.increasePoint(
        { userId, point, pointPvP },
        this.authMetadata,
      ),
    );
  }

  async tipHopium(senderId: number, receiverId: number, amount: number) {
    const result = await firstValueFrom(
      this.grpcWalletService.transferAsset(
        {
          senderId,
          receiverId,
          amount,
          assetId: Asset.HOPIUM,
          transactionType: TransactionType.TIP,
        },
        this.authMetadata,
      ),
    );

    if (result.success) {
      await this.tipHistoryModel.create({
        senderId,
        receiverId,
        amount,
        timestamp: Date.now(),
      });
    }
  }
}
