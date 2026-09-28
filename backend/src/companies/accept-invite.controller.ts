import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Trim } from '../common/email';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequestUser } from '../common/decorators/current-user.decorator';
import { InvitesService } from './invites.service';
import { env } from '../config/env';

class AcceptInviteDto {
  @IsString() @MaxLength(200) token!: string;
}

class RedeemInviteDto {
  @IsString() @MaxLength(200) token!: string;
  @Transform(Trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;
  // Required whether or not the account already exists: the redeem call is what
  // proves control of the address, and proving it with a guessable secret would
  // let anyone claim an invitation forwarded to them.
  @MinLength(8) @MaxLength(200) password!: string;
}

/**
 * Invitation redemption.
 *
 * Redeeming requires a session but not membership of the inviting company: the
 * whole point is that the person clicking the link is not yet a member.
 * AuthGuard resolves the caller's *existing* memberships, and the service then
 * decides whether this token may add them to one more.
 */
@Controller('invites')
export class AcceptInviteController {
  constructor(private invites: InvitesService) {}

  /**
   * Unauthenticated, because the invitee has not signed in yet. Returns only
   * what the page needs to render "you have been invited by X" - never the
   * token's company id, which would turn this into an enumeration oracle for who
   * is a customer of whom.
   */
  @Get('preview/:token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async preview(@Param('token') token: string) {
    const summary = await this.invites.preview(token);
    return {
      companyName: summary.companyName,
      email: summary.email,
      role: summary.role,
      isExpired: summary.isExpired,
      isValid: summary.isValid,
    };
  }

  /** Redeems for a caller who already has an account and a session. */
  @Post('accept')
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(@CurrentUser() user: RequestUser, @Body() dto: AcceptInviteDto) {
    return this.invites.accept(dto.token, user.userId, user.email);
  }

  /**
   * Redeems without a session, for the common case of someone clicking a link
   * in an email for the first time. Signs the address in if the account exists
   * and creates it if not, in one transaction, so the invitation is never left
   * half-redeemed.
   */
  @Post('redeem')
  @Throttle({ default: { limit: env.AUTH_RATE_LIMIT_MAX, ttl: 60_000 } })
  redeem(@Body() dto: RedeemInviteDto) {
    return this.invites.redeem(dto.token, dto.email, dto.password);
  }
}
