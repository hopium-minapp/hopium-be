import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { Config } from 'src/configuration/config.interface';
import { GameService } from 'src/game/game.service';
import { RankService } from 'src/rank/rank.service';
import { UsersService } from 'src/users/users.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class TelegramStatisticsBotService implements OnModuleInit {
  private readonly bot: TelegramBot;
  private readonly logger = new Logger(TelegramStatisticsBotService.name);
  private readonly whitelistChatIds: number[];

  constructor(
    private readonly configService: ConfigService<Config>,
    private readonly rankService: RankService,
    private readonly usersService: UsersService,
    private readonly gameService: GameService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    const polling = this.configService.get<boolean>('telegramPolling');

    this.bot = new TelegramBot(
      this.configService.get<string>('telegramStatisticToken'),
      { polling },
    );
    this.whitelistChatIds =
      this.configService.get<number[]>('whitelistChatIds');
  }

  onModuleInit() {
    this.initBot();
  }

  initBot() {
    this.bot.setMyCommands([
      { command: '/stats', description: 'Get statistics' },
      { command: '/top', description: 'Get top users' },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.bot.onText(/\/stats/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (this.isChatIdAllowed(chatId)) {
        const stats = await this.getStats();
        this.sendMessage(chatId, stats);
      } else {
        this.sendMessage(chatId, 'You are not authorized to use this bot.');
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.bot.onText(/\/top/, async (msg, match) => {
      const chatId = msg.chat.id;
      if (this.isChatIdAllowed(chatId)) {
        const topUsers = await this.getTopUsers();
        const message = this.formatTopUsersMessage(topUsers);
        this.sendMessage(chatId, message);
      } else {
        this.sendMessage(chatId, 'You are not authorized to use this bot.');
      }
    });
  }

  sendMessage(
    chatId: TelegramBot.ChatId,
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ): Promise<TelegramBot.Message> {
    const sendMessageOptions: TelegramBot.SendMessageOptions = {
      ...options,
      parse_mode: 'HTML',
    };
    return this.bot.sendMessage(chatId, text, sendMessageOptions);
  }

  formatTopUsersMessage(users: any[]): string {
    let message = '<pre>Top 20 users with highest points:\n\n';
    message += 'Rank | Username      | Points  | Friends | Predictions\n';
    message += '-----|---------------|---------|---------|-------------\n';
    users.forEach((user, index) => {
      const truncatedUsername =
        user.username?.length > 14
          ? user.username.substring(0, 11) + '...'
          : user.username || `${user._id}`;
      message += `${String(index + 1).padEnd(5, ' ')}| ${truncatedUsername.padEnd(14, ' ')}| ${String(user.point).padStart(7, ' ')} | ${String(user.friends).padStart(7, ' ')} | ${String(user.predictions).padStart(11, ' ')}\n`;
    });
    message += '</pre>';
    return message;
  }

  isChatIdAllowed(chatId: number): boolean {
    return this.whitelistChatIds.includes(chatId);
  }

  async getTopUsers(): Promise<any[]> {
    const cachedTopUsers = await this.cacheManager.get<any[]>('topUsers');
    if (cachedTopUsers) {
      this.logger.log('Top users retrieved from cache');
      return cachedTopUsers;
    }

    this.logger.log('Fetching top users from database');
    const topUsers = await this.rankService.getTopUsersForStats(20);
    // Cache for 5 minute
    await this.cacheManager.set('topUsers', topUsers, 5 * 60 * 1000);
    this.logger.log('Top users fetched and cached');
    return topUsers;
  }

  async getStats(): Promise<string> {
    const cachedStats = await this.cacheManager.get<string>('stats');
    if (cachedStats) {
      this.logger.log('Stats retrieved from cache');
      return cachedStats;
    }

    this.logger.log('Fetching stats from database');
    const totalUsers = await this.usersService.getTotalUsers();
    const totalPredictions = await this.gameService.getTotalPredictions();
    const totalReferrals = await this.usersService.getTotalReferrals();

    const stats =
      `<b>Statistics:</b>\n\n` +
      `<b>👥  Total Users:</b> ${totalUsers} \n` +
      `<b>📊  Total Predictions:</b> ${totalPredictions} \n` +
      `<b>🔗  Total Referrals:</b> ${totalReferrals}`;
    // Cache for 5 minute
    await this.cacheManager.set('stats', stats, 5 * 60 * 1000);
    this.logger.log('Stats fetched and cached');
    return stats;
  }
}
