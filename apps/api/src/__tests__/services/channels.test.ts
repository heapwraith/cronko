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

describe("chat and push channels (Google Chat, Mattermost, Rocket.Chat, Gotify, Matrix)", () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(["googlechat", "mattermost", "rocketchat"])(
    "%s posts {text} to its incoming webhook",
    async (type) => {
      const fetch = stubFetch()
      await deliver(
        channel(type, { webhookUrl: "https://chat.example/hook/abc" }),
        "down",
        "etl caiu",
        "etl",
      )
      const [url, init] = fetch.mock.calls[0] ?? []
      expect(url).toBe("https://chat.example/hook/abc")
      expect(init?.method).toBe("POST")
      expect(JSON.parse(String(init?.body))).toEqual({ text: "etl caiu" })
    },
  )

  it("gotify posts title, message, priority and the click link to /message", async () => {
    const fetch = stubFetch()
    await deliver(
      channel("gotify", { serverUrl: "https://gotify.example/", appToken: "tok en" }),
      "down",
      "etl caiu https://cronko.example/monitors/1",
      "etl",
    )
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("https://gotify.example/message?token=tok%20en")
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "Cronko: etl",
      message: "etl caiu",
      priority: 8,
      extras: { "client::notification": { click: { url: "https://cronko.example/monitors/1" } } },
    })
  })

  it("matrix PUTs an m.text message with a bearer token and a fresh transaction id", async () => {
    const fetch = stubFetch()
    const cfg = {
      homeserverUrl: "https://matrix.example/",
      accessToken: "syt_secret",
      roomId: "!abc:matrix.example",
    }
    await deliver(channel("matrix", cfg), "failed", "etl falhou", "etl")
    await deliver(channel("matrix", cfg), "failed", "etl falhou", "etl")
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(String(url)).toMatch(
      /^https:\/\/matrix\.example\/_matrix\/client\/v3\/rooms\/!abc%3Amatrix\.example\/send\/m\.room\.message\/[0-9a-f-]{36}$/,
    )
    expect(init?.method).toBe("PUT")
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer syt_secret")
    expect(JSON.parse(String(init?.body))).toEqual({ msgtype: "m.text", body: "etl falhou" })
    expect(String(fetch.mock.calls[1]?.[0])).not.toBe(String(url))
  })

  it("marks 5xx as retryable and 4xx as permanent without leaking the token", async () => {
    stubFetch(503)
    const retry = await deliver(
      channel("gotify", { serverUrl: "https://g.example", appToken: "SECRET" }),
      "down",
      "x",
    ).catch((e) => e)
    expect(retry).toBeInstanceOf(DeliveryError)
    expect(retry.retryable).toBe(true)
    expect(retry.message).not.toContain("SECRET")

    stubFetch(403)
    const permanent = await deliver(
      channel("matrix", {
        homeserverUrl: "https://m.example",
        accessToken: "SECRET",
        roomId: "!a:b",
      }),
      "down",
      "x",
    ).catch((e) => e)
    expect(permanent.retryable).toBe(false)
    expect(permanent.message).not.toContain("SECRET")
  })
})

describe("apprise channel", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("stateful: posts to /notify/{key} with title, body, type and tag", async () => {
    const fetch = stubFetch()
    await deliver(
      channel("apprise", {
        serverUrl: "https://apprise.example/",
        configKey: "cronko",
        tag: "ops",
        urls: "ignored://when-a-key-is-set",
      }),
      "down",
      "etl caiu",
      "etl",
    )
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("https://apprise.example/notify/cronko")
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "Cronko: etl",
      body: "etl caiu",
      type: "failure",
      tag: "ops",
    })
  })

  it("stateless: posts to /notify with the inline urls joined by commas", async () => {
    const fetch = stubFetch()
    await deliver(
      channel("apprise", {
        serverUrl: "https://apprise.example",
        urls: "tgram://bot/chat  mailto://u:p@mail.test,\nslack://a/b/c",
      }),
      "recovered",
      "etl voltou",
      "etl",
    )
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("https://apprise.example/notify")
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "Cronko: etl",
      body: "etl voltou",
      type: "success",
      urls: "tgram://bot/chat,mailto://u:p@mail.test,slack://a/b/c",
    })
  })

  it("maps events to Apprise types", async () => {
    const types: Record<string, string> = {}
    for (const event of ["down", "failed", "missed", "slow", "unusual", "recovered", "digest"]) {
      const fetch = stubFetch()
      await deliver(
        channel("apprise", { serverUrl: "https://a.example", configKey: "k" }),
        event,
        "x",
      )
      types[event] = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).type
    }
    expect(types).toEqual({
      down: "failure",
      failed: "failure",
      missed: "failure",
      slow: "warning",
      unusual: "warning",
      recovered: "success",
      digest: "info",
    })
  })

  it("does not leak the urls in a delivery error", async () => {
    stubFetch(500)
    const err = await deliver(
      channel("apprise", { serverUrl: "https://a.example", urls: "tgram://SECRET/chat" }),
      "down",
      "x",
    ).catch((e) => e)
    expect(err.retryable).toBe(true)
    expect(err.message).not.toContain("SECRET")
  })
})
