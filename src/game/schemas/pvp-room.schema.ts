import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Target, Type } from '../type/pvp.type';

export type PvPRoomDocument = PvPRoom & Document;

@Schema({ timestamps: true })
export class PvPRoom {
  @Prop({ required: true })
  creatorId: number;

  @Prop({ required: true })
  acceptorId: number;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, enum: Target })
  target: Target; // e.g., 'pump' or 'dump'

  @Prop({ required: true })
  openPrice: number;

  @Prop()
  closePrice: number;

  @Prop({
    type: Number,
    index: true,
  })
  winnerId: number;

  @Prop()
  volumeWinning: number;

  @Prop({ required: true })
  chatId: number;

  @Prop({ required: true })
  messageId: number;

  @Prop({
    enum: Type,
  })
  type: Type;
}

export const PvPRoomSchema = SchemaFactory.createForClass(PvPRoom);
