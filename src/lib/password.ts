import "server-only";

import bcrypt from "bcryptjs";

/** bcrypt work factor. 12 ≈ a few hundred ms per hash on current hardware. */
const COST = 12;

/** bcrypt only reads the first 72 bytes; longer passwords are rejected up front instead of being silently truncated. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export function passwordFitsBcrypt(password: string): boolean {
  return new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** A valid hash of a random value, compared against when the account does not exist so timing does not reveal it. */
const DECOY_HASH = bcrypt.hashSync(crypto.randomUUID(), COST);

/** Constant-work check: always runs one bcrypt comparison, whether or not there is a stored hash. */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DECOY_HASH);
  return Boolean(hash) && matches;
}
