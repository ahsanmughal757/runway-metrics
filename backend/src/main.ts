import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env, isProduction } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestIdMiddleware } from './common/logging/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Buffers writes into a single stdout line, which is what a log shipper
    // and `docker logs` both expect.
    bufferLogs: true,
  });

  // Routes Nest's own boot/request logging through Pino so every line shares
  // one JSON shape and the same redaction. `PinoLogger` is the provider exported
  // by nestjs-pino; Nest's own `Logger` class is not injectable and throws
  // "could not find Logger element" if it is resolved here.
  app.useLogger(app.get(PinoLogger));

  // First, so the correlation id exists before anything can log or fail, and
  // so the response always carries X-Request-Id.
  app.use(requestIdMiddleware);

  // Must precede routing so every response carries the hardening headers,
  // including the CORS preflight that never reaches a guard.
  app.use(
    helmet({
      // The API serves JSON only; the SPA is served by nginx, which owns the
      // document CSP. A default-src here would just be wrong for the API.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Explicit allowlist. The previous `origin: true` reflected any origin back
  // to the caller, which combined with `credentials: true` is equivalent to
  // having no same-origin protection at all.
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      // Query params are explicitly typed with @Type() on each DTO. Implicit
      // conversion would silently coerce types across every DTO in the app.
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // ThrottlerGuard is registered as APP_GUARD in app.module so it receives its
  // options through DI rather than a half-constructed `new ThrottlerGuard()`.
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });

  if (!isProduction) {
    const swagger = new DocumentBuilder()
      .setTitle('Runway API')
      .setDescription('Investor-grade metrics for founders.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), {
      jsonDocumentUrl: 'api/docs/openapi.json',
    });
  }

  app.enableShutdownHooks();

  const port = env.PORT;
  // 0.0.0.0 so the container is reachable; the VPS firewall and reverse proxy
  // are the real boundary, not a loopback bind.
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(
    `Runway API listening on :${port} | node=${env.NODE_ENV} | db=${env.ENABLE_DATABASE} | demo=${env.BYPASS_AUTH} | cors=${env.CORS_ORIGINS.join(',')}`,
  );
}

// A failed boot must be loud and non-zero: a container that stays "running"
// while serving nothing is worse than one that exits and gets restarted.
void bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // Written straight to stderr because the Pino logger may not have come up,
  // which is the most common reason a boot fails.
  process.stderr.write(`\nFatal: Runway API failed to start\n${message}\n\n`);
  process.exit(1);
});
