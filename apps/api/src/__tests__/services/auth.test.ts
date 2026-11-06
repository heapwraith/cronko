import { describe, expect, it } from "vitest"
import {
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  verifyAccessToken,
  verifyPassword,
  verifyRefreshToken,
} from "../../services/auth"

describe("auth service", () => {
  it("hashes and verifies passwords with bcrypt", async () => {
    const hash = await hashPassword("my-secret-password")
    expect(hash).not.toBe("my-secret-password")
    expect(await verifyPassword("my-secret-password", hash)).toBe(true)
    expect(await verifyPassword("wrong-password", hash)).toBe(false)
  })

  it("generates and verifies access tokens with Zod validation", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440000"
    const token = await generateAccessToken(userId, "test@cronko.dev")
    expect(token).toBeTypeOf("string")

    const payload = await verifyAccessToken(token)
    expect(payload.sub).toBe(userId)
    expect(payload.email).toBe("test@cronko.dev")
    expect(payload.iss).toBe("cronko")
    expect(payload.aud).toBe("cronko-api")

    // Access token should expire in ~15 minutes
    const lifetime = payload.exp - payload.iat
    expect(lifetime).toBe(15 * 60)
  })

  it("generates and verifies refresh tokens", async () => {
    const userId = "660e8400-e29b-41d4-a716-446655440001"
    const token = await generateRefreshToken(userId, "refresh@cronko.dev")

    const payload = await verifyRefreshToken(token)
    expect(payload.sub).toBe(userId)
    expect(payload.aud).toBe("cronko-refresh")

    const lifetime = payload.exp - payload.iat
    expect(lifetime).toBe(7 * 24 * 60 * 60)
  })

  it("rejects access tokens with wrong audience", async () => {
    const userId = "770e8400-e29b-41d4-a716-446655440002"
    const refreshToken = await generateRefreshToken(userId, "wrong@cronko.dev")
    // Using a refresh token as an access token should fail Zod validation
    await expect(verifyAccessToken(refreshToken)).rejects.toThrow()
  })
})
