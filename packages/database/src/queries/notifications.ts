import type {
  DiscordConfig,
  EmailConfig,
  NotificationChannelType,
  TelegramConfig,
} from "@cronko/shared"
import { and, asc, desc, eq, lt, lte } from "drizzle-orm"
import { db } from "../index"
import { notificationChannels, notificationDeliveries } from "../schema"

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

type Delivery = typeof notificationDeliveries.$inferSelect
type NewDelivery = Pick<Delivery, "id" | "channelId" | "monitorName" | "event" | "message">

export async function enqueueDeliveries(rows: NewDelivery[], now: Date) {
  if (rows.length === 0) return
  await db.insert(notificationDeliveries).values(
    rows.map((row) => ({
      ...row,
      status: "pending" as const,
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

/** Pending deliveries that are due, oldest first, with their channel. */
export async function findDueDeliveries(now: Date, limit = 50) {
  return db
    .select({ delivery: notificationDeliveries, channel: notificationChannels })
    .from(notificationDeliveries)
    .innerJoin(notificationChannels, eq(notificationChannels.id, notificationDeliveries.channelId))
    .where(
      and(
        eq(notificationDeliveries.status, "pending"),
        lte(notificationDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(notificationDeliveries.nextAttemptAt))
    .limit(limit)
    .all()
}

export async function markDeliverySent(id: string, attempts: number, now: Date) {
  await db
    .update(notificationDeliveries)
    .set({ status: "sent", attempts, lastError: null, updatedAt: now })
    .where(eq(notificationDeliveries.id, id))
}

export async function markDeliveryAttemptFailed(
  id: string,
  input: { attempts: number; error: string; retryAt: Date | null; now: Date },
) {
  await db
    .update(notificationDeliveries)
    .set({
      status: input.retryAt ? "pending" : "failed",
      attempts: input.attempts,
      lastError: input.error,
      ...(input.retryAt && { nextAttemptAt: input.retryAt }),
      updatedAt: input.now,
    })
    .where(eq(notificationDeliveries.id, id))
}

export async function findRecentDeliveries(limit: number) {
  return db
    .select({
      id: notificationDeliveries.id,
      channelId: notificationDeliveries.channelId,
      channelName: notificationChannels.name,
      monitorName: notificationDeliveries.monitorName,
      event: notificationDeliveries.event,
      status: notificationDeliveries.status,
      attempts: notificationDeliveries.attempts,
      lastError: notificationDeliveries.lastError,
      createdAt: notificationDeliveries.createdAt,
    })
    .from(notificationDeliveries)
    .innerJoin(notificationChannels, eq(notificationChannels.id, notificationDeliveries.channelId))
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(Math.min(limit, 200))
    .all()
}

export async function deleteDeliveriesOlderThan(cutoff: Date) {
  await db.delete(notificationDeliveries).where(lt(notificationDeliveries.createdAt, cutoff))
}
