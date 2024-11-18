import { Observable } from 'rxjs';
import { Metadata } from '@grpc/grpc-js';
import { ChangeBalanceDto, ChangeLockedDto } from '../dto/change-balance.dto';

export type Wallet = {
  userId: number;
  assetId: number;
  balance: number;
  locked: number;
  available: number;
};

export type CreateWalletDto = {
  userId: number;
  assetId: number;
  balance: number;
};

export type TransactionHistory = {
  userId: number;
  assetId: number;
  transactionType: number;
  isMain: boolean;
  moneyUse: number;
  moneyBefore: number;
  moneyAfter: number;
  note: string;
  hash: string;
  metadata?: Record<string, any>;
};

export type IncreasePointRequest = {
  userId: number;
  point: number;
  pointPvP: number;
};

export type TransferAssetDto = {
  senderId: number;
  receiverId: number;
  amount: number;
  assetId: number;
  transactionType: number;
};

export type SuccessResult = {
  success: boolean;
};

export interface GrpcWalletService {
  getBalance(
    data: {
      userId: number;
      assetId: number;
    },
    metadata: Metadata,
  ): Observable<Wallet>;
  getAllBalance(
    data: { userId: number },
    metadata: Metadata,
  ): Observable<{ wallets: Wallet[] }>;
  createWallet(data: CreateWalletDto, metadata: Metadata): Observable<Wallet>;
  changeBalance(
    data: ChangeBalanceDto,
    metadata: Metadata,
  ): Observable<TransactionHistory>;
  changeLocked(
    data: ChangeLockedDto,
    metadata: Metadata,
  ): Observable<TransactionHistory>;
  rollbackWallet(
    data: { transactionHistories: TransactionHistory[] },
    metadata: Metadata,
  ): Observable<SuccessResult>;
  increasePoint(
    data: IncreasePointRequest,
    metadata: Metadata,
  ): Observable<SuccessResult>;
  transferAsset(
    data: TransferAssetDto,
    metadata: Metadata,
  ): Observable<SuccessResult>;
}
