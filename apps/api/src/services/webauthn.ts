/**
 * Security keys and passkeys as an extra second factor (WebAuthn, via @simplewebauthn/server).
 *
 * A key can only be added once TOTP is on, so the recovery codes always remain as the way
 * back in, and the relying party is derived from PUBLIC_URL (or WEBAUTHN_ORIGIN / WEBAUTHN_RP_ID):
 * without one of them the feature is off, because a wrong origin would lock people out.
 */
import { createHash } from "node:crypto"
import { isTokenRevoked, revokeToken } from "@cronko/database/queries/revoked-tokens"
import {
  createWebauthnCredential,
  findWebauthnCredential,
  listWebauthnCredentials,
  touchWebauthnCredential,
  webauthnCredentialExists,
} from "@cronko/database/queries/webauthn"
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { env } from "../env"

const RP_NAME = "Cronko"

export function webauthnConfig(): { origin: string; rpID: string } | null {
  const base = env.WEBAUTHN_ORIGIN ?? env.PUBLIC_URL
  if (!base) return null
  try {
    const url = new URL(base)
    return { origin: url.origin, rpID: env.WEBAUTHN_RP_ID ?? url.hostname }
  } catch {
    return null
  }
}

const b64 = {
  encode: (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url"),
  decode: (text: string) => new Uint8Array(Buffer.from(text, "base64url")),
}

// --- registration ---------------------------------------------------------------------------

/** Registration challenges wait here between the two calls; single process, so a Map is enough. */
const pending = new Map<string, { challenge: string; expires: number }>()
const CHALLENGE_TTL_MS = 5 * 60_000

export async function beginRegistration(user: { id: string; email: string }) {
  const cfg = webauthnConfig()
  if (!cfg) throw new Error("webauthn is not configured")
  const existing = await listWebauthnCredentials(user.id)
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: cfg.rpID,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ?? [] })),
    // A second factor, not a passwordless login: the password still comes first.
    authenticatorSelection: { residentKey: "discouraged", userVerification: "discouraged" },
  })
  pending.set(user.id, { challenge: options.challenge, expires: Date.now() + CHALLENGE_TTL_MS })
  return options
}

export async function finishRegistration(
  user: { id: string },
  response: RegistrationResponseJSON,
  name: string,
): Promise<{ id: string } | null> {
  const cfg = webauthnConfig()
  const wait = pending.get(user.id)
  // One try per challenge, whatever the outcome.
  pending.delete(user.id)
  if (!cfg || !wait || wait.expires < Date.now()) return null

  let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verified = await verifyRegistrationResponse({
      response,
      expectedChallenge: wait.challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      // A second factor behind the password and the code: touching the key is enough, so
      // PIN or fingerprint (user verification) is not demanded, matching the options sent.
      requireUserVerification: false,
    })
  } catch {
    return null
  }
  if (!verified.verified) return null
  const { credential } = verified.registrationInfo
  if (await webauthnCredentialExists(credential.id)) return null
  await createWebauthnCredential({
    id: credential.id,
    userId: user.id,
    name,
    publicKey: b64.encode(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
  })
  return { id: credential.id }
}

// --- login ----------------------------------------------------------------------------------

/** Options for the second step of a login, or null when the user has no usable key. */
export async function beginAuthentication(
  userId: string,
): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  const cfg = webauthnConfig()
  if (!cfg) return null
  const creds = await listWebauthnCredentials(userId)
  if (creds.length === 0) return null
  return generateAuthenticationOptions({
    rpID: cfg.rpID,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports ?? [] })),
    userVerification: "discouraged",
  })
}

const challengeKey = (challenge: string) =>
  `wac:${createHash("sha256").update(challenge).digest("hex")}`

/**
 * Verify an assertion against the challenge that was signed into the login step. Each
 * challenge is accepted once (it is recorded as used before anything else), so a captured
 * response cannot be replayed even with an authenticator whose counter stays at zero.
 */
export async function finishAuthentication(
  user: { id: string },
  challenge: string,
  expiresAt: Date,
  response: AuthenticationResponseJSON,
): Promise<boolean> {
  const cfg = webauthnConfig()
  if (!cfg) return false
  const key = challengeKey(challenge)
  if (await isTokenRevoked(key)) return false
  await revokeToken(key, expiresAt)

  const stored = await findWebauthnCredential(user.id, response.id)
  if (!stored) return false
  try {
    const verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpID,
      requireUserVerification: false,
      credential: {
        id: stored.id,
        publicKey: b64.decode(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports ?? [],
      },
    })
    if (!verified.verified) return false
    await touchWebauthnCredential(stored.id, verified.authenticationInfo.newCounter)
    return true
  } catch {
    return false
  }
}
