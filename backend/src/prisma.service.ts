import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { env } from './config/env';

/**
 * Only ever instantiated/connected when ENABLE_DATABASE=true. Services should
 * still be able to import this safely when DB is disabled — it just never
 * connects, and repositories should not call it in that mode.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (env.ENABLE_DATABASE) {
      await this.$connect();
    }
  }

  async onModuleDestroy() {
    if (env.ENABLE_DATABASE) {
      await this.$disconnect();
    }
  }
}
