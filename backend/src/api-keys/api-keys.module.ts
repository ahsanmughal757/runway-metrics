import { Global, Module } from '@nestjs/common';
import { ApiKeysController, ApiKeyScopesController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Global because `AuthGuard` needs `ApiKeysService` to authenticate a presented
 * key, and a guard named in `@UseGuards(...)` is resolved against the module
 * that owns the *controller* -- MetricsModule, CompaniesModule, ReportsModule and
 * the rest. Declaring this module global is what lets every one of them build a
 * working AuthGuard, and it is why `AuthModule` does not need to import this one
 * at all.
 *
 * That last part is not incidental. Scoped, this module and AuthModule need each
 * other (this one's controller needs the AuthGuard that AuthModule exports, and
 * AuthGuard needs the service this module provides), so both sides need a
 * forwardRef. Global, the back-reference disappears and neither module carries a
 * cycle-breaking workaround.
 *
 * AuditService is likewise not imported here, because AuditModule is @Global.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController, ApiKeyScopesController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
