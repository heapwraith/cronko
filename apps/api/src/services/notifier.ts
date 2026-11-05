import * as nodemailer from "nodemailer"
import { findEnabledNotificationChannels } from "@cronko/database/queries/notifications"
import { env } from "../env"
import { logger } from "../lib/logger"
import type {
  DiscordConfig,
  TelegramConfig,
  EmailConfig,
} from "@cronko/shared"
import type { notificationChannels } from "@cronko/database/schema"

export type NotificationEvent = "missed" | "down" | "recovered" | "slow"

const messages: Record<NotificationEvent, (name: string) => string> = {
  missed: (name) => `⚠️ ${name} não executou no tempo esperado`,
  down: (name) => `🔴 ${name} está down`,
  recovered: (name) => `✅ ${name} voltou a executar normalmente`,
  slow: (name) => `🐢 ${name} excedeu a duração máxima configurada`,
}

type ChannelRow = typeof notificationChannels.$inferSelect

async function sendToChannel(
  channel: ChannelRow,
  event: NotificationEvent,
  text: string,
) {
  try {
    const cfg = channel.config as
      | DiscordConfig
      | TelegramConfig
      | EmailConfig

    if (channel.type === "discord") {
      const discordCfg = cfg as DiscordConfig
      await fetch(discordCfg.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      })
    } else if (channel.type === "slack") {
      const slackCfg = cfg as { webhookUrl: string }
      await fetch(slackCfg.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
    } else if (channel.type === "telegram") {
      const telegramCfg = cfg as TelegramConfig
      await fetch(
        `https://api.telegram.org/bot${telegramCfg.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramCfg.chatId,
            text,
          }),
        },
      )
    } else if (channel.type === "email") {
      const emailCfg = cfg as EmailConfig
      if (env.SMTP_HOST) {
        const transporter = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT ?? 587,
          secure: (env.SMTP_PORT ?? 587) === 465,
          auth: env.SMTP_USER
            ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
            : undefined,
        })
        await transporter.sendMail({
          from: env.SMTP_FROM,
          to: emailCfg.to,
          subject: `Cronko — ${event} alert`,
          text,
        })
      }
    }
  } catch (err) {
    logger.error(
      { err, event, channelType: channel.type, channelName: channel.name },
      "notification send failed",
    )
  }
}

export async function sendNotification(
  monitor: { name: string },
  event: NotificationEvent,
  specificChannels?: ChannelRow[],
) {
  const channels = specificChannels ?? await findEnabledNotificationChannels()
  const text = messages[event](monitor.name)

  const tasks = channels.map((channel: ChannelRow) => sendToChannel(channel, event, text))

  await Promise.allSettled(tasks)
}