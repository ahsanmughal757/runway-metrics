import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { InvitesController } from './invites.controller';
import { CompaniesRepository } from './companies.repository';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CompaniesController, InvitesController],
  providers: [CompaniesRepository],
  exports: [CompaniesRepository],
})
export class CompaniesModule {}
