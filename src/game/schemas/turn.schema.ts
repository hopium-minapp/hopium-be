import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Side, State, TurnResult } from '../type/turn.type';
import { MAX_WIN_STREAK } from '../constants/game';

export type TurnDocument = HydratedDocument<Turn>;

@Schema({
  collection: 'turns',
})
export class Turn {
  @Prop({
    type: Number,
    required: true,
    index: true,
  })
  userId: number;

  @Prop({
    type: Number,
    required: true,
  })
  margin: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
  })
  profit: number;

  @Prop({
    type: Number,
    required: true,
  })
  openPrice: number;

  @Prop({
    type: String,
    required: true,
    enum: Side,
  })
  side: Side;

  @Prop({
    type: String,
    required: true,
    enum: State,
    default: State.OPEN,
  })
  state: State;

  @Prop({
    type: String,
    required: false,
    enum: TurnResult,
  })
  result?: TurnResult;

  @Prop({
    type: Number,
    required: false,
  })
  closePrice?: number;

  @Prop({
    type: Number,
    required: true,
  })
  openTime: number;

  @Prop({
    type: Number,
    required: false,
  })
  closeTime?: number;

  @Prop({
    type: Number,
    required: false,
    min: 0,
    max: MAX_WIN_STREAK,
  })
  winStreak?: number;
}

export const TurnSchema = SchemaFactory.createForClass(Turn);
