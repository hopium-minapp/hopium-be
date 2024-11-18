import { InjectQueue } from '@nestjs/bullmq';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import * as TelegramBot from 'node-telegram-bot-api';
import { ParseMode } from 'node-telegram-bot-api';
import { Config } from 'src/configuration/config.interface';
import { LINK_CHECK_BALANCE, TIME_PVP_DURATION } from 'src/game/constants/game';
import { GamePvPService } from 'src/game/game-pvp.service';
import { Target } from 'src/game/type/pvp.type';
import {
  BOT_QUEUE_NAME,
  HANDLE_PVP_RESULT,
  SEND_MESSAGE,
} from './telegram-bot.constants';
import { TelegramPvPBotService } from 'src/telegram-pvp-bot/telegram-pvp-bot.service';
import { UsersService } from 'src/users/users.service';
import { WalletsService } from 'src/wallets/wallets.service';

import { Asset } from '../wallets/constants/common';

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly bot: TelegramBot;
  private readonly logger = new Logger(TelegramBotService.name);
  constructor(
    private readonly configService: ConfigService<Config>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly gamePvPService: GamePvPService,
    private readonly telegramPvpBotService: TelegramPvPBotService,
    @InjectQueue(BOT_QUEUE_NAME)
    private readonly messageQueue: Queue,
  ) {
    const polling = this.configService.get<boolean>('telegramPolling');
    this.bot = new TelegramBot(
      this.configService.get<string>('telegramBotToken'),
      { polling },
    );
  }

  onModuleInit() {
    this.initBot();
  }

  initBot() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.bot.onText(/\/start/, (msg, match) => {
      // 'msg' is the received Message from Telegram
      // 'match' is the result of executing the regexp above on the text content
      // of the message
      const chatId = msg.chat.id;
      const username = msg.from?.username;

      if (username) {
        this.handleOnStartMessage(username, chatId);
      }

      // Check if there is a parameter in the message
      const parentId = msg?.text ? parseInt(msg.text.split('_')[1], 10) : null;
      if (
        !!msg.from &&
        !msg.from?.is_bot &&
        parentId !== null &&
        !isNaN(parentId) &&
        parentId > 0
      ) {
        this.handleStartCommand(msg, parentId);
      }
    });
    this.handlePrivateTipCommand();
    this.handlePvPCommand();
  }

  private async handleStartCommand(msg: TelegramBot.Message, parentId: number) {
    const userId = msg.from?.id;

    try {
      const parentUser = await this.usersService.getUser(parentId);
      if (!parentUser) {
        this.logger.warn('Parent user not found for parentId: ' + parentId);
        return;
      }

      const user = await this.usersService.getUser(userId);
      if (!user) {
        await Promise.all([
          this.usersService.updateOrCreateUser({
            id: userId,
            username: msg.from?.username,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name,
            allowsWriteToPm: true,
            languageCode: msg.from.language_code,
            isPremium: false,
            addedToAttachmentMenu: false,
          }),
          this.walletsService.getOrCreateWallet({
            userId,
            isPremium: false,
          }),
        ]);
        await this.usersService.addReferral(userId, parentId);
      }
    } catch (error) {
      this.logger.error('Error handling start command: ' + error.message);
    }
  }

  handleOnStartMessage(username: string, chatId: number) {
    this.bot.sendMessage(
      chatId,
      `Hello, ${username}!\n\nHow good is your prediction skill? 😎\nLet's predict the BTC price and earn rewards! ️🏆`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `🚀 It's predict time! 🚀`,
                web_app: {
                  url: this.configService.get<string>('telegramMiniAppUrl'),
                },
              },
            ],
            [
              {
                text: '👥 Join Hopium Community 👥',
                url: 'https://t.me/hopium_community',
              },
            ],
          ],
        },
      },
    );
  }

  private handlePrivateTipCommand() {
    this.bot.onText(/\/tip (@\w+) (\d+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const senderId = msg.from.id;
      const senderUsername = msg.from.username;
      const receiverUsername = match[1].slice(1); // removing the '@'

      // Get the amount directly from the input text
      const input = msg.text.split(' ');
      const amountStr = input[input.length - 1];
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount <= 0) {
        return this.sendMessage(chatId, 'Amount must be a positive number.');
      }

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

      // Process the tip transaction and check for success
      await this.processTip(
        senderId,
        senderUsername,
        receiver._id,
        receiverUsername,
        amount,
      );
    });
  }

  async processTip(
    senderId: number,
    senderUsername: string,
    receiverId: number,
    receiverUsername: string,
    amount: number,
  ) {
    try {
      await this.walletsService.tipHopium(senderId, receiverId, amount);

      this.sendMessage(
        senderId,
        `@${senderUsername} tipped @${receiverUsername} ${amount} $Hopium.`,
      );

      const receiver = await this.usersService.getUser(receiverId);
      this.sendMessage(
        receiver._id,
        `@${senderUsername} tipped you ${amount} $Hopium.`,
      );
    } catch (error) {
      this.sendMessage(senderId, `Failed to process tip: ${error.message}`);
    }
  }
  private handlePvPCommand() {
    this.bot.onText(/\/bless(@\w+)?$/, (msg) => {
      const chatId = msg.chat.id;

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
    this.telegramPvpBotService.checkRateLimit(userId, chatId, msg);
    const [, , target] = match;
    const input = msg.text.split(' ');
    const amountStr = input[input.length - 1];
    const amount = parseFloat(amountStr);
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
    const userName = msg.from.username;
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
      // Create and accept PvP room with bot
      this.logger.log(
        `Creating and accepting PvP room with bot for user: ${userId} with target: ${normalizedTarget} and amount: ${amount}`,
      );
      const { _id, openPrice } =
        await this.gamePvPService.createAndAcceptPvPWithBot(
          userId,
          normalizedTarget as Target,
          amount,
          chatId,
          msg.message_id,
        );

      // Send a message to the chat with the PvP challenge
      const message = `<b>🪄Bless Challenge is Live!🪄</b><i>\n\n</i>🎮 Game ID: ${_id}<i>\n</i>🙏 @${userName} (${normalizedTarget}) vs @Bot (${normalizedTarget === 'pump' ? 'dump' : 'pump'})<i>\n</i>🏆 Prize Pool: ${amount * 2} $Hopium<i>\n</i>💸 Tax: 5%<i>\n</i>📈 Open Price: ${openPrice}<i>\n\n</i>Current Time: ${new Date().toUTCString()} (UTC)<i>\n</i>Result Time: ${new Date(Date.now() + 7000).toUTCString()} (UTC)<i>\n\n</i>🍀 The result will be announced at ${new Date(Date.now() + 7000).toUTCString()} (UTC)`;
      const options = {
        parse_mode: 'HTML' as ParseMode,
        message_thread_id: msg.message_thread_id,
      };
      await this.sendMessageDirectly(chatId, message, options);

      await this.messageQueue.add(
        HANDLE_PVP_RESULT,
        {
          userId,
          creatorId: userId,
          acceptorId: 0,
          openPrice,
          userName,
          acceptorUserName: 'Bot',
          chatId,
          messageId: msg.message_id,
          amount,
          normalizedTarget,
        },
        { delay: TIME_PVP_DURATION },
      );
    } catch (error) {
      this.logger.error(
        `Failed to create and accept PvP room for user: ${userId}, error: ${error.message}`,
      );
      this.sendMessage(chatId, error.message, {
        reply_to_message_id: msg.message_id,
      });
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
    await this.messageQueue.add(SEND_MESSAGE, {
      chatId,
      text,
      options,
    });
  }

  async checkUserInChat(userId: number, chatId: TelegramBot.ChatId) {
    try {
      const chatMember = await this.bot.getChatMember(chatId, userId);
      return chatMember.status === 'member';
    } catch (error) {
      return false;
    }
  }
}
