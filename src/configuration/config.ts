import { type Config, Environment } from './config.interface';

export default (): Config => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  environment: (process.env.NODE_ENV as Environment) || Environment.DEVELOPMENT,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramStatisticToken: process.env.TELEGRAM_STATISTIC_TOKEN,
  telegramPvPToken: process.env.TELEGRAM_PVP_TOKEN,
  telegramTipToken: process.env.TELEGRAM_TIP_TOKEN,
  telegramGroupId: parseInt(process.env.TELEGRAM_GROUP_ID),
  telegramChannelId: parseInt(process.env.TELEGRAM_CHANNEL_ID),
  telegramMiniAppUrl: process.env.TELEGRAM_MINI_APP_URL || 'https://hopium.dev',
  telegramPolling: process.env.TELEGRAM_POLLING
    ? process.env.TELEGRAM_POLLING === 'true'
    : true,
  mongoUri: process.env.MONGO_URI,
  redisUri: process.env.REDIS_URI,
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX || 'hopium',
  cors: {
    enabled: process.env.CORS_ENABLED === 'true',
    origins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : [],
  },
  bull: {
    connection: {
      host: process.env.BULL_REDIS_HOST || 'localhost',
      port: parseInt(process.env.BULL_REDIS_PORT, 10) || 6379,
      db: parseInt(process.env.BULL_REDIS_DB, 10) || 0,
      username: process.env.BULL_REDIS_USERNAME,
      password: process.env.BULL_REDIS_PASSWORD,
    },
    prefix: process.env.BULL_PREFIX || 'hopium-bull',
  },
  whitelistChatIds: process.env.WHITELIST_CHAT_IDS
    ? process.env.WHITELIST_CHAT_IDS.split(',').map((id) => parseInt(id, 10))
    : [],
  whitelistGroupIds: process.env.WHITELIST_GROUP_IDS
    ? process.env.WHITELIST_GROUP_IDS.split(',').map((id) => parseInt(id, 10))
    : [],
  allowedTopicIds: process.env.ALLOWED_TOPIC_IDS
    ? process.env.ALLOWED_TOPIC_IDS.split(',').map((id) => parseInt(id, 10))
    : [],
  schedulesEnabled: process.env.SCHEDULES_ENABLED
    ? process.env.SCHEDULES_ENABLED === 'true'
    : true,
  ton: {
    isMainnet: process.env.IS_TON_MAINNET === 'true',
    validAuthTime: 15 * 60, // 15 minutes
    allowedDomains: [],
  },
  jwt: {
    secret: process.env.JWT_SECRET || '123456a@',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  groupOwnerId: parseInt(process.env.GROUP_OWNER_ID, 10),
  grpcClient: {
    wallet: {
      name: 'WALLET_GRPC_CLIENT',
      host: process.env.GRPC_WALLET_HOST,
      authApiKey: process.env.GRPC_WALLET_AUTH_API_KEY,
    },
  },
  kafka: {
    brokers: process.env.KAFKA_BROKERS?.split(',') || [],
    consumerGroupId: process.env.KAFKA_CONSUMER_GROUP_ID || 'hopium-be-consumer',
  },
});
