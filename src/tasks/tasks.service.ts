import * as dayjs from 'dayjs';
import { FilterQuery, Model } from 'mongoose';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Config } from 'src/configuration/config.interface';

import { Task } from './schemas/task.schema';
import { Condition, Group, Status, Type } from './type/task.type';
import { UserTask } from './schemas/user-task.schema';
import { UserTaskLog } from './schemas/user-task-log.schema';
import { WalletsService } from 'src/wallets/wallets.service';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { TransactionType } from 'src/wallets/schemas/transaction-log.schema';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from 'src/users/schemas/user.schema';
import { PvPRoom, PvPRoomDocument } from 'src/game/schemas/pvp-room.schema';
import { Type as RewardType } from 'src/lottery/type/reward.type';
import { LotteryService } from 'src/lottery/lottery.service';
import { Turn } from 'src/game/schemas/turn.schema';
import { Command } from 'nestjs-command';
import * as tasks from '../assets/tasks.json';
import { TaskQueryDto } from './dto/task-query.dto';
import { Asset } from '../wallets/constants/common';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name)
    private readonly taskModel: Model<Task>,
    @InjectModel(UserTask.name)
    private readonly userTaskModel: Model<UserTask>,
    @InjectModel(UserTaskLog.name)
    private readonly userTaskLogModel: Model<UserTaskLog>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(PvPRoom.name) private pvpRoomModel: Model<PvPRoomDocument>,
    @InjectModel(Turn.name) private turnModel: Model<Turn>,
    private readonly walletService: WalletsService,
    private readonly configService: ConfigService<Config>,
    private readonly telegramBotService: TelegramBotService,
    private readonly lotteryService: LotteryService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async getUserTasks(userId: number, query: TaskQueryDto) {
    const result = [];

    const filter: FilterQuery<Task> = {
      isEnable: true,
    };

    if (query.group) {
      filter.group = query.group;
    }
    const defaultTasks = await this.taskModel.find(filter);

    const userTasks = await this.userTaskModel.find({ userId });

    for (const task of defaultTasks) {
      const userTask = userTasks.find(
        (userTask) => userTask.taskId === task._id,
      );

      result.push({
        ...task.toObject(),
        status: await this.getUserTaskStatus(task, userTask),
      });
    }

    return result;
  }

  async getUserTaskStatus(task: Task, userTask: UserTask) {
    if (task.type === Type.DAILY) {
      return this.checkUserTaskDailyClaimable(userTask)
        ? Status.CLAIMABLE
        : Status.COMPLETED;
    }

    if (task.type === Type.FIXED) {
      return Status.UNCOMPLETED;
    }

    if (!userTask) {
      return Status.UNCOMPLETED;
    }

    return userTask.status;
  }

  async updateUserTaskStatus(userId: number, taskId: number) {
    const task = await this.taskModel.findById(taskId);

    if (!task || !task.isEnable) {
      return true;
    }

    // if task type is not one time or partner, return true
    if (![Type.ONE_TIME, Type.PARTNER].includes(task.type)) {
      return true;
    }

    const userTask = await this.userTaskModel.findOne({
      userId,
      taskId,
    });

    if (!userTask) {
      await this.userTaskModel.create({
        userId,
        taskId,
        status: Status.CLAIMABLE,
        completedAt: new Date(),
        claimedAt: new Date(),
      });

      return true;
    }

    if (userTask.status === Status.UNCOMPLETED) {
      await this.userTaskModel.updateOne(
        { userId, taskId },
        {
          status: Status.CLAIMABLE,
          completedAt: new Date(),
          claimedAt: new Date(),
        },
      );
    }

    return true;
  }

  checkUserTaskDailyClaimable(userTask: UserTask) {
    const sevenAMToday = dayjs().startOf('d').valueOf();

    // handle status for daily task
    return !userTask || dayjs(userTask.claimedAt).valueOf() < sevenAMToday;
  }

  async claimTask(userId: number, taskId: number) {
    const lockKey = `task:${taskId}:${userId}:lock`;
    const isLocked = (await this.cacheManager.get(lockKey)) === 1;
    if (isLocked) {
      throw new BadRequestException('Task is claiming');
    }

    await this.cacheManager.set(lockKey, 1, 5 * 60000 /* 5 minutes */);

    try {
      const task = await this.taskModel.findById(taskId);

      if (!task || !task.isEnable) {
        throw new BadRequestException('Task not found');
      }

      if (task.group === Group.HOPIUM) {
        switch (task.type) {
          case Type.DAILY:
            return await this.claimDailyTask(userId, task);
          case Type.ONE_TIME:
          case Type.PARTNER:
            return await this.claimOneTimeTask(userId, task);
          default:
            return true;
        }
      } else {
        return await this.claimLuckyTask(userId, task);
      }
    } catch (error) {
      throw error;
    } finally {
      await this.cacheManager.del(lockKey);
    }
  }

  async claimDailyTask(userId: number, task: Task) {
    const taskId = task._id;
    const userTask = await this.userTaskModel.findOne({
      userId,
      taskId,
    });

    if (!this.checkUserTaskDailyClaimable(userTask)) {
      throw new BadRequestException('Task already claimed');
    }

    await this.userClaimTaskPoint(userId, task);

    return true;
  }

  async claimOneTimeTask(userId: number, task: Task) {
    const taskId = task._id;
    const userTask = await this.userTaskModel.findOne({
      userId,
      taskId,
    });

    if (!userTask) {
      throw new BadRequestException('User task not found');
    }

    const check = await this.isOneTimeTaskCompleted(userId, task);
    if (userTask.status === Status.UNCOMPLETED || !check) {
      throw new BadRequestException('Cannot claim uncompleted task');
    }

    if (userTask.status === Status.COMPLETED) {
      throw new BadRequestException('Task already claimed');
    }

    await this.userClaimTaskPoint(userId, task);

    return true;
  }

  async claimAddFriendTask(userId: number, parentId: number) {
    const task = await this.taskModel.findOne({
      condition: Condition.INVITE_FRIEND,
      group: Group.HOPIUM,
    });

    if (!task) {
      throw new BadRequestException('Task not found');
    }

    await this.lotteryService.increaseRewardQuantity(
      userId,
      Asset.TICKET,
      RewardType.TICKET,
      1,
    );
    await this.userClaimTaskPoint(userId, task);
    await this.userClaimTaskPoint(parentId, task);

    return task;
  }

  async userClaimTaskPoint(userId: number, task: Task) {
    const taskId = task._id;

    const userTask = await this.userTaskModel
      .findOne({
        userId,
        taskId,
      })
      .lean();

    if (
      userTask &&
      userTask.status === Status.COMPLETED &&
      [Type.ONE_TIME, Type.PARTNER].includes(task.type)
    ) {
      throw new BadRequestException('Task already claimed');
    }

    await this.userTaskModel.updateOne(
      { userId, taskId },
      {
        status: Status.COMPLETED,
        claimedAt: new Date(),
        completedAt: new Date(),
      },
      {
        upsert: true,
      },
    );

    await this.userTaskLogModel.create({
      userId,
      taskId,
      action: 'CLAIM',
      metadata: {
        point: task.point,
      },
    });

    await this.walletService.changeBalance({
      userId,
      assetId: Asset.HOPIUM,
      transactionType: TransactionType.CLAIM_TASK,
      amount: task.point,
      metadata: {
        taskId,
      },
      note: `[Task] Claim task #${taskId}`,
    });
    if (task.point > 0) {
      //Increase point
      await this.walletService.increasePoint(userId, task.point);
    }
  }

  async isOneTimeTaskCompleted(userId: number, task) {
    switch (task.condition) {
      case Condition.JOIN_TELEGRAM_GROUP:
        const telegramGroupId = this.configService.get('telegramGroupId');

        return this.telegramBotService.checkUserInChat(userId, telegramGroupId);
      case Condition.SUBSCRIBE_TELEGRAM_CHANNEL:
        const telegramChannelId = this.configService.get('telegramChannelId');

        return this.telegramBotService.checkUserInChat(
          userId,
          telegramChannelId,
        );
      case Condition.SUBSCRIBE_TWITTER:
        // always return true
        return true;
      case Condition.CONNECT_TON_WALLET:
        const user = await this.userModel.findById(userId);

        return user && user.tonAddress;
      case Condition.WIN_PVP_BATTLE:
        const pvpWinBattle = await this.pvpRoomModel
          .findOne({
            winnerId: userId,
          })
          .select('_id');
        return !!pvpWinBattle;
      case Condition.AFFILIATE_CLICK:
        return true;
      default:
        return false;
    }
  }

  async claimLuckyTask(userId: number, task: Task) {
    const taskId = task._id;
    const userTask = await this.userTaskModel.findOne({
      userId,
      taskId,
    });

    // Validate for onetime task
    if ([Type.ONE_TIME, Type.PARTNER].includes(task.type)) {
      if (!userTask) {
        throw new BadRequestException('User task not found');
      }
      if (userTask.status === Status.COMPLETED) {
        throw new BadRequestException('Task already claimed');
      }
    }

    // Validate for daily task
    if (task.type === Type.DAILY) {
      if (!this.checkUserTaskDailyClaimable(userTask)) {
        throw new BadRequestException('Task already claimed');
      }
    }

    switch (task.condition) {
      case Condition.ONE_FORECAST:
      case Condition.THREE_FORECAST:
      case Condition.FIVE_FORECAST:
        let predictCondition;
        if (task.condition === Condition.ONE_FORECAST) {
          predictCondition = 1;
        } else if (task.condition === Condition.THREE_FORECAST) {
          predictCondition = 3;
        } else {
          predictCondition = 5;
        }

        const predictToday = await this.countTurnsToday(userId);

        if (predictToday < predictCondition) {
          throw new BadRequestException(
            `Your prediction today is less than ${predictCondition}`,
          );
        }

        await this.userClaimTaskTicket(userId, taskId, task.point);

        return true;
      case Condition.WIN_PVP_BATTLE:
        const pvpWinBattle = await this.pvpRoomModel
          .findOne({
            winnerId: userId,
          })
          .select('_id');

        if (pvpWinBattle) {
          await this.userClaimTaskTicket(userId, taskId, task.point);
        }

        return !!pvpWinBattle;
      case Condition.DAILY_CHECK_IN:
        await this.userClaimTaskTicket(userId, taskId, task.point);

        return true;
      default:
        return false;
    }
  }

  async countTurnsToday(userId: number) {
    return await this.turnModel.countDocuments({
      userId,
      openTime: { $gte: dayjs().startOf('d').valueOf() },
    });
  }

  async userClaimTaskTicket(userId: number, taskId: number, ticket: number) {
    await this.userTaskModel.updateOne(
      { userId, taskId },
      {
        status: Status.COMPLETED,
        claimedAt: new Date(),
        completedAt: new Date(),
      },
      {
        upsert: true,
      },
    );

    await this.userTaskLogModel.create({
      userId,
      taskId,
      action: 'CLAIM',
      metadata: {
        ticket: ticket,
      },
    });

    await this.lotteryService.increaseRewardQuantity(
      userId,
      Asset.TICKET,
      RewardType.TICKET,
      ticket,
    );
  }

  @Command({ command: 'migrate:task', describe: 'Update tasks data' })
  async updateWalletsData() {
    console.log('Migrating tasks data...');

    for (const task of tasks) {
      await this.taskModel.findOneAndUpdate({ _id: task._id }, task, {
        upsert: true,
      });
    }

    console.log(`Migrate wallet data completed`);
  }
}
