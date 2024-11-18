import { forwardRef, Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { UsersModule } from 'src/users/users.module';
import { WalletsModule } from 'src/wallets/wallets.module';
import { GameModule } from 'src/game/game.module';
import { BullModule } from '@nestjs/bullmq';
import { BOT_QUEUE_NAME } from './telegram-bot.constants';
import { BotQueue } from './telegram-bot.queue';
import { TelegramPvPBotModule } from 'src/telegram-pvp-bot/telegram-pvp-bot.module';

@Module({
  controllers: [],
  imports: [
    WalletsModule,
    forwardRef(() => GameModule),
    forwardRef(() => UsersModule),
    BullModule.registerQueue({
      name: BOT_QUEUE_NAME,
      defaultJobOptions: {
        removeOnFail: true,
        removeOnComplete: true,
      },
    }),
    TelegramPvPBotModule,
  ],
  providers: [TelegramBotService, BotQueue],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
