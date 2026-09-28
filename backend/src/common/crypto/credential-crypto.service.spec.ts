import {
  CredentialCryptoService,
  type CredentialKeyConfig,
  DecryptionFailedError,
  MalformedEnvelopeError,
  UnknownKeyError,
} from './credential-crypto.service';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

function service(config: Partial<CredentialKeyConfig> = {}): CredentialCryptoService {
  return new CredentialCryptoService({ activeKeyId: 'k1', masterKey: KEY_A, previousKeys: [], ...config });
}

describe('CredentialCryptoService', () => {
  describe('round trip', () => {
    it('returns the plaintext it was given', () => {
      const crypto = service();
      expect(crypto.decrypt(crypto.encrypt('stripe_live_sk_test', 'ctx'), 'ctx')).toBe('stripe_live_sk_test');
    });

    it('handles the empty string, which is a legitimate secret', () => {
      const crypto = service();
      expect(crypto.decrypt(crypto.encrypt('', 'ctx'), 'ctx')).toBe('');
    });

    it('writes a versioned, five-part envelope', () => {
      const parts = service().encrypt('secret', 'ctx').split(':');
      expect(parts).toHaveLength(5);
      expect(parts[0]).toBe('v1');
      expect(parts[1]).toBe('k1');
    });

    it('never emits the plaintext into the envelope', () => {
      expect(service().encrypt('stripe_live_sk_test', 'ctx')).not.toContain('stripe');
    });

    it('uses a fresh IV per call, so the same plaintext does not repeat', () => {
      const crypto = service();
      expect(crypto.encrypt('same', 'ctx')).not.toBe(crypto.encrypt('same', 'ctx'));
    });
  });

  describe('context binding', () => {
    it('refuses a ciphertext replayed under a different context', () => {
      const crypto = service();
      const envelope = crypto.encrypt('tenant-a-secret', 'company-1');
      // The value is intact and the key is correct; only the context differs.
      expect(() => crypto.decrypt(envelope, 'company-2')).toThrow(DecryptionFailedError);
    });
  });

  describe('tamper detection', () => {
    const swap = (envelope: string, index: number, byte: string): string => {
      const parts = envelope.split(':');
      parts[index] = byte;
      return parts.join(':');
    };

    it('refuses a modified IV', () => {
      const crypto = service();
      const envelope = crypto.encrypt('secret', 'ctx');
      expect(() => crypto.decrypt(swap(envelope, 2, Buffer.from('nope-nope!').toString('base64url')), 'ctx')).toThrow(DecryptionFailedError);
    });

    it('refuses a modified tag', () => {
      const crypto = service();
      const parts = crypto.encrypt('secret', 'ctx').split(':');
      const tag = Buffer.from(parts[3], 'base64url');
      tag[0] ^= 0xff;
      parts[3] = tag.toString('base64url');
      expect(() => crypto.decrypt(parts.join(':'), 'ctx')).toThrow(DecryptionFailedError);
    });

    it('refuses modified ciphertext', () => {
      const crypto = service();
      const parts = crypto.encrypt('secret', 'ctx').split(':');
      const body = Buffer.from(parts[4], 'base64url');
      body[0] ^= 0xff;
      parts[4] = body.toString('base64url');
      expect(() => crypto.decrypt(parts.join(':'), 'ctx')).toThrow(DecryptionFailedError);
    });

    it('refuses an envelope that has been swapped for another valid one', () => {
      const crypto = service();
      const other = crypto.encrypt('attacker', 'ctx');
      const mine = crypto.encrypt('mine', 'ctx');
      const parts = other.split(':');
      expect(() => crypto.decrypt(`${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${mine.split(':')[4]}`, 'ctx')).toThrow(DecryptionFailedError);
    });
  });

  describe('malformed input', () => {
    it('rejects an empty value', () => {
      expect(() => service().decrypt('', 'ctx')).toThrow(MalformedEnvelopeError);
    });

    it('rejects a plaintext value, which is what a pre-migration row looks like', () => {
      // The failure mode this guards: an unencrypted token reaching a decrypt
      // call must not be silently accepted as "the value".
      expect(() => service().decrypt('a-plain-old-token', 'ctx')).toThrow(MalformedEnvelopeError);
    });

    it('rejects an unknown version', () => {
      expect(() => service().decrypt('v9:k1:AA:BB:CC', 'ctx')).toThrow(MalformedEnvelopeError);
    });

    it('rejects a part that is not base64url', () => {
      expect(() => service().decrypt('v1:k1:AA:BB:not*base64!', 'ctx')).toThrow(MalformedEnvelopeError);
    });
  });

  describe('key rotation', () => {
    it('reads a value written under the previous key after the active key changes', () => {
      // The whole reason the envelope carries a key id.
      const before = service({ activeKeyId: 'k1', masterKey: KEY_A });
      const envelope = before.encrypt('carried-over', 'ctx');

      const after = service({ activeKeyId: 'k2', masterKey: KEY_B, previousKeys: [`k1:${KEY_A}`] });
      expect(after.decrypt(envelope, 'ctx')).toBe('carried-over');
    });

    it('writes new values under the new key only', () => {
      const after = service({ activeKeyId: 'k2', masterKey: KEY_B, previousKeys: [`k1:${KEY_A}`] });
      expect(after.encrypt('fresh', 'ctx').split(':')[1]).toBe('k2');
    });

    it('lists the previous key as still able to decrypt', () => {
      const after = service({ activeKeyId: 'k2', masterKey: KEY_B, previousKeys: [`k1:${KEY_A}`] });
      expect(after.knownKeyIds).toEqual(['k2', 'k1']);
    });

    it('fails with a rotation message once the old key is gone', () => {
      const before = service({ activeKeyId: 'k1', masterKey: KEY_A });
      const envelope = before.encrypt('orphaned', 'ctx');

      const after = service({ activeKeyId: 'k2', masterKey: KEY_B });
      // Named as its own error so an operator is told to re-add the old key
      // rather than to suspect tampering.
      expect(() => after.decrypt(envelope, 'ctx')).toThrow(UnknownKeyError);
    });

    it('refuses a previous-key entry that collides with the active key id', () => {
      expect(() => service({ activeKeyId: 'k1', previousKeys: [`k1:${KEY_B}`] })).toThrow(/reuses the active key id/);
    });
  });

  describe('misconfiguration', () => {
    it('refuses to encrypt with no key at all, rather than falling back', () => {
      // A derived or default key would be weak and would change on restart.
      expect(() => service({ masterKey: undefined }).encrypt('secret', 'ctx')).toThrow(/CREDENTIALS_MASTER_KEY/);
    });

    it('names the key it could not read', () => {
      expect(() => service({ previousKeys: ['malformed'] })).toThrow(/<keyId>:<64 hex characters>/);
    });

    it('refuses a key that is not 64 hex characters rather than truncating it', () => {
      expect(() => service({ masterKey: 'a'.repeat(63) })).toThrow(/exactly 32 bytes/);
    });
  });
});
