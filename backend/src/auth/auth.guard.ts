import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { env } from '../config/env';
import { BypassAuthGuard } from './bypass-auth.guard';

/**
 * Single guard used across all protected controllers. Delegates to
 * BypassAuthGuard in demo mode, otherwise runs real JWT verification.
 * This keeps every controller's @UseGuards(AuthGuard) identical regardless
 * of mode — only this one file branches on env.BYPASS_AUTH.
 */
@Injectable()
export class AuthGuard extends PassportAuthGuard('jwt') {
  private bypass = new BypassAuthGuard();

  override canActivate(context: ExecutionContext) {
    if (env.BYPASS_AUTH) {
      return this.bypass.canActivate(context);
    }
    return super.canActivate(context) as boolean | Promise<boolean>;
  }
}
