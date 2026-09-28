import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { CompaniesRepository } from './companies.repository';
import { ROLE_RANK } from '../auth/permissions';

class UpdateSettingsDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(1) runwayGreenMonths?: number;
  @IsOptional() @IsInt() @Min(1) runwayYellowMonths?: number;
  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO 4217 code, e.g. USD' }) currency?: string;
}

class UpdateRoleDto {
  @IsEnum(MembershipRole) role!: MembershipRole;
}

@Controller('companies')
@UseGuards(AuthGuard, CompanyScopeGuard)
export class CompaniesController {
  constructor(private repo: CompaniesRepository) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.repo.findForUser(user.userId);
  }

  @Get('members')
  @RequirePermission('members:read')
  members(@CurrentUser() user: RequestUser) {
    return this.repo.findMembers(user.companyId, user.userId);
  }

  @Get('settings')
  @RequirePermission('company:read')
  getSettings(@CurrentUser() user: RequestUser) {
    return this.repo.getSettings(user.companyId);
  }

  // ADMIN and above. The permission is named rather than the role so that
  // changing who administers a company never means editing this controller.
  @Put('settings')
  @UseGuards(PermissionsGuard)
  @RequirePermission('company:update')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: UpdateSettingsDto) {
    return this.repo.updateSettings(user.companyId, dto, user.userId);
  }

  @Patch('members/:membershipId/role')
  @UseGuards(PermissionsGuard)
  @RequirePermission('members:updateRole')
  async updateRole(
    @CurrentUser() user: RequestUser,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    // An ADMIN can manage the team but must not outrank an OWNER. Enforced from
    // the caller's own role, so it holds even if the permission table is later
    // widened by mistake. The repository re-checks inside its transaction.
    this.assertOutranks(user, dto.role);
    return this.repo.updateMemberRole(user.companyId, membershipId, dto.role, user.userId, user.role);
  }

  @Delete('members/:membershipId')
  @UseGuards(PermissionsGuard)
  @RequirePermission('members:remove')
  removeMember(@CurrentUser() user: RequestUser, @Param('membershipId') membershipId: string) {
    // No rank check here. The repository enforces it inside the transaction that
    // performs the delete, because the caller's role and the target's role are
    // both read there and a check made earlier could be invalidated by a
    // concurrent role change before the delete lands. `members:remove` alone is
    // not sufficient: ADMIN holds it too, and without the in-transaction check an
    // ADMIN could remove an OWNER.
    return this.repo.removeMember(user.companyId, membershipId, user.userId, user.role);
  }

  private assertOutranks(actor: RequestUser, targetRole: MembershipRole) {
    // An early 403 so the common case never reaches the database. The repository
    // repeats this inside its transaction, and that second check is the one that
    // actually holds; this one is an optimisation, not the enforcement.
    if (actor.role !== MembershipRole.OWNER && ROLE_RANK[targetRole] >= ROLE_RANK[actor.role]) {
      throw new ForbiddenException('You cannot grant a role at or above your own');
    }
  }
}
