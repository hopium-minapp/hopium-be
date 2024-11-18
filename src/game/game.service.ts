import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { WalletsService } from 'src/wallets/wallets.service';
import { Turn } from './schemas/turn.schema';
import { FilterQuery, Model } from 'mongoose';
import { PriceService } from 'src/price/price.service';
import { PlayGameDto, PvPPositionDto } from './dto/play-game.dto';
import { Side, SortBy, State, TurnResult } from './type/turn.type';
import { SchedulerRegistry } from '@nestjs/schedule';
import { REDIS_PROVIDER } from 'src/redis/redis.provider';
import { Redis } from 'ioredis';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PVP_EVENTS, TURN_EVENTS } from './constants/events';
import { UsersService } from 'src/users/users.service';
import { MAX_WIN_STREAK, WIN_STREAK_RATES } from './constants/game';
import { TurnListQueryDto } from './dto/turns-query.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { GAME_QUEUE_ACTION, GAME_QUEUE_NAME } from './constants/queue';
import { Queue } from 'bullmq';
import { TransactionType } from 'src/wallets/schemas/transaction-log.schema';
import { PvPRoom, PvPRoomDocument } from './schemas/pvp-room.schema';
import { OpenPvPRoomQueryDto, PvPHistoryQueryDto } from './dto/pvp-query.dto';
import { ConfigService } from '@nestjs/config';
import { Config } from 'src/configuration/config.interface';
import { GamePvPService } from './game-pvp.service';
import { Type } from './type/pvp.type';
import { Asset } from '../wallets/constants/common';
import { TransactionHistory } from 'src/wallets/interfaces/wallet.interface';

@Injectable()
export class GameService implements OnApplicationBootstrap {
  readonly bet = 10;
  readonly turnDuration = 5 * 1000 - 200; // 5 seconds
  readonly winRate = 1;
  readonly loseRate = 0.7;
  private readonly logger = new Logger(GameService.name);

