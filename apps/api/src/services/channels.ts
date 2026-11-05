import type { notificationChannels } from "@cronko/database/schema"
import type { DiscordConfig, EmailConfig, TelegramConfig } from "@cronko/shared"
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

async function postJson(url: string, body: unknown, label: string) {
  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
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
export async function deliver(channel: ChannelRow, event: string, text: string): Promise<void> {
  switch (channel.type) {
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
