import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";

const ITERATIONS = 100_000;
const KEY_LEN    = 32;
const DIGEST     = "sha256";
const PREFIX     = "pbkdf2:";

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(plain, salt, ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  return `${PREFIX}${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext — allows migration of existing accounts on next login
    return plain === stored;
  }
  const [, salt, storedHash] = stored.split(":");
  const derived = pbkdf2Sync(plain, salt, ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}