  constructor(
    @InjectModel(Turn.name) private turnModel: Model<Turn>,
    private readonly walletService: WalletsService,
    private readonly priceService: PriceService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => UsersService))
    private readonly userService: UsersService,
    @Inject(REDIS_PROVIDER.CACHE) private readonly redisCache: Redis,
    @InjectQueue(GAME_QUEUE_NAME) private gameQueue: Queue,
    private readonly configService: ConfigService<Config>,
    @InjectModel(PvPRoom.name) private pvpRoomModel: Model<PvPRoomDocument>,
    @Inject(forwardRef(() => GamePvPService))
    private readonly gamePvPService: GamePvPService,
  ) {}

  onApplicationBootstrap() {
    if (this.configService.get('schedulesEnabled')) {
      this.initTimeouts();
    }
  }

  async initTimeouts() {
    const turns = await this.turnModel.find({ state: State.OPEN }).lean();
    this.logger.log('Available turns: ' + turns.length);

    const now = Date.now();
    for (const turn of turns) {
      if (this.isTurnExpired(turn)) {
        this.closeTurn(String(turn._id));
      } else {
        const dur = Math.max(this.turnDuration - (now - turn.openTime), 0);
        this.addTimeoutCloseTurn(String(turn._id), dur);
      }
    }
  }

  private getLockKey(userId: number) {
    return `lock-user:${userId}`;
  }

  private getTimeoutKey(turnId: string) {
    return `close-turn:${turnId}`;
  }

  lockUser(userId: number) {
    const key = this.getLockKey(userId);
    return this.redisCache.set(key, 1, 'PX', this.turnDuration + 500);
  }

  unLockUser(userId: number) {
    const key = this.getLockKey(userId);
    return this.redisCache.del(key);
  }

  isUserLocked(userId: number) {
    const key = this.getLockKey(userId);
    return this.redisCache.exists(key);
  }

  async play(userId: number, data: PlayGameDto) {
    if (await this.isUserLocked(userId)) {
      throw new BadRequestException('User is already playing');
    }

    let txn: TransactionHistory;
    try {
      // Lock the user's balance (bet's amount)
      txn = await this.walletService.changeLocked({
        userId,
        assetId: Asset.HOPIUM,
        transactionType: TransactionType.GAME_PLAY,
        amount: this.bet,
        note: '[Bless] Game play',
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }
    this.lockUser(userId);

    try {
      const lastPrice = await this.priceService.getLastPrice();

      const turn = await this.turnModel.create({
        userId,
        openPrice: lastPrice,
        openTime: Date.now(),
        margin: this.bet,
        side: data.side,
        state: State.OPEN,
      });

      this.eventEmitter.emit(TURN_EVENTS.OPENED, turn);
      this.addTimeoutCloseTurn(String(turn._id), this.turnDuration);
      this.gameQueue.add(GAME_QUEUE_ACTION.BONUS_USER_HAS_REFERRAL, {
        userId,
        margin: this.bet,
      });

      if (this.bet > 0) {
        //Increase point
        this.walletService.increasePoint(userId, this.bet);
      }
      return turn;
    } catch (error) {
      await this.walletService.rollbackWallet([txn]);
      this.unLockUser(userId);
      throw new InternalServerErrorException(error.message);
    }
  }

  addTimeoutCloseTurn(turnId: string, timeout: number) {
    const timeoutId = setTimeout(() => {
      this.closeTurn(turnId);
    }, timeout);
    this.schedulerRegistry.addTimeout(this.getTimeoutKey(turnId), timeoutId);
  }

  isTurnExpired(turn: Turn) {
    return Date.now() - turn.openTime > this.turnDuration;
  }

  async getTurnDetail(userId: number, turnId: string) {
    const turn = await this.turnModel.findOne({ userId, _id: turnId });
    if (!turn) {
      throw new BadRequestException('Turn not found');
    }
    return turn;
  }

  async closeTurn(turnId: string) {
    const turn = await this.turnModel.findById(turnId);
    if (!turn) {
      throw new BadRequestException('Turn not found');
    }

    if (turn.state === State.CLOSED) {
      this.logger.error(`Turn is already closed: ${turnId}`);
      return;
    }

    if (!this.isTurnExpired(turn)) {
      this.logger.error(`Turn is still in progress: ${turnId}`);
      return;
    }

    const lastPrice = await this.priceService.getLastPrice();

    let result = TurnResult.WIN;
    if (
      (turn.side === Side.PUMP && lastPrice < turn.openPrice) ||
      (turn.side === Side.DUMP && lastPrice > turn.openPrice)
    ) {
      result = TurnResult.MISS;
    }

    let winStreak = 0;
    if (result === TurnResult.WIN) {
      // lấy chuỗi thắng của user
      const currentWinStreak = await this.userService.getWinStreak(turn.userId);

      // tăng chuỗi thắng lên 1 nếu nhỏ hơn MAX_WIN_STREAK
      winStreak = currentWinStreak < MAX_WIN_STREAK ? currentWinStreak + 1 : 1;
    }

    const winStreakRate = WIN_STREAK_RATES[winStreak] ?? 1;

    const profit =
      result === TurnResult.WIN
        ? this.winRate * turn.margin * winStreakRate
        : -this.loseRate * turn.margin;

    const updatedTurn = await this.turnModel.findOneAndUpdate(
      {
        _id: turnId,
        state: { $ne: State.CLOSED },
      },
      {
        profit,
        state: State.CLOSED,
        result,
        closePrice: lastPrice,
        closeTime: Date.now(),
        winStreak,
      },
      {
        new: true,
      },
    );

    if (!updatedTurn) {
      this.logger.error(`Turn is already closed: ${turnId}`);
      return;
    }

    this.eventEmitter.emit(TURN_EVENTS.CLOSED, updatedTurn);

    const txns: TransactionHistory[] = [];
    try {
      // Update the user's balance (unlock margin and add profit)

      txns.push(
        await this.walletService.changeLocked({
          userId: turn.userId,
          assetId: Asset.HOPIUM,
          transactionType: TransactionType.GAME_RESULT,
          amount: -turn.margin,
          note: '[Bless] unlock margin',
          metadata: {
            turnId,
            result,
          },
        }),
      );

      txns.push(
        await this.walletService.changeBalance({
          userId: turn.userId,
          assetId: Asset.HOPIUM,
          transactionType: TransactionType.GAME_RESULT,
          amount: profit,
          note: '[Bless] result profit',
          metadata: {
            turnId,
            result,
          },
        }),
      );
    } catch (error) {
      if (txns.length > 0) {
        await this.walletService.rollbackWallet(txns);
      }

      this.logger.error(
        `changeBalance Error: ${turn._id} | userId: ${turn.userId}`,
        error.message,
      );
      await this.turnModel.findByIdAndUpdate(turnId, { state: State.CANCELED });
      return;
    }

    this.userService.updateWinStreak(turn.userId, winStreak);
    this.unLockUser(turn.userId);

    if (profit > 0) {
      //Increase point
      await this.walletService.increasePoint(turn.userId, profit);
    }
    return updatedTurn;
  }

  async getTurns(userId: number, query: TurnListQueryDto) {
    const filter: FilterQuery<Turn> = { userId };
    if (query.state) {
      filter.state = query.state;
    }

    const data = await this.turnModel
      .find(filter)
      .sort({ openTime: -1 })
      .limit(query.limit + 1)
      .skip(query.offset)
      .lean();

    return {
      data: data.slice(0, query.limit),
      hasMore: data.length > query.limit,
    };
  }

  async getStats(userId: number) {
    const result = await this.turnModel.aggregate([
      {
        $match: { userId, state: State.CLOSED },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: 1,
          },
          win: {
            $sum: {
              $cond: [{ $eq: ['$result', TurnResult.WIN] }, 1, 0],
            },
          },
          miss: {
            $sum: {
              $cond: [{ $eq: ['$result', TurnResult.MISS] }, 1, 0],
            },
          },
        },
      },
    ]);

    if (!result.length) {
      return {
        total: 0,
        win: 0,
        miss: 0,
      };
    }

    const total = result[0]?.total ?? 0;
    const win = result[0]?.win ?? 0;
    const miss = result[0]?.miss ?? 0;

    return {
      total,
      win,
      miss,
    };
  }

  async getTotalPredictions(): Promise<number> {
    return this.turnModel.countDocuments();
  }

  async getPvPHistory(userId: number, query: PvPHistoryQueryDto) {
    const filter: FilterQuery<PvPRoom> = {
      $or: [{ creatorId: userId }, { acceptorId: userId }],
    };

    if (query.target) {
      filter.target = query.target;
    }

    const pvpRooms = await this.pvpRoomModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit + 1)
      .skip(query.offset)
      .lean();

    return {
      data: pvpRooms.slice(0, query.limit),
      hasMore: pvpRooms.length > query.limit,
    };
  }

  async getPvPStats(userId: number) {
    const result = await this.pvpRoomModel.aggregate([
      {
        $match: { $or: [{ creatorId: userId }, { acceptorId: userId }] },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: 1,
          },
          win: {
            $sum: {
              $cond: [{ $eq: ['$winnerId', userId] }, 1, 0],
            },
          },
          lose: {
            $sum: {
              $cond: [{ $ne: ['$winnerId', userId] }, 1, 0],
            },
          },
        },
      },
    ]);

    if (!result.length) {
      return {
        total: 0,
        win: 0,
        lose: 0,
      };
    }

    const total = result[0]?.total ?? 0;
    const win = result[0]?.win ?? 0;
    const lose = result[0]?.lose ?? 0;

    return {
      total,
      win,
      lose,
    };
  }

  async getOpenPvPRooms(userId: number, query: OpenPvPRoomQueryDto) {
    let result = [];

    const keyPrefix = this.configService.get<string>('redisKeyPrefix');
    const keys = await this.redisCache.keys(`${keyPrefix}:pvp:web:*`);
    if (!keys.length) {
      return result;
    }
    const keysWithoutPrefix = keys.map((key) =>
      key.replace(`${keyPrefix}:`, ''),
    );

    const openPvPRooms = await this.redisCache.mget(keysWithoutPrefix);

    result = openPvPRooms
      .map((pvpDataStr) => JSON.parse(pvpDataStr))
      .filter((pvpData) => {
        if (query.userId && pvpData.userId === query.userId) {
          return true;
        } else if (!query.userId && pvpData.userId !== userId) {
          return true;
        }
        return false;
      })
      .map((pvpData) => ({
        id: pvpData.id,
        target: pvpData.target,
        amount: pvpData.amount,
        pvpKey: pvpData.pvpKey,
        firstName: pvpData.firstName,
        lastName: pvpData.lastName,
        createdAt: pvpData.createdAt,
      }))
      .sort((a, b) =>
        query.sort === SortBy.ASC
          ? a.createdAt - b.createdAt
          : b.createdAt - a.createdAt,
      );

    return result;
  }

  async createPvPPosition(userId: number, data: PvPPositionDto) {
    try {
      const user = await this.userService.getUser(userId);
      const createdAt = Date.now();
      const { target, amount } = data;

      if (amount < 100) {
        throw new BadRequestException('Min amount is 100 Hopium');
      }

      const pvpKey = `pvp:web:${userId}:${createdAt}`;
      const keyPrefix = this.configService.get<string>('redisKeyPrefix');
      const keys = await this.redisCache.keys(
        `${keyPrefix}:pvp:web:${userId}*`,
      );

      if (keys.length >= 3) {
        throw new BadRequestException('Maximum capacity reached');
      }

      await this.gamePvPService.createPvPRoom({
        userId,
        target,
        amount,
        chatId: 0,
        messageId: 0,
        userName: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt,
        pvpKey,
        type: Type.WEB,
      });

      return {
        target,
        amount,
        pvpKey,
        createdAt,
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async acceptPvPPosition(userId: number, pvpKey: string) {
    try {
      const user = await this.userService.getUser(userId);

      const pvp = await this.gamePvPService.acceptPvPRoom({
        acceptorId: user._id,
        acceptorUserName: user.username,
        pvpKey,
        messageId: 0,
      });

      if (!pvp) {
        const customError = new Error(`PvP room not found`);
        customError.name = 'PvPNotFoundError';
        throw customError;
      }

      this.eventEmitter.emit(PVP_EVENTS.ACCEPTED, {
        pvpKey,
        creatorId: pvp.creatorId,
        acceptorId: pvp.acceptorId,
      });

      return {
        id: pvp._id,
        createdAt: Date.now(),
      };
    } catch (error) {
      throw new BadRequestException(error.message, error.name);
    }
  }

  async getPvPResult(pvpRoomId: string) {
    const pvp = await this.pvpRoomModel.findById(pvpRoomId);
    if (!pvp) {
      throw new BadRequestException('PvP result not found');
    }

    return {
      winnerId: pvp.winnerId,
      loserId: pvp.winnerId === pvp.creatorId ? pvp.acceptorId : pvp.creatorId,
    };
  }
}
