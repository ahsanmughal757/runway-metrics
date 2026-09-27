import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';

interface ShareRecord {
  companyId: string;
  createdAt: number;
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Demo-mode share links: random tokens kept in an in-memory map. Fine for a
 * demo process lifetime; a real deployment would persist tokens (and revoke
 * them) server-side.
 */
@Injectable()
export class ShareService {
  private store = new Map<string, ShareRecord>();

  constructor(private audit: AuditService) {}

  async create(companyId: string, actorId: string): Promise<{ token: string; url: string }> {
    const token = randomBytes(16).toString('hex');
    this.store.set(token, { companyId, createdAt: Date.now() });
    this.purgeExpired();
    await this.audit.record({
      companyId,
      entityId: `share:${token.slice(0, 8)}`,
      entityType: 'ShareLink',
      action: 'shared',
      actorId,
    });
    return { token, url: `/share/${token}` };
  }

  resolve(token: string): string | null {
    const record = this.store.get(token);
    if (!record) return null;
    if (Date.now() - record.createdAt > TOKEN_TTL_MS) {
      this.store.delete(token);
      return null;
    }
    return record.companyId;
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [token, record] of this.store) {
      if (now - record.createdAt > TOKEN_TTL_MS) this.store.delete(token);
    }
  }
}
