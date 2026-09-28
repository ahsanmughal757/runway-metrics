import { Global, Module } from '@nestjs/common';
import { CredentialCryptoService } from './credential-crypto.service';

/**
 * Global because the key material is a single process-wide secret rather than a
 * per-module dependency, and every module that persists something the server
 * must read back will need it. Global here mirrors PrismaModule: one
 * connection, one key, available everywhere.
 */
@Global()
@Module({
  providers: [CredentialCryptoService],
  exports: [CredentialCryptoService],
})
export class CredentialCryptoModule {}
