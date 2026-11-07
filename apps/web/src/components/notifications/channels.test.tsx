import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { ChannelFields } from "./ChannelFields"
import { CHANNEL_TYPES, channelMeta, serverFieldErrors, validateConfig } from "./channels"

const ok: Record<string, Record<string, string>> = {
  discord: { webhookUrl: "https://discord.com/api/webhooks/1/x" },
  slack: { webhookUrl: "https://hooks.slack.com/services/x" },
  teams: { webhookUrl: "https://example.logic.azure.com/x" },
  telegram: { botToken: "1:abc", chatId: "-100" },
  webhook: { url: "http://localhost:9000/hook" },
  ntfy: { topic: "cronko-alerts" },
  pushover: { userKey: "a".repeat(30), appToken: "B".repeat(30) },
  pagerduty: { routingKey: "c".repeat(32) },
  googlechat: { webhookUrl: "https://chat.googleapis.com/v1/spaces/x/messages?key=k" },
  mattermost: { webhookUrl: "https://mm.example.com/hooks/x" },
  rocketchat: { webhookUrl: "https://rc.example.com/hooks/x/y" },
  gotify: { serverUrl: "https://gotify.example.com", appToken: "AbC123" },
  matrix: {
    homeserverUrl: "https://matrix.example.com",
    accessToken: "syt_x",
    roomId: "!abc:matrix.example.com",
  },
  apprise: { serverUrl: "http://apprise:8000", configKey: "cronko" },
  email: { to: "ops@example.com" },
}

describe("validateConfig", () => {
  it("covers every channel type with a valid example", () => {
    expect(Object.keys(ok).sort()).toEqual([...CHANNEL_TYPES].sort())
    for (const type of CHANNEL_TYPES) expect(validateConfig(type, ok[type] ?? {})).toEqual({})
  })

  it("flags every required field when empty (ntfy optionals excepted)", () => {
    for (const type of CHANNEL_TYPES) {
      const required = channelMeta(type).fields.filter((f) => !f.optional)
      expect(Object.keys(validateConfig(type, {})).sort()).toEqual(
        required.map((f) => f.key).sort(),
      )
    }
  })

  it("accepts only a room id (not an alias) for Matrix", () => {
    const base = { homeserverUrl: "https://m.example", accessToken: "t" }
    expect(validateConfig("matrix", { ...base, roomId: "#room:m.example" })).toEqual({
      roomId: "invalidRoomId",
    })
    expect(validateConfig("matrix", { ...base, roomId: "!abc:m.example" })).toEqual({})
  })

  it("requires https for chat webhooks but allows http for generic webhooks", () => {
    expect(validateConfig("discord", { webhookUrl: "http://x.test" })).toEqual({
      webhookUrl: "invalidUrl",
    })
    expect(validateConfig("webhook", { url: "http://x.test/h" })).toEqual({})
    expect(validateConfig("webhook", { url: "ftp://x.test" })).toEqual({ url: "invalidUrl" })
    expect(validateConfig("webhook", { url: "http://a b" })).toEqual({ url: "invalidUrl" })
  })

  it("validates format-specific keys", () => {
    expect(validateConfig("email", { to: "nope" })).toEqual({ to: "invalidEmail" })
    expect(validateConfig("ntfy", { topic: "bad topic!" })).toEqual({ topic: "invalidTopic" })
    expect(validateConfig("ntfy", { topic: "ok", serverUrl: "nope" })).toEqual({
      serverUrl: "invalidUrl",
    })
    expect(validateConfig("pushover", { userKey: "short", appToken: "B".repeat(30) })).toEqual({
      userKey: "invalidKey",
    })
    expect(validateConfig("pagerduty", { routingKey: "short" })).toEqual({
      routingKey: "invalidRoutingKey",
    })
  })

  it("unknown types have no fields", () => {
    expect(channelMeta("carrier-pigeon")).toMatchObject({ label: "carrier-pigeon", fields: [] })
  })
})

describe("serverFieldErrors", () => {
  it("maps zod issues onto the last path segment, first issue wins", () => {
    expect(
      serverFieldErrors({
        error: {
          issues: [
            { path: ["config", "url"], message: "bad url" },
            { path: ["config", "url"], message: "second" },
            { path: ["name"], message: "too long" },
          ],
        },
      }),
    ).toEqual({ url: "bad url", name: "too long" })
  })

  it("tolerates malformed bodies", () => {
    expect(serverFieldErrors(null)).toEqual({})
    expect(serverFieldErrors({ error: { issues: "x" } })).toEqual({})
  })
})

function Harness({
  type,
  errors = {},
  onChange,
}: {
  type: string
  errors?: Record<string, string>
  onChange?: (v: Record<string, string>) => void
}) {
  const [name, setName] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  return (
    <I18nProvider>
      <ChannelFields
        type={type}
        name={name}
        onName={setName}
        values={values}
        onValue={(k, v) =>
          setValues((p) => {
            const next = { ...p, [k]: v }
            onChange?.(next)
            return next
          })
        }
        errors={errors}
      />
    </I18nProvider>
  )
}

describe("ChannelFields", () => {
  it("renders the fields of the selected type and reports edits", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness type="webhook" onChange={onChange} />)
    await user.type(screen.getByLabelText("URL"), "http://localhost:1/h")
    expect(onChange).toHaveBeenLastCalledWith({ url: "http://localhost:1/h" })
    expect(screen.getByLabelText("Nome")).toBeInTheDocument()
  })

  it("marks optional fields and renders errors accessibly", () => {
    render(<Harness type="ntfy" errors={{ topic: "Tópico inválido", name: "Nome ruim" }} />)
    expect(screen.getAllByText(/opcional/i, { selector: "span" })).toHaveLength(2)
    const topic = screen.getByLabelText(/Tópico|Topic/i)
    expect(topic).toHaveAttribute("aria-invalid", "true")
    expect(topic).toHaveAccessibleDescription("Tópico inválido")
    expect(screen.getByLabelText("Nome")).toHaveAccessibleDescription("Nome ruim")
  })
})
