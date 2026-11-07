import bcrypt from "bcryptjs"
import { sign, verify } from "hono/jwt"
import { z } from "zod"
import { env } from "../env"

const jwtPayloadSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  iat: z.number(),
  exp: z.number(),
  // Absent on tokens issued before logout revocation existed.
  jti: z.string().optional(),
  iss: z.literal("cronko"),
  aud: z.literal("cronko-api"),
})

const jwtRefreshSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().optional(),
  iss: z.literal("cronko"),
  aud: z.literal("cronko-refresh"),
})

const jwtChallengeSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  iat: z.number(),
  exp: z.number(),
  iss: z.literal("cronko"),
  aud: z.literal("cronko-2fa"),
  // The WebAuthn challenge issued with this login step, when the user has a security key.
  wac: z.string().optional(),
})

export type JwtPayload = z.infer<typeof jwtPayloadSchema>
export type JwtRefreshPayload = z.infer<typeof jwtRefreshSchema>

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function generateAccessToken(userId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 15 * 60 // 15 minutes

  return sign(
    {
      sub: userId,
      email,
      iat: now,
      exp,
      jti: crypto.randomUUID(),
      iss: "cronko",
      aud: "cronko-api",
    },
    env.JWT_SECRET,
    "HS256",
  )
}

export async function generateRefreshToken(userId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 7 * 24 * 60 * 60 // 7 days

  return sign(
    {
      sub: userId,
      email,
      iat: now,
      exp,
      jti: crypto.randomUUID(),
      iss: "cronko",
      aud: "cronko-refresh",
    },
    env.JWT_SECRET,
    "HS256",
  )
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const payload = await verify(token, env.JWT_SECRET, "HS256")
  return jwtPayloadSchema.parse(payload)
}

export async function verifyRefreshToken(token: string): Promise<JwtRefreshPayload> {
  const payload = await verify(token, env.JWT_SECRET, "HS256")
  return jwtRefreshSchema.parse(payload)
}

/**
 * Proof that the password step succeeded, valid for 5 minutes and only for the
 * 2FA step (its own audience: it is useless as an access or refresh token).
 */
export async function generateTwoFactorChallenge(
  userId: string,
  email: string,
  webauthnChallenge?: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return sign(
    {
      sub: userId,
      email,
      iat: now,
      exp: now + 5 * 60,
      iss: "cronko",
      aud: "cronko-2fa",
      ...(webauthnChallenge && { wac: webauthnChallenge }),
    },
    env.JWT_SECRET,
    "HS256",
  )
}

export async function verifyTwoFactorChallenge(token: string) {
  const payload = await verify(token, env.JWT_SECRET, "HS256")
  return jwtChallengeSchema.parse(payload)
}
