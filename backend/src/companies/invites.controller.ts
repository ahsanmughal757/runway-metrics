import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Trim } from '../common/email';
import { IsEmail, IsEnum } from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { InvitesService } from './invites.service';

class CreateInviteDto {
  @Transform(Trim)

  @IsEmail() email!: string;
  @IsEnum(MembershipRole) role!: MembershipRole;
}

@Controller('companies/invites')
@UseGuards(AuthGuard, CompanyScopeGuard)
export class InvitesController {
  constructor(private invites: InvitesService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('members:read')
  list(@CurrentUser() user: RequestUser) {
    return this.invites.list(user.companyId);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('members:invite')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateInviteDto) {
    return this.invites.create(user.companyId, dto.email, dto.role, {
      userId: user.userId,
      email: user.email,
      role: user.role,
    });
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('members:invite')
  async revoke(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.invites.revoke(user.companyId, id, user.userId);
    return { revoked: true };
  }
}
