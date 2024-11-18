import { Status } from '../type/task.type';
import { HydratedDocument } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type UserTaskDocument = HydratedDocument<UserTask>;

@Schema({
  timestamps: true,
  collection: 'users_tasks',
})
export class UserTask {
  @Prop({
    type: Number,
    required: true,
  })
  userId: number; // Telegram user ID

  @Prop({
    type: Number,
    required: true,
  })
  taskId: number;

  @Prop({
    type: String,
    required: true,
    enum: Status,
  })
  status: Status;

  @Prop({
    type: Date,
    required: true,
    default: new Date(),
  })
  completedAt: Date;

  @Prop({
    type: Date,
    required: true,
    default: new Date(),
  })
  claimedAt: Date;
}

export const UserTaskSchema = SchemaFactory.createForClass(UserTask);

UserTaskSchema.index({ userId: 1, taskId: 1 }, { unique: true });
