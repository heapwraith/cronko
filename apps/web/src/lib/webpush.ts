/** Web Push from the browser side: subscribe this device with the server's VAPID key. */

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

/** The VAPID public key is URL-safe base64; the browser wants raw bytes. */
export function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const padded = publicKey
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(publicKey.length / 4) * 4, "=")
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export type PushSubscriptionConfig = { endpoint: string; keys: { p256dh: string; auth: string } }

export class PushDenied extends Error {
  constructor() {
    super("notification permission was not granted")
    this.name = "PushDenied"
  }
}

/** Ask for permission, subscribe and return what the server needs to reach this browser. */
export async function subscribeThisDevice(publicKey: string): Promise<PushSubscriptionConfig> {
  if ((await Notification.requestPermission()) !== "granted") throw new PushDenied()
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  })
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("the browser returned an incomplete subscription")
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }
}
