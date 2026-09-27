import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';

class AuditQueryDto {
  // Query params always arrive as strings. Without the explicit `@Type`,
  // `@IsInt()` rejects `?page=1` and the whole Activity page 400s. Prefer this
  // over enabling `enableImplicitConversion` globally, which would silently
  // coerce types across every DTO in the app.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @IsString() entityType?: string;
}

@Controller('audit')
@UseGuards(AuthGuard, CompanyScopeGuard)
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get('recent')
  recent(@CurrentUser() user: RequestUser) {
    return this.audit.recent(user.companyId);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: AuditQueryDto) {
    return this.audit.list(user.companyId, query);
  }
}
