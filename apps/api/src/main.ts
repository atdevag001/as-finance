import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.validation.js';

// Enable BigInt JSON serialization (Prisma returns BigInt for paise fields).
// Safe serialization: values within ±Number.MAX_SAFE_INTEGER (2^53 - 1) are
// returned as JSON numbers; larger magnitudes fall back to a string to avoid
// silent precision loss during JSON.stringify.
(BigInt.prototype as unknown as { toJSON: () => number | string }).toJSON =
  function () {
    const v = this as unknown as bigint;
    const MAX = BigInt(Number.MAX_SAFE_INTEGER);
    const MIN = -MAX;
    return v <= MAX && v >= MIN ? Number(v) : v.toString();
  };

async function bootstrap() {
  // Fail-fast: validate environment before anything else
  const env = validateEnv();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Trust the first proxy hop (nginx) so per-IP throttling sees the real client IP
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

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
          // TODO(tech-debt): 'unsafe-inline' on styleSrc is required by Swagger
          // UI and some MUI runtime styles. Remove once inline styles are
          // eliminated or replaced with a nonce/hash-based policy.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow Swagger UI to load
    }),
  );

  // CORS configuration — env-driven allowlist.
  // CORS_ORIGINS is a comma-separated list of allowed browser origins.
  // Requests with no Origin header (curl, same-origin, server-to-server) are
  // permitted; any other origin must appear in the allowlist or is rejected.
  const allowedOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true); return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true); return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

  // Wire SIGTERM/SIGINT to Nest lifecycle so PrismaService.onModuleDestroy() runs $disconnect() before exit.
  app.enableShutdownHooks();

  await app.listen(env.PORT);

  const logger = app.get(Logger);
  logger.log(
    `AS Finance LMS API running on port ${env.PORT} [${env.NODE_ENV}]`,
  );
  logger.log(`Swagger docs available at http://localhost:${env.PORT}/api/docs`);
}

void bootstrap();
