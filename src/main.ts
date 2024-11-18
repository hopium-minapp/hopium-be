import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import compression from '@fastify/compress';
import helmet from '@fastify/helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Config, CorsConfig, KafkaConfig } from './configuration/config.interface';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AllExceptionsFilter } from './commons/filters/http-exception.filter';
import { RedisIoAdapter } from './commons/adapters/redis-io.adapter';
import grpcInit from './grpc';
import kafkaInit from './kafka';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
    }),
  );

  const configService = app.get(ConfigService<Config>);

  const { httpAdapter } = app.get(HttpAdapterHost);

  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(configService.get('redisUri'));

  app.useWebSocketAdapter(redisIoAdapter);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  await app.register(compression);
  await app.register(helmet);

  app.enableShutdownHooks();

  app.setGlobalPrefix('api');

  const isDevelopment = configService.get('environment') === 'development';

  if (isDevelopment) {
    const config = new DocumentBuilder()
      .addBearerAuth({
        type: 'apiKey',
        in: 'header',
        name: 'X-Auth-User',
      })
      .setTitle('Hopium Backend')
      .setDescription('The Hopium API description')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const corsConfig = configService.get<CorsConfig>('cors');

  if (corsConfig.enabled) {
    app.enableCors({
      origin: corsConfig.origins,
      credentials: true,
    });
  }

  const logger = new Logger('bootstrap');

  // gRPC
  grpcInit(app);

  // kafka
  const kafkaConfig = configService.get<KafkaConfig>('kafka');
  kafkaInit(app, kafkaConfig);

  await app.startAllMicroservices();

  const port = configService.get('port');
  await app.listen(port, '0.0.0.0').then(() => {
    logger.log(`Server started on http://localhost:${port}`);
  });
}
bootstrap();
