import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuthGuard } from './auth.guard';
import { env } from '../config/env';

@Module({
  imports: [
    PassportModule,
    // Short-lived by design. Phase 3 moves the session into httpOnly cookies
    // with a rotating refresh token; until then this TTL is the only thing
    // bounding the blast radius of a leaked token, so it is minutes not days.
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
    }),
  ],
  providers: [AuthService, JwtStrategy, AuthGuard],
  controllers: [AuthController],
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
