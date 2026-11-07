/**
 * Single sign-on: trusted-proxy header login and OIDC (authorization code + PKCE).
 *
 * Both only ever log in a user that already exists (matched by e-mail): there is no
 * registration, so the user list is the allowlist. Neither asks for the local TOTP code,
 * because the identity provider is responsible for the second factor.
 */
import { createHash, randomBytes } from "node:crypto"
import { BlockList, isIP } from "node:net"
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose"
import { env } from "../env"

export const SSO_CALLBACK_PATH = "/auth/sso/oidc/callback"

export const oidcEnabled = () => Boolean(env.OIDC_ISSUER)
export const proxyEnabled = () => Boolean(env.TRUSTED_PROXY_AUTH_HEADER && env.TRUSTED_PROXY_IPS)
export const passwordLoginEnabled = () => env.PASSWORD_LOGIN_DISABLED !== "true"

/** The address the identity provider sends the browser back to. */
export function redirectUri(): string {
  return (
    env.OIDC_REDIRECT_URL ?? `${(env.PUBLIC_URL ?? "").replace(/\/+$/, "")}${SSO_CALLBACK_PATH}`
  )
}

// --- trusted proxy -------------------------------------------------------------------------

let proxyList: BlockList | null = null
let proxyListFor = ""

function trustedProxies(): BlockList {
  const raw = env.TRUSTED_PROXY_IPS ?? ""
  if (proxyList && proxyListFor === raw) return proxyList
  const list = new BlockList()
  for (const entry of raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)) {
    const [addr = "", bits] = entry.split("/")
    const family = isIP(addr)
    if (!family) continue
    const type = family === 6 ? "ipv6" : "ipv4"
    if (bits === undefined) list.addAddress(addr, type)
    else list.addSubnet(addr, Number.parseInt(bits, 10), type)
  }
  proxyList = list
  proxyListFor = raw
  return list
}

/** True when the TCP peer (never a forwarded header) is one of the configured proxies. */
export function isTrustedPeer(peer: string | undefined): boolean {
  if (!peer) return false
  // An IPv4 peer on a dual-stack socket shows up as ::ffff:a.b.c.d.
  const addr = peer.startsWith("::ffff:") ? peer.slice(7) : peer
  const family = isIP(addr)
  if (!family) return false
  return trustedProxies().check(addr, family === 6 ? "ipv6" : "ipv4")
}

// --- OIDC ----------------------------------------------------------------------------------

interface Discovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
}

let discovery: { at: number; doc: Discovery; jwks: JWTVerifyGetKey } | null = null
const DISCOVERY_TTL_MS = 3_600_000

async function getDiscovery() {
  if (discovery && Date.now() - discovery.at < DISCOVERY_TTL_MS) return discovery
  const issuer = (env.OIDC_ISSUER ?? "").replace(/\/+$/, "")
  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`discovery failed (${res.status})`)
  const doc = (await res.json()) as Discovery
  // The document must describe the issuer we were configured with (mix-up protection).
  if (doc.issuer?.replace(/\/+$/, "") !== issuer) throw new Error("issuer mismatch in discovery")
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof doc[key] !== "string") throw new Error(`discovery lacks ${key}`)
  }
  discovery = { at: Date.now(), doc, jwks: createRemoteJWKSet(new URL(doc.jwks_uri)) }
  return discovery
}

/** Forget the cached discovery document (tests, and a way to recover after an IdP change). */
export function resetOidcCache() {
  discovery = null
}

const b64url = (b: Buffer) => b.toString("base64url")

export interface OidcStart {
  url: string
  /** What the callback needs to see again: kept in a short-lived cookie. */
  state: string
  nonce: string
  verifier: string
}

export async function startOidc(): Promise<OidcStart> {
  const { doc } = await getDiscovery()
  const state = b64url(randomBytes(24))
  const nonce = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(48))
  const url = new URL(doc.authorization_endpoint)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.OIDC_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    scope: "openid email",
    state,
    nonce,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  }).toString()
  return { url: url.toString(), state, nonce, verifier }
}

export class SsoError extends Error {
  constructor(
    readonly code: string,
    detail?: string,
  ) {
    super(detail ?? code)
    this.name = "SsoError"
  }
}

/** Exchange the code, verify the ID token and return the verified e-mail. */
export async function finishOidc(params: {
  code: string
  nonce: string
  verifier: string
}): Promise<string> {
  const { doc, jwks } = await getDiscovery()
  let res: Response
  try {
    res = await fetch(doc.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: redirectUri(),
        client_id: env.OIDC_CLIENT_ID ?? "",
        client_secret: env.OIDC_CLIENT_SECRET ?? "",
        code_verifier: params.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new SsoError("token_request_failed")
  }
  if (!res.ok) throw new SsoError("token_exchange_failed", `HTTP ${res.status}`)
  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown }
  if (typeof body.id_token !== "string") throw new SsoError("no_id_token")

  let claims: Record<string, unknown>
  try {
    const verified = await jwtVerify(body.id_token, jwks, {
      issuer: doc.issuer,
      audience: env.OIDC_CLIENT_ID ?? "",
      // Never accept "none" or a symmetric algorithm for a token checked against a JWKS.
      algorithms: ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "EdDSA"],
    })
    claims = verified.payload
  } catch {
    throw new SsoError("invalid_id_token")
  }
  if (claims.nonce !== params.nonce) throw new SsoError("nonce_mismatch")
  if (typeof claims.email !== "string" || !claims.email) throw new SsoError("no_email")
  if (claims.email_verified !== true) throw new SsoError("email_not_verified")
  return claims.email
}
