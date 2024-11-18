import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { WalletsService } from 'src/wallets/wallets.service';
import { PriceService } from 'src/price/price.service';
import { REDIS_PROVIDER } from 'src/redis/redis.provider';
import { Redis } from 'ioredis';
import { TransactionType } from 'src/wallets/schemas/transaction-log.schema';
import { PvPRoom, PvPRoomDocument } from './schemas/pvp-room.schema';
import { TelegramPvPBotService } from 'src/telegram-pvp-bot/telegram-pvp-bot.service';
import { Model, ObjectId, PipelineStage } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { GAME_PVP_QUEUE_ACTION, GAME_PVP_QUEUE_NAME } from './constants/queue';
import { ConfigService } from '@nestjs/config';
import { Config } from 'src/configuration/config.interface';
import { Target, Type } from './type/pvp.type';
import { TAX_PVP, TIME_CANCEL_PVP, TIME_PVP_DURATION } from './constants/game';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import config from 'src/configuration/config';
import { Point, PointDocument } from 'src/wallets/schemas/point.schema';
import { generateHash, getRandomInt, round } from 'src/commons/utils/helper';
import { AcceptPvPDto, CreatePvPDto, PlayPvPDto } from './dto/pvp.dto';
import { PVP_EVENTS } from './constants/events';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Asset } from '../wallets/constants/common';
import { TransactionHistory } from 'src/wallets/interfaces/wallet.interface';

@Injectable()
export class GamePvPService {
  private readonly logger = new Logger(GamePvPService.name);

