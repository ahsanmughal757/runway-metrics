import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Global because the audit trail is written from every domain module and only
 * the *service* is ever wanted from it - never the controller. A public share
 * link view, a rejected invite, a key issuance, a metric import: all of them
 * record, and all of them live in a different module.
 *
 * It is also what keeps the dependency graph acyclic. `AuthGuard` authenticates
 * a presented API key, so `AuthModule` needs `ApiKeysService`; `ApiKeysService`
 * records issuance, so it needs `AuditService`; and `AuditController` needs the
 * `AuthGuard` that `AuthModule` exports. Declaring the module global removes the
 * `ApiKeysModule -> AuditModule` edge, which is the only one that can be removed
 * without changing what any of those three actually does.
 *
 * `AuthModule` is still imported plainly and safely: nothing in its own graph
 * imports back to here.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
