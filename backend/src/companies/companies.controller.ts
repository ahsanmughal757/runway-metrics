import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { CompaniesRepository } from './companies.repository';

class UpdateSettingsDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(1) runwayGreenMonths?: number;
  @IsOptional() @IsInt() @Min(0) runwayYellowMonths?: number;
}

@Controller('companies')
@UseGuards(AuthGuard)
export class CompaniesController {
  constructor(private repo: CompaniesRepository) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.repo.findForUser(user.userId);
  }

  @Get('settings')
  getSettings(@CurrentUser() user: RequestUser) {
    return this.repo.getSettings(user.companyId);
  }

  // Settings (including runway zone thresholds) are Founder-only, enforced server-side.
  @Put('settings')
  @UseGuards(RolesGuard)
  @Roles('FOUNDER')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: UpdateSettingsDto) {
    return this.repo.updateSettings(user.companyId, dto);
  }
}
