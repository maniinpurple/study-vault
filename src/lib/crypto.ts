import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM vault for BYOK API keys (server-only).
 *
 * Envelope format (all segments base64url, so "." is a safe separator):
 *
 *     v1.<keyId>.<iv:12B>.<authTag:16B>.<ciphertext>
 *
 * - A fresh random 96-bit IV per encryption.
 * - `context` is bound as Additional Authenticated Data (AAD). Use {@link apiKeyContext} so a ciphertext copied
 *   to another user's row (or another provider) fails authentication instead of decrypting.
 * - `keyId` = first 16 hex chars of SHA-256(masterKey), which enables zero-downtime key rotation:
 *   put the old key in VAULT_ENCRYPTION_KEYS_PREVIOUS, deploy, then re-encrypt rows where
 *   `needsReencryption()` is true.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_PLAINTEXT_BYTES = 8 * 1024;
const DEV_FALLBACK_SEED = "vaultlearn-insecure-development-key-do-not-use-in-production";

export type VaultErrorCode =
  | "MISSING_MASTER_KEY"
  | "INVALID_MASTER_KEY"
  | "INVALID_PLAINTEXT"
  | "MALFORMED_ENVELOPE"
  | "UNKNOWN_KEY_ID"
  | "DECRYPTION_FAILED";

export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export interface Vault {
  /** Id of the key new envelopes are encrypted with. */
  readonly primaryKeyId: string;
  encrypt(plaintext: string, context: string): string;
  decrypt(envelope: string, context: string): string;
  /** True when the envelope was produced by a non-primary (rotated-out) key. */
  needsReencryption(envelope: string): boolean;
  /** Decrypt with any known key and re-encrypt with the primary key. */
  reencrypt(envelope: string, context: string): string;
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

/** Parse a 32-byte master key from base64, base64url or 64-char hex. */
export function parseMasterKey(raw: string): Buffer {
  const value = raw.trim();
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    key = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } else {
    throw new VaultError("INVALID_MASTER_KEY", "Master key must be base64, base64url or hex");
  }
  if (key.length !== KEY_BYTES) {
    throw new VaultError("INVALID_MASTER_KEY", `Master key must decode to ${KEY_BYTES} bytes (got ${key.length})`);
  }
  return key;
}

