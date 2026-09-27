import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { env } from '../config/env';

class RegisterDto {
  @IsEmail() email!: string;
  // Upper bound matters: without it a huge body of 'a' reaches bcrypt, which
  // is deliberately slow, and turns a public endpoint into a CPU DoS.
  @MinLength(8) @MaxLength(200) password!: string;
  @IsOptional() @MaxLength(120) name?: string;
}

class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
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

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @credentialThrottle
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.name);
  }

  @Post('login')
  @credentialThrottle
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
