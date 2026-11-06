import { afterEach, describe, expect, it, vi } from "vitest"
import { type ChannelRow, deliver } from "../../services/channels"
import {
  isJsonContentType,
  maskHeaders,
  parseHeaders,
  renderTemplate,
  unknownPlaceholders,
  unmaskHeaders,
} from "../../services/webhook-template"

const ctx = {
  event: "down",
  message: 'backup "nightly" is down',
  url: "https://cronko.example.com/monitors/m1",
  monitorName: "back\\up",
  sentAt: "2026-01-01T00:00:00.000Z",
}

describe("renderTemplate", () => {
  it("fills placeholders, tolerating spaces", () => {
    expect(renderTemplate("{{ monitor.name }} {{status}} {{event}} {{url}}", ctx, false)).toBe(
      "back\\up down down https://cronko.example.com/monitors/m1",
    )
    expect(renderTemplate("{{status}}", { ...ctx, event: "recovered" }, false)).toBe("up")
  })

  it("renders unknown placeholders empty and never evaluates anything", () => {
    expect(renderTemplate("[{{nope}}][{{constructor}}][{{__proto__}}]", ctx, false)).toBe("[][][]")
    expect(renderTemplate("{{ 1+1 }}", ctx, false)).toBe("")
  })

  it("escapes values for JSON so quotes and newlines cannot break the body", () => {
    const out = renderTemplate('{"m":"{{message}}","n":"{{monitor.name}}"}', ctx, true)
    expect(JSON.parse(out)).toEqual({ m: 'backup "nightly" is down', n: "back\\up" })
    const multi = renderTemplate('{"m":"{{message}}"}', { ...ctx, message: "a\nb" }, true)
    expect(JSON.parse(multi)).toEqual({ m: "a\nb" })
  })

  it("leaves values raw for non-JSON content", () => {
    expect(renderTemplate("{{message}}", ctx, false)).toBe('backup "nightly" is down')
  })

  it("lists unknown placeholders for save-time validation", () => {
    expect(unknownPlaceholders("{{event}} {{foo}} {{ bar.baz }}")).toEqual(["foo", "bar.baz"])
    expect(unknownPlaceholders("plain")).toEqual([])
  })
})

describe("headers", () => {
  it("parses Name: value lines", () => {
    expect(parseHeaders("Authorization: Bearer x:y\n\nX-Gotify-Key: abc").headers).toEqual({
      Authorization: "Bearer x:y",
      "X-Gotify-Key": "abc",
    })
  })

  it("rejects malformed, forbidden and non-ASCII headers", () => {
    expect(parseHeaders("nocolon").error).toBeDefined()
    expect(parseHeaders("Bad Name: x").error).toBeDefined()
    expect(parseHeaders("Host: evil").error).toMatch(/not allowed/)
    expect(parseHeaders("X-A: café").error).toBeDefined()
  })

  it("detects the JSON content type, defaulting to JSON", () => {
    expect(isJsonContentType({})).toBe(true)
    expect(isJsonContentType({ "Content-Type": "application/json; charset=utf-8" })).toBe(true)
    expect(isJsonContentType({ "content-type": "text/plain" })).toBe(false)
  })

  it("masks values and restores them when the client sends the mask back", () => {
    const stored = "Authorization: Bearer supersecret\nX-Short: abc"
    const masked = maskHeaders(stored)
    expect(masked).not.toContain("supersecret")
    expect(masked).toContain("Authorization: ****cret")
    expect(unmaskHeaders(masked, stored)).toBe(stored)
    expect(unmaskHeaders(`${masked}\nX-New: 1`, stored)).toBe(`${stored}\nX-New: 1`)
    expect(unmaskHeaders("Authorization: changed", stored)).toBe("Authorization: changed")
  })
})

describe("webhook delivery", () => {
  afterEach(() => vi.unstubAllGlobals())
  const channel = (config: Record<string, unknown>) =>
    ({
      id: "c",
      name: "n",
      type: "webhook",
      enabled: true,
      config,
      createdAt: new Date(),
    }) as ChannelRow
  const stub = () => {
    const fn = vi.fn(async (_u: string, _i: RequestInit) => new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fn)
    return fn
  }
  const hdrs = (fn: ReturnType<typeof stub>) =>
    (fn.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>
  const text = "🔴 etl is down\nhttps://cronko.example.com/monitors/m1"

  it("backward compat: no headers/template keeps the fixed payload and content type", async () => {
    const fetch = stub()
    await deliver(channel({ url: "http://h.local/x" }), "down", text, "etl")
    expect(Object.keys(hdrs(fetch))).toEqual(["content-type"])
    expect(hdrs(fetch)["content-type"]).toBe("application/json")
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({ event: "down", monitor: "etl", message: text })
  })

  it("sends custom headers with the default payload", async () => {
    const fetch = stub()
    const cfg = { url: "http://h.local/x", headers: "X-Gotify-Key: k1" }
    await deliver(channel(cfg), "down", text, "etl")
    expect(hdrs(fetch)["X-Gotify-Key"]).toBe("k1")
    expect(hdrs(fetch)["content-type"]).toBe("application/json")
  })

  it("renders a Slack-style JSON template with escaping", async () => {
    const fetch = stub()
    const cfg = {
      url: "http://h.local/x",
      bodyTemplate: '{"text":"*{{monitor.name}}* is {{status}}: {{message}} <{{url}}>"}',
    }
    await deliver(channel(cfg), "down", text, 'et"l')
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body.text).toBe(
      '*et"l* is down: 🔴 etl is down <https://cronko.example.com/monitors/m1>',
    )
  })

  it("a custom Content-Type switches to raw (unescaped) rendering", async () => {
    const fetch = stub()
    const cfg = {
      url: "http://h.local/x",
      headers: "Content-Type: text/plain",
      bodyTemplate: "{{monitor.name}}: {{message}}",
    }
    await deliver(channel(cfg), "down", 'say "hi"', "etl")
    expect(fetch.mock.calls[0]?.[1]?.body).toBe('etl: say "hi"')
    expect(hdrs(fetch)["Content-Type"]).toBe("text/plain")
    expect(hdrs(fetch)["content-type"]).toBeUndefined()
  })
})
