import type {
  DiscordConfig,
  EmailConfig,
  NotificationChannelType,
  TelegramConfig,
} from "@cronko/shared"
import { eq } from "drizzle-orm"
import { db } from "../index"
import { notificationChannels } from "../schema"

export async function findAllNotificationChannels() {
  return db.select().from(notificationChannels).all()
}

export async function findNotificationChannelById(id: string) {
  return db.select().from(notificationChannels).where(eq(notificationChannels.id, id)).get()
}

export async function findEnabledNotificationChannels() {
  return db.select().from(notificationChannels).where(eq(notificationChannels.enabled, true)).all()
}

export async function createNotificationChannel(input: {
  id: string
  name: string
  type: NotificationChannelType
  enabled: boolean
  config: DiscordConfig | TelegramConfig | EmailConfig
}) {
  await db.insert(notificationChannels).values({
    id: input.id,
    name: input.name,
    type: input.type,
    enabled: input.enabled,
    config: input.config,
    createdAt: new Date(),
  })

  const created = await findNotificationChannelById(input.id)
  if (!created) throw new Error(`notification channel ${input.id} missing after insert`)
  return created
}

export async function updateNotificationChannel(
  id: string,
  input: {
    name?: string
    enabled?: boolean
    config?: DiscordConfig | TelegramConfig | EmailConfig
  },
) {
  await db
    .update(notificationChannels)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.config !== undefined && { config: input.config }),
    })
    .where(eq(notificationChannels.id, id))

  return findNotificationChannelById(id)
}

export async function deleteNotificationChannel(id: string) {
  await db.delete(notificationChannels).where(eq(notificationChannels.id, id))
}
