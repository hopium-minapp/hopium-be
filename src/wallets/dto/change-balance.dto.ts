import { TransactionType } from '../schemas/transaction-log.schema';

export class ChangeBalanceDto {
  userId: number;
  assetId: number;
  amount: number = 0;
  transactionType: TransactionType;
  metadata?: Record<string, any>;
  note?: string;
}

export class ChangeLockedDto {
  userId: number;
  assetId: number;
  amount: number = 0;
  transactionType: TransactionType;
  metadata?: Record<string, any>;
  note?: string;
}
