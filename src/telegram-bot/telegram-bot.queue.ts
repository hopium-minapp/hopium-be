import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  HANDLE_PVP_RESULT,
  BOT_QUEUE_NAME,
  SEND_MESSAGE,
} from './telegram-bot.constants';
import { TelegramBotService } from './telegram-bot.service';
import { GamePvPService } from 'src/game/game-pvp.service';

@Processor(BOT_QUEUE_NAME, {
  concurrency: 1,
})
export class BotQueue extends WorkerHost {
  constructor(
    private readonly telegramBotService: TelegramBotService,
    private readonly gamePvPService: GamePvPService,
  ) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case SEND_MESSAGE:
        return this.handleSendMessage(job);
      case HANDLE_PVP_RESULT:
        return this.gamePvPService.handlePvPResultWithBot(job.data);
      default:
        return Promise.reject(new Error(`Unknown job name: ${job.name}`));
    }
  }

  private async handleSendMessage(job: Job) {
    const { chatId, text, options } = job.data;
    try {
      await this.telegramBotService.sendMessageDirectly(chatId, text, options);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
