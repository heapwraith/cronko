import { afterEach, describe, expect, it, vi } from "vitest"
import { type ChannelRow, DeliveryError, deliver, headerText } from "../../services/channels"

const channel = (type: string, config: Record<string, unknown>) =>
  ({ id: "c", name: "n", type, enabled: true, config, createdAt: new Date() }) as ChannelRow

function stubFetch(status = 200) {
  const fn = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status }))
  vi.stubGlobal("fetch", fn)
  return fn
}

describe("webhook and ntfy channels", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("webhook POSTs a JSON payload with event, monitor and message", async () => {
    const fetch = stubFetch()
    await deliver(
      channel("webhook", { url: "http://hooks.local/x" }),
      "failed",
      "etl falhou",
      "etl",
    )
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("http://hooks.local/x")
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ event: "failed", monitor: "etl", message: "etl falhou" })
    expect(typeof body.sentAt).toBe("string")
  })

  it("ntfy posts text to server/topic with priority, tags, click link and token", async () => {
    const fetch = stubFetch()
    await deliver(
      channel("ntfy", { topic: "ops", serverUrl: "https://ntfy.example.com/", token: "tk" }),
      "down",
      "🔴 backup está down\nhttps://cronko.example.com/monitors/m1",
      "backup",
    )
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("https://ntfy.example.com/ops")
    const h = (init?.headers ?? {}) as Record<string, string>
    expect(h.Priority).toBe("5")
    expect(h.Tags).toBe("red_circle")
    expect(h.Click).toBe("https://cronko.example.com/monitors/m1")
    expect(h.Authorization).toBe("Bearer tk")
    expect(h.Title).toBe("Cronko: backup")
  })

  it("ntfy defaults to ntfy.sh and encodes non-ASCII titles", async () => {
    const fetch = stubFetch()
    await deliver(channel("ntfy", { topic: "ops" }), "recovered", "ok", "relatório 📦")
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("https://ntfy.sh/ops")
    const title = ((init?.headers ?? {}) as Record<string, string>).Title
    expect(title).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
    expect(headerText("plain")).toBe("plain")
  })

  it("maps HTTP errors to retryable or permanent failures", async () => {
    stubFetch(503)
    await expect(
      deliver(channel("webhook", { url: "http://h/x" }), "down", "x"),
    ).rejects.toMatchObject({ retryable: true })
    stubFetch(404)
    const err = await deliver(channel("ntfy", { topic: "t" }), "down", "x").catch((e) => e)
    expect(err).toBeInstanceOf(DeliveryError)
    expect(err.retryable).toBe(false)
    expect(err.message).toBe("ntfy: HTTP 404")
  })
})
