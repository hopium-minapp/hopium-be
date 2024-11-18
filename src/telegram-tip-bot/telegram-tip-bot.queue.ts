import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TIP_SEND_MESSAGE_QUEUE_NAME } from './telegram-tip-bot.constants';
import { TelegramTipBotService } from './telegram-tip-bot.service';

@Processor(TIP_SEND_MESSAGE_QUEUE_NAME, {
  concurrency: 1,
})
export class TipQueue extends WorkerHost {
  constructor(private readonly telegramTipBotService: TelegramTipBotService) {
    super();
  }

  async process(job: Job) {
    const { chatId, text, options } = job.data;
    try {
      await this.telegramTipBotService.sendMessageDirectly(
        chatId,
        text,
        options,
      );
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
