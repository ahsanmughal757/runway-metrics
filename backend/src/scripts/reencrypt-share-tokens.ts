/**
 * Rewrites share-link tokens that the credential-encryption migration backfilled
 * with a `pending:` marker.
 *
 * The migration cannot encrypt: doing it in SQL would mean shipping the master
 * key inside the migration, and a migration is a file in git. So the migration
 * hashed the tokens (which it can do, hashing needs no secret) and left the
 * ciphertext column holding a marker. Every row minted after the migration is
 * already encrypted; only the pre-existing ones need this pass.
 *
 * Run it once, then the pending: rows are gone and a rerun is a no-op:
 *   pnpm --filter runway-backend exec tsx src/scripts/reencrypt-share-tokens.ts
 */
import { PrismaClient } from '@prisma/client';
import { CredentialCryptoService } from '../common/crypto/credential-crypto.service';

const PENDING_PREFIX = 'pending:';

// stdout directly rather than console.log, which lint forbids: this is a CLI
// whose output is the deliverable, not a diagnostic a logger should decorate.
const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const crypto = new CredentialCryptoService();

    // Keyed on the marker rather than "every row" on purpose. Rewriting an
    // already-encrypted row would be harmless but would make it impossible to
    // tell, afterwards, whether this pass had actually run.
    const pending = await prisma.shareLink.findMany({
      where: { tokenCiphertext: { startsWith: PENDING_PREFIX } },
      select: { id: true, tokenCiphertext: true },
    });

    if (pending.length === 0) {
      say('No pending share-link tokens. Nothing to do.');
      return;
    }

    for (const row of pending) {
      const token = row.tokenCiphertext.slice(PENDING_PREFIX.length);
      await prisma.shareLink.update({
        where: { id: row.id },
        data: { tokenCiphertext: crypto.encrypt(token, 'share-link-token') },
      });
    }

    say(`Re-encrypted ${pending.length} share-link token(s) under key ${crypto.activeKey}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  // A non-zero exit so a deploy step fails loudly rather than leaving pending
  // rows behind while reporting success.
  console.error(e);
  process.exit(1);
});
