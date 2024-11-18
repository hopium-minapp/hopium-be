import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramPvPBotService } from './telegram-pvp-bot.service';
import {
  PVP_QUEUE_EVENT_NAME,
  PVP_QUEUE_NAME,
  PvPAcceptRoomData,
  PvPSendMessageData,
} from './telegram-pvp-bot.constants';
import { GamePvPService } from 'src/game/game-pvp.service';
import { ParseMode } from 'node-telegram-bot-api';
import { TIME_PVP_DURATION } from 'src/game/constants/game';
import { Target } from 'src/game/type/pvp.type';

@Processor(PVP_QUEUE_NAME, {
  concurrency: 1,
})
export class PvPQueue extends WorkerHost {
  constructor(
    private readonly telegramPvPBotService: TelegramPvPBotService,
    private readonly gamePvPService: GamePvPService,
  ) {
    super();
  }

  async process(job: Job<PvPSendMessageData | PvPAcceptRoomData>) {
    const { name, data } = job;
    switch (name) {
      case PVP_QUEUE_EVENT_NAME.PVP_SEND_MESSAGE: {
        const { chatId, text, options } = data as PvPSendMessageData;
        try {
          await this.telegramPvPBotService.sendMessageDirectly(
            chatId,
            text,
            options,
          );
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error);
        }
      }
      case PVP_QUEUE_EVENT_NAME.PVP_ACCEPT_ROOM: {
        const {
          acceptorId,
          acceptorUserName,
          pvpKey,
          messageId,
          userName,
          target,
          amount,
          chatId,
        } = data as PvPAcceptRoomData;
        try {
          const pvpRoom = await this.gamePvPService.acceptPvPRoom({
            acceptorId,
            acceptorUserName,
            pvpKey,
            messageId,
          });

          if (messageId && pvpRoom) {
            const { _id, openPrice } = pvpRoom;
            const updatedMessage = `<b>🪄Bless Challenge is Live!🪄</b><i>\n\n</i>🎮 Game ID: ${_id}<i>\n</i>🙏 @${userName} (${target}) vs @${acceptorUserName} (${target === Target.PUMP ? Target.DUMP.toLowerCase() : Target.PUMP.toLowerCase()})<i>\n</i>🏆 Prize Pool: ${amount * 2} $Hopium<i>\n</i>💸 Tax: 5%<i>\n</i>📈 Open Price: ${openPrice}<i>\n\n</i>Current Time: ${new Date().toUTCString()}<i>\n</i>Result Time: ${new Date(Date.now() + TIME_PVP_DURATION).toUTCString()}<i>\n\n</i>🍀 The result will be announced at ${new Date(Date.now() + TIME_PVP_DURATION).toUTCString()}`;
            await this.telegramPvPBotService.editMessageText(updatedMessage, {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'HTML' as ParseMode,
            });
            return Promise.resolve();
          }
        } catch (error) {
          return Promise.reject(error);
        }
      }
      default:
        return Promise.reject(new Error(`Unknown job name: ${name}`));
    }
  }
}
