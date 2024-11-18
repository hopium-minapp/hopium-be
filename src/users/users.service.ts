import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { TasksService } from 'src/tasks/tasks.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { isInt } from 'class-validator';
import { MAX_WIN_STREAK } from 'src/game/constants/game';
import { Condition } from 'src/tasks/type/task.type';
import { Task } from 'src/tasks/schemas/task.schema';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<Task>,
    @Inject(forwardRef(() => TelegramBotService))
    private readonly telegramBotService: TelegramBotService,
    private readonly taskService: TasksService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async updateOrCreateUser(data: CreateUserDto) {
    return this.userModel.findByIdAndUpdate(
      data.id,
      {
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        allowsWriteToPm: data.allowsWriteToPm,
        languageCode: data.languageCode,
        isPremium: data.isPremium,
        addedToAttachmentMenu: data.addedToAttachmentMenu,
        photoUrl: data.photoUrl,
      },
      {
        upsert: true,
        lean: true,
        new: true,
      },
    );
  }

  async connectTonWallet(userId: number, tonAddress: string) {
    const existingUser = await this.userModel.findOne({ tonAddress });

    if (existingUser && existingUser._id !== userId) {
      throw new BadRequestException('Ton Wallet already connected');
    }

    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.tonAddress && user.tonAddress !== tonAddress) {
      throw new BadRequestException('Ton Wallet already connected');
    } else if (!user.tonAddress) {
      user.tonAddress = tonAddress;

      await user.save();
    }

    try {
      const task = await this.taskModel.findOne({
        condition: Condition.CONNECT_TON_WALLET,
      });
      await this.taskService.updateUserTaskStatus(user.id, task._id);
    } catch (e) {
      this.logger.error('Error update task connect ton wallet: ' + e.message);
    }

    return user;
  }

  async getUser(id: number) {
    return this.userModel.findById(id).lean();
  }

  async getUserByUsername(username: string): Promise<User> {
    try {
      const user = await this.userModel.findOne({ username }).lean();
      if (!user) {
        throw new NotFoundException(`User with username ${username} not found`);
      }
      return user;
    } catch (error) {
      this.logger.error(
        `Failed to get user by username: ${username}`,
        error.stack,
      );
    }
  }

  private _getWinStreakKey(id: number) {
    return `win_streak:${id}`;
  }

  async getWinStreak(id: number) {
    const cached = await this.cacheManager.get<number>(
      this._getWinStreakKey(id),
    );

    let winStreak = 0;
    if (isInt(cached)) {
      winStreak = cached;
    } else {
      const result = await this.userModel.findById(id).select('winStreak');
      winStreak = result?.winStreak ?? 0;
    }
    if (winStreak > MAX_WIN_STREAK) {
      winStreak = 1;
    }

    return winStreak;
  }

  async updateWinStreak(id: number, winStreak: number) {
    if (winStreak < 0 && winStreak > MAX_WIN_STREAK) {
      throw new Error('Invalid win streak');
    }

    // Cache for 5 minute
    this.cacheManager.set(this._getWinStreakKey(id), winStreak, 5 * 60 * 1000);

    return this.userModel.updateOne(
      {
        _id: id,
      },
      { winStreak },
    );
  }

  async addReferral(id: number, parentId: number) {
    if (id === parentId) {
      throw new BadRequestException('User cannot refer yourself');
    }

    const user = await this.userModel.findById(id);

    if (!user || user.parentId) {
      throw new BadRequestException(
        `User with ID ${id} does not exist or exist partner`,
      );
    }

    // SEND MESSAGE TO PARENT
    const fullname = [user.firstName, user.lastName]
      .filter((t) => !!t)
      .join(' ');

    try {
      const task = await this.taskService.claimAddFriendTask(id, parentId);
      this.telegramBotService.sendMessage(
        parentId,
        `🎉 You referred ${user.username || fullname}! 🎉 \nYou've been rewarded with ${task.point} Hopium!  🪙`,
      );
    } catch (e) {
      this.logger.error('Error claimAddFriendTask: ' + e.message);
    }

    return this.userModel.updateOne(
      {
        _id: id,
      },
      { parentId },
    );
  }

  async getTotalUsers(): Promise<number> {
    return this.userModel.countDocuments();
  }

  async getTotalReferrals(): Promise<number> {
    return this.userModel.countDocuments({ parentId: { $ne: null } });
  }
}
