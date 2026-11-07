/**
 * The ping key: one instance-level secret that lets a job ping a monitor by its readable
 * slug (`/ping/k/<key>/<slug>`) instead of by the monitor's own token.
 *
 * It is stored as is in the `settings` table, at the same trust level as the per-monitor
 * tokens (which are also stored as is, because the UI has to show them again). Rotating
 * replaces it, and the old key stops working at once.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { getSetting, setSetting } from "@cronko/database/queries/settings"

const SETTING_KEY = "ping_key"
export const PING_KEY_PREFIX = "pk_"

const sha256 = (v: string) => createHash("sha256").update(v).digest()

export async function getPingKey(): Promise<string | null> {
  return (await getSetting(SETTING_KEY)) || null
}

export async function rotatePingKey(): Promise<string> {
  const key = PING_KEY_PREFIX + randomBytes(24).toString("base64url")
  await setSetting(SETTING_KEY, key)
  return key
}

/** Constant-time check; false when no key has been generated. */
export async function verifyPingKey(candidate: string): Promise<boolean> {
  const key = await getPingKey()
  if (!key) return false
  return timingSafeEqual(sha256(candidate), sha256(key))
}

/** Slugs a job may name in a ping URL (the same shape `slugFor` produces for a monitor). */
export const PING_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
