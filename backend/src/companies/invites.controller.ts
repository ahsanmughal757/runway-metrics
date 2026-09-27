import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { env } from '../config/env';

class InviteDto {
  @IsEmail() email!: string;
}

// In-memory placeholder for BYPASS_AUTH/demo mode so the Investor Invite
// screen has something real to call without requiring Postgres.
const demoInvites: { id: string; email: string; status: string; createdAt: string }[] = [];

@Controller('companies/invites')
@UseGuards(AuthGuard, RolesGuard, CompanyScopeGuard)
export class InvitesController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    if (env.ENABLE_DATABASE) {
      return this.prisma.investorInvite.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: 'desc' } });
    }
    return demoInvites;
  }

  @Post()
  @Roles('FOUNDER')
  async invite(@CurrentUser() user: RequestUser, @Body() dto: InviteDto) {
    if (env.ENABLE_DATABASE) {
      const created = await this.prisma.investorInvite.create({
        data: { companyId: user.companyId, email: dto.email, invitedById: user.userId, status: 'PENDING' },
      });
      await this.audit.record({
        companyId: user.companyId,
        entityId: created.id,
        entityType: 'InvestorInvite',
        action: 'invited',
        actorId: user.userId,
        diff: { email: dto.email },
      });
      return created;
    }
    const invite = { id: `demo-${Date.now()}`, email: dto.email, status: 'PENDING', createdAt: new Date().toISOString() };
    demoInvites.unshift(invite);
    return invite;
  }
}
