import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma.service';
import { env } from '../config/env';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(email: string, password: string, name?: string) {
    if (!env.ENABLE_DATABASE) {
      throw new ConflictException('Registration requires ENABLE_DATABASE=true; use BYPASS_AUTH for demo mode.');
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({ data: { email, passwordHash, name } });
    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string) {
    if (!env.ENABLE_DATABASE) {
      throw new UnauthorizedException('Login requires ENABLE_DATABASE=true; use BYPASS_AUTH for demo mode.');
    }
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const membership = user.memberships[0];
    if (!membership) throw new UnauthorizedException('User has no company membership');

    const payload = {
      userId: user.id,
      email: user.email,
      companyId: membership.companyId,
      role: membership.role,
    };
    const token = this.jwt.sign(payload, { expiresIn: env.JWT_EXPIRES_IN });
    return { accessToken: token, user: payload };
  }
}
