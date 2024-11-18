import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { ParseMode } from 'node-telegram-bot-api';
import { Config } from 'src/configuration/config.interface';
import { UsersService } from 'src/users/users.service';
import { WalletsService } from 'src/wallets/wallets.service';
import { REDIS_PROVIDER } from 'src/redis/redis.provider';
import Redis from 'ioredis';
import { GamePvPService } from 'src/game/game-pvp.service';
import { Target, Type } from 'src/game/type/pvp.type';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LINK_CHECK_BALANCE } from 'src/game/constants/game';
import {
  PVP_QUEUE_EVENT_NAME,
  PVP_QUEUE_NAME,
  TIME_SEND_MESSAGE_LIMIT,
} from './telegram-pvp-bot.constants';
import { randomInArray } from 'src/commons/utils/helper';

import { Asset } from '../wallets/constants/common';

const acceptTexts = ['Accept', 'Agree', 'Bless', 'Approve', 'Adopt', 'Battle'];

const iconTexts = ['❗️', '‼️', '✅', '➡️', '⬅️', '📈', '📉', '⚔️', '⚡️'];

@Injectable()
export class TelegramPvPBotService implements OnModuleInit {
  private readonly bot: TelegramBot;
  private readonly logger = new Logger(TelegramPvPBotService.name);
  private readonly whitelistGroupIds: number[];
  private readonly allowedTopicIds: number[];

