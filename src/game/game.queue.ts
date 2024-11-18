import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GAME_QUEUE_ACTION, GAME_QUEUE_NAME } from './constants/queue';
import { UsersService } from 'src/users/users.service';
import { BONUS_USER_PARENT_RATES } from './constants/game';
import { WalletsService } from 'src/wallets/wallets.service';
import { Logger } from '@nestjs/common';
import { TransactionType } from 'src/wallets/schemas/transaction-log.schema';
import { Asset } from '../wallets/constants/common';

@Processor(GAME_QUEUE_NAME, {
  concurrency: 1,
})
export class GameQueue extends WorkerHost {
  private readonly logger = new Logger(GameQueue.name);
  constructor(
    private readonly userService: UsersService,
    private readonly walletService: WalletsService,
  ) {
    super();
  }
  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case GAME_QUEUE_ACTION.BONUS_USER_HAS_REFERRAL: {
        await this.bonusUserHasReferral(job.data.userId, job.data.margin);
        break;
      }
      default:
        break;
    }
  }

  async bonusUserHasReferral(userId: number, margin: number) {
    const user = await this.userService.getUser(userId);

    if (!user || !user.parentId) {
      return;
    }

    if (margin < 0) {
      return;
    }

    const bonusParent = margin * BONUS_USER_PARENT_RATES.PARENT;
    const bonusUser = margin * BONUS_USER_PARENT_RATES.USER;

    try {
      await this.walletService.changeBalance({
        userId: user.parentId,
        assetId: Asset.HOPIUM,
        transactionType: TransactionType.BONUS_REFERRAL,
        amount: bonusParent,
        note: `[Bless] Referral bonus from user ${userId}`,
        metadata: {
          referralType: 'PARENT',
          childId: userId,
        },
      });

      await this.walletService.changeBalance({
        userId,
        assetId: Asset.HOPIUM,
        transactionType: TransactionType.BONUS_REFERRAL,
        amount: bonusUser,
        note: `[Bless] Referral bonus to parent ${user.parentId}`,
        metadata: {
          referralType: 'USER',
          parentId: user.parentId,
        },
      });
    } catch (error) {
      this.logger.error(
        `bonusUserHasReferral Error: ${user._id} | parentId: ${user.parentId}`,
        error.message,
      );
    }

    if (bonusParent > 0) {
      //Increase point
      this.walletService.increasePoint(user.parentId, bonusParent);
    }
    if (bonusUser > 0) {
      //Increase point
      this.walletService.increasePoint(userId, bonusUser);
    }
  }
}
