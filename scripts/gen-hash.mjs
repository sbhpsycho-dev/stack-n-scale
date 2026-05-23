import { randomBytes, pbkdf2Sync } from "crypto";
const pw = process.argv[2];
if (!pw) { console.error("Usage: node scripts/gen-hash.mjs <password>"); process.exit(1); }
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(pw, salt, 100_000, 32, "sha256").toString("hex");
console.log(`pbkdf2:${salt}:${hash}`);
