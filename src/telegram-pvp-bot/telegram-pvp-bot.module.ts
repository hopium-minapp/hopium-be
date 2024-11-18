import { forwardRef, Module } from '@nestjs/common';
import { GameModule } from 'src/game/game.module';
import { UsersModule } from 'src/users/users.module';
import { TelegramPvPBotService } from './telegram-pvp-bot.service';
import { WalletsModule } from 'src/wallets/wallets.module';
import { PvPQueue } from './telegram-pvp-bot.queue';
import { BullModule } from '@nestjs/bullmq';
import { PVP_QUEUE_NAME } from './telegram-pvp-bot.constants';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => GameModule),
    WalletsModule,
    BullModule.registerQueue({
      name: PVP_QUEUE_NAME,
      defaultJobOptions: {
        removeOnFail: true,
        removeOnComplete: true,
      }
    }),
  ],
  providers: [TelegramPvPBotService, PvPQueue],
  exports: [TelegramPvPBotService],
})
export class TelegramPvPBotModule {}
