import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task, TaskSchema } from './schemas/task.schema';
import { WalletsModule } from 'src/wallets/wallets.module';
import { UserTask, UserTaskSchema } from './schemas/user-task.schema';
import { UserTaskLog, UserTaskLogSchema } from './schemas/user-task-log.schema';
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { PvPRoom, PvPRoomSchema } from 'src/game/schemas/pvp-room.schema';
import { LotteryModule } from 'src/lottery/lottery.module';
import { Turn, TurnSchema } from 'src/game/schemas/turn.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: UserTask.name, schema: UserTaskSchema },
      { name: UserTaskLog.name, schema: UserTaskLogSchema },
      { name: User.name, schema: UserSchema },
      { name: PvPRoom.name, schema: PvPRoomSchema },
      { name: Turn.name, schema: TurnSchema },
    ]),
    WalletsModule,
    TelegramBotModule,
    LotteryModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
