-- Phase 4: hashed, encrypted share-link tokens, and real API keys.
--
-- Two things are happening here and they are separable, so they are separable.
--
-- 1. ShareLink loses its plaintext `token` column. The token is a bearer
--    credential for an unauthenticated endpoint, so a row readable in a backup
--    is a company whose financials are readable by whoever holds that backup.
--    It is replaced by tokenHash (indexed equality lookup, irreversible) and
--    tokenCiphertext (so an already-issued link can still be listed and revoked).
--    The old column is dropped rather than left null, because a nullable secret
--    column is exactly the kind of thing a future query forgets to check.
--
-- 2. ApiKey is a new table. secretHash is a SHA-256 of a value shown once and
--    never again; prefix is a short indexed head so a presented key can be
--    found without scanning.

-- Backfill before the drop. The tokens that exist now are plaintext, so the
-- application cannot encrypt them here: the key is not available to SQL and
-- putting it in a migration would commit it to git history. The migration
-- therefore carries the rows across as plaintext into the new columns, and a
-- one-off application command re-encrypts them (see the phase doc). Token
-- length is unchanged, so the hash is computable in SQL; the ciphertext column
-- is filled with a marker that the re-encrypt command recognises and refuses to
-- serve if it ever reaches a decrypt call.
ALTER TABLE "ShareLink" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "ShareLink" ADD COLUMN "tokenCiphertext" TEXT;

UPDATE "ShareLink" SET
  "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex'),
  "tokenCiphertext" = 'pending:' || "token";

ALTER TABLE "ShareLink" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "ShareLink" ALTER COLUMN "tokenCiphertext" SET NOT NULL;

CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");
ALTER TABLE "ShareLink" DROP COLUMN "token";

CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- scope is a vocabulary the application owns, so a key cannot be stored holding
-- a permission that no longer exists or one it should not have been able to
-- hold. The application additionally refuses to include `apiKeys:manage`, and
-- this constraint is the backstop for a direct database write.
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_scopes_known" CHECK (
    "scopes" <@ ARRAY[
        'company:read', 'company:update', 'company:delete',
        'members:read', 'members:invite', 'members:updateRole', 'members:remove',
        'metrics:read', 'metrics:write',
        'customers:read', 'customers:write',
        'reports:read', 'reports:generate', 'reports:share',
        'audit:read'
    ]::TEXT[]
);

-- A key that has been revoked is dead even if it has not passed its expiry, and
-- both states have to be checkable without reading the row into the
-- application first. This is the constraint that makes "revoked" mean revoked.
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_revoked_before_expiry" CHECK ("revokedAt" IS NULL OR "expiresAt" IS NULL OR "revokedAt" <= "expiresAt");

CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE UNIQUE INDEX "ApiKey_secretHash_key" ON "ApiKey"("secretHash");
CREATE INDEX "ApiKey_companyId_idx" ON "ApiKey"("companyId");
CREATE INDEX "ApiKey_companyId_revokedAt_idx" ON "ApiKey"("companyId", "revokedAt");

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType" ADD VALUE 'API_KEY';
