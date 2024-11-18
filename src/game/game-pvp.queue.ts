import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { GamePvPService } from './game-pvp.service';
import { GAME_PVP_QUEUE_ACTION, GAME_PVP_QUEUE_NAME } from './constants/queue';

@Processor(GAME_PVP_QUEUE_NAME, {
  concurrency: 1,
})
export class GamePvPQueue extends WorkerHost {
  private readonly logger = new Logger(GamePvPQueue.name);

  constructor(private readonly gamePvPService: GamePvPService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { name, data } = job;
    switch (name) {
      case GAME_PVP_QUEUE_ACTION.PVP_EVENT: {
        const {
          creatorId,
          acceptorId,
          target,
          openPrice,
          amount,
          userName,
          chatId,
          acceptorUserName,
          messageId,
          type,
          pvpId,
          pvpRoomId,
        } = data;
        this.logger.log(
          `Processing PvP ${type} event for creatorId: ${creatorId}, acceptorId: ${acceptorId}`,
        );
        await this.gamePvPService.playPvP({
          creatorId,
          acceptorId,
          target,
          openPrice,
          amount,
          userName,
          chatId,
          acceptorUserName,
          messageId,
          type,
          pvpId,
          pvpRoomId,
        });
        break;
      }
      default:
        this.logger.error(`Unknown job name: ${name}`);
        break;
    }
  }
}
