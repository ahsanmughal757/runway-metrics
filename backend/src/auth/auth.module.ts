import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionsService } from './sessions.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthGuard } from './auth.guard';
import { MembershipResolver } from './membership.resolver';
import { env } from '../config/env';

@Module({
  imports: [
    PassportModule,
    // Deliberately minutes, not days: the access token is the thing that travels
    // in a header and is therefore the thing most likely to leak, and a
    // long-lived one cannot be revoked. SessionsService exists so the *session*
    // can be long-lived and revocable without the access token being either.
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
    }),
    // ApiKeysModule is deliberately absent. AuthGuard does need ApiKeysService
    // to authenticate a presented X-Api-Key, but that module is @Global precisely
    // so this one does not have to reach back for it - see the comment there.
  ],
  providers: [AuthService, SessionsService, JwtStrategy, AuthGuard, MembershipResolver],
  controllers: [AuthController],
  exports: [AuthGuard, MembershipResolver, SessionsService, JwtModule],
})
export class AuthModule {}
