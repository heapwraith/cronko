/**
 * Web Push: notifications straight to a browser (desktop or phone), without a third-party
 * app. A channel holds one browser's push subscription; the browser subscribes with our
 * VAPID public key, and every alert is sent with the private one.
 *
 * The VAPID key pair is made on first use and kept in the settings table. Replacing it
 * (delete the two settings) makes every existing subscription stop working.
 */
import { getSetting, setSetting } from "@cronko/database/queries/settings"
import type { WebPushConfig } from "@cronko/shared"
import * as webpushModule from "web-push"
import { env } from "../env"

// web-push is CommonJS: depending on the loader its API sits on the namespace or on `default`.
const webpush: typeof webpushModule =
  (webpushModule as { default?: typeof webpushModule }).default ?? webpushModule

const PUBLIC_KEY = "vapid_public_key"
const PRIVATE_KEY = "vapid_private_key"

export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const [publicKey, privateKey] = await Promise.all([
    getSetting(PUBLIC_KEY),
    getSetting(PRIVATE_KEY),
  ])
  if (publicKey && privateKey) return { publicKey, privateKey }
  const fresh = webpush.generateVAPIDKeys()
  await setSetting(PUBLIC_KEY, fresh.publicKey)
  await setSetting(PRIVATE_KEY, fresh.privateKey)
  return fresh
}

/** The contact the push service may use: a web address or a mailto, as the VAPID spec asks. */
export function vapidSubject(): string {
  if (env.PUBLIC_URL) return env.PUBLIC_URL
  if (env.ADMIN_EMAIL) return `mailto:${env.ADMIN_EMAIL}`
  return "https://github.com/heapwraith/cronko"
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string; event: string }

/** Small enough for every push service (the limit is about 4 KB once encrypted). */
export function buildPushPayload(event: string, text: string, monitorName?: string): PushPayload {
  const url = text.match(/https?:\/\/\S+$/)?.[0]
  const body = (url ? text.slice(0, -url.length) : text).trim().slice(0, 300)
  return {
    title: `Cronko: ${monitorName ?? event}`,
    body,
    ...(url && { url }),
    ...(monitorName && { tag: `cronko:${monitorName}` }),
    event,
  }
}

export class PushError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** The browser unsubscribed or the subscription expired: it will never work again. */
    readonly gone = false,
  ) {
    super(message)
  }
}

export async function sendWebPush(config: WebPushConfig, payload: PushPayload): Promise<void> {
  const { publicKey, privateKey } = await getVapidKeys()
  try {
    await webpush.sendNotification(
      { endpoint: config.endpoint, keys: config.keys },
      JSON.stringify(payload),
      {
        vapidDetails: { subject: vapidSubject(), publicKey, privateKey },
        TTL: 3600,
        // Alerts should wake the device, a recovery or a digest need not.
        urgency: payload.event === "down" || payload.event === "failed" ? "high" : "normal",
        timeout: 10_000,
      },
    )
  } catch (err) {
    // Never include the endpoint: it is a capability URL.
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      throw new PushError("webpush: subscription expired or removed", false, true)
    }
    if (typeof status === "number") {
      throw new PushError(
        `webpush: HTTP ${status}`,
        status >= 500 || status === 408 || status === 429,
      )
    }
    throw new PushError("webpush: request failed", true)
  }
}
