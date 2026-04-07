import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.validation.js';

// Enable BigInt JSON serialization (Prisma returns BigInt for paise fields)
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  // Fail-fast: validate environment before anything else
  const env = validateEnv();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Structured logging via pino
  app.useLogger(app.get(Logger));

  // Cookie parser middleware (required for reading httpOnly cookies like refresh_token)
  app.use(cookieParser());

  // Security headers via helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow Swagger UI to load
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AS Finance LMS API')
    .setDescription(
      'Loan Management System API — customer onboarding, loan lifecycle, collections, accounting, and reporting',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.PORT);

  const logger = app.get(Logger);
  logger.log(
    `AS Finance LMS API running on port ${env.PORT} [${env.NODE_ENV}]`,
  );
  logger.log(`Swagger docs available at http://localhost:${env.PORT}/api/docs`);
}

bootstrap();
