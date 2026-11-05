import {
  createNotificationChannel,
  deleteNotificationChannel,
  findAllNotificationChannels,
  findNotificationChannelById,
  updateNotificationChannel,
} from "@cronko/database/queries/notifications"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import { logAuditEvent } from "../services/audit"
import { sendNotification } from "../services/notifier"

export const notificationsRoute = new Hono()

const createNotificationSchema = z.discriminatedUnion("type", [
  z.object({
    name: z.string().min(1),
    type: z.literal("discord"),
    config: z.object({ webhookUrl: z.url() }),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("telegram"),
    config: z.object({ botToken: z.string().min(1), chatId: z.string().min(1) }),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("email"),
    config: z.object({ to: z.email() }),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("slack"),
    config: z.object({ webhookUrl: z.url() }),
  }),
])

const updateNotificationSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  config: z
    .union([
      z.object({ webhookUrl: z.url() }),
      z.object({ botToken: z.string().min(1), chatId: z.string().min(1) }),
      z.object({ to: z.email() }),
    ])
    .optional(),
})

notificationsRoute.get("/", async (c) => {
  const channels = await findAllNotificationChannels()
  return c.json({ data: channels })
})

notificationsRoute.post("/", zValidator("json", createNotificationSchema), async (c) => {
  const body = c.req.valid("json")
  const channel = await createNotificationChannel({
    id: crypto.randomUUID(),
    name: body.name,
    type: body.type,
    enabled: true,
    config: body.config,
  })

  logAuditEvent({
    userId: (c.get("jwtPayload") as { sub: string })?.sub,
    action: "notification.created",
    resourceType: "notification",
    resourceId: channel.id,
    metadata: { name: body.name, type: body.type },
  }).catch(() => {})

  return c.json({ data: channel }, 201)
})

notificationsRoute.patch("/:id", zValidator("json", updateNotificationSchema), async (c) => {
  const id = c.req.param("id") ?? ""
  const body = c.req.valid("json")

  const updated = await updateNotificationChannel(id, {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.enabled !== undefined && { enabled: body.enabled }),
    ...(body.config !== undefined && { config: body.config }),
  })

  if (!updated) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }

  return c.json({ data: updated })
})

notificationsRoute.delete("/:id", async (c) => {
  const id = c.req.param("id") ?? ""
  await deleteNotificationChannel(id)
  logAuditEvent({
    userId: (c.get("jwtPayload") as { sub: string })?.sub,
    action: "notification.deleted",
    resourceType: "notification",
    resourceId: id,
  }).catch(() => {})
  return c.json({ data: { ok: true } })
})

notificationsRoute.post("/:id/test", async (c) => {
  const id = c.req.param("id") ?? ""
  const channel = await findNotificationChannelById(id)

  if (!channel) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
  }

  await sendNotification({ name: "Test Notification" }, "recovered", [channel])

  return c.json({ data: { ok: true } })
})
