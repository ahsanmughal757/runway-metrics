import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { InvitesController } from './invites.controller';
import { AcceptInviteController } from './accept-invite.controller';
import { CompaniesRepository } from './companies.repository';
import { InvitesService } from './invites.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [CompaniesController, InvitesController, AcceptInviteController],
  providers: [CompaniesRepository, InvitesService],
  exports: [CompaniesRepository, InvitesService],
})
export class CompaniesModule {}
