import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto"
import { env } from "../env"

/**
 * TOTP (RFC 6238) on top of HOTP (RFC 4226), HMAC-SHA1, 6 digits, 30 s step: the
 * profile every authenticator app supports. Only node:crypto, no dependency.
 */

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
/** Steps accepted on each side of "now", to absorb clock drift and typing time. */
const WINDOW = 1

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) throw new Error("invalid base32")
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A fresh 160-bit secret, base32 (what authenticator apps display). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function hotp(
  secret: Buffer,
  counter: number,
  digits = TOTP_DIGITS,
  algorithm: "sha1" | "sha256" | "sha512" = "sha1",
): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac(algorithm, secret).update(msg).digest()
  const offset = (mac[mac.length - 1] as number) & 0x0f
  const bin =
    (((mac[offset] as number) & 0x7f) << 24) |
    (((mac[offset + 1] as number) & 0xff) << 16) |
    (((mac[offset + 2] as number) & 0xff) << 8) |
    ((mac[offset + 3] as number) & 0xff)
  return String(bin % 10 ** digits).padStart(digits, "0")
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS)
}

/**
 * Check a user-typed code. Returns the matching time step or null. All window
 * steps are always compared (no early exit) with a constant-time compare.
 * The caller must still reject a step that was already used (replay).
 */
export function verifyTotp(secretBase32: string, code: string, nowMs = Date.now()): number | null {
  const typed = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(typed)) return null
  const secret = base32Decode(secretBase32)
  const current = totpStep(nowMs)
  const typedBuf = Buffer.from(typed)
  let match: number | null = null
  for (let step = current - WINDOW; step <= current + WINDOW; step++) {
    const expected = Buffer.from(hotp(secret, step))
    if (timingSafeEqual(expected, typedBuf)) match = step
  }
  return match
}

export function otpauthUri(secretBase32: string, account: string, issuer = "Cronko"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const q = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${q}`
}

// --- Encryption at rest -------------------------------------------------------
// The secret must be recoverable (to compute codes), so it cannot be hashed. It is
// sealed with AES-256-GCM under a key derived from JWT_SECRET via HKDF with its
// own info string, so the key is never the JWT signing key itself. A database
// leak alone then does not reveal the seeds. Rotating JWT_SECRET makes enrolled
// secrets undecryptable: users must re-enroll (or an operator clears the columns).

function encryptionKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", env.JWT_SECRET, "cronko-totp", "cronko-totp-secret-v1", 32))
}

export function encryptTotpSecret(secretBase32: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const ct = Buffer.concat([cipher.update(secretBase32, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64")))
    .join(":")
}

/** Returns null when the value is corrupt or was sealed under a different JWT_SECRET. */
export function decryptTotpSecret(stored: string): string | null {
  try {
    const [version, iv, tag, ct] = stored.split(":")
    if (version !== "v1" || !iv || !tag || !ct) return null
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString(
      "utf8",
    )
  } catch {
    return null
  }
}

// --- Recovery codes -----------------------------------------------------------

export const RECOVERY_CODE_COUNT = 10
const RECOVERY_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"

/** `xxxxx-xxxxx`: 10 chars of a 32-letter alphabet, ~50 bits each. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(32)]).join("")
    return `${chars.slice(0, 5)}-${chars.slice(5)}`
  })
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase()
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex")
}

/** Compare against every stored hash without stopping at the first hit. */
export function findRecoveryCodeMatch<T extends { codeHash: string }>(
  code: string,
  rows: T[],
): T | null {
  const probe = Buffer.from(hashRecoveryCode(code))
  let hit: T | null = null
  for (const row of rows) {
    const stored = Buffer.from(row.codeHash)
    if (stored.length === probe.length && timingSafeEqual(stored, probe)) hit = row
  }
  return hit
}

/**
 * Check a second factor for a user with 2FA on: a 6-digit TOTP code (each time
 * step usable once) or a recovery code (deleted when spent). Both are claimed
 * atomically in the database, so two concurrent requests cannot both succeed.
 */
export async function verifySecondFactor(
  user: { id: string; totpSecret: string | null },
  code: string,
): Promise<"totp" | "recovery" | null> {
  const { claimTotpStep, consumeRecoveryCode, listRecoveryCodes } = await import(
    "@cronko/database/queries/users"
  )
  if (/^\d{3}\s?\d{3}$/.test(code.trim())) {
    const secret = user.totpSecret ? decryptTotpSecret(user.totpSecret) : null
    if (!secret) return null
    const step = verifyTotp(secret, code)
    if (step === null) return null
    return (await claimTotpStep(user.id, step)) ? "totp" : null
  }
  const hit = findRecoveryCodeMatch(code, await listRecoveryCodes(user.id))
  if (!hit) return null
  return (await consumeRecoveryCode(hit.id)) ? "recovery" : null
}
