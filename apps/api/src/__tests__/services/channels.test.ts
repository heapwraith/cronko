import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type ChannelRow,
  DeliveryError,
  deliver,
  headerText,
  pagerDutyEvent,
  teamsCard,
} from "../../services/channels"

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

  it("pushover sends token, user, priority and the run link as url", async () => {
    const fetch = stubFetch()
    const key = "a".repeat(30)
    await deliver(
      channel("pushover", { appToken: key, userKey: "u".repeat(30) }),
      "failed",
      "❌ etl falhou (exit code 2)\nhttps://cronko.example.com/monitors/m/runs/r",
      "etl",
    )
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("https://api.pushover.net/1/messages.json")
    expect(JSON.parse(String(init?.body))).toEqual({
      token: key,
      user: "u".repeat(30),
      title: "Cronko: etl",
      message: "❌ etl falhou (exit code 2)",
      priority: 1,
      url: "https://cronko.example.com/monitors/m/runs/r",
      url_title: "Open in Cronko",
    })
  })

  it("teams posts an Adaptive Card with an Open in Cronko action", async () => {
    const fetch = stubFetch()
    await deliver(
      channel("teams", { webhookUrl: "https://prod.workflows.example/x" }),
      "down",
      "🔴 backup está down\nhttps://cronko.example.com/monitors/m1",
      "backup",
    )
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    const card = body.attachments[0]
    expect(body.type).toBe("message")
    expect(card.contentType).toBe("application/vnd.microsoft.card.adaptive")
    expect(card.content.body[0]).toMatchObject({ text: "🔴 backup está down", weight: "Bolder" })
    expect(card.content.body).toHaveLength(1)
    expect(card.content.actions[0]).toMatchObject({
      type: "Action.OpenUrl",
      url: "https://cronko.example.com/monitors/m1",
    })
    expect(teamsCard("plain").attachments[0]?.content).not.toHaveProperty("actions")
  })

  it("pagerduty triggers with severity, dedup key and link, and resolves on recovery", async () => {
    const fetch = stubFetch()
    const key = "R".repeat(32)
    await deliver(
      channel("pagerduty", { routingKey: key }),
      "down",
      "🔴 backup está down\nhttps://cronko.example.com/monitors/m1",
      "backup",
    )
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("https://events.pagerduty.com/v2/enqueue")
    expect(JSON.parse(String(init?.body))).toMatchObject({
      routing_key: key,
      event_action: "trigger",
      dedup_key: "cronko:backup",
      payload: { summary: "🔴 backup está down", source: "backup", severity: "critical" },
      links: [{ href: "https://cronko.example.com/monitors/m1", text: "Open in Cronko" }],
    })

    expect(pagerDutyEvent(key, "recovered", "✅ ok", "backup")).toEqual({
      routing_key: key,
      event_action: "resolve",
      dedup_key: "cronko:backup",
    })
    expect(pagerDutyEvent(key, "failed", "x", "b")).toMatchObject({
      payload: { severity: "error" },
    })
    expect(pagerDutyEvent(key, "failed", "x", "b")).not.toHaveProperty("links")
  })

  it("pagerduty ignores informative events: analytics and the digest", async () => {
    const fetch = stubFetch()
    const pd = channel("pagerduty", { routingKey: "R".repeat(32) })
    await deliver(pd, "unusual", "🐌 etl demorou bem mais que o normal", "etl")
    await deliver(pd, "overlap", "⚠️ etl começou antes", "etl")
    await deliver(pd, "digest", "📊 Resumo diário", "Resumo diário")
    expect(fetch).not.toHaveBeenCalled()
  })
})
