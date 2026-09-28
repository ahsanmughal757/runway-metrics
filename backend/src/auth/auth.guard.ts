import { ExecutionContext, Inject, Injectable, UnauthorizedException, forwardRef } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { env } from '../config/env';
import { BypassAuthGuard } from './bypass-auth.guard';
import { ApiKeysService } from '../api-keys/api-keys.service';

/**
 * Single guard used across all protected controllers. Delegates to
 * BypassAuthGuard in demo mode, otherwise runs real JWT verification plus
 * membership resolution.
 * This keeps every controller's @UseGuards(AuthGuard) identical regardless
 * of mode — only this one file branches on env.BYPASS_AUTH.
 *
 * A presented API key is accepted here rather than by a separate guard on each
 * controller. That is the fail-closed direction: if a future controller forgets
 * to opt in, a key is rejected, so the mistake costs a key not working rather
 * than a key quietly having more access than intended. The reverse -- every
 * controller opting in and one forgetting -- would fail open, which is the
 * mistake that matters.
 *
 * The injected ApiKeysService resolves here rather than in a guard of its own,
 * because a guard named in @UseGuards(...) is built against the module that
 * owns the controller -- and there is no such thing as a guard that only some
 * controllers remember. ApiKeysModule is @Global so every one of those modules
 * can supply it; see the comment there.
 */
@Injectable()
export class AuthGuard extends PassportAuthGuard('jwt') {
  private bypass = new BypassAuthGuard();

  constructor(@Inject(forwardRef(() => ApiKeysService)) private readonly keys: ApiKeysService) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (env.BYPASS_AUTH) {
      return this.bypass.canActivate(context);
    }

    const req = context.switchToHttp().getRequest<{ headers: Record<string, unknown>; user?: unknown }>();
    const presented = headerValue(req.headers['x-api-key']);
    if (presented) {
      return this.authenticateWithKey(req, presented) as boolean | Promise<boolean>;
    }

    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  /**
   * The request identity for a key caller.
   *
   * `userId` is empty and `role` is VIEWER on purpose. A key is not a person, so
   * it must not borrow a user's identity -- a synthetic User row would appear in
   * the members list and inherit whatever role it was later changed to. See the
   * scope-change notes in plan/phase-4-credential-encryption.md.
   */
  private async authenticateWithKey(
    req: { user?: unknown },
    secret: string,
  ): Promise<boolean> {
    const resolved = await this.keys.authenticate(secret);
    if (!resolved) {
      // One message for unknown, revoked and expired, so the response cannot
      // be used to probe which of those it was.
      throw new UnauthorizedException('Invalid or expired API key');
    }

    req.user = {
      apiKeyId: resolved.keyId,
      actorLabel: `API key ${resolved.keyId}`,
      companyId: resolved.companyId,
      permissions: resolved.scopes,
      role: 'VIEWER',
      userId: '',
      email: '',
      name: null,
    };
    return true;
  }
}

/** Header values are `string | string[] | undefined` depending on the client. */
function headerValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}
