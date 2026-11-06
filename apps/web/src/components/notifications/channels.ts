import { Bell, BellRing, Mail, MessageSquare, Send, Siren, Users, Webhook } from "lucide-react"

export type ChannelType =
  | "discord"
  | "telegram"
  | "email"
  | "slack"
  | "webhook"
  | "ntfy"
  | "pushover"
  | "teams"
  | "pagerduty"

export type Channel = {
  id: string
  name: string
  type: string
  enabled: boolean
  config: Record<string, unknown>
  createdAt: string
}

export type FieldSpec = {
  key: string
  labelKey: string
  placeholder: string
  type?: "text" | "email" | "url"
  autoComplete?: string
  optional?: boolean
  validate: (value: string) => FieldError | null
}

export type FieldError =
  | "required"
  | "invalidUrl"
  | "invalidEmail"
  | "invalidTopic"
  | "invalidKey"
  | "invalidRoutingKey"

const url = (v: string) => (!v.trim() ? "required" : v.startsWith("https://") ? null : "invalidUrl")
const httpUrl = (v: string) =>
  !v.trim() ? "required" : /^https?:\/\/\S+$/.test(v.trim()) ? null : "invalidUrl"
const optionalHttpUrl = (v: string) => (v.trim() ? httpUrl(v) : null)
const topic = (v: string) =>
  !v.trim() ? "required" : /^[\w-]{1,64}$/.test(v.trim()) ? null : "invalidTopic"
const pushoverKey = (v: string) =>
  !v.trim() ? "required" : /^[A-Za-z0-9]{30}$/.test(v.trim()) ? null : "invalidKey"
const routingKey = (v: string) =>
  !v.trim() ? "required" : /^[A-Za-z0-9]{32}$/.test(v.trim()) ? null : "invalidRoutingKey"
const required = (v: string) => (v.trim() ? null : "required")
const email = (v: string) => (!v.trim() ? "required" : v.includes("@") ? null : "invalidEmail")

const webhook: FieldSpec = {
  key: "webhookUrl",
  labelKey: "notifications.webhookUrl",
  placeholder: "https://",
  type: "url",
  validate: url,
}

/** One source of truth for what each channel type needs. */
export const CHANNELS: Record<
  ChannelType,
  { label: string; icon: React.ComponentType<{ className?: string }>; fields: FieldSpec[] }
> = {
  discord: {
    label: "Discord",
    icon: MessageSquare,
    fields: [{ ...webhook, placeholder: "https://discord.com/api/webhooks/…" }],
  },
  slack: {
    label: "Slack",
    icon: MessageSquare,
    fields: [{ ...webhook, placeholder: "https://hooks.slack.com/services/…" }],
  },
  telegram: {
    label: "Telegram",
    icon: Send,
    fields: [
      {
        key: "botToken",
        labelKey: "notifications.botToken",
        placeholder: "123456:ABC-DEF…",
        validate: required,
      },
      {
        key: "chatId",
        labelKey: "notifications.chatId",
        placeholder: "-1001234567890",
        validate: required,
      },
    ],
  },
  webhook: {
    label: "Webhook",
    icon: Webhook,
    fields: [
      {
        key: "url",
        labelKey: "notifications.url",
        placeholder: "https://example.com/hooks/cronko",
        type: "url",
        validate: httpUrl,
      },
    ],
  },
  ntfy: {
    label: "ntfy",
    icon: Bell,
    fields: [
      {
        key: "topic",
        labelKey: "notifications.topic",
        placeholder: "cronko-alerts",
        validate: topic,
      },
      {
        key: "serverUrl",
        labelKey: "notifications.serverUrl",
        placeholder: "https://ntfy.sh",
        type: "url",
        optional: true,
        validate: optionalHttpUrl,
      },
      {
        key: "token",
        labelKey: "notifications.token",
        placeholder: "tk_…",
        optional: true,
        validate: () => null,
      },
    ],
  },
  pushover: {
    label: "Pushover",
    icon: BellRing,
    fields: [
      {
        key: "userKey",
        labelKey: "notifications.userKey",
        placeholder: "uQiRzpo4DX…",
        validate: pushoverKey,
      },
      {
        key: "appToken",
        labelKey: "notifications.appToken",
        placeholder: "azGDORePK8…",
        validate: pushoverKey,
      },
    ],
  },
  pagerduty: {
    label: "PagerDuty",
    icon: Siren,
    fields: [
      {
        key: "routingKey",
        labelKey: "notifications.routingKey",
        placeholder: "e93facc04764012d7bfb…",
        validate: routingKey,
      },
    ],
  },
  teams: {
    label: "Microsoft Teams",
    icon: Users,
    fields: [{ ...webhook, placeholder: "https://prod-…logic.azure.com/workflows/…" }],
  },
  email: {
    label: "Email",
    icon: Mail,
    fields: [
      {
        key: "to",
        labelKey: "notifications.email",
        placeholder: "alerts@example.com",
        type: "email",
        autoComplete: "email",
        validate: email,
      },
    ],
  },
}

export const CHANNEL_TYPES = Object.keys(CHANNELS) as ChannelType[]

export function channelMeta(type: string) {
  return CHANNELS[type as ChannelType] ?? { label: type, icon: Send, fields: [] }
}

export function validateConfig(type: string, values: Record<string, string>) {
  const errors: Record<string, FieldError> = {}
  for (const f of channelMeta(type).fields) {
    const err = f.validate(values[f.key] ?? "")
    if (err) errors[f.key] = err
  }
  return errors
}

/** Maps a server-side zod 400 onto field keys (`config.webhookUrl` -> `webhookUrl`). */
export function serverFieldErrors(body: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const issues = (body as { error?: { issues?: { path: (string | number)[]; message: string }[] } })
    ?.error?.issues
  if (!Array.isArray(issues)) return out
  for (const i of issues) {
    const key = String(i.path[i.path.length - 1] ?? "")
    if (key && !out[key]) out[key] = i.message
  }
  return out
}
