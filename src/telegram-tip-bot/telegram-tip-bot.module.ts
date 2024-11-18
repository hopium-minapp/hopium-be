import { Module } from '@nestjs/common';
import { RankModule } from 'src/rank/rank.module';
import { UsersModule } from 'src/users/users.module';
import { WalletsModule } from 'src/wallets/wallets.module';
import { TelegramTipBotService } from './telegram-tip-bot.service';
import { BullModule } from '@nestjs/bullmq';
import { TIP_SEND_MESSAGE_QUEUE_NAME } from './telegram-tip-bot.constants';
import { TipQueue } from './telegram-tip-bot.queue';
import { TelegramBotModule } from 'src/telegram-bot/telegram-bot.module';

@Module({
  imports: [
    RankModule,
    UsersModule,
    WalletsModule,
    BullModule.registerQueue({
      name: TIP_SEND_MESSAGE_QUEUE_NAME,
    }),
    TelegramBotModule,
  ],
  providers: [TelegramTipBotService, TipQueue],
  exports: [TelegramTipBotService],
})
export class TelegramTipBotModule {}
