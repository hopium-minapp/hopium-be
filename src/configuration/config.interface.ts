export enum Environment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
}

export interface Config {
  port: number;
  environment: Environment;
  telegramBotToken: string;
  telegramStatisticToken: string;
  telegramPvPToken: string;
  telegramTipToken: string;
  telegramGroupId: number;
  telegramChannelId: number;
  telegramMiniAppUrl: string;
  telegramPolling: boolean;
  mongoUri: string;
  redisUri: string;
  redisKeyPrefix: string;
  cors: CorsConfig;
  bull: BullConfig;
  whitelistChatIds: number[];
  whitelistGroupIds: number[];
  allowedTopicIds: number[];
  schedulesEnabled: boolean;
  // TON
  ton: TonConfig;
  jwt: JwtConfig;
  groupOwnerId: number;
  grpcClient: GrpcClientConfig;
  // KAFKA
  kafka: KafkaConfig;
}

export interface TonConfig {
  isMainnet: boolean;
  validAuthTime: number;
  allowedDomains: string[];
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

export interface CorsConfig {
  enabled: boolean;
  origins: string[];
}

export interface BullConfig {
  connection: {
    host: string;
    port: number;
    db: number;
    username?: string;
    password?: string;
  };
  prefix: string;
}

export interface GrpcClientConfig {
  wallet: {
    name: string;
    host: string;
    authApiKey: string;
  };
}

export interface KafkaConfig {
  brokers: string[];
  consumerGroupId: string;
}
