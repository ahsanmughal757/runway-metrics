import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  userId: string;
  email: string;
  companyId: string;
  role: 'FOUNDER' | 'INVESTOR';
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
