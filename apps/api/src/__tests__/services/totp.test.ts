import { describe, expect, it } from "vitest"
import {
  base32Decode,
  base32Encode,
  decryptTotpSecret,
  encryptTotpSecret,
  findRecoveryCodeMatch,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  otpauthUri,
  totpStep,
  verifyTotp,
} from "../../services/totp"

const SHA1_KEY = Buffer.from("12345678901234567890")
const SHA256_KEY = Buffer.from("12345678901234567890123456789012")
const SHA512_KEY = Buffer.from("1234567890123456789012345678901234567890123456789012345678901234")

describe("HOTP / TOTP against the RFCs", () => {
  it("matches the RFC 4226 appendix D vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676"]
    expected.forEach((code, counter) => {
      expect(hotp(SHA1_KEY, counter)).toBe(code)
    })
  })

  it("matches the RFC 6238 appendix B vectors (8 digits, all three hashes)", () => {
    const at = (t: number) => Math.floor(t / 30)
    expect(hotp(SHA1_KEY, at(59), 8)).toBe("94287082")
    expect(hotp(SHA1_KEY, at(1111111109), 8)).toBe("07081804")
    expect(hotp(SHA1_KEY, at(1111111111), 8)).toBe("14050471")
    expect(hotp(SHA1_KEY, at(1234567890), 8)).toBe("89005924")
    expect(hotp(SHA1_KEY, at(2000000000), 8)).toBe("69279037")
    expect(hotp(SHA1_KEY, at(20000000000), 8)).toBe("65353130")
    expect(hotp(SHA256_KEY, at(59), 8, "sha256")).toBe("46119246")
    expect(hotp(SHA512_KEY, at(59), 8, "sha512")).toBe("90693936")
  })

  it("verifies 6-digit codes within the +/-1 step window only", () => {
    const secret = base32Encode(SHA1_KEY)
    const t = 1111111109 * 1000 // step 37037036, 6-digit code 081804
    expect(verifyTotp(secret, "081804", t)).toBe(totpStep(t))
    expect(verifyTotp(secret, "081804", t + 30_000)).toBe(totpStep(t))
    expect(verifyTotp(secret, "081804", t - 30_000)).toBe(totpStep(t))
    expect(verifyTotp(secret, "081804", t + 90_000)).toBeNull()
    expect(verifyTotp(secret, "081805", t)).toBeNull()
  })

  it("rejects malformed input", () => {
    const secret = base32Encode(SHA1_KEY)
    const t = 1111111109 * 1000
    for (const bad of ["", "08180", "0818044", "abcdef", "08 18 0x"]) {
      expect(verifyTotp(secret, bad, t)).toBeNull()
    }
    expect(verifyTotp(secret, "081 804", t)).toBe(totpStep(t))
  })
})

describe("base32 and URI", () => {
  it("round-trips and decodes the RFC 4648 vectors", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI")
    expect(base32Decode("MZXW6YTBOI======").toString()).toBe("foobar")
    const s = generateTotpSecret()
    expect(s).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Encode(base32Decode(s))).toBe(s)
  })

  it("builds an otpauth URI authenticator apps accept", () => {
    const uri = new URL(otpauthUri("JBSWY3DPEHPK3PXP", "ops@example.com"))
    expect(uri.protocol).toBe("otpauth:")
    expect(uri.host).toBe("totp")
    expect(decodeURIComponent(uri.pathname)).toBe("/Cronko:ops@example.com")
    expect(uri.searchParams.get("secret")).toBe("JBSWY3DPEHPK3PXP")
    expect(uri.searchParams.get("issuer")).toBe("Cronko")
    expect(uri.searchParams.get("digits")).toBe("6")
    expect(uri.searchParams.get("period")).toBe("30")
  })
})

describe("secret encryption at rest", () => {
  it("round-trips, never stores plaintext, and uses a fresh IV each time", () => {
    const secret = generateTotpSecret()
    const a = encryptTotpSecret(secret)
    const b = encryptTotpSecret(secret)
    expect(a).not.toContain(secret)
    expect(a).not.toBe(b)
    expect(decryptTotpSecret(a)).toBe(secret)
  })

  it("returns null for tampered or foreign values", () => {
    const sealed = encryptTotpSecret(generateTotpSecret())
    const parts = sealed.split(":")
    parts[3] = Buffer.from("tampered").toString("base64")
    expect(decryptTotpSecret(parts.join(":"))).toBeNull()
    expect(decryptTotpSecret("garbage")).toBeNull()
  })
})

describe("recovery codes", () => {
  it("generates 10 distinct xxxxx-xxxxx codes", () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/)
  })

  it("matches regardless of case, dashes and spaces", () => {
    const [code] = generateRecoveryCodes() as [string]
    const rows = [
      { codeHash: hashRecoveryCode("zzzzz-zzzzz") },
      { codeHash: hashRecoveryCode(code) },
    ]
    expect(findRecoveryCodeMatch(code.toUpperCase().replace("-", " "), rows)).toBe(rows[1])
    expect(findRecoveryCodeMatch("aaaaa-aaaaa", rows)).toBeNull()
  })
})
