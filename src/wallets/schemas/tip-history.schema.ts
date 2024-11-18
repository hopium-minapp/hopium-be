import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TipHistoryDocument = HydratedDocument<TipHistory>;

@Schema({
  collection: 'tip_histories',
})
export class TipHistory {
  @Prop({
    type: Number,
    required: true,
    index: true,
  })
  senderId: number;

  @Prop({
    type: Number,
    required: true,
    index: true,
  })
  receiverId: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
  })
  amount: number;

  @Prop({
    type: Object,
    required: false,
  })
  metadata?: Record<string, any>;

  @Prop({
    type: Number,
    required: true,
    default: () => Date.now(),
  })
  timestamp: number;
}

export const TipHistorySchema = SchemaFactory.createForClass(TipHistory);
