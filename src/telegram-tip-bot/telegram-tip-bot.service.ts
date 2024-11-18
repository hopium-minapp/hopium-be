import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as TelegramBot from 'node-telegram-bot-api';
import { Config } from 'src/configuration/config.interface';
import { UsersService } from 'src/users/users.service';
import { WalletsService } from 'src/wallets/wallets.service';
import { TIP_SEND_MESSAGE_QUEUE_NAME } from './telegram-tip-bot.constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TelegramBotService } from 'src/telegram-bot/telegram-bot.service';
import { LINK_CHECK_BALANCE } from 'src/game/constants/game';

@Injectable()
export class TelegramTipBotService implements OnModuleInit {
  private readonly bot: TelegramBot;
  private readonly logger = new Logger(TelegramTipBotService.name);
  private readonly whitelistGroupIds: number[];

  constructor(
    private readonly configService: ConfigService<Config>,
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    @InjectQueue(TIP_SEND_MESSAGE_QUEUE_NAME)
    private readonly tipSendMessageQueue: Queue,
    private readonly telegramBotService: TelegramBotService,
  ) {
    const polling = this.configService.get<boolean>('telegramPolling');

    this.bot = new TelegramBot(
      this.configService.get<string>('telegramTipToken'),
      { polling },
    );

    this.whitelistGroupIds =
      this.configService.get<number[]>('whitelistGroupIds');
  }

  onModuleInit() {
    this.initBot();
  }

  initBot() {
    this.setBotCommands();
    this.handleTipCommand();
  }

  private setBotCommands() {
    this.bot.setMyCommands([
      {
        command: 'tip',
        description: 'Usage: /tip @username <amount> (e.g., /tip @user 300)',
      },
    ]);
  }

  private handleTipCommand() {
    // Handle tipping with specified username
    this.bot.onText(/\/tip(@\w+)?\s+(\@\w+)\s+(\d+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const senderId = msg.from.id;
      const senderUsername = msg.from.username || msg.from.first_name;
      const receiverUsername = match[2].slice(1);

      const input = msg.text.split(' ');
      const amountStr = input[input.length - 1];
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount < 1) {
        return this.sendMessage(
          chatId,
          'Amount must be a positive number greater than or equal to 1.',
          {
            reply_to_message_id: msg.message_id,
          },
        );
      }

      if (this.whitelistGroupIds.includes(chatId)) {
        const receiver =
          await this.usersService.getUserByUsername(receiverUsername);
        if (!receiver) {
          return this.sendMessage(
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
        }

        if (senderId === receiver._id) {
          return this.sendMessage(chatId, `You cannot tip yourself.`, {
            reply_to_message_id: msg.message_id,
          });
        }

        await this.processTip(
          chatId,
          senderId,
          senderUsername,
          receiver._id,
          receiverUsername,
          amount,
          msg.message_id,
        );
      } else {
        this.sendMessage(
          chatId,
          `User or group chat not allowed: ${msg.chat.id}`,
          { reply_to_message_id: msg.message_id },
        );
      }
    });

    // Handle tipping via reply to a message
    this.bot.onText(/\/tip(@\w+)?\s+(\d+)/, async (msg) => {
      const chatId = msg.chat.id;
      const senderId = msg.from.id;
      const senderUsername = msg.from.username || msg.from.first_name;

      const input = msg.text.split(' ');
      const amountStr = input[input.length - 1];
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount <= 0) {
        return this.sendMessage(chatId, 'Amount must be a positive number.', {
          reply_to_message_id: msg.message_id,
        });
      }

      if (this.whitelistGroupIds.includes(chatId)) {
        const ownerId = this.configService.get<number>('groupOwnerId');
        if (
          !msg.reply_to_message ||
          !msg.reply_to_message.from ||
          msg.reply_to_message.from.id === ownerId
        ) {
          return this.sendMessage(
            chatId,
            'Please reply to a message to tip the user.',
            { reply_to_message_id: msg.message_id },
          );
        }

        const receiverUsername =
          msg.reply_to_message.from.username ||
          msg.reply_to_message.from.first_name;
        const receiverId = msg.reply_to_message.from.id;

        if (senderId === receiverId) {
          return this.sendMessage(chatId, `You cannot tip yourself.`, {
            reply_to_message_id: msg.message_id,
          });
        }

        await this.processTip(
          chatId,
          senderId,
          senderUsername,
          receiverId,
          receiverUsername,
          amount,
          msg.message_id,
        );
      } else {
        this.sendMessage(
          chatId,
          `User or group chat not allowed: ${msg.chat.id}`,
          { reply_to_message_id: msg.message_id },
        );
      }
    });
  }

  private async processTip(
    chatId: number,
    senderId: number,
    senderUsername: string,
    receiverId: number,
    receiverUsername: string,
    amount: number,
    messageId: number,
  ) {
    if (senderId === receiverId) {
      this.sendMessage(chatId, `You cannot tip yourself.`, {
        reply_to_message_id: messageId,
      });
      return;
    }

    try {
      await Promise.all([
        this.usersService.getUser(senderId),
        this.usersService.getUser(receiverId),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to tip hopium from user @${senderUsername}: ${error.message}`,
      );

      this.sendMessage(
        chatId,
        `⚠️ The sender or receiver is not registered with the Hopium.`,
        { reply_to_message_id: messageId },
      );
    }

    try {
      await this.walletsService.tipHopium(senderId, receiverId, amount);
      this.sendMessage(
        chatId,
        `@${senderUsername} tipped @${receiverUsername} ${amount} $Hopium`,
        { reply_to_message_id: messageId },
      );
      this.telegramBotService.sendMessage(
        receiverId,
        `🎉 You have received a tip of ${amount} $Hopium from @${senderUsername}!`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to tip hopium for user @${senderUsername}: ${error.message}`,
      );
      this.sendMessage(
        chatId,
        `⚠️ You do not have enough balance to send this tip. Please top up your account.`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Top up',
                  url: LINK_CHECK_BALANCE,
                },
              ],
            ],
          },
          reply_to_message_id: messageId,
        },
      );
    }
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
    await this.tipSendMessageQueue.add('sendMessage', {
      chatId,
      text,
      options,
    });
  }
}