  constructor(
    private readonly walletService: WalletsService,
    private readonly priceService: PriceService,
    @Inject(REDIS_PROVIDER.CACHE) private readonly redisCache: Redis,
    @InjectModel(PvPRoom.name) private pvpRoomModel: Model<PvPRoomDocument>,
    @Inject(forwardRef(() => TelegramPvPBotService))
    private readonly telegramPvPBotService: TelegramPvPBotService,
    @InjectQueue(GAME_PVP_QUEUE_NAME) private readonly pvpQueue: Queue,
    private readonly configService: ConfigService<Config>,
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramBotService: TelegramBotService,
    @InjectModel(Point.name)
    private readonly pointModel: Model<PointDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createPvPRoom(params: CreatePvPDto) {
    const {
      userId,
      target,
      amount,
      chatId,
      messageId,
      userName,
      firstName,
      lastName,
      createdAt,
      pvpKey,
      type,
    } = params;

    await this.walletService.changeLocked({
      userId: userId,
      assetId: Asset.HOPIUM,
      amount: amount,
      transactionType: TransactionType.PVP,
      note: `[PvP] Create PvP challenge`,
    });

    // Generate a unique ID for the list Open PvP Position
    const id = generateHash();
    const pvpData = JSON.stringify({
      id,
      pvpKey,
      amount,
      target,
      chatId,
      messageId,
      userName,
      firstName,
      lastName,
      userId,
      createdAt,
      type,
    });

    try {
      await this.redisCache.set(pvpKey, pvpData);
      this.logger.log(`PvP challenge created: ${pvpKey}`);
    } catch (error) {
      this.logger.error(
        `Failed to set PvP data in Redis for key ${pvpKey}: ${error.message}`,
      );
      throw new Error('Failed to create PvP');
    }
  }

  async acceptPvPRoom(params: AcceptPvPDto) {
    const { acceptorId, acceptorUserName, pvpKey, messageId } = params;
    const pvpDataStr = await this.redisCache.get(pvpKey);

    if (pvpDataStr) {
      const pvpData = JSON.parse(pvpDataStr);
      const { id, amount, target, userName, userId, chatId, type } = pvpData;
      const pvpId = id;
      const creatorId = userId;

      if (acceptorId === creatorId) {
        if (type === Type.WEB) {
          throw new Error('You cannot accept your own challenge');
        }

        return;
      }

      try {
        await this.walletService.changeLocked({
          userId: acceptorId,
          assetId: Asset.HOPIUM,
          amount: amount,
          transactionType: TransactionType.PVP,
          note: `[PvP] Accept PvP challenge from #${creatorId}`,
        });
      } catch (error) {
        const customError = new Error(
          `${acceptorUserName}, 💸 You do not have enough balance to play.`,
        );
        customError.name = 'InsufficientBalanceError';
        throw customError;
      }

      await this.redisCache.del(pvpKey);

      const openPrice = await this.priceService.getLastPrice();
      const pvp = new this.pvpRoomModel({
        creatorId,
        acceptorId,
        amount,
        target,
        openPrice,
        messageId,
        chatId,
        type,
      });
      await pvp.save();

      // Add event to queue
      await this.pvpQueue.add(
        GAME_PVP_QUEUE_ACTION.PVP_EVENT,
        {
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
          pvpRoomId: pvp._id,
        },
        {
          delay: TIME_PVP_DURATION, // 5 seconds delay
        },
      );

      return pvp;
    }
    return;
  }

  async playPvP(params: PlayPvPDto) {
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
    } = params;

    const txns: TransactionHistory[] = [];

    try {
      // Get BTC price
      let closePrice = await this.priceService.getLastPrice();

      const result = this.determinePvPResult(
        creatorId,
        acceptorId,
        target,
        openPrice,
        closePrice,
        userName,
        acceptorUserName,
      );
      closePrice = result.closePrice;

      const { winnerId, loserId, winnerName } = result;

      const totalAmount = amount * 2;
      const tax = totalAmount * TAX_PVP; // 5% tax
      const totalPrize = totalAmount - tax;
      const volumeWinning = totalPrize;

      txns.push(
        await this.walletService.changeLocked({
          userId: winnerId,
          assetId: Asset.HOPIUM,
          amount: -amount,
          transactionType: TransactionType.PVP,
          metadata: { result: 'win' },
          note: `[PvP] Win PvP challenge against #${loserId} | Unlock margin`,
        }),
      );

      // update balances for winners
      txns.push(
        await this.walletService.changeBalance({
          userId: winnerId,
          assetId: Asset.HOPIUM,
          amount: totalPrize - amount,
          transactionType: TransactionType.PVP,
          metadata: { result: 'win' },
          note: `[PvP] Win PvP challenge against #${loserId} | Get prize`,
        }),
      );

      // update balances for losers
      txns.push(
        await this.walletService.changeBalance({
          userId: loserId,
          assetId: Asset.HOPIUM,
          amount: -amount,
          transactionType: TransactionType.PVP,
          metadata: { result: 'lose' },
          note: `[PvP] Lose PvP challenge against #${winnerId} | Unlock margin`,
        }),
      );

      txns.push(
        await this.walletService.changeLocked({
          userId: loserId,
          assetId: Asset.HOPIUM,
          amount: -amount,
          transactionType: TransactionType.PVP,
          metadata: { result: 'lose' },
          note: `[PvP] Lose PvP challenge against #${winnerId} | Unlock margin`,
        }),
      );

      this.addPointPvP(winnerId, volumeWinning);

      // update close price and winner
      await this.pvpRoomModel.updateOne(
        { _id: pvpRoomId },
        { closePrice, winnerId, volumeWinning },
      );

      try {
        if (type === Type.TELEGRAM_CHAT) {
          // noti in telegram
          // Determine the actual result
          const actualResult = closePrice > openPrice ? 'Pump' : 'Dump';
          const winnerMessage = `🪄<b> It's ${actualResult}! 🪄</b>\n\n📈The closing price was ${closePrice}\n\n🏆 Congratulations, @${winnerName} won ${totalPrize} $Hopium`;
          await this.telegramPvPBotService.sendMessage(chatId, winnerMessage, {
            reply_to_message_id: messageId, // Reply to the original message
            parse_mode: 'HTML',
          });
        } else if (type === Type.WEB) {
          this.eventEmitter.emit(PVP_EVENTS.ENDED, {
            pvpId,
            winnerId,
            loserId,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to notify in Telegram: ${error.message}`);
      }
    } catch (error) {
      if (txns.length > 0) {
        await this.walletService.rollbackWallet(txns);
      }

      this.logger.error(`Failed to play PvP: ${error.message}`);
    }
  }

  private determinePvPResult(
    creatorId: number,
    acceptorId: number,
    target: Target,
    openPrice: number,
    closePrice: number,
    creatorName: string,
    acceptorName: string,
  ): {
    winnerId: number;
    loserId: number;
    winnerName: string;
    loserName: string;
    closePrice: number;
  } {
    let winnerId: number;
    let loserId: number;
    let winnerName: string;
    let loserName: string;
    let _closePrice = closePrice;
  
    switch (target) {
      case Target.PUMP:
        if (closePrice > openPrice) {
          winnerId = creatorId;
          loserId = acceptorId;
          winnerName = creatorName;
          loserName = acceptorName;
        } else {
          winnerId = acceptorId;
          loserId = creatorId;
          winnerName = acceptorName;
          loserName = creatorName;
        }
        break;
      case Target.DUMP:
        if (closePrice < openPrice) {
          winnerId = creatorId;
          loserId = acceptorId;
          winnerName = creatorName;
          loserName = acceptorName;
        } else {
          winnerId = acceptorId;
          loserId = creatorId;
          winnerName = acceptorName;
          loserName = creatorName;
        }
        break;
      default:
        throw new Error('Invalid target');
    }
    

    return {
      winnerId,
      loserId,
      winnerName,
      loserName,
      closePrice: round(_closePrice, 2),
    };
  }

  @Cron('*/10 * * * * *', { disabled: !config().schedulesEnabled }) // run every 10 seconds
  async handleCancelCron() {
    const keyPrefix = this.configService.get<string>('redisKeyPrefix');
    const keys = await this.redisCache.keys(`${keyPrefix}:pvp:*`);
    const now = Date.now();

    await Promise.all(
      keys.map(async (key) => {
        const strippedKey = key.replace(`${keyPrefix}:`, ''); // Remove the prefix

        const keyType = await this.redisCache.type(strippedKey);

        if (keyType !== 'string') {
          this.logger.warn(`Skipping key ${strippedKey} with type ${keyType}`);
          return;
        }
        const pvpDataStr = await this.redisCache.get(strippedKey);
        if (pvpDataStr) {
          const pvpData = JSON.parse(pvpDataStr);
          const { createdAt } = pvpData;

          if (now - createdAt > TIME_CANCEL_PVP) {
            this.logger.warn(`Cancelling pvp challenge: ${strippedKey}`);
            // 5 minutes
            await this.cancelPvPChallenge(strippedKey);
          }
        }
      }),
    );
  }

  private async cancelPvPChallenge(pvpKey: string) {
    const pvpDataStr = await this.redisCache.get(pvpKey);
    if (!pvpDataStr) {
      return; // pvp was accepted before
    }

    const pvpData = JSON.parse(pvpDataStr);
    const { userId, amount, chatId, messageId, userName, type } = pvpData;

    await this.redisCache.del(pvpKey);

    try {
      await this.walletService.changeLocked({
        userId,
        assetId: Asset.HOPIUM,
        amount: -amount,
        transactionType: TransactionType.PVP_CANCEL,
        note: `[PvP] Cancel PvP challenge`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to return balance for user ${userId}: ${error.message}`,
      );
      throw new Error('Failed to return balance for PvP challenge.');
    }

    if (type === Type.WEB) {
      return;
    }

    // Update the original message to remove the "Accept" button
    try {
      await this.telegramPvPBotService.editMessageReplyMarkup(
        { inline_keyboard: [] }, // Remove all inline buttons
        { chat_id: chatId, message_id: messageId },
      );
    } catch (error) {
      this.logger.error(`Failed to update Telegram message: ${error.message}`);
    }

    const cancelMessage = `❌ @${userName}, your Bless game was canceled because no one joined after 5 minutes.`;
    try {
      await this.telegramPvPBotService.sendMessage(chatId, cancelMessage, {
        reply_to_message_id: messageId, // Reply to the original message
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error(`Failed to update Telegram message: ${error.message}`);
    }
  }

  async createAndAcceptPvPWithBot(
    userId: number,
    target: Target,
    amount: number,
    chatId: number,
    messageId: number,
  ): Promise<{ _id: ObjectId; openPrice: number }> {
    const openPrice = await this.priceService.getLastPrice();

    await this.walletService.changeLocked({
      userId,
      assetId: Asset.HOPIUM,
      amount: amount,
      transactionType: TransactionType.PVP,
      note: `[PvP] Create PvP challenge against bot`,
    });

    const botId = 0; // Assuming 0 is the bot ID

    const pvpRoom = new this.pvpRoomModel({
      creatorId: userId,
      amount,
      target,
      openPrice,
      messageId,
      acceptorId: botId,
      chatId,
    });
    await pvpRoom.save();

    return { _id: pvpRoom._id as ObjectId, openPrice };
  }

  async handlePvPResultWithBot(data: {
    userId: number;
    creatorId: number;
    acceptorId: number;
    openPrice: number;
    userName: string;
    acceptorUserName: string;
    chatId: number;
    messageId: number;
    amount: number;
    normalizedTarget: Target;
  }) {
    const {
      creatorId,
      acceptorId,
      openPrice,
      userName,
      acceptorUserName,
      chatId,
      messageId,
      amount,
      normalizedTarget,
    } = data;
    // Get the close price
    let closePrice = await this.priceService.getLastPrice();

    // Determine the result
    const result = this.determinePvPResult(
      creatorId,
      acceptorId,
      normalizedTarget,
      openPrice,
      closePrice,
      userName,
      acceptorUserName,
    );

    closePrice = result.closePrice;

    const { winnerId, winnerName } = result;

    const totalAmount = amount * 2;
    const tax = totalAmount * TAX_PVP; // 5% tax
    const totalPrize = totalAmount - tax;
    const volumeWinning = totalPrize;

    const txns: TransactionHistory[] = [];
    try {
      if (winnerId !== 0) {
        txns.push(
          await this.walletService.changeLocked({
            userId: winnerId,
            assetId: Asset.HOPIUM,
            amount: -amount,
            transactionType: TransactionType.PVP,
            metadata: { result: 'win' },
            note: `[PvP] Win PvP challenge against bot | Unlock margin`,
          }),
        );

        txns.push(
          await this.walletService.changeBalance({
            userId: winnerId,
            assetId: Asset.HOPIUM,
            amount: totalPrize - amount,
            transactionType: TransactionType.PVP,
            metadata: { result: 'win' },
            note: `[PvP] Win PvP challenge against bot | Get prize`,
          }),
        );
      }

      // Update close price and winner
      await this.pvpRoomModel.updateOne(
        { creatorId, acceptorId, openPrice },
        { closePrice, winnerId, volumeWinning },
      );
    } catch (error) {
      if (txns.length > 0) {
        await this.walletService.rollbackWallet(txns);
      }

      this.logger.error(
        `Failed to handle PvP result with bot: ${error.message}`,
      );
      return;
    }

    const actualResult = closePrice > openPrice ? 'Pump' : 'Dump';

    // Notify in Telegram
    const winnerMessage = `🪄 It's ${actualResult}! 🪄\n\n📈The closing price was ${closePrice}\n\n🏆 Congratulations, @${winnerName} won ${totalPrize} $Hopium`;
    await this.telegramBotService.sendMessage(chatId, winnerMessage, {
      reply_to_message_id: messageId,
      parse_mode: 'HTML',
    });

    return Promise.resolve();
  }

  private async addPointPvP(userId: number, points: number) {
    try {
      await this.pointModel.updateOne(
        { _id: userId },
        { $inc: { pointPvP: points } },
        { upsert: true },
      );
      this.logger.log(`Added ${points} pointPvP to user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to add pointPvP to user ${userId}: ${error.message}`,
      );
    }
  }
}
