import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TransactionLogDocument = HydratedDocument<TransactionLog>;

export enum TransactionType {
  ROLLBACK = 1,
  TRANSFER = 101,
  TIP = 102,
  CLAIM_TASK = 103,
  GAME_PLAY = 111,
  GAME_RESULT = 112,
  BONUS_REFERRAL = 113,
  PVP = 114,
  PVP_CANCEL = 115,
  LOTTERY_SPIN = 116,
  WITHDRAW = 121,
  DEPOSIT = 131,

  // Future 600-700
  FUTURE_PLACE_ORDER_FEE = 600,
  FUTURE_PLACE_ORDER_MARGIN = 601,
  FUTURE_CLOSE_ORDER_PROFIT = 602,
  FUTURE_SWAP = 603,
  FUTURE_SWAP_V2 = 610,
  FUTURE_REFERRAL_COMMISION = 604,
  FUTURE_VNDC_FEE_PROMOTE = 605,
  FUTURE_FUNDING_FEE = 611,
}

@Schema({
  collection: 'transaction_histories',
})
export class TransactionLog {
  @Prop({
    type: Number,
    required: true,
    index: true,
  })
  userId: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
  })
  assetId: number;

  @Prop({
    type: Number,
    required: true,
    enum: TransactionType,
  })
  transactionType: TransactionType;

  @Prop({
    type: Boolean,
    required: true,
    default: true,
  })
  isMain: boolean;

  @Prop({
    type: Number,
    required: true,
    default: 0,
  })
  moneyUse: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
  })
  moneyBefore: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
  })
  moneyAfter: number;

  @Prop({
    type: String,
    required: false,
  })
  note: string;

  @Prop({
    type: Number,
    required: true,
    default: () => Date.now(),
  })
  timestamp: number;

  @Prop({
    type: String,
    required: true,
    unique: true,
  })
  hash: string;

  @Prop({
    type: Object,
    required: false,
  })
  metadata?: Record<string, any>;
}

export const TransactionLogSchema =
  SchemaFactory.createForClass(TransactionLog);
