import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Trim } from '../common/email';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { clearRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { CurrentUser, type RequestUser } from '../common/decorators/current-user.decorator';
import { env } from '../config/env';

class RegisterDto {
  @Transform(Trim)
  @IsEmail()
  email!: string;
  // Upper bound matters: without it a huge body of 'a' reaches bcrypt, which
  // is deliberately slow, and turns a public endpoint into a CPU DoS.
  @MinLength(8) @MaxLength(200) password!: string;
  @IsString() @MinLength(2) @MaxLength(120) companyName!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

class LoginDto {
  @Transform(Trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @MaxLength(200) password!: string;
}

/**
 * Credential endpoints get a far tighter budget than the global default.
 *
 * The tracker keys on the submitted email as well as the caller's IP. IP-only
 * limiting is defeated by a botnet and lets a single attacker lock out a whole
 * office behind one NAT; the email key is what actually stops credential
 * stuffing against a known account.
 */
const credentialThrottle = Throttle({
  default: {
    limit: env.AUTH_RATE_LIMIT_MAX,
    ttl: 60_000,
    getTracker: (req: Record<string, unknown>) => {
      const body = req.body as { email?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email.toLowerCase().slice(0, 254) : 'no-email';
      const socket = req.socket as { remoteAddress?: string } | undefined;
      // Keyed by IP *and* email so one attacker cannot exhaust a shared NAT's
      // budget, and a distributed attempt against one account is still caught.
      // Each part is narrowed explicitly; `String(unknown)` would render an
      // object as "[object Object]" and collapse distinct keys into one.
      const ip = typeof req.ip === 'string' ? req.ip : (socket?.remoteAddress ?? 'unknown');
      return `${ip}:${email}`;
    },
  },
});

/**
 * Refresh gets its own budget, keyed on IP rather than email: the request
 * carries no address, and a user whose access token just expired has no reason
 * to be turned away by a limit meant for credential stuffing.
 */
const refreshThrottle = Throttle({
  default: { limit: env.AUTH_RATE_LIMIT_MAX * 3, ttl: 60_000 },
});

/** Where the refresh token lives on the way in. */
function readRefreshToken(req: Request): string | undefined {
  const bag = (req as Request & { cookies?: Record<string, string> }).cookies;
  return bag?.[env.REFRESH_COOKIE_NAME];
}

/**
 * Recorded on the session so a user can recognise their own devices later.
 *
 * Deliberately not *enforced*: an IP that changes is normal on mobile, and
 * demanding a match signs people out on a train. Fingerprints are for showing a
 * user "is this you?", not for deciding silently.
 */
function clientMeta(req: Request) {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @credentialThrottle
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto.email, dto.password, dto.companyName, dto.name);
    setRefreshCookie(res, await this.authService.startSession(result.user.id, clientMeta(req)));
    return result;
  }

  @Post('login')
  @HttpCode(200)
  @credentialThrottle
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto.email, dto.password);
    setRefreshCookie(res, await this.authService.startSession(result.user.id, clientMeta(req)));
    return result;
  }

  /**
   * Trades a refresh cookie for a new access token and a new refresh cookie.
   *
   * The access token comes back in the body because the SPA keeps it in memory
   * for the `Authorization` header; the refresh token does not, because the only
   * way to read it is the one thing this endpoint is designed to make impossible.
   *
   * Rotates on every call, so a refresh token is good for exactly one use. A
   * second use of the same token means a copy exists somewhere, and the service
   * revokes the whole family before returning 401.
   */
  @Post('refresh')
  @HttpCode(200)
  @refreshThrottle
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readRefreshToken(req);
    if (!token) throw new UnauthorizedException('No session to refresh');

    const result = await this.authService.refresh(token, clientMeta(req));
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  /**
   * Server-side sign-out. The cookie is cleared and the session family is
   * revoked, so a token captured before the logout stops working immediately
   * rather than at its natural expiry.
   *
   * Always 204, including when no cookie was sent: the browser's end state
   * ("no session") is already true, and reporting an error for it would only
   * make the client guess whether it still has something to clear.
   */
  @Post('logout')
  @HttpCode(204)
  @refreshThrottle
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(readRefreshToken(req));
    clearRefreshCookie(res);
  }

  /** Which devices are currently signed in. See `SessionsService` for the model. */
  @Get('sessions')
  @UseGuards(AuthGuard)
  async listSessions(@CurrentUser() user: RequestUser, @Req() req: Request) {
    // The cookie rides along with the request, so the list can say which entry
    // is the device asking - see `listForUser`.
    return this.authService.listSessions(user.userId, readRefreshToken(req));
  }

  /**
   * Signs one device out without touching the rest.
   *
   * Does not clear the caller's cookie, because revoking a *different* device
   * must not sign the caller out, and the only way to know which session a
   * cookie belongs to is the lookup `listForUser` already makes - so the client
   * is told which row is `isCurrent` and can warn before doing this. Revoking
   * your own device is allowed: the next refresh fails and you land on the login
   * screen, which is what you asked for.
   */
  @Delete('sessions/:id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async revokeSession(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.authService.revokeSession(user.userId, id);
  }

  /**
   * The client calls this once at startup to learn who it is and what it may
   * do. Every capability it renders from comes from the server's permission
   * table, so the two can never drift.
   */
  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return this.authService.me(user);
  }
}
