import type { notificationChannels } from "@cronko/database/schema"
import type {
  DiscordConfig,
  EmailConfig,
  NtfyConfig,
  TelegramConfig,
  WebhookConfig,
} from "@cronko/shared"
import { createTransport, type Transporter } from "nodemailer"
import { env } from "../env"

export type ChannelRow = typeof notificationChannels.$inferSelect

const REQUEST_TIMEOUT_MS = 10_000

/** A failed delivery attempt. `retryable` tells the outbox whether to try again. */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "DeliveryError"
  }
}

/** 5xx, 408 (timeout) and 429 (rate limited) are worth retrying; other 4xx are not. */
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

async function post(
  url: string,
  init: { headers: Record<string, string>; body: string },
  label: string,
) {
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    // Never include the URL: webhook and bot URLs embed secrets.
    const reason = err instanceof Error ? err.name : "error"
    throw new DeliveryError(`${label}: request failed (${reason})`, true)
  }
  if (!res.ok) {
    throw new DeliveryError(`${label}: HTTP ${res.status}`, isRetryableStatus(res.status))
  }
}

function postJson(url: string, body: unknown, label: string) {
  return post(
    url,
    { headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    label,
  )
}

/** ntfy priorities: 5 urgent, 4 high, 3 default. */
const NTFY_PRIORITY: Record<string, string> = { down: "5", failed: "4", missed: "4", slow: "3" }
const NTFY_TAGS: Record<string, string> = {
  down: "red_circle",
  failed: "x",
  missed: "warning",
  slow: "turtle",
  recovered: "white_check_mark",
}

/** HTTP headers are Latin-1 only; ntfy accepts RFC 2047 for anything else (emoji, CJK). */
export function headerText(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

let transporter: Transporter | undefined

function smtp(): Transporter | undefined {
  if (!env.SMTP_HOST) return undefined
  transporter ??= createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
    connectionTimeout: REQUEST_TIMEOUT_MS,
    socketTimeout: REQUEST_TIMEOUT_MS,
  })
  return transporter
}

/** Send one message through one channel. Throws DeliveryError on failure. */
export async function deliver(
  channel: ChannelRow,
  event: string,
  text: string,
  monitorName?: string,
): Promise<void> {
  switch (channel.type) {
    case "webhook":
      return postJson(
        (channel.config as WebhookConfig).url,
        { event, monitor: monitorName ?? null, message: text, sentAt: new Date().toISOString() },
        "webhook",
      )
    case "ntfy": {
      const cfg = channel.config as NtfyConfig
      const server = (cfg.serverUrl || "https://ntfy.sh").replace(/\/+$/, "")
      const link = text.match(/https?:\/\/\S+$/)?.[0]
      return post(
        `${server}/${encodeURIComponent(cfg.topic)}`,
        {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            Title: headerText(`Cronko: ${monitorName ?? event}`),
            Priority: NTFY_PRIORITY[event] ?? "3",
            Tags: NTFY_TAGS[event] ?? "bell",
            ...(link && { Click: link }),
            ...(cfg.token && { Authorization: `Bearer ${cfg.token}` }),
          },
          body: text,
        },
        "ntfy",
      )
    }
    case "discord":
      return postJson((channel.config as DiscordConfig).webhookUrl, { content: text }, "discord")
    case "slack":
      return postJson((channel.config as { webhookUrl: string }).webhookUrl, { text }, "slack")
    case "telegram": {
      const cfg = channel.config as TelegramConfig
      return postJson(
        `https://api.telegram.org/bot${cfg.botToken}/sendMessage`,
        { chat_id: cfg.chatId, text },
        "telegram",
      )
    }
    case "email": {
      const mailer = smtp()
      if (!mailer) throw new DeliveryError("email: SMTP is not configured", false)
      try {
        await mailer.sendMail({
          from: env.SMTP_FROM,
          to: (channel.config as EmailConfig).to,
          subject: `Cronko — ${event} alert`,
          text,
        })
      } catch (err) {
        const code = (err as { responseCode?: number }).responseCode
        // 5xx SMTP replies are permanent (bad recipient, auth); the rest is transient.
        throw new DeliveryError(
          `email: ${err instanceof Error ? err.message.slice(0, 120) : "send failed"}`,
          code === undefined || code < 500,
        )
      }
      return
    }
  }
}
