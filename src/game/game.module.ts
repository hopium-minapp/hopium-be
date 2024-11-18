import { forwardRef, Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { WalletsModule } from 'src/wallets/wallets.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Turn, TurnSchema } from './schemas/turn.schema';
import { PriceModule } from 'src/price/price.module';
import { UsersModule } from 'src/users/users.module';
import { BullModule } from '@nestjs/bullmq';
import { GAME_PVP_QUEUE_NAME, GAME_QUEUE_NAME } from './constants/queue';
import { GameQueue } from './game.queue';
import { PvPRoom, PvPRoomSchema } from './schemas/pvp-room.schema';
import { TelegramPvPBotModule } from 'src/telegram-pvp-bot/telegram-pvp-bot.module';
import { GamePvPService } from './game-pvp.service';
import { GamePvPQueue } from './game-pvp.queue';
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';
import { Point, PointSchema } from 'src/wallets/schemas/point.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Turn.name, schema: TurnSchema },
      { name: PvPRoom.name, schema: PvPRoomSchema },
      { name: Point.name, schema: PointSchema },
    ]),
    BullModule.registerQueue(
      {
        name: GAME_QUEUE_NAME,
        defaultJobOptions: {
          removeOnFail: true,
          removeOnComplete: true,
        },
      },
      {
        name: GAME_PVP_QUEUE_NAME,
        defaultJobOptions: {
          removeOnFail: true,
          removeOnComplete: true,
        },
      },
    ),
    WalletsModule,
    PriceModule,
    forwardRef(() => TelegramPvPBotModule),
    forwardRef(() => TelegramBotModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [GameController],
  providers: [GameService, GameQueue, GamePvPService, GamePvPQueue],
  exports: [GameService, GamePvPService],
})
export class GameModule {}
