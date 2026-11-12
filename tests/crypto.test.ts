import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  VaultError,
  apiKeyContext,
  createVault,
  decryptApiKey,
  encryptApiKey,
  envelopeKeyId,
  generateMasterKey,
  getVault,
  keyHint,
  keyIdFor,
  parseMasterKey,
} from "@/lib/crypto";

const SECRET = "sk-test-0123456789abcdefghijklmnopqrstuvwxyz";
const CTX = apiKeyContext("00000000-0000-7000-8000-000000000001", "OPENAI");

function expectVaultError(fn: () => unknown, code: VaultError["code"]) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(VaultError);
    expect((err as VaultError).code).toBe(code);
    return;
  }
  throw new Error(`expected VaultError(${code})`);
}

describe("AES-256-GCM vault", () => {
  const key = randomBytes(32);
  const vault = createVault(key);

  it("round-trips and uses the v1 envelope format", () => {
    const envelope = vault.encrypt(SECRET, CTX);
    expect(envelope).toMatch(/^v1\.[0-9a-f]{16}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/);
    expect(envelope).not.toContain(SECRET);
    expect(envelopeKeyId(envelope)).toBe(keyIdFor(key));
    expect(vault.decrypt(envelope, CTX)).toBe(SECRET);
  });

  it("uses a fresh IV every time", () => {
    const a = vault.encrypt(SECRET, CTX);
    const b = vault.encrypt(SECRET, CTX);
    expect(a).not.toBe(b);
    expect(a.split(".")[2]).not.toBe(b.split(".")[2]);
  });

  it("handles unicode secrets", () => {
    const s = "khoá-bí-mật-🔐-日本";
    expect(vault.decrypt(vault.encrypt(s, CTX), CTX)).toBe(s);
  });

  it("rejects a ciphertext moved to another user or provider (AAD binding)", () => {
    const envelope = vault.encrypt(SECRET, CTX);
    expectVaultError(() => vault.decrypt(envelope, apiKeyContext("someone-else", "OPENAI")), "DECRYPTION_FAILED");
    expectVaultError(
      () => vault.decrypt(envelope, apiKeyContext("00000000-0000-7000-8000-000000000001", "GEMINI")),
      "DECRYPTION_FAILED",
    );
  });

  it("detects tampering with ciphertext, tag or IV", () => {
    const envelope = vault.encrypt(SECRET, CTX);
    const parts = envelope.split(".");
    for (const index of [2, 3, 4]) {
      const bytes = Buffer.from(parts[index]!, "base64url");
      bytes[0] = bytes[0]! ^ 0x01;
      const tampered = [...parts];
      tampered[index] = bytes.toString("base64url");
      expectVaultError(() => vault.decrypt(tampered.join("."), CTX), "DECRYPTION_FAILED");
    }
  });

  it("rejects wrong keys and malformed envelopes", () => {
    const envelope = vault.encrypt(SECRET, CTX);
    expectVaultError(() => createVault(randomBytes(32)).decrypt(envelope, CTX), "UNKNOWN_KEY_ID");
    expectVaultError(() => vault.decrypt("not-an-envelope", CTX), "MALFORMED_ENVELOPE");
    expectVaultError(() => vault.decrypt(envelope.replace(/^v1/, "v2"), CTX), "MALFORMED_ENVELOPE");
    expectVaultError(() => vault.encrypt("", CTX), "INVALID_PLAINTEXT");
  });

  it("supports key rotation", () => {
    const oldKey = generateMasterKey();
    const newKey = generateMasterKey();
    const legacy = createVault(oldKey).encrypt(SECRET, CTX);

    const rotated = createVault(newKey, [oldKey]);
    expect(rotated.decrypt(legacy, CTX)).toBe(SECRET);
    expect(rotated.needsReencryption(legacy)).toBe(true);

    const fresh = rotated.reencrypt(legacy, CTX);
    expect(rotated.needsReencryption(fresh)).toBe(false);
    expect(envelopeKeyId(fresh)).toBe(rotated.primaryKeyId);
    expect(createVault(newKey).decrypt(fresh, CTX)).toBe(SECRET);
  });
});

describe("master key handling", () => {
  it("parses base64, base64url and hex 32-byte keys", () => {
    const raw = randomBytes(32);
    expect(parseMasterKey(raw.toString("base64")).equals(raw)).toBe(true);
    expect(parseMasterKey(raw.toString("base64url")).equals(raw)).toBe(true);
    expect(parseMasterKey(raw.toString("hex")).equals(raw)).toBe(true);
    expectVaultError(() => parseMasterKey(randomBytes(16).toString("base64")), "INVALID_MASTER_KEY");
    expectVaultError(() => parseMasterKey("not a key!"), "INVALID_MASTER_KEY");
  });

  it("refuses to run in production without VAULT_ENCRYPTION_KEY", () => {
    expectVaultError(() => getVault({ NODE_ENV: "production" } as NodeJS.ProcessEnv), "MISSING_MASTER_KEY");
    const key = generateMasterKey();
    const vault = getVault({ NODE_ENV: "production", VAULT_ENCRYPTION_KEY: key } as NodeJS.ProcessEnv);
    expect(vault.primaryKeyId).toBe(keyIdFor(parseMasterKey(key)));
  });

  it("encryptApiKey / decryptApiKey round-trip with a display-only hint", () => {
    const userId = "00000000-0000-7000-8000-000000000002";
    const stored = encryptApiKey(`  ${SECRET}  `, userId, "ANTHROPIC");
    expect(stored.keyHint).toBe("wxyz");
    expect(stored.encryptionKeyId).toBe(envelopeKeyId(stored.encryptedKey));
    expect(decryptApiKey(stored.encryptedKey, userId, "ANTHROPIC")).toBe(SECRET);
    expect(keyHint("abc")).toBe("••••");
  });
});
