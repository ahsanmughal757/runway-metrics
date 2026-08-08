import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { AuditService } from './audit.service';

class AuditQueryDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) pageSize?: number;
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
