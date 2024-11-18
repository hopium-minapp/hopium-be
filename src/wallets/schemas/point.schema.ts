import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PointDocument = HydratedDocument<Point>;

@Schema({
  timestamps: true,
  collection: 'points',
})
export class Point {
  @Prop({
    type: Number,
    required: true,
  })
  _id: number; // Telegram user ID

  @Prop({
    type: Number,
    required: true,
    default: 0,
    index: -1,
  })
  point: number;

  @Prop({ default: 0, index: -1 })
  pointPvP: number;
}

export const PointSchema = SchemaFactory.createForClass(Point);
