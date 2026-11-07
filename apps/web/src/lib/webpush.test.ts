import { afterEach, describe, expect, it, vi } from "vitest"
import { applicationServerKey, PushDenied, pushSupported, subscribeThisDevice } from "./webpush"

afterEach(() => vi.unstubAllGlobals())

describe("applicationServerKey", () => {
  it("decodes URL-safe base64 without padding into the raw bytes", () => {
    // 0xfb 0xff 0xfe uses both URL-safe replacements ("-" and "_").
    expect([...applicationServerKey("-__-")]).toEqual([0xfb, 0xff, 0xfe])
    expect([...applicationServerKey("AQID")]).toEqual([1, 2, 3])
    expect([...applicationServerKey("AQI")]).toEqual([1, 2])
    expect([...applicationServerKey("AQ")]).toEqual([1])
  })

  it("turns a real 65-byte VAPID public key into 65 bytes starting with 0x04", () => {
    const point = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)])
    const bytes = applicationServerKey(point.toString("base64url"))
    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(4)
  })
})

describe("pushSupported", () => {
  it("is false in an environment without the Push API", () => {
    expect(pushSupported()).toBe(false)
  })

  it("is true when service workers, push and notifications all exist", () => {
    vi.stubGlobal("navigator", { serviceWorker: {} })
    vi.stubGlobal("PushManager", class {})
    vi.stubGlobal("Notification", class {})
    vi.stubGlobal("window", { PushManager: class {}, Notification: class {} })
    expect(pushSupported()).toBe(true)
  })
})

describe("subscribeThisDevice", () => {
  const stub = (permission: string, subscription?: object) => {
    const subscribe = vi.fn(async () => ({ toJSON: () => subscription }))
    vi.stubGlobal("Notification", { requestPermission: vi.fn(async () => permission) })
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe } }) },
    })
    return subscribe
  }
  const KEY = "AQID"

  it("asks permission, subscribes with the server key and returns the subscription", async () => {
    const subscribe = stub("granted", {
      endpoint: "https://push.example/abc",
      keys: { p256dh: "P", auth: "A" },
    })
    await expect(subscribeThisDevice(KEY)).resolves.toEqual({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "P", auth: "A" },
    })
    const arg = (
      subscribe.mock.calls[0] as unknown as [
        { userVisibleOnly: boolean; applicationServerKey: Uint8Array },
      ]
    )[0]
    expect(arg.userVisibleOnly).toBe(true)
    expect([...arg.applicationServerKey]).toEqual([1, 2, 3])
  })

  it("throws PushDenied, and never subscribes, when permission is refused", async () => {
    const subscribe = stub("denied")
    await expect(subscribeThisDevice(KEY)).rejects.toBeInstanceOf(PushDenied)
    expect(subscribe).not.toHaveBeenCalled()
    stub("default")
    await expect(subscribeThisDevice(KEY)).rejects.toBeInstanceOf(PushDenied)
  })

  it("rejects an incomplete subscription from the browser", async () => {
    stub("granted", { endpoint: "https://push.example/abc", keys: { p256dh: "P" } })
    await expect(subscribeThisDevice(KEY)).rejects.toThrow(/incomplete/)
  })
})
