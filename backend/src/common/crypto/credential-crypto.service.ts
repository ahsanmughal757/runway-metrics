import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { env } from '../../config/env';

/**
 * Symmetric encryption for secrets the server has to read back: AES-256-GCM
 * from Node's own crypto, with no third-party dependency.
 *
 * Why GCM and not a bare cipher: the authentication tag is the point. Plain
 * AES-CBC will happily decrypt a flipped bit into plausible garbage, so a
 * corrupted or edited credential surfaces much later as a confusing failure
 * somewhere else. GCM refuses to produce output unless the ciphertext, the IV
 * and the tag all still agree, which moves the failure to the one place that
 * can name it.
 *
 * The envelope is self-describing -- `v1:<keyId>:<iv>:<tag>:<ciphertext>`,
 * each part base64url -- so a row encrypted years ago can still be read after
 * the active key has been rotated away. `keyId` selects the decrypting key; a
 * row is only ever *written* under the active key. Without the id in the
 * envelope, rotation means a full table rewrite before the old key can be
 * deleted, and one missed row is an unreadable secret.
 *
 * Every failure path throws a specific error. That is not fussiness: a decrypt
 * that returns `undefined` or an empty string on a bad key is how a credential
 * bug turns into unauthenticated access somewhere further downstream, because
 * the caller sees a falsy value and keeps going.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const ENVELOPE_VERSION = 'v1';
const ENVELOPE_PARTS = 5;

/** Base class so a caller can catch every crypto failure without matching on env. */
export class CredentialCryptoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class MissingKeyError extends CredentialCryptoError {}

/** The envelope names a key id this deployment has no material for. */
export class UnknownKeyError extends CredentialCryptoError {}

/** Not a well-formed envelope: wrong shape, or a part that is not base64url. */
export class MalformedEnvelopeError extends CredentialCryptoError {}

/**
 * The tag did not verify. Either the bytes were altered or the key is wrong;
 * the two are indistinguishable by design, and the envelope's keyId has already
 * been checked by the time we get here.
 */
export class DecryptionFailedError extends CredentialCryptoError {}

interface DecodedEnvelope {
  keyId: string;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

/**
 * The key material, injectable so rotation can be tested without mutating the
 * process environment. `config/env` snapshots at import time -- deliberately,
 * since that is what makes a bad value a boot failure -- so a test cannot
 * change a key by assigning to `process.env` after the fact.
 */
export interface CredentialKeyConfig {
  activeKeyId: string;
  masterKey: string | undefined;
  previousKeys: readonly string[];
}

@Injectable()
export class CredentialCryptoService {
  private readonly activeKeyId: string;
  private readonly keys: ReadonlyMap<string, Buffer>;

  // @Optional because in production this is always resolved from env below, and
  // Nest reads the emitted design:paramtypes rather than the `?`. Without it the
  // injector looks for a provider of type `Object` and refuses to boot.
  constructor(@Optional() config?: CredentialKeyConfig) {
    const resolved: CredentialKeyConfig = config ?? {
      activeKeyId: env.CREDENTIALS_MASTER_KEY_ID,
      masterKey: env.CREDENTIALS_MASTER_KEY,
      previousKeys: env.CREDENTIALS_PREVIOUS_KEYS,
    };
    this.activeKeyId = resolved.activeKeyId;
    this.keys = this.loadKeys(resolved);
  }

