import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsInt, IsOptional, IsString, Max, Min, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { ApiKeysService } from './api-keys.service';

class CreateKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  scopes!: string[];

  /**
   * Optional expiry. Absent means it does not expire, which is the default
   * because the common case is a CI key that should not need renewing, and a
   * key that silently stops working breaks a deploy. Revocation is the
   * deliberate act; expiry is a backstop against a key nobody remembers.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

@Controller('companies/api-keys')
@UseGuards(AuthGuard, CompanyScopeGuard, PermissionsGuard)
export class ApiKeysController {
  constructor(private keys: ApiKeysService) {}

  @Get()
  @RequirePermission('apiKeys:manage')
  list(@CurrentUser() user: RequestUser) {
    return this.keys.list(user);
  }

  /**
   * The only response in the API that carries a secret. `secret` is present
   * here and nowhere else, ever -- there is no endpoint that re-reads it,
   * because the database cannot.
   */
  @Post()
  @RequirePermission('apiKeys:manage')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateKeyDto) {
    return this.keys.create(user, dto.name, dto.scopes, dto.expiresInDays);
  }

  @Delete(':id')
  @RequirePermission('apiKeys:manage')
  async revoke(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.keys.revoke(user, id);
    return { revoked: true };
  }
}

/** The scope vocabulary for the UI's checkboxes. Served from the same source the guard uses. */
@Controller('companies/api-keys/scopes')
export class ApiKeyScopesController {
  @Get()
  list() {
    return { scopes: PERMISSIONS };
  }
}
