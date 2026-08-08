import { Module } from '@nestjs/common';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';
import { CohortsRepository } from './cohorts.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CohortsController],
  providers: [CohortsService, CohortsRepository],
})
export class CohortsModule {}