  /**
   * Encrypts for storage. `context` is authenticated but not encrypted: it is
   * bound into the tag, so a ciphertext lifted out of one row and pasted into
   * another fails to decrypt even though the key is valid.
   *
   * It is a required argument rather than an optional one on purpose. An
   * optional context is a context that will be omitted, and a caller who
   * forgets it on the encrypt path decrypts it fine -- right up until someone
   * notices the ciphertext was never bound to anything.
   */
  encrypt(plaintext: string, context: string): string {
    const keyId = this.activeKeyId;
    const key = this.keys.get(keyId);
    if (!key) {
      throw new MissingKeyError(this.missingKeyMessage());
    }

    // A fresh IV per record. Reusing an IV under one key is catastrophic for
    // GCM: it leaks the XOR of the two plaintexts and can expose the auth key.
    // The 12-byte value is the size GCM is defined for; Node rejects others.
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      ENVELOPE_VERSION,
      keyId,
      iv.toString('base64url'),
      // `getAuthTag` must be read after `final`, and its length is recorded in
      // the envelope by convention (16 bytes) rather than stored separately.
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  /** Decrypts an envelope produced by `encrypt`. Throws rather than returning empty on any failure. */
  decrypt(envelope: string, context: string): string {
    const decoded = this.decode(envelope);
    const key = this.keys.get(decoded.keyId);
    if (!key) {
      throw new UnknownKeyError(
        `No key with id "${decoded.keyId}" is configured, so this value cannot be read. ` +
          'Decrypt-old-then-encrypt-new: keep the retired key in CREDENTIALS_PREVIOUS_KEYS until every row has been rewritten.',
      );
    }

    const decipher = createDecipheriv(ALGORITHM, key, decoded.iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(decoded.tag);

    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([decipher.update(decoded.ciphertext), decipher.final()]);
    } catch (cause) {
      // Deliberately not distinguishing "wrong key" from "altered bytes": the
      // caller has one remedy either way, and naming the wrong one sends
      // someone re-encrypting rows that were never tampered with.
      throw new DecryptionFailedError(
        'The stored value failed its integrity check. It was either altered in place or encrypted under a key that is no longer available.',
        { cause },
      );
    }

    return plaintext.toString('utf8');
  }

  /** The key id the next `encrypt` will use. Exposed so operators can see which one is live. */
  get activeKey(): string {
    return this.activeKeyId;
  }

  /** Key ids currently able to decrypt, newest first. */
  get knownKeyIds(): string[] {
    return [this.activeKeyId, ...[...this.keys.keys()].filter((id) => id !== this.activeKeyId)];
  }

  private decode(envelope: string): DecodedEnvelope {
    if (typeof envelope !== 'string' || envelope.length === 0) {
      throw new MalformedEnvelopeError('Encrypted value is empty.');
    }
    const parts = envelope.split(':');
    if (parts.length !== ENVELOPE_PARTS) {
      throw new MalformedEnvelopeError(
        `Encrypted value has ${parts.length} parts, expected ${ENVELOPE_PARTS}. A value that is not an envelope means it was stored in plaintext by an older build.`,
      );
    }
    const [version, keyId, iv, tag, ciphertext] = parts;
    if (version !== ENVELOPE_VERSION) {
      throw new MalformedEnvelopeError(`Unsupported envelope version "${version}".`);
    }
    if (!keyId) {
      throw new MalformedEnvelopeError('Encrypted value names no key.');
    }
    return {
      keyId,
      iv: this.fromBase64(iv, 'iv'),
      tag: this.fromBase64(tag, 'tag'),
      ciphertext: this.fromBase64(ciphertext, 'ciphertext'),
    };
  }

  private fromBase64(value: string, label: string): Buffer {
    // Buffer.from(value, 'base64url') is lenient: it discards characters it
    // does not recognise instead of failing. A truncated or corrupted envelope
    // would then decrypt-fail with a misleading message, so the decode is
    // checked by re-encoding.
    const buf = Buffer.from(value, 'base64url');
    if (buf.toString('base64url') !== value) {
      throw new MalformedEnvelopeError(`Encrypted value has a malformed ${label}.`);
    }
    return buf;
  }

  private loadKeys(config: CredentialKeyConfig): ReadonlyMap<string, Buffer> {
    const keys = new Map<string, Buffer>();

    if (config.masterKey) {
      keys.set(this.activeKeyId, this.keyFromHex(config.masterKey, 'CREDENTIALS_MASTER_KEY'));
    }

    // Rotation: retired keys stay readable here until every row written under
    // them has been re-encrypted, and only then are they removed. Removing one
    // too early is unrecoverable, so there is deliberately no automatic expiry.
    for (const pair of config.previousKeys) {
      const separator = pair.indexOf(':');
      if (separator <= 0 || separator === pair.length - 1) {
        throw new CredentialCryptoError(`CREDENTIALS_PREVIOUS_KEYS entry "${pair}" must be "<keyId>:<64 hex characters>".`);
      }
      const keyId = pair.slice(0, separator);
      const key = this.keyFromHex(pair.slice(separator + 1), `CREDENTIALS_PREVIOUS_KEYS (${keyId})`);
      if (keyId === this.activeKeyId) {
        throw new CredentialCryptoError(`CREDENTIALS_PREVIOUS_KEYS reuses the active key id "${keyId}".`);
      }
      if (keys.has(keyId)) {
        throw new CredentialCryptoError(`CREDENTIALS_PREVIOUS_KEYS lists key id "${keyId}" more than once.`);
      }
      keys.set(keyId, key);
    }

    return keys;
  }

  private keyFromHex(hex: string, label: string): Buffer {
    // Check the text before decoding. Buffer.from(hex, 'hex') stops at the
    // first invalid pair and returns whatever it managed to read, so a
    // malformed key would become a short key rather than an error, and a short
    // key fails later inside the cipher with a message about the cipher.
    // Comparing the decode against a re-encode is the version of this check
    // that actually detects the truncation.
    const key = Buffer.from(hex, 'hex');
    if (key.length !== KEY_BYTES || key.toString('hex') !== hex.toLowerCase()) {
      throw new CredentialCryptoError(
        `${label} must be exactly ${KEY_BYTES * 2} hex characters, which is exactly ${KEY_BYTES} bytes for AES-256. Generate one with scripts/generate-secrets.mjs.`,
      );
    }
    return key;
  }

  private missingKeyMessage(): string {
    return (
      'CREDENTIALS_MASTER_KEY is not set, so nothing can be encrypted. ' +
      'Generate one with `node scripts/generate-secrets.mjs`. This is not a case for a fallback key: ' +
      'a silently derived one would be weak and would change across restarts.'
    );
  }
}