  constructor(
    private readonly configService: ConfigService<Config>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => GamePvPService))
    private readonly gamePvPService: GamePvPService,
    private readonly walletsService: WalletsService,
    @Inject(REDIS_PROVIDER.CACHE) private readonly redisCache: Redis,
    @InjectQueue(PVP_QUEUE_NAME)
    private readonly pvpQueue: Queue,
  ) {
    const polling = this.configService.get<boolean>('telegramPolling');

    this.bot = new TelegramBot(
      this.configService.get<string>('telegramPvPToken'),
      { polling },
    );

    this.whitelistGroupIds =
      this.configService.get<number[]>('whitelistGroupIds');
    this.allowedTopicIds = this.configService.get<number[]>('allowedTopicIds');
  }

  onModuleInit() {
    this.initBot();
  }

  initBot() {
    this.setBotCommands();
    this.handlePvPCommand();
    this.handleCallbackQuery();
  }

  private setBotCommands() {
    this.bot.setMyCommands([
      {
        command: 'bless',
        description: 'Usage: /bless <target> <amount> (e.g., /bless pump 500)',
      },
    ]);
  }

  private handlePvPCommand() {
    this.bot.onText(/\/bless(@\w+)?$/, (msg) => {
      const chatId = msg.chat.id;
      const topicId = msg.message_thread_id;

      if (!this.whitelistGroupIds.includes(chatId)) {
        this.sendMessage(chatId, 'This command is not allowed in this group.', {
          reply_to_message_id: msg.message_id,
        });
        return;
      }

      if (
        typeof topicId !== 'number' ||
        !this.allowedTopicIds.includes(topicId)
      ) {
        this.sendMessage(chatId, 'This command is not allowed in this topic.', {
          reply_to_message_id: msg.message_id,
        });
        return;
      }

      this.sendMessage(
        chatId,
        'Please provide a target and amount. Usage: /bless <target> <amount> (e.g., /bless pump 500)',
        { reply_to_message_id: msg.message_id },
      );
    });

    this.bot.onText(
      /\/bless(@\w+)? (dump|pump) (-?\d+)/i,
      async (msg, match) => {
        const chatId = msg.chat.id;
        const topicId = msg.message_thread_id;

        if (!this.whitelistGroupIds.includes(chatId)) {
          this.sendMessage(
            chatId,
            'This command is not allowed in this group.',
            { reply_to_message_id: msg.message_id },
          );
          return;
        }

        if (
          typeof topicId !== 'number' ||
          !this.allowedTopicIds.includes(topicId)
        ) {
          this.sendMessage(
            chatId,
            'This command is not allowed in this topic.',
            { reply_to_message_id: msg.message_id },
          );
          return;
        }

        const userId = msg.from.id;
        await this.processPvPCommand(chatId, userId, match, msg);
      },
    );
  }

  private async processPvPCommand(
    chatId: number,
    userId: number,
    match: RegExpMatchArray,
    msg: TelegramBot.Message,
  ) {
    this.checkRateLimit(userId, chatId, msg);
    const [, , target] = match;
    const input = msg.text.split(' ');
    const amountStr = input[input.length - 1]; // Get the last part of the input
    const amount = parseFloat(amountStr); // Use parseFloat to handle decimal numbers
    const normalizedTarget = target.toLowerCase();

    // Validate the amount
    if (isNaN(amount) || amount <= 0) {
      this.logger.warn(`Invalid amount: ${amountStr} from user: ${userId}`);
      this.sendMessage(chatId, 'The amount must be a positive number.', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    // Get user information
    const user = await this.usersService.getUser(userId);
    if (!user) {
      this.sendMessage(
        chatId,
        `⚠️ The receiver is not registered with the Hopium.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Register',
                  url: LINK_CHECK_BALANCE,
                },
              ],
            ],
          },
          reply_to_message_id: msg.message_id,
        },
      );
      return;
    }
    const userBalanceData = await this.walletsService.getBalance({
      userId: userId,
      assetId: Asset.HOPIUM,
    });

    // Check if the user has sufficient balance
    if (userBalanceData.available < amount) {
      this.logger.warn(
        `Insufficient balance for user: ${userId}, required: ${amount}, available: ${userBalanceData.available}`,
      );

      this.sendMessage(
        chatId,
        'Insufficient balance. Please check your balance.',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Check Balance',
                  url: LINK_CHECK_BALANCE,
                },
              ],
            ],
          },
          reply_to_message_id: msg.message_id,
          message_thread_id: msg.message_thread_id,
        },
      );
      return;
    }

    try {
      // Create a PvP room
      this.logger.log(
        `Creating PvP room for user: ${userId} with target: ${normalizedTarget} and amount: ${amount}`,
      );
      const userName = msg.from.username || msg.from.first_name;
      const createdAt = Date.now();
      const pvpKey = `pvp:${userId}:${createdAt}`;

      // Send a message to the chat with the PvP challenge
      const message = `<b>🪄 Token PvP Challenge! 🪄</b>\n\n@${userName} bets ${amount} $Hopium on ${normalizedTarget}!\nWho’s up for the challenge? Tap Accept to join the battle now!`;
      const options = {
        parse_mode: 'HTML' as ParseMode,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `${randomInArray(acceptTexts)} ${randomInArray(iconTexts)}`,
                callback_data: `${pvpKey}`,
              },
            ],
          ],
        },
        message_thread_id: msg.message_thread_id,
      };
      const { message_id } = await this.sendMessageDirectly(
        chatId,
        message,
        options,
      );
      await this.gamePvPService.createPvPRoom({
        userId,
        target: normalizedTarget as Target,
        amount,
        chatId,
        messageId: message_id,
        userName,
        createdAt,
        pvpKey,
        type: Type.TELEGRAM_CHAT,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create PvP room for user: ${userId}, error: ${error.message}`,
      );
      this.sendMessage(chatId, error.message, {
        reply_to_message_id: msg.message_id,
      });
    }
  }

  private handleCallbackQuery() {
    // Listen for callback queries from Telegram
    this.bot.on('callback_query', async (callbackQuery) => {
      const msg = callbackQuery.message;
      const chatId = msg.chat.id;

      // Handle acceptance of PvP challenge
      if (callbackQuery.data.startsWith('pvp:')) {
        const [, userId, pvpKey] = callbackQuery.data.split(':');
        try {
          // Get PvP data from Redis
          const redisKey = `pvp:${userId}:${pvpKey}`;
          const pvpDataStr = await this.redisCache.get(redisKey);

          if (pvpDataStr) {
            const { amount, target, userName } = JSON.parse(pvpDataStr);
            const acceptorUserName =
              callbackQuery.from.username || callbackQuery.from.first_name;

            // Add job to queue
            await this.pvpQueue.add(PVP_QUEUE_EVENT_NAME.PVP_ACCEPT_ROOM, {
              acceptorId: callbackQuery.from.id,
              acceptorUserName,
              pvpKey: redisKey,
              messageId: msg.message_id,
              amount,
              target,
              userName,
              chatId,
            });
          }
        } catch (error) {
          if (error.name === 'InsufficientBalanceError') {
            this.sendMessage(chatId, error.message, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: 'Check Balance',
                      url: LINK_CHECK_BALANCE,
                    },
                  ],
                ],
              },
              reply_to_message_id: msg.message_id,
            });
          } else {
            this.sendMessage(chatId, error.message, {
              reply_to_message_id: msg.message_id,
            });
          }
        }
      }

      // Answer the callback query to remove the loading state in the Telegram client
      this.bot.answerCallbackQuery(callbackQuery.id);
    });
  }

  async sendMessageDirectly(
    chatId: TelegramBot.ChatId,
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ): Promise<TelegramBot.Message> {
    return this.bot.sendMessage(chatId, text, options);
  }

  async sendMessage(
    chatId: TelegramBot.ChatId,
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ): Promise<void> {
    await this.pvpQueue.add(PVP_QUEUE_EVENT_NAME.PVP_SEND_MESSAGE, {
      chatId,
      text,
      options,
    });
  }

  async editMessageText(
    text: string,
    options: TelegramBot.EditMessageTextOptions,
  ): Promise<void> {
    this.bot.editMessageText(text, options);
  }

  async editMessageReplyMarkup(
    replyMarkup: any,
    options: { chat_id: number; message_id: number },
  ) {
    try {
      await this.bot.editMessageReplyMarkup(replyMarkup, options);
    } catch (error) {
      this.logger.error(
        `Failed to edit message reply markup: ${error.message}`,
      );
    }
  }

  async checkRateLimit(
    userId: number,
    chatId: number,
    msg: TelegramBot.Message,
  ): Promise<boolean> {
    const lastCommandTimeKey = `lastPvPCommandTime:${userId}`;
    const lastCommandTime = await this.redisCache.get(lastCommandTimeKey);
    const currentTime = Date.now();

    if (
      lastCommandTime &&
      currentTime - parseInt(lastCommandTime) < TIME_SEND_MESSAGE_LIMIT
    ) {
      const rateLimitKey = `rateLimitMessageSent:${userId}`;
      const rateLimitMessageSent = await this.redisCache.get(rateLimitKey);

      if (!rateLimitMessageSent) {
        await this.sendMessage(
          chatId,
          'Please wait a few seconds before sending another command.',
          {
            reply_to_message_id: msg.message_id,
          },
        );

        // Set a flag to indicate that the rate limit message has been sent
        await this.redisCache.set(
          rateLimitKey,
          'true',
          'EX',
          TIME_SEND_MESSAGE_LIMIT / 1000,
        );
      }

      return true; // Rate limit hit
    }

    // Update the last command time
    await this.redisCache.set(
      lastCommandTimeKey,
      currentTime.toString(),
      'EX',
      TIME_SEND_MESSAGE_LIMIT / 1000,
    );

    return false; // No rate limit hit
  }
}
