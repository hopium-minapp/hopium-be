import { Module } from '@nestjs/common';
import { TelegramStatisticsBotService } from './telegram-statistics-bot.service';
import { GameModule } from 'src/game/game.module';
import { RankModule } from 'src/rank/rank.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [RankModule, UsersModule, GameModule],
  providers: [TelegramStatisticsBotService],
  exports: [TelegramStatisticsBotService],
})
export class TelegramStatisticsBotModule {}