export function keyIdFor(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** Fresh random master key, base64-encoded (for VAULT_ENCRYPTION_KEY). */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

/** AAD for a stored API key: binds the ciphertext to its owner and provider. */
export function apiKeyContext(userId: string, provider: string): string {
  if (!userId || !provider) throw new VaultError("INVALID_PLAINTEXT", "userId and provider are required");
  return `vaultlearn:api-key:${userId}:${provider}`;
}

/** Display hint for a secret: its last 4 characters. Never store or log more than this. */
export function keyHint(secret: string): string {
  const trimmed = secret.trim();
  return trimmed.length <= 4 ? "••••" : trimmed.slice(-4);
}

/** Read the envelope's key id without decrypting. */
export function envelopeKeyId(envelope: string): string {
  return parseEnvelope(envelope).keyId;
}

interface ParsedEnvelope {
  keyId: string;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

function parseEnvelope(envelope: string): ParsedEnvelope {
  const parts = typeof envelope === "string" ? envelope.split(".") : [];
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new VaultError("MALFORMED_ENVELOPE", "Unrecognised ciphertext envelope");
  }
  const [, keyId, ivPart, tagPart, ctPart] = parts as [string, string, string, string, string];
  const iv = fromB64url(ivPart);
  const tag = fromB64url(tagPart);
  const ciphertext = fromB64url(ctPart);
  if (!/^[0-9a-f]{16}$/.test(keyId) || iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
    throw new VaultError("MALFORMED_ENVELOPE", "Unrecognised ciphertext envelope");
  }
  return { keyId, iv, tag, ciphertext };
}

/**
 * Build a vault from explicit keys (used by tests and by {@link getVault}).
 * @param primaryKey key used for all new encryptions
 * @param previousKeys rotated-out keys still accepted for decryption
 */
export function createVault(primaryKey: Buffer | string, previousKeys: ReadonlyArray<Buffer | string> = []): Vault {
  const toKey = (k: Buffer | string) => (typeof k === "string" ? parseMasterKey(k) : k);
  const primary = toKey(primaryKey);
  if (primary.length !== KEY_BYTES) throw new VaultError("INVALID_MASTER_KEY", "Primary key must be 32 bytes");
  const primaryKeyId = keyIdFor(primary);

  const keyring = new Map<string, Buffer>([[primaryKeyId, primary]]);
  for (const k of previousKeys) {
    const key = toKey(k);
    if (key.length !== KEY_BYTES) throw new VaultError("INVALID_MASTER_KEY", "Previous keys must be 32 bytes");
    keyring.set(keyIdFor(key), key);
  }

  const encrypt = (plaintext: string, context: string): string => {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new VaultError("INVALID_PLAINTEXT", "Nothing to encrypt");
    }
    const data = Buffer.from(plaintext, "utf8");
    if (data.length > MAX_PLAINTEXT_BYTES) throw new VaultError("INVALID_PLAINTEXT", "Secret is too long");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, primary, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(context, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, primaryKeyId, b64url(iv), b64url(tag), b64url(ciphertext)].join(".");
  };

  const decrypt = (envelope: string, context: string): string => {
    const { keyId, iv, tag, ciphertext } = parseEnvelope(envelope);
    const key = keyring.get(keyId);
    if (!key) throw new VaultError("UNKNOWN_KEY_ID", "Ciphertext was encrypted with an unknown master key");
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      // Deliberately generic: never reveal whether the key, tag or context was wrong.
      throw new VaultError("DECRYPTION_FAILED", "Unable to decrypt secret");
    }
  };

  return {
    primaryKeyId,
    encrypt,
    decrypt,
    needsReencryption: (envelope) => parseEnvelope(envelope).keyId !== primaryKeyId,
    reencrypt: (envelope, context) => encrypt(decrypt(envelope, context), context),
  };
}

let cachedVault: Vault | null = null;
let warnedDevKey = false;

/** Process-wide vault built from VAULT_ENCRYPTION_KEY (+ VAULT_ENCRYPTION_KEYS_PREVIOUS, comma-separated). */
export function getVault(env: NodeJS.ProcessEnv = process.env): Vault {
  if (cachedVault && env === process.env) return cachedVault;

  const previous = (env.VAULT_ENCRYPTION_KEYS_PREVIOUS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let primary: Buffer;
  const configured = env.VAULT_ENCRYPTION_KEY?.trim();
  if (configured) {
    primary = parseMasterKey(configured);
  } else if (env.NODE_ENV !== "production") {
    // Zero-config local development only. Production refuses to start without a real key.
    primary = createHash("sha256").update(DEV_FALLBACK_SEED).digest();
    if (!warnedDevKey) {
      warnedDevKey = true;
      console.warn(
        "[vault] VAULT_ENCRYPTION_KEY is not set — using an INSECURE development key. Run `npm run vault:keygen`.",
      );
    }
  } else {
    throw new VaultError("MISSING_MASTER_KEY", "VAULT_ENCRYPTION_KEY must be set in production");
  }

  const vault = createVault(primary, previous);
  if (env === process.env) cachedVault = vault;
  return vault;
}

/** Encrypt a user's provider API key for storage in `UserApiKey.encryptedKey`. */
export function encryptApiKey(plaintextKey: string, userId: string, provider: string) {
  const vault = getVault();
  const encryptedKey = vault.encrypt(plaintextKey.trim(), apiKeyContext(userId, provider));
  return { encryptedKey, encryptionKeyId: vault.primaryKeyId, keyHint: keyHint(plaintextKey) };
}

/** Decrypt a stored API key in memory, just before calling the provider. Never return this to a client. */
export function decryptApiKey(encryptedKey: string, userId: string, provider: string): string {
  return getVault().decrypt(encryptedKey, apiKeyContext(userId, provider));
}
