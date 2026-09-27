import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { env } from '../config/env';
import { MembershipResolver, type AccessTokenPayload } from './membership.resolver';
import type { RequestUser } from '../common/decorators/current-user.decorator';

/**
 * Verifies the signature and expiry, then throws the payload's authority away.
 *
 * The strategy returns identity only. Company and role are re-read from the
 * database on every request, so a demotion or a removed membership takes effect
 * immediately instead of whenever the short-lived access token happens to
 * expire. It also means a token cannot assert a role, because there is no role
 * in it to assert.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private memberships: MembershipResolver) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
      // Passport calls validate() with just the payload. passReqToCallback
      // switches it to validate(request, payload), which is the only way to get
      // at the request from here.
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: AccessTokenPayload): Promise<RequestUser> {
    // The header is a request, not a credential: it selects which of the
    // caller's own memberships to use, and the resolver rejects it if the
    // caller has no membership there.
    return this.memberships.resolve(payload.sub, payload.email, asCompanyId(request.headers['x-company-id']));
  }
}

function asCompanyId(value: unknown): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== 'string') return undefined;
  const trimmed = single.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
